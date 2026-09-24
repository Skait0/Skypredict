"use strict";
/* POST /api/tg - the Telegram bot's webhook. The code doctor.
 *
 * Someone sends the bot a booking code (any of the four books, or a share
 * link carrying one); it reads the code the same way /api/slip does, lays the
 * legs against today's board and answers with our model's read - strongest,
 * weakest, the chance they all land - plus links to convert or soften it on
 * the site. See lib/doctor.js.
 *
 * Only Telegram may call this: setWebhook is given a secret derived from the
 * bot token (scripts/tgwebhook.js), Telegram echoes it in a header, and
 * anything without it is refused. Private chats only - the channel and any
 * group the bot lands in are ignored, so it cannot be made to spam either.
 *
 * Always answers 200 once the request is genuine: Telegram retries anything
 * else, and a retry would send the reader the same reply twice.
 */
const crypto = require("crypto");
const { UPSTREAM } = require("../lib/upstream.js");
const D = require("../lib/doctor.js");
const CONVERT = require("../lib/convert.js");
const SB = require("../lib/supabase.js");
const QUOTA = require("../lib/quota.js");
const FOLLOW = require("../lib/follow.js");

const SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const ORDER = ["sporty", "bet9ja", "betking", "betpawa"];

const TOKEN = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
function secretFor(token) {
  return crypto.createHash("sha256").update("sw-webhook:" + token).digest("hex").slice(0, 48);
}

async function tg(method, body) {
  const r = await fetch("https://api.telegram.org/bot" + TOKEN() + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json().catch(() => null);
}

async function readCode(book, code) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(UPSTREAM + "/api/slip?book=" + book + "&code=" + encodeURIComponent(code),
      { signal: ctrl.signal, headers: { accept: "application/json" } });
    const b = await r.json().catch(() => null);
    return b && b.success && Array.isArray(b.legs) && b.legs.length ? b.legs : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

const HELLO =
  "🔮 <b>The Wizard's Eye</b> 🧙\n<i>Drop any code. The Wizard's Eye sees it all.</i>\n\n" +
  "Send me any booking code - SportyBet, Bet9ja, BetKing or betPawa - and you get:\n" +
  "🔥 your bankers\n👀 the legs to tighten\n💰 what it pays\n" +
  "🔁 the same slip on another bookie, one tap\n🔔 live updates as each game lands\n\n" +
  "Paste the code on its own, or a share link. Say which bookie if you know it.\n\n" +
  "Daily codes: @soccerwizardTG · <a href=\"" + SITE + "\">soccerwizard.live</a>\n<i>18+</i>";

/* CONVERSIONS IN THE BOT: FIVE A DAY PER PERSON (owner's call, 24 Sep). The
   doctor is unlimited; converting books a real code at a bookmaker, so it is
   counted in book_quota like every site booking, under a hashed Telegram id
   and src "tgbot". A count we cannot read lets the conversion through, the
   same fail-open rule the site's gate uses - an outage of ours is not the
   reader's problem. The cap is the funnel: past it, the site does unlimited. */
const CONVERT_CAP = 5;
const subjectOf = (uid) => "tg-" + crypto.createHash("sha256")
  .update((process.env.SW_QUOTA_PEPPER || "") + ":" + uid).digest("hex").slice(0, 24);

/* One button per other book, and Follow my slip, under every doctor reply. */
function convertButtons(from, code) {
  const row = ORDER.filter((b) => b !== from).map((b) => ({
    text: "🔁 " + D.BOOK_NAMES[b], callback_data: ["cv", b, from, code].join("|") }));
  return { inline_keyboard: [row, [{ text: "🔔 Follow my slip", callback_data: ["fw", from, code].join("|") }]] };
}

/* FOLLOW MY SLIP (lib/follow.js, api/tgfollow.js). Up to FOLLOW_CAP open at
   once per person, so the ten-minute job stays small; a slip settles within a
   day or two and frees its place. */
const FOLLOW_CAP = 5;
async function onFollow(cq) {
  const chat = cq.message && cq.message.chat;
  if (!chat || chat.type !== "private") return;
  const [tag, from, code] = String(cq.data || "").split("|");
  if (tag !== "fw" || !ORDER.includes(from) || !/^[A-Z0-9]{4,16}$/.test(code || "")) return;
  const say = (text) => tg("sendMessage", { chat_id: chat.id, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: cq.message.message_id });
  const open = await SB.openFollows(chat.id);
  if (!open.ok) { await say("I can't follow slips right now. Try again in a few minutes."); return; }
  if (!open.rows.some((r) => r.code === code) && open.rows.length >= FOLLOW_CAP) {
    await say("🔔 You're already following " + FOLLOW_CAP + " slips - that's the most at once. " +
      "One frees up as soon as it settles. Every graded code lives on <a href=\"" + SITE + "/booking-codes\">soccerwizard.live</a> 🧙");
    return;
  }
  const legs = await readCode(from, code);
  if (!legs) { await say("That code can't be read any more - it may have expired or its games started."); return; }
  const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => ({}));
  const tracked = FOLLOW.track(legs, (pay && pay.fixtures) || []);
  if (!tracked.length) {
    await say("😤 I can't follow any game on this slip - they're not on our board, or the markets can't be settled from a final score.");
    return;
  }
  const last = tracked.map((l) => Date.parse(l.ko || "")).filter(isFinite).sort((a, b) => b - a)[0];
  const put = await SB.putFollow({ chat_id: chat.id, book: from, code, legs: tracked, seen: {}, done: false,
    last_kickoff: last ? new Date(last).toISOString() : null });
  if (!put.ok) { await say("I can't follow slips right now. Try again in a few minutes."); return; }
  if (!put.added) {
    await say("🔔 You're already following <b>" + code + "</b> - I'll keep the updates coming 🧙");
    return;
  }
  await say("🔔 <b>Following " + code + "</b> 🧙\n\nI'll message you as each game lands, and when the whole slip is in." +
    (tracked.length < legs.length ? "\nTracking " + tracked.length + " of " + legs.length + " games (the rest aren't on our board or settle on a half-time score)." : "") +
    "\n\nWhile you wait: the slip builder and tomorrow's code are on <a href=\"" + SITE + "\">soccerwizard.live</a> 🔥");
}

