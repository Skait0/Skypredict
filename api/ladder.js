"use strict";
/* THE DAILY LADDER (lib/ladder.js, sql/ladder.sql).
 *
 * GET /api/ladder           today's rungs for the site's codes card (public).
 *                           Only x5 carries its codes; the other rungs show odds
 *                           and game count, codes and legs held back (owner, 18 Oct).
 * GET /api/ladder?mine=1    the same, but every code for a Wizard Pass session
 *                           (never cached: it differs per reader).
 * GET /api/ladder?a=run     the 10:30 and 10:45 Lagos crons: book every rung
 *                           still missing today, then send each Wizard Pass
 *                           reader their rung on their bookie (push, Telegram).
 *
 * Booked once per rung per day: a stored rung is never booked again, so the
 * 10:45 retry only fills what 10:30 could not. A reader is marked sent only
 * after something reached them, so a failed morning is retried at 10:45.
 */
const SB = require("../lib/supabase.js");
const S = require("../lib/social.js");
const L = require("../lib/ladder.js");
const BIG = require("../lib/bigodds.js");
const R = require("../lib/roles.js");
const { allowed } = require("../lib/cronauth.js");
const { applyCache, BROWSER_REVALIDATE } = require("../lib/cachepolicy.js");

const SITE = () => process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const POLICY = { browser: BROWSER_REVALIDATE, cdn: "public, s-maxage=300", vercel: "public, s-maxage=300" };
const PASS = ["plus", "ff", "admin"];
const OPEN_RUNG = 5;

/* A rung without a pass: the odds and how many games per book, no code, no legs
   (a list of games is the slip, just typed by hand). */
function locked(row) {
  if (row.rung === OPEN_RUNG) return row;
  const codes = {};
  Object.keys(row.codes || {}).forEach((k) => { codes[k] = { n: row.codes[k] && row.codes[k].n }; });
  return { day: row.day, rung: row.rung, odds: row.odds, games: Array.isArray(row.legs) ? row.legs.length : 0, codes, legs: [], locked: true };
}

async function tgSend(chat, text) {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t || !chat) return false;
  const r = await fetch("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) }).catch(() => null);
  const b = r ? await r.json().catch(() => null) : null;
  return !!(b && b.ok);
}

/* Books the rungs not stored yet. Returns today's rows. */
async function fill(now, deps) {
  const day = S.dayOf(now);
  const have = await deps.getLadder(day);
  if (!have.ok) return { ok: false, rows: [] };
  const done = new Set(have.rows.map((r) => r.rung));
  const todo = L.RUNGS.filter((r) => !done.has(r.x));
  if (!todo.length) return { ok: true, rows: have.rows, minted: [] };
  const pay = await deps.payload();
  if (!pay || !Array.isArray(pay.fixtures)) return { ok: true, rows: have.rows, minted: [] };
  const feed = await deps.feed();
  const minted = [];
  /* One rung at a time: six books per rung in parallel is already the burst the
     bookies tolerate. */
  for (const rung of todo) {
    const row = await deps.mint(pay, now, feed, rung);
    if (row && (await deps.putLadder(row)).ok) minted.push(row);
  }
  return { ok: true, rows: have.rows.concat(minted), minted: minted.map((r) => r.rung) };
}

/* Sends each due reader their rung. Returns counts. */
async function deliver(now, rows, deps) {
  const day = S.dayOf(now);
  const byRung = {};
  rows.forEach((r) => { byRung[r.rung] = r; });
  const due = await deps.autopilotDue(day);
  const out = { due: due.rows.length, sent: 0, notToday: 0, notPass: 0 };
  for (const a of due.rows) {
    const row = byRung[a.rung];
    const msg = row && L.note(row, a.book);
    if (!msg) { out.notToday++; continue; }
    const pass = PASS.includes(await deps.roleOf(a.user_id));
    /* A pass that ran out gets one "pass ended" line, then silence: last_sent_day
       holds "ended:<day>" until a renewed pass sends again and overwrites it. */
    if (!pass && String(a.last_sent_day || "").startsWith("ended:")) { out.notPass++; continue; }
    const say = pass ? msg : L.ended(a.rung);
    let reached = false;
    if (a.push) reached = (await deps.push(a.user_id, say.push, new Date(now).toISOString())) || reached;
    if (a.tg_chat) reached = (await deps.tg(a.tg_chat, say.tg)) || reached;
    if (!pass) { out.notPass++; if (reached) await deps.markSent(a.user_id, "ended:" + day); continue; }
    if (reached && await deps.markSent(a.user_id, day)) out.sent++;
  }
  return out;
}

function make(deps) {
  return async function handler(req, res) {
    const q = req.query || {};
    if (q.a === "run") {
      if (!allowed(req)) return res.status(401).json({ ok: false });
      const now = deps.now();
      const f = await fill(now, deps);
      if (!f.ok) return res.status(200).json({ ok: false, why: "ladder unreadable" });
      const d = await deliver(now, f.rows, deps);
      return res.status(200).json({ ok: true, rungs: f.rows.map((r) => r.rung), minted: f.minted, delivery: d });
    }
    const got = await deps.getLadder(S.dayOf(deps.now()));
    const rows = got.ok ? got.rows : [];
    if (q.mine) {
      res.setHeader("Cache-Control", "private, no-store");
      const pass = PASS.includes(await deps.roleOfReq(req));
      return res.status(200).json({ ok: true, pass, rungs: pass ? rows : rows.map(locked) });
    }
    applyCache(res, POLICY);
    return res.status(200).json({ ok: true, rungs: rows.map(locked) });
  };
}

const live = {
  now: () => Date.now(),
  getLadder: SB.getLadder, putLadder: SB.putLadder,
  autopilotDue: SB.autopilotDue, markSent: SB.markAutopilotSent,
  payload: () => fetch(SITE() + "/predictions.json").then((r) => r.json()).catch(() => null),
  feed: () => BIG.feedNow().catch(() => []),
  mint: L.mintRung,
  roleOf: async (uid) => {
    try {
      const AUTHDB = require("../lib/auth/db.js");
      const u = await AUTHDB.userById(uid);
      return u ? await R.roleOf(AUTHDB, u, process.env) : "free";
    } catch (e) { return "free"; }
  },
  roleOfReq: async (req) => {
    try {
      const AUTHDB = require("../lib/auth/db.js");
      const s = await require("../lib/auth/session.js").readSession(AUTHDB, req, Date.now());
      if (s.state !== "ok") return "free";
      const u = await AUTHDB.userById(s.userId);
      return u ? await R.roleOf(AUTHDB, u, process.env) : "free";
    } catch (e) { return "free"; }
  },
  /* The line goes on the reader's phones, then an empty push; the service worker
     shows the line (api/push.js?a=note). */
  push: async (uid, note, iso) => {
    const subs = await SB.pushSubsForUser(uid);
    if (!subs.length) return false;
    await SB.setPushNote(subs.map((s) => s.endpoint), note, iso);
    const out = await require("../lib/pushsend.js").pushTo(subs);
    return !!(out && out.sent);
  },
  tg: tgSend,
};

module.exports = make(live);
module.exports.make = make;
module.exports.fill = fill;
module.exports.deliver = deliver;
module.exports.locked = locked;
