"use strict";
/* EVERY BOOKED SLIP, GRADED, AND THE HITS ON THE ADMIN PAGE (owner, 12 Oct 2026).
 *
 * lib/bookproxy.js saves each minted code as a `new` row in site_slips. Every ten
 * minutes api/tgfollow.js calls tick():
 *   1. new  -> reads the code back from the bookie (the same reader "Follow my slip"
 *      uses) and maps its legs onto our board with lib/follow.js track(): `open`.
 *      A code that cannot be read is `unreadable`; one with no leg we can grade is
 *      `ungraded`. Neither is retried.
 *   2. open -> grades the settled legs with the shared grader (lib/follow.js step,
 *      lib/grade.js underneath): `lost` the moment a leg loses, `landed` when every
 *      leg won, `check` when every gradable leg won but some legs could not be graded
 *      from a final score (corners, shots, first half...) - never a guessed hit -
 *      and `stale` when results never came.
 * A hit at PING_AT odds or more messages the owner once (SW_OWNER_TG_CHAT).
 *
 * Pure apart from the injected deps, so the whole pass is tested without a network.
 */
const F = require("./follow.js");
const D = require("./doctor.js");
const G = require("./grade.js");
const LG = require("./legrade.js");

/* OURS ONLY (owner, 13 Oct 2026: "if it wasnt picked from our platform, i dont want to
   see it. everything has to be picked from our website"). The booking surfaces that
   carry the reader's own picks - a code pasted into the converter and rebooked, or
   edited, trimmed or changed there - are never a Soccerwizard slip. They are not
   saved (api/book.js), and any row from before this rule is dropped from every list.
   A "Make it safer" or "Split" slip with a game that is not on our board (both
   can run on a pasted code) is marked "foreign" and never graded,
   listed, posted or pinged. */
const READER_SRCS = ["convert", "editor", "trim", "change"];
const isReaderSrc = (src) => READER_SRCS.includes(String(src || ""));
/* Only these two can mix a pasted code into our picks, so only they face the board
   test - a board slip read just after midnight must not lose a game that has
   already left the day's board. */
const MIXED_SRCS = ["safer", "split"];

const PING_AT = 20;      /* owner, 12 Oct 2026: x20 (was x50) */
const NEW_PER_RUN = 10;     /* each one is a read against the bookie, through Railway */
const READ_BUDGET_MS = 20000; /* the cron has 60s and the results sweep runs first */
const TERMINAL = new Set(["landed", "check", "lost", "stale", "ungraded"]);
/* NOTHING FOR A PERSON TO GRADE BELOW THIS (owner, 13 Oct 2026: "when there are thousands
   of tickets that have played legs we cant grade, how do we grade that? it will litter my
   admin tab"). Every leg on our board is graded here from the results API-Football fills -
   goals, corners, shots, goal order and the half-time score (lib/legrade.js). What is
   still unknown after that is rare; at this payout it is worth a look ("check"), below it
   the slip closes quietly as "ungraded": never a hit, never a loss, never listed. */
const CHECK_AT = 20;
const STALE_MS = 3 * 864e5;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const unresolved = (slip) => (Number(slip.total_odds) >= CHECK_AT ? "check" : "ungraded");

/* One slip against the results we have. A leg is "won", "lost" or "void" (a push: the
   stake comes back, so it neither breaks nor makes the slip); null is not known yet. */
function grade(slip, results, now) {
  const byKey = new Map();
  for (const r of results || []) {
    if (r && r.hg != null && r.ag != null) byKey.set(r.date + "|" + norm(r.home) + "|" + norm(r.away), r);
  }
  const legs = slip.legs || [];
  const seen = Object.assign({}, slip.seen || {});
  legs.forEach((l, i) => {
    if (seen[i]) return;
    const r = byKey.get(l.date + "|" + norm(l.home) + "|" + norm(l.away));
    if (!r) return;
    let v = l.code ? LG.gradeLeg(l.code, r) : null;
    if (v == null && l.grade) v = G.gradeLabel(l.grade, Number(r.hg), Number(r.ag));   /* rows saved before codes */
    if (v === true) seen[i] = "won"; else if (v === false) seen[i] = "lost"; else if (v === 0.5) seen[i] = "void";
  });
  const marks = legs.map((_, i) => seen[i]);
  const allIn = legs.length && marks.every((m) => m === "won" || m === "void");
  const last = Date.parse(slip.last_kickoff || "");
  const stale = isFinite(last) && (now || Date.now()) - last > STALE_MS;
  let status = "open";
  if (marks.includes("lost")) status = "lost";
  else if (allIn) status = Number(slip.untracked) > 0 ? unresolved(slip) : "landed";
  else if (stale) status = marks.some((m) => m) || Number(slip.untracked) > 0 ? unresolved(slip) : "stale";
  return { status, seen };
}

/* Every leg on our board, with its market code, so any market lib/legrade.js knows can
   be graded - not only the goal markets "Follow my slip" settles. */
