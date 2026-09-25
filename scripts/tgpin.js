#!/usr/bin/env node
/* Post a message to the channel and pin it in place of the current pin.
 *
 *   TG_PIN_TEXT="..." node scripts/tgpin.js
 *
 * Run from the Telegram posts workflow (it holds the token). The old pin is
 * unpinned, not deleted - it stays in the channel's history.
 */
const { withBot } = require("../lib/tgbot.js");
const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const chat = process.env.TELEGRAM_CHAT || "@soccerwizardTG";
const text = process.env.TG_PIN_TEXT || "";

async function tg(method, body) {
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const b = await r.json().catch(() => null);
  if (!b || !b.ok) throw new Error(method + ": " + ((b && b.description) || "http " + r.status));
  return b.result;
}

(async () => {
  if (!token || !text.trim()) { console.log("need TELEGRAM_BOT_TOKEN and TG_PIN_TEXT"); process.exit(1); }
  /* TG_PIN=0 posts without touching the pin - an announcement, not a welcome. */
  if (process.env.TG_PIN === "0") {
    /* TG_PHOTOS (comma-separated public URLs) posts an album, the text as its
       caption - how the owner's win screenshots go out. */
    const photos = String(process.env.TG_PHOTOS || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10);
    if (photos.length) {
      const r = await tg("sendMediaGroup", { chat_id: chat,
        media: photos.map((u, i) => Object.assign({ type: "photo", media: u }, i === 0 ? { caption: withBot(text, 1024).slice(0, 1024) } : {})) });
      console.log("posted album of " + r.length);
      return;
    }
    const m = await tg("sendMessage", { chat_id: chat, text: withBot(text), disable_web_page_preview: false });
    console.log("posted message " + m.message_id);
    return;
  }
  const chatInfo = await tg("getChat", { chat_id: chat });
  const old = chatInfo.pinned_message && chatInfo.pinned_message.message_id;
  const msg = await tg("sendMessage", { chat_id: chat, text: withBot(text), disable_web_page_preview: true });
  await tg("pinChatMessage", { chat_id: chat, message_id: msg.message_id, disable_notification: true });
  if (old) await tg("unpinChatMessage", { chat_id: chat, message_id: old });
  console.log("pinned message " + msg.message_id + (old ? ", unpinned " + old : ""));
})().catch((e) => { console.log("pin failed: " + e.message); process.exit(1); });
