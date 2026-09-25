"use strict";
/* GET /api/social - hourly, from Vercel cron. The social engine's hands.
 *
 * Asks lib/social.js what is due this Lagos hour, posts each item to X (via
 * Buffer, BUFFER_KEY) or the Telegram channel (the bot, TELEGRAM_BOT_TOKEN),
 * and logs it in social_log - whose unique key is what stops a double post.
 * Big odds of the day (lib/bigodds.js) is minted here too, because it books
 * real codes.
 *
 * Auth as api/tgfollow.js: CRON_SECRET when set, else Vercel's cron agent.
 */
const SB = require("../lib/supabase.js");
const S = require("../lib/social.js");
const BIG = require("../lib/bigodds.js");

const SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const CHANNEL = process.env.TELEGRAM_CHAT || "@soccerwizardTG";

const { allowed } = require("../lib/cronauth.js");
const { withBot } = require("../lib/tgbot.js");

async function gql(k, query) {
  const r = await fetch("https://api.buffer.com", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + k }, body: JSON.stringify({ query }) });
  const b = await r.json().catch(() => null);
  if (!r.ok || !b || b.errors) throw new Error("buffer " + r.status);
  return b.data;
}
let XCH = null;
async function postX(text) {
  const k = (process.env.BUFFER_KEY || "").trim();
  if (!k) return false;
  try {
    if (!XCH) {
      const org = (await gql(k, "{account{organizations{id}}}")).account.organizations[0].id;
      const ch = (await gql(k, `{channels(input:{organizationId:${JSON.stringify(org)}}){id service}}`)).channels
        .find((c) => c.service === "twitter");
      XCH = ch && ch.id;
    }
    if (!XCH) return false;
    const res = (await gql(k, `mutation{createPost(input:{text:${JSON.stringify(text)},channelId:${JSON.stringify(XCH)},` +
      `schedulingType:automatic,mode:shareNow}){__typename ... on PostActionSuccess{post{id}} ... on MutationError{message}}}`)).createPost;
    return res.__typename === "PostActionSuccess";
  } catch (e) { return false; }
}
async function postTG(text) {
  const t = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!t) return false;
  const r = await fetch("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHANNEL, text: withBot(text) }) });
  const b = await r.json().catch(() => null);
  return !!(b && b.ok);
}

module.exports = async function handler(req, res) {
  if (!allowed(req)) return res.status(401).json({ ok: false });
  const now = Date.now();
  const log = await SB.socialRecent(3);
  if (!log.ok) return res.status(200).json({ ok: false, why: "log unavailable - posting nothing rather than double-posting" });
  const posted = new Set(log.rows.map((r) => r.key));
  const lastPost = {};
  for (const r of log.rows) {
    const t = Date.parse(r.posted_at);
    if (!lastPost[r.channel] || t > lastPost[r.channel]) lastPost[r.channel] = t;
  }
  const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => null);
  if (!pay || !Array.isArray(pay.fixtures)) return res.status(200).json({ ok: false, why: "no payload" });

  const items = S.due(pay, now, posted, lastPost);
  /* Big odds of the day: 11:00 Lagos, only on a day with enough bankers. */
  /* ONE MINTING A DAY, EVER (code review, 24 Sep). Each channel is gated on
     its own key, and once today's slip is stored any retry re-posts THOSE
     codes - it never books a second set that disagrees with what one channel
     already showed. */
  const bigKey = (ch) => "bigodds|" + S.dayOf(now) + "|" + ch;
  const bigDue = ["x", "tg"].filter((ch) => !posted.has(bigKey(ch)));
  if (S.hourOf(now) === 11 && bigDue.length) {
    const stored = await SB.getBigOdds(S.dayOf(now));
    let slip = stored.ok && stored.row ? BIG.fromRow(stored.row) : null;
    if (!slip && stored.ok && !stored.row) {
      slip = await BIG.mint(pay, now);
      /* Stored for the site's daily codes card (/api/bigodds) before posting. */
      if (slip) await SB.putBigOdds(slip.row);
    }
    if (slip) for (const ch of bigDue) items.push({ key: bigKey(ch), kind: "bigodds", channel: ch, text: slip[ch] });
  }

  const sent = [];
  for (const it of items) {
    const ok = it.channel === "x" ? await postX(it.text) : await postTG(it.text);
    if (ok) { await SB.logSocial({ key: it.key, channel: it.channel, kind: it.kind, text: it.text }); sent.push(it.key); }
  }
  return res.status(200).json({ ok: true, due: items.length, sent });
};
