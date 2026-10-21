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
/* Buffer channels by service, looked up once per instance. */
const BCH = {};
/* Why the last Buffer post failed, for the admin's button (api/account.js postwin). */
let lastWhy = "";
async function postBuffer(service, text, image, extra) {
  const k = (process.env.BUFFER_KEY || "").trim();
  lastWhy = "";
  if (!k) { lastWhy = "BUFFER_KEY is not set"; return false; }
  try {
    if (!BCH[service]) {
      const org = (await gql(k, "{account{organizations{id}}}")).account.organizations[0].id;
      const ch = (await gql(k, `{channels(input:{organizationId:${JSON.stringify(org)}}){id service}}`)).channels
        .find((c) => c.service === service);
      BCH[service] = ch && ch.id;
    }
    if (!BCH[service]) { lastWhy = "no " + service + " channel in Buffer"; return false; }
    /* An image rides as assets:[{image:{url}}] - `images` is not a field (24 Sep). */
    const assets = image ? `assets:[{image:{url:${JSON.stringify(image)}}}],` : "";
    const res = (await gql(k, `mutation{createPost(input:{text:${JSON.stringify(text)},channelId:${JSON.stringify(BCH[service])},` +
      assets + (extra || "") + `schedulingType:automatic,mode:shareNow}){__typename ... on PostActionSuccess{post{id}} ... on MutationError{message}}}`)).createPost;
    if (res.__typename !== "PostActionSuccess") lastWhy = res.message || res.__typename;
    return res.__typename === "PostActionSuccess";
  } catch (e) { lastWhy = String(e && e.message || e); return false; }
}
const postX = (text, image) => postBuffer("twitter", text, image);
/* The Facebook Page (owner, 18 Oct 2026: "include facebook"); Buffer wants the post type. */
const postFB = (text, image) => postBuffer("facebook", text, image, "metadata:{facebook:{type:post}},");
async function postTG(text) {
  const t = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!t) return false;
  const r = await fetch("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHANNEL, text: withBot(text) }) });
  const b = await r.json().catch(() => null);
  return !!(b && b.ok);
}
/* The won-slip banner with its caption (1024 is Telegram's photo caption limit). */
/* A plain message to one chat (the owner's), without the channel's bot footer. */
async function tgTo(chat, text) {
  const t = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!t || !chat) return false;
  const r = await fetch("https://api.telegram.org/bot" + t + "/sendMessage", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => null);
  const b = r ? await r.json().catch(() => null) : null;
  return !!(b && b.ok);
}
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
  /* PAUSE SWITCHES (lib/flags.js pause, Admin > Switches): wins, Big odds, the ladder. */
  const FL = require("../lib/flags.js");
  const flags = await FL.get(now).catch(() => ({}));
  const paused = (what) => FL.pausedOn(flags, what, S.dayOf(now));
  /* Big odds of the day: 11:00 Lagos, only on a day with enough bankers. */
  /* ONE MINTING A DAY, EVER (code review, 24 Sep). Each channel is gated on
     its own key, and once today's slip is stored any retry re-posts THOSE
     codes - it never books a second set that disagrees with what one channel
     already showed. */
  const bigKey = (ch) => "bigodds|" + S.dayOf(now) + "|" + ch;
  const bigDue = ["x", "tg"].filter((ch) => !posted.has(bigKey(ch)));
  if (S.hourOf(now) === 11 && bigDue.length && !paused("bigodds")) {
    const stored = await SB.getBigOdds(S.dayOf(now));
    let slip = stored.ok && stored.row ? BIG.fromRow(stored.row) : null;
    if (!slip && stored.ok && !stored.row) {
      /* Its own slip, never the ladder's x10 (18 Oct 2026): x10 is Wizard Pass only,
         and this one goes out on X and Telegram for everyone. Picked around the
         ladder's games, every rung (lib/ladder.js takenGames: no game on two codes). */
      const lad = await SB.getLadder(S.dayOf(now));
      slip = await BIG.mint(pay, now, L.bigSkips(lad.ok ? lad.rows : []));
      /* Stored for the site's daily codes card (/api/bigodds) before posting. */
      if (slip) await SB.putBigOdds(slip.row);
    }
    if (slip) for (const ch of bigDue) items.push({ key: bigKey(ch), kind: "bigodds", channel: ch, text: slip[ch] });
  }

  /* THE DAILY CODES (owner, 22 Oct 2026: "we should drop these codes everyday"): 11:00 Lagos,
     after the 10:30 and 10:45 ladder runs, the x5 code and the other rungs' payouts
     (lib/ladder.js drop). Once per channel per day; nothing on a day without an x5. */
  const ladKey = (ch) => "ladder|" + S.dayOf(now) + "|" + ch;
  const ladDue = ["x", "fb", "tg"].filter((ch) => !posted.has(ladKey(ch)));
  if (S.hourOf(now) === 11 && ladDue.length && !paused("ladder")) {
    const lad = await SB.getLadder(S.dayOf(now));
    const text = lad.ok ? L.drop(lad.rows) : null;
    if (text) for (const ch of ladDue) items.push({ key: ladKey(ch), kind: "ladder", channel: ch, text });
  }

  const sent = [];
  for (const it of items) {
    const ok = it.channel === "x" ? await postX(it.text) : it.channel === "fb" ? await postFB(it.text) : await postTG(it.text);
    if (ok) { await SB.logSocial({ key: it.key, channel: it.channel, kind: it.kind, text: it.text }); sent.push(it.key); }
  }
  /* THE REST WAIT FOR THE OWNER (owner, 18 Oct 2026: win approvals, after a x121.88
     slip went out that had paid x12.52). Each new x5+ win that is not confirmed goes
     to the owner's own chat once, the banner with what it paid, and the owner posts it
     from Admin > Won slips (api/account.js postwin). The banner in that chat can be
     forwarded as it is. */
  const landed = await SB.landedSlipsSince(new Date(now - 864e5).toISOString());
  /* A CONFIRMED win (every game won on its final score, lib/winpost.js confirmed) still
     posts itself, three a day per channel, biggest first. */
  if (landed.ok && !paused("wins")) {
    for (const ch of ["tg", "x", "fb"]) {
      for (const s of WIN.pick(landed.rows, log.rows, ch, now, S.dayOf, S.hourOf)) {
        const text = WIN.caption(s, ch), img = WIN.imageUrl(SITE, s);
        const ok = ch === "x" ? await postX(text, img) : ch === "fb" ? await postFB(text, img) : await postTGPhoto(img, text);
        if (ok) { await SB.logSocial({ key: WIN.key(s, ch), channel: ch, kind: "win", text }); sent.push(WIN.key(s, ch)); }
      }
    }
  }
  const owner = String(process.env.SW_OWNER_TG_CHAT || "").trim();
  if (landed.ok && owner) {
    for (const s of WIN.toAsk(landed.rows, log.rows, now, S.hourOf)) {
      if (await postTGPhoto(WIN.imageUrl(SITE, s), WIN.askText(s), owner)) {
        await SB.logSocial({ key: WIN.askKey(s), channel: "owner", kind: "winask", text: WIN.askText(s) });
        sent.push(WIN.askKey(s));
      }
    }
  }
  /* FEED ALARMS (lib/alarms.js): once a day each, to the owner's own chat. */
  if (owner) {
    const day = S.dayOf(now);
    const [lad, stats] = await Promise.all([SB.getLadder(day).catch(() => null), SB.adminStats().catch(() => null)]);
    const found = require("../lib/alarms.js").alarms({ now, hour: S.hourOf(now), payload: pay,
      ladder: lad && lad.ok ? lad.rows : null, ladderPaused: paused("ladder"), stats: stats && stats.ok ? stats.stats : null });
    for (const a of found) {
      const key = "alarm|" + a.id + "|" + day;
      if (posted.has(key)) continue;
      if (await tgTo(owner, a.text)) { await SB.logSocial({ key, channel: "owner", kind: "alarm", text: a.text }); sent.push(key); }
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
module.exports.postFB = postFB;
module.exports.lastWhy = () => lastWhy;
/* Scheduled posts per Buffer channel (limit 10 each on the free plan), for Admin > Today. */
module.exports.bufferQueue = async () => {
  const k = (process.env.BUFFER_KEY || "").trim();
  if (!k) return null;
  try {
    const org = (await gql(k, "{account{organizations{id}}}")).account.organizations[0].id;
    const d = await gql(k, `{posts(input:{organizationId:${JSON.stringify(org)},filter:{status:[scheduled]}},first:100){edges{node{channelService}}}}`);
    const out = { twitter: 0, instagram: 0, facebook: 0 };
    d.posts.edges.forEach((e) => { const c = e.node.channelService; out[c] = (out[c] || 0) + 1; });
    return out;
  } catch (e) { return null; }
};
module.exports.postTGPhoto = postTGPhoto;
