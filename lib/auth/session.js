"use strict";
/* Sessions: a 256-bit random token in a __Host- HttpOnly cookie, stored only
   as its SHA-256. 30 days renewed with use (at most every 10 minutes), 90
   days absolute. Three live devices per account; a fourth ends the least
   recently used ("displaced"). Spec section 5. */
const { randomToken, sha256hex, deviceLabel, TOKEN_RE } = require("./crypto.js");

const COOKIE = "__Host-sw_session";
const OAUTH_COOKIE = "__Host-sw_oauth";
const MAX_AGE_S = 30 * 86400;
const ABSOLUTE_MS = 90 * 864e5;
const RENEW_MS = 10 * 60e3;
const DEVICE_CAP = 3;
const iso = (ms) => new Date(ms).toISOString();

function cookie(name, value, maxAgeS) {
  return name + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + (maxAgeS | 0);
}
const clearCookie = (name) => cookie(name, "", 0);
function readCookie(req, name) {
  const raw = String(((req && req.headers) || {}).cookie || "");
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

async function startSession(db, userId, ua, nowMs) {
  const token = randomToken();
  const row = await db.insertSession({
    user_id: userId, token_hash: sha256hex(token), label: deviceLabel(ua),
    created_at: iso(nowMs), last_used_at: iso(nowMs),
    expires_at: iso(nowMs + MAX_AGE_S * 1000), absolute_expires_at: iso(nowMs + ABSOLUTE_MS),
  });
  if (!row) return null;
  const live = await db.liveSessions(userId, iso(nowMs));
  const displaced = live.filter((s) => s.id !== row.id).slice(DEVICE_CAP - 1).map((s) => s.id);
  if (displaced.length) await db.endSessions(displaced, "displaced", iso(nowMs));
  return { token, cookie: cookie(COOKIE, token, MAX_AGE_S), displaced };
}

async function readSession(db, req, nowMs) {
  const token = readCookie(req, COOKIE);
  if (!token || !TOKEN_RE.test(token)) return { state: "none" };
  const s = await db.sessionByHash(sha256hex(token));
  if (!s) return { state: "none" };
  if (s.ended_at) return { state: "ended", reason: s.end_reason || "ended" };
  const abs = Date.parse(s.absolute_expires_at);
  if (Date.parse(s.expires_at) <= nowMs || abs <= nowMs) return { state: "ended", reason: "expired" };
  let setCookie = null;
  if (nowMs - Date.parse(s.last_used_at) > RENEW_MS) {
    const exp = Math.min(nowMs + MAX_AGE_S * 1000, abs);
    await db.updateSession(s.id, { last_used_at: iso(nowMs), expires_at: iso(exp) });
    setCookie = cookie(COOKIE, token, Math.floor((exp - nowMs) / 1000));
  }
  return { state: "ok", session: s, userId: s.user_id, setCookie };
}

module.exports = { COOKIE, OAUTH_COOKIE, DEVICE_CAP, MAX_AGE_S, cookie, clearCookie, readCookie, startSession, readSession };
