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
  await tg("setMyCommands", { commands: [{ command: "start", description: "What I do" }] });
  await tg("setMyShortDescription", { short_description:
    "Send any SportyBet, Bet9ja, BetKing or betPawa code. Get our model's read on every game." });
  const me = await tg("getMe", {});
  console.log("bot @" + me.username);
  const info = await tg("getWebhookInfo", {});
  console.log("webhook " + info.url + " pending=" + info.pending_update_count +
    (info.last_error_message ? " last error: " + info.last_error_message : ""));
})().catch((e) => { console.log("webhook setup failed: " + e.message); process.exit(1); });
