#!/usr/bin/env node
/* Point the bot at /api/tg, with the secret api/tg.js expects, and set its
 * command list and description. Run from the Telegram workflow (it holds the
 * token). Safe to rerun. */
const { secretFor } = require("../api/tg.js");
const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
const SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";

async function tg(method, body) {
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const b = await r.json().catch(() => null);
  if (!b || !b.ok) throw new Error(method + ": " + ((b && b.description) || "http " + r.status));
  return b.result;
}

(async () => {
  if (!token) { console.log("no TELEGRAM_BOT_TOKEN"); process.exit(1); }
  await tg("setWebhook", { url: SITE + "/api/tg", secret_token: secretFor(token),
    allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  /* THE START SCREEN AND THE MENU BUTTON (owner, 19 Oct 2026: "our telegram bot should have a
     start button", with SportyClaw's for comparison). The description is what a new reader
     reads above Telegram's START button; the commands fill the Menu button by the chat box. */
  const B = require("../lib/books.js");
  await tg("setMyCommands", { commands: [
    { command: "start", description: "Open the menu" },
    { command: "build", description: "Build a slip: pick your odds" },
    { command: "check", description: "Check a booking code" },
    { command: "dailyodds", description: "Today's x5 to x1000 codes" },
    { command: "bookie", description: "Change your bookie" },
    { command: "guide", description: "How it works, in pictures" },
    { command: "daily", description: "My daily slip here (Wizard Pass)" },
  ] });
  await tg("setChatMenuButton", { menu_button: { type: "commands" } });
  await tg("setMyShortDescription", { short_description:
    "🧙 Type your odds, get a code. Check, fix and convert any code on " + require("../lib/books.js").COUNT_WORD + " bookies. 18+" });
  await tg("setMyDescription", { description:
    "🧙 The Soccerwizard bot\n\n" +
    "🎯 Type 50 and get a x50 slip, booked on your bookie\n" +
    "🔍 Send any code and see the strong games and the weak ones\n" +
    "🛡 Make it safer, ✂️ trim it, ➗ split it, 🔁 move it to another bookie\n" +
    "📅 Daily odds: x5 to x1000 codes every morning at 10:30\n\n" +
    B.list("and") + ".\n\nTap START. 18+" });
  const me = await tg("getMe", {});
  console.log("bot @" + me.username);
  const info = await tg("getWebhookInfo", {});
  console.log("webhook " + info.url + " pending=" + info.pending_update_count +
    (info.last_error_message ? " last error: " + info.last_error_message : ""));
})().catch((e) => { console.log("webhook setup failed: " + e.message); process.exit(1); });
