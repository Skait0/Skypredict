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
  "🧙 <b>Soccerwizard code doctor</b>\n\n" +
  "Send me any booking code - SportyBet, Bet9ja, BetKing or betPawa - and I'll tell you " +
  "which games our model rates, which ones are weak, and the chance the whole slip lands.\n\n" +
  "Paste the code on its own, or a share link. Say which bookie if you know it.\n\n" +
  "Daily codes: @soccerwizardTG · <a href=\"" + SITE + "\">soccerwizard.live</a>\n<i>18+</i>";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const token = TOKEN();
  if (!token || req.headers["x-telegram-bot-api-secret-token"] !== secretFor(token)) {
    return res.status(401).json({ ok: false });
  }
  const msg = req.body && req.body.message;
  if (!msg || !msg.chat || msg.chat.type !== "private" || typeof msg.text !== "string") {
    return res.status(200).json({ ok: true });
  }
  const chat = msg.chat.id;
  const say = (text) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: msg.message_id });

  try {
    if (/^\/(start|help)\b/i.test(msg.text)) { await say(HELLO); return res.status(200).json({ ok: true }); }
    const { code, book } = D.parse(msg.text);
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
    await say(D.reply(used, code, legs, (pay && pay.fixtures) || [], SITE));
  } catch (e) {
    await say("Something went wrong reading that code. Try again in a minute.").catch(() => {});
  }
  return res.status(200).json({ ok: true });
};

module.exports.secretFor = secretFor;
