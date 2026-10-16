"use strict";
/* CONNECT TELEGRAM (owner, 16 Oct 2026). The account panel asks api/account.js
   (action "tglink") for a link to the bot carrying a signed token; the bot
   (api/tg.js, "/start link_<token>") checks it and files which hashed Telegram
   id belongs to which account (sql/tglinks.sql). A pass then works in the bot.

   The token is the user id, an expiry and an HMAC over both - nothing stored,
   nothing to clean up. Fixed widths, no separators, so it fits Telegram's
   64-character [A-Za-z0-9_-] start parameter with "link_" in front:
   32 hex (uuid) + 7 base36 (expiry, seconds) + 16 hex (signature) = 55. */
const crypto = require("crypto");

const TTL_S = 15 * 60;
const TOKEN_RE = /^[0-9a-f]{32}[0-9a-z]{7}[0-9a-f]{16}$/;

const sign = (body, secret) => crypto.createHmac("sha256", String(secret)).update("tglink:" + body).digest("hex").slice(0, 16);

function makeToken(userId, nowMs, secret) {
  const hex = String(userId || "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex) || !secret) return null;
  const exp = Math.floor(nowMs / 1000 + TTL_S).toString(36).padStart(7, "0");
  return hex + exp + sign(hex + exp, secret);
}

/* The user id, or null for a bad, forged or expired token. */
function readToken(token, nowMs, secret) {
  const t = String(token || "");
  if (!TOKEN_RE.test(t) || !secret) return null;
  const body = t.slice(0, 39), sig = t.slice(39);
  const want = sign(body, secret);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  if (parseInt(body.slice(32), 36) * 1000 < nowMs) return null;
  const h = body.slice(0, 32);
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}

module.exports = { makeToken, readToken, TTL_S };
