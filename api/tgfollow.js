"use strict";
/* GET /api/tgfollow - every ten minutes, from Vercel cron (vercel.json).
 *
 * 1. Runs the results sweep (api/record-sweep.js) first. GitHub was meant to
 *    run it every ten minutes and in practice ran it every four or five hours
 *    (24 Sep: 02:04, 07:32, 12:51, 17:36 UTC), which both delays results and
 *    loses evening games outright - the sweep only banks a match it saw past
 *    the 80th minute. This cron gives the whole site's record ten-minute
 *    coverage, not just the bot.
 * 2. For every open "Follow my slip", grades the legs whose results are in
 *    (lib/follow.js) and DMs whatever is new: each leg as it settles, and the
 *    slip once it is done, always pointing back at the site.
 *
 * Auth: Vercel cron sends `Authorization: Bearer $CRON_SECRET` when that
 * variable is set; the sweep's own x-sweep-key is accepted too, so it can be
 * run by hand. Without CRON_SECRET, Vercel's cron user agent is accepted - the
 * job is idempotent (a leg is announced once), so a stray call costs a run.
 */
const SB = require("../lib/supabase.js");
const F = require("../lib/follow.js");

const SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";

function allowed(req) {
  const h = req.headers || {};
  const cron = process.env.CRON_SECRET || "";
  if (cron) return h.authorization === "Bearer " + cron || (process.env.SWEEP_KEY && h["x-sweep-key"] === process.env.SWEEP_KEY);
  if (process.env.SWEEP_KEY && h["x-sweep-key"] === process.env.SWEEP_KEY) return true;
  return /^vercel-cron\//.test(String(h["user-agent"] || ""));
}

async function send(chatId, text) {
  const r = await fetch("https://api.telegram.org/bot" + (process.env.TELEGRAM_BOT_TOKEN || "").trim() + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const b = await r.json().catch(() => null);
  return !!(b && b.ok);
}

module.exports = async function handler(req, res) {
  if (!allowed(req)) return res.status(401).json({ ok: false });
  const out = { swept: null, follows: 0, sent: 0, closed: 0 };

  if (process.env.SWEEP_KEY) {
    try {
      const r = await fetch(SITE + "/api/record-sweep", { headers: { "x-sweep-key": process.env.SWEEP_KEY } });
      const b = await r.json().catch(() => null);
      out.swept = b ? { ok: b.ok, finalised: b.finalised, observed: b.observed } : { ok: false };
    } catch (e) { out.swept = { ok: false }; }
  }

  const open = await SB.openFollows();
  if (!open.ok || !open.rows.length) return res.status(200).json(out);
  out.follows = open.rows.length;
  const since = open.rows.flatMap((f) => (f.legs || []).map((l) => l.date)).filter(Boolean).sort()[0];
  const got = since ? await SB.recentResults(since) : { ok: false, rows: [] };
  const results = (got.rows || []).map((r) => ({ date: r.match_date, home: r.home, away: r.away, hg: r.hg, ag: r.ag }));

  for (const f of open.rows) {
    const s = F.step(f, results, Date.now());
    if (!s.lines.length && !s.done) continue;
    const text = [];
    if (s.lines.length) text.push("🔔 <b>" + f.code + "</b> update", ...s.lines);
    if (s.final) text.push("", s.final, "", "Tomorrow's code and the slip builder: <a href=\"" + SITE + "\">soccerwizard.live</a> 🧙");
    else if (s.stale) text.push("🔔 <b>" + f.code + "</b>: I couldn't get every result for this one, so I've stopped following it. " +
      "Every graded code is on <a href=\"" + SITE + "/booking-codes\">soccerwizard.live</a>.");
    const ok = text.length ? await send(f.chat_id, text.join("\n")) : true;
    /* Only mark what was actually told: a failed send leaves `seen` alone so
       the next run says it again. */
    if (ok) {
      await SB.patchFollow(f.id, { seen: s.seen, done: s.done });
      if (text.length) out.sent++;
      if (s.done) out.closed++;
    }
  }
  return res.status(200).json(out);
};