async function onConvert(cq) {
  const chat = cq.message && cq.message.chat;
  if (!chat || chat.type !== "private") return;
  const [tag, to, from, code] = String(cq.data || "").split("|");
  if (tag !== "cv" || !ORDER.includes(to) || !ORDER.includes(from) || !/^[A-Z0-9]{4,16}$/.test(code || "")) return;
  const say = (text) => tg("sendMessage", { chat_id: chat.id, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: cq.message.message_id });
  const subject = subjectOf(cq.from && cq.from.id);
  const day = QUOTA.dayOf(Date.now());
  const used = await SB.countBookings(subject, day, CONVERT_CAP).catch(() => ({ ok: false, n: null }));
  if (used.ok && used.n >= CONVERT_CAP) {
    await say("🔥 That's your " + CONVERT_CAP + " conversions for today.\n\n" +
      "Want more? The converter on <a href=\"" + SITE + "/?book=" + from + "&code=" + code + "&go=convert\">soccerwizard.live</a> " +
      "does it with no daily limit, plus the slip builder and every graded code 🧙");
    return;
  }
  tg("sendChatAction", { chat_id: chat.id, action: "typing" }).catch(() => {});
  const legs = await readCode(from, code);
  if (!legs) { await say("That code can't be read any more - it may have expired or its games started."); return; }
  const r = await CONVERT.convert(legs, to);
  if (!r.code) {
    await say("😤 " + D.BOOK_NAMES[to] + " couldn't take this one" + (r.error ? " - " + esc(r.error) : "") +
      ". Try another bookie, or <a href=\"" + SITE + "/?book=" + from + "&code=" + code + "&go=convert\">the full converter</a>.");
    return;
  }
  await SB.recordBooking(subject, day, "tgbot").catch(() => {});
  const left = used.ok ? Math.max(0, CONVERT_CAP - used.n - 1) : null;
  const stuck = r.stuck || [];
  const out = ["🔁 <b>" + D.BOOK_NAMES[to] + ": <code>" + r.code + "</code></b> 🔥",
    r.booked.length + " of " + legs.length + " games converted."];
  if (stuck.length) out.push("Left behind: " + stuck.slice(0, 4).map((s) =>
    esc((s.leg.home || "") + " v " + (s.leg.away || "")) + " (" + esc(s.why) + ")").join("; ") +
    (stuck.length > 4 ? "; +" + (stuck.length - 4) + " more" : ""));
  if ((r.changed || []).length) out.push("Line moved to what " + D.BOOK_NAMES[to] + " sells on " + r.changed.length + " leg" + (r.changed.length === 1 ? "" : "s") + ".");
  out.push("", (left != null ? "⚡ " + left + " conversion" + (left === 1 ? "" : "s") + " left today. " : "") +
    "Unlimited, plus the slip builder, on <a href=\"" + SITE + "\">soccerwizard.live</a> 🧙", "<i>18+</i>");
  await say(out.join("\n"));
}

