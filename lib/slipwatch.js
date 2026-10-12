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

const PING_AT = 20;      /* owner, 12 Oct 2026: x20 (was x50) */
const NEW_PER_RUN = 10;     /* each one is a read against the bookie, through Railway */
const READ_BUDGET_MS = 20000; /* the cron has 60s and the results sweep runs first */
const TERMINAL = new Set(["landed", "check", "lost", "stale"]);

/* One slip against the results we have. */
function grade(slip, results, now) {
  const s = F.step(slip, results, now);
  const legs = slip.legs || [];
  const marks = legs.map((_, i) => s.seen[i]);
  let status = "open";
  if (marks.includes("lost")) status = "lost";
  else if (legs.length && marks.every((m) => m === "won")) status = Number(slip.untracked) > 0 ? "check" : "landed";
  else if (s.stale) status = "stale";
  return { status, seen: s.seen };
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
    const tracked = d.track(legs, fixtures);
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
    const g = grade(s, results, now);
    const changed = g.status !== s.status || JSON.stringify(g.seen) !== JSON.stringify(s.seen || {});
    if (!changed) continue;
    const patch = { status: g.status, seen: g.seen };
    if (TERMINAL.has(g.status)) { patch.settled_at = new Date(now).toISOString(); out.settled++; }
    await d.patch(s.id, patch);
    if (g.status !== "landed") continue;
    out.landed++;
    if (typeof d.ping === "function" && !s.notified && Number(s.total_odds) >= pingAt) {
      if (await d.ping(pingText(Object.assign({}, s, patch)))) {
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

module.exports = { grade, tick, codeOf, product, PING_AT, NEW_PER_RUN };