function trackAll(legs, fixtures) {
  const out = [];
  for (const l of legs || []) {
    const f = l && l.prediction ? D.findFixture(fixtures || [], l) : null;
    if (!f) continue;
    let name = D.label(Object.assign({}, l, { home: f.home, away: f.away }));
    if (!name.includes(f.home) && !name.includes(f.away)) name += " (" + f.home + " v " + f.away + ")";
    out.push({ date: f.date, home: f.home, away: f.away, code: l.prediction, grade: F.labelFor(l.prediction), name, ko: f.kickoff || null });
  }
  return out;
}

function product(legs) {
  const odds = (legs || []).map((l) => Number(l && l.odds));
  if (!odds.length || odds.some((o) => !(o > 1))) return null;
  return Math.round(odds.reduce((a, b) => a * b, 1) * 100) / 100;
}

function pingText(slip) {
  const odds = Number(slip.total_odds);
  return "🔥🧙 <b>A Soccerwizard slip landed</b>\n" +
    "<b>" + slip.code + "</b> on " + slip.book + " · ×" + odds.toLocaleString("en-US", { maximumFractionDigits: 2 }) +
    " · " + ((slip.legs || []).length) + " games\nSee every hit on the admin page.";
}

const BOOK_NAMES = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet" };
function userNote(slip) {
  const odds = Number(slip.total_odds), n = (slip.legs || []).length;
  return { title: "Your slip landed! 🔥🧙",
    body: slip.code + " on " + (BOOK_NAMES[slip.book] || slip.book) +
      (odds ? " · ×" + odds.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "") + " · " + n + " game" + (n === 1 ? "" : "s") + ", all in",
    url: "/" };
}

async function tick(d) {
  const now = d.now ? d.now() : Date.now();
  const out = { read: 0, opened: 0, settled: 0, landed: 0, pinged: 0 };

  /* 1. new -> open */
  const fresh = ((await d.newSlips(NEW_PER_RUN)) || []).slice(0, NEW_PER_RUN);
  let fixtures = null;
  const started = Date.now();
  for (const s of fresh) {
    if (Date.now() - started > (d.budgetMs || READ_BUDGET_MS)) break;   /* the rest wait for the next run */
    out.read++;
    const legs = await d.readCode(s.book, s.code);
    if (!legs || !legs.length) { await d.patch(s.id, { status: "unreadable" }); continue; }
    if (!fixtures) fixtures = (await d.fixtures()) || [];
    if (isReaderSrc(s.src) || (MIXED_SRCS.includes(s.src) && legs.some((l) => !D.findFixture(fixtures, l)))) {
      await d.patch(s.id, { status: "foreign", leg_count: legs.length });
      continue;
    }
    const tracked = (d.track || trackAll)(legs, fixtures);
    const last = tracked.map((l) => Date.parse(l.ko || "")).filter(isFinite).sort((a, b) => b - a)[0];
    const total = product(legs);
    await d.patch(s.id, {
      status: tracked.length ? "open" : "ungraded",
      legs: tracked,
      untracked: legs.length - tracked.length,
      leg_count: legs.length,
      total_odds: total != null ? total : (s.total_odds != null ? Number(s.total_odds) : null),
      last_kickoff: last ? new Date(last).toISOString() : null,
    });
    if (tracked.length) out.opened++;
  }

  /* 2. open -> graded */
  const open = (await d.openSlips()) || [];
  if (!open.length) return out;
  const since = open.flatMap((s) => (s.legs || []).map((l) => l.date)).filter(Boolean).sort()[0];
  const results = since ? (await d.results(since)) || [] : [];
  const pingAt = d.pingAt != null ? d.pingAt : PING_AT;
  for (const s of open) {
    if (isReaderSrc(s.src)) { await d.patch(s.id, { status: "foreign" }); continue; }
    const g = grade(s, results, now);
    const changed = g.status !== s.status || JSON.stringify(g.seen) !== JSON.stringify(s.seen || {});
    if (!changed) continue;
    const patch = { status: g.status, seen: g.seen };
    if (TERMINAL.has(g.status)) { patch.settled_at = new Date(now).toISOString(); out.settled++; }
    await d.patch(s.id, patch);
    if (g.status !== "landed") continue;
    out.landed++;
    /* The reader who booked it, if signed in and subscribed (owner, 13 Oct 2026:
       only when every game on the slip has landed). Best effort. */
    if (typeof d.userPing === "function" && /^u:/.test(String(s.subject || ""))) {
      try { if (await d.userPing(s.subject.slice(2), userNote(Object.assign({}, s, patch)))) out.userPinged = (out.userPinged || 0) + 1; }
      catch (e) { /* the grade above already stuck */ }
    }
    if (typeof d.ping === "function" && !s.notified && Number(s.total_odds) >= pingAt) {
      const full = Object.assign({}, s, patch);
      if (await d.ping(pingText(full), full)) {
        await d.patch(s.id, { notified: true });
        out.pinged++;
      }
    }
  }
  return out;
}

/* What lib/bookproxy.js saves: the minted code from either response shape. */
function codeOf(body) {
  const c = body && (body.booking_code || body.code);
  return typeof c === "string" && /^[A-Za-z0-9]{3,24}$/.test(c) ? c : null;
}

module.exports = { grade, tick, codeOf, userNote, product, trackAll, PING_AT, NEW_PER_RUN, CHECK_AT, READER_SRCS, isReaderSrc };
