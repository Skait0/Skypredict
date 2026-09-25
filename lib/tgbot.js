"use strict";
/**
 * Every post to the Telegram channel ends by pointing at the bot.
 *
 * Owner, 25 Sep 2026: "whenever you drop a message, also add the bots handle
 * and what it does briefly." The channel's readers are the people most likely
 * to paste a code, and the bot is where a pasted code gets read, converted and
 * followed. One line, one place - api/social.js, scripts/tgpost.js and
 * scripts/tgpin.js all send through it. The bot's own DMs do not: they ARE the
 * bot.
 */
const LINE = "🔮 @Soccerwizardhqbot - drop any booking code: the Wizard's Eye reads every leg, " +
  "converts it to your book and follows your slip live.";

/* Idempotent (a post that already names the bot is left alone), and never
   pushed past Telegram's limit: 4096 for a message, 1024 for a photo caption.
   Over the limit the post goes out as it was rather than cut mid-sentence. */
function withBot(text, max) {
  const t = String(text == null ? "" : text);
  if (/@Soccerwizardhqbot/i.test(t)) return t;
  const out = t.replace(/\s+$/, "") + "\n\n" + LINE;
  return out.length <= (max || 4096) ? out : t;
}

module.exports = { withBot, LINE };
