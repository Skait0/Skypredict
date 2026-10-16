"use strict";
/* THE OWNER'S WIN PING (SW_OWNER_TG_CHAT), from one place: the 10-minute grader
   (api/tgfollow.js via lib/slipwatch.js) and the admin's "It landed" on a check
   slip (api/account.js settle) - owner, 16 Oct 2026: "i just confirmed that a
   slip won, shouldnt that automatically send to telegram?". The ping is the post
   itself: the rank banner with the X-ready caption, then the code and the
   Telegram-ready caption. No code or user on the banner. */
const WIN = require("./winpost.js");

const SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";

async function tgCall(method, body) {
  const r = await fetch("https://api.telegram.org/bot" + (process.env.TELEGRAM_BOT_TOKEN || "").trim() + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const b = await r.json().catch(() => null);
  return !!(b && b.ok);
}
const send = (chatId, text) => tgCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true });
const sendPhoto = (chatId, photo, caption) => tgCall("sendPhoto", { chat_id: chatId, photo, caption: String(caption).slice(0, 1024) });

/* null when SW_OWNER_TG_CHAT is unset: hits still land on the admin page. */
function ownerPing() {
  const owner = String(process.env.SW_OWNER_TG_CHAT || "").trim();
  if (!owner) return null;
  return async (text, slip) => {
    const r = slip && WIN.rankOf(slip.total_odds);
    if (!r) return send(owner, text);
    await sendPhoto(owner, WIN.imageUrl(SITE, slip), WIN.caption(slip, "x"));
    return send(owner, text + "\n\n<b>Ready to post on Telegram:</b>\n" + WIN.caption(slip, "tg").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]));
  };
}

module.exports = { ownerPing, send, sendPhoto };
