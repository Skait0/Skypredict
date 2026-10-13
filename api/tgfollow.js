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

const { allowed } = require("../lib/cronauth.js");

async function send(chatId, text) {
  const r = await fetch("https://api.telegram.org/bot" + (process.env.TELEGRAM_BOT_TOKEN || "").trim() + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const b = await r.json().catch(() => null);
  return !!(b && b.ok);
}

/* A photo with a caption, for the owner's win ping: the banner they can forward as it is. */
async function sendPhoto(chatId, photo, caption) {
  const r = await fetch("https://api.telegram.org/bot" + (process.env.TELEGRAM_BOT_TOKEN || "").trim() + "/sendPhoto", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, photo, caption: String(caption).slice(0, 1024) }),
  });
  const b = await r.json().catch(() => null);
  return !!(b && b.ok);
}

const W = require("../lib/slipwatch.js");
const WIN = require("../lib/winpost.js");

/* The same read-back api/tg.js uses for Follow my slip (lib/upstream.js). */
const readCode = require("../lib/upstream.js").readSlip;

function slipDeps() {
  const owner = String(process.env.SW_OWNER_TG_CHAT || "").trim();
  return {
    newSlips: (n) => SB.newSiteSlips(n),
    openSlips: () => SB.openSiteSlips(),
    patch: (id, p) => SB.patchSiteSlip(id, p),
    readCode,
    fixtures: async () => {
      const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => ({}));
      return (pay && pay.fixtures) || [];
    },
    /* track left to lib/slipwatch.js (trackAll): every leg on the board, by market code. */
    results: async (since) => ((await SB.recentResults(since)).rows || [])
      .map((r) => ({ date: r.match_date, home: r.home, away: r.away, hg: r.hg, ag: r.ag,
        hc: r.hc, ac: r.ac, hsh: r.hsh, ash: r.ash, seq: r.seq, hth: r.hth, hta: r.hta })),
    /* The owner's own chat (SW_OWNER_TG_CHAT). Unset: hits still land on the admin page. */
    /* A WIN THE OWNER CAN SHARE (12 Oct 2026: "a win just came in. there is no way for me to share it").
       The ping is the post itself: the rank banner with the X-ready caption, forwardable as it is,
       then the code and the Telegram-ready caption as a second message. No code or user on the banner. */
    ping: owner ? async (text, slip) => {
      const r = slip && WIN.rankOf(slip.total_odds);
      if (!r) return send(owner, text);
      await sendPhoto(owner, WIN.imageUrl(SITE, slip), WIN.caption(slip, "x"));
      return send(owner, text + "\n\n<b>Ready to post on Telegram:</b>\n" + WIN.caption(slip, "tg").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]));
    } : null,
  };
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

  /* 3. Every code booked on the site: read back, graded, hits listed for the admin
     and big ones messaged to the owner (lib/slipwatch.js). Its own try, before the
     follows, which return early when nobody is following anything. */
  try { out.slips = await W.tick(slipDeps()); } catch (e) { out.slips = { ok: false }; }

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