const esc = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const token = TOKEN();
  if (!token || req.headers["x-telegram-bot-api-secret-token"] !== secretFor(token)) {
    return res.status(401).json({ ok: false });
  }
  const cq = req.body && req.body.callback_query;
  if (cq) {
    /* Stop the button's spinner first; the work can take a few seconds. */
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "On it 🧙" }).catch(() => {});
    try { await (String(cq.data || "").startsWith("fw|") ? onFollow(cq) : onConvert(cq)); } catch (e) { /* the reader can tap again */ }
    return res.status(200).json({ ok: true });
  }
  const msg = req.body && req.body.message;
  if (!msg || !msg.chat || msg.chat.type !== "private" || typeof msg.text !== "string") {
    return res.status(200).json({ ok: true });
  }
  const chat = msg.chat.id;
  const say = (text) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: msg.message_id });

  try {
    /* t.me/<bot>?start=book_CODE arrives as "/start book_CODE" - the site's
       code dialog opens the bot on the code the reader just got. */
    const deep = /^\/start\s+(sporty|bet9ja|betking|betpawa)_([A-Za-z0-9]{4,16})\s*$/i.exec(msg.text);
    if (!deep && /^\/(start|help)\b/i.test(msg.text)) { await say(HELLO); return res.status(200).json({ ok: true }); }
    const { code, book } = deep ? { code: deep[2].toUpperCase(), book: deep[1].toLowerCase() } : D.parse(msg.text);
    if (!code) { await say("Send me a booking code, like <code>HUW6YC</code>."); return res.status(200).json({ ok: true }); }
    tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});

    /* The book named, or each in turn: one code rarely means something on two. */
    let legs = null, used = null;
    for (const b of book ? [book] : ORDER) {
      legs = await readCode(b, code);
      if (legs) { used = b; break; }
    }
    if (!legs) {
      await say("I couldn't read <code>" + code + "</code>" + (book ? " on " + D.BOOK_NAMES[book] : " on any of the four bookies") +
        ". Check the code - or it may have expired, or every game may have started.");
      return res.status(200).json({ ok: true });
    }
    const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => ({}));
    await tg("sendMessage", { chat_id: chat, text: D.reply(used, code, legs, (pay && pay.fixtures) || [], SITE),
      parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: msg.message_id,
      reply_markup: convertButtons(used, code) });
  } catch (e) {
    await say("Something went wrong reading that code. Try again in a minute.").catch(() => {});
  }
  return res.status(200).json({ ok: true });
};

module.exports.secretFor = secretFor;
