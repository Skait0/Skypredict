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
const L = require("../lib/ladder.js");
const WIN = require("../lib/winpost.js");

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
async function postX(text, image) {
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
    /* An image rides as assets:[{image:{url}}] - `images` is not a field (24 Sep). */
    const assets = image ? `assets:[{image:{url:${JSON.stringify(image)}}}],` : "";
    const res = (await gql(k, `mutation{createPost(input:{text:${JSON.stringify(text)},channelId:${JSON.stringify(XCH)},` +
      assets + `schedulingType:automatic,mode:shareNow}){__typename ... on PostActionSuccess{post{id}} ... on MutationError{message}}}`)).createPost;
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
/* The won-slip banner with its caption (1024 is Telegram's photo caption limit). */
async function postTGPhoto(photo, caption, chat) {
  const t = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!t) return false;
  const r = await fetch("https://api.telegram.org/bot" + t + "/sendPhoto", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat || CHANNEL, photo, caption: chat ? String(caption).slice(0, 1024) : withBot(caption, 1024) }) });
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
      /* Its own slip, never the ladder's x10 (18 Oct 2026): x10 is Wizard Pass only,
         and this one goes out on X and Telegram for everyone. Picked around the
         locked rungs' games too, or it would be x10 again, and around the open x5
         (lib/ladder.js BIG_KEEP_OUT). */
      const lad = await SB.getLadder(S.dayOf(now));
      slip = await BIG.mint(pay, now, L.bigSkips(lad.ok ? lad.rows : []));
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
  /* WON SLIPS (lib/winpost.js): today's landed site slips at x5+, biggest first,
     three a day per channel, the banner plus a caption crediting a wizard rank -
     never a person or a code. social_log's key stops a double post. */
  const landed = await SB.landedSlipsSince(new Date(now - 864e5).toISOString());
  if (landed.ok) {
    for (const ch of ["tg", "x"]) {
      for (const s of WIN.pick(landed.rows, log.rows, ch, now, S.dayOf, S.hourOf)) {
        const text = WIN.caption(s, ch), img = WIN.imageUrl(SITE, s);
        const ok = ch === "x" ? await postX(text, img) : await postTGPhoto(img, text);
        if (ok) { await SB.logSocial({ key: WIN.key(s, ch), channel: ch, kind: "win", text }); sent.push(WIN.key(s, ch)); }
        /* A copy the owner can share (12 Oct 2026: a channel post could not be shared): the same banner
           to their own chat, with the X-ready caption, once per win (on the Telegram post). */
        const owner = String(process.env.SW_OWNER_TG_CHAT || "").trim();
        if (ok && ch === "tg" && owner) await postTGPhoto(img, WIN.caption(s, "x"), owner);
      }
    }
  }
  /* THE MORNING RECAP (lib/winpost.js recap): 10:00 Lagos, yesterday's x5+ wins, once per channel. */
  const recapDue = ["x", "tg"].filter((ch) => !posted.has("winrecap|" + S.dayOf(now) + "|" + ch));
  if (S.hourOf(now) === 10 && recapDue.length) {
    const yesterday = S.dayOf(now - 864e5);
    const from = Date.parse(yesterday + "T00:00:00Z") - 3600e3;   /* Lagos midnight */
    const got = await SB.landedSlipsSince(new Date(from).toISOString());
    const text = got.ok ? WIN.recap(got.rows, yesterday, S.dayOf) : null;
    if (text) for (const ch of recapDue) {
      const key = "winrecap|" + S.dayOf(now) + "|" + ch;
      const ok = ch === "x" ? await postX(text) : await postTG(text);
      if (ok) { await SB.logSocial({ key, channel: ch, kind: "winrecap", text }); sent.push(key); }
    }
  }
  return res.status(200).json({ ok: true, due: items.length, sent });
};
/* The admin's "Post to our channels" on a landed win (api/account.js postwin). */
module.exports.postX = postX;
module.exports.postTGPhoto = postTGPhoto;
