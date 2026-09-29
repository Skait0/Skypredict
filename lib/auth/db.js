"use strict";
/* Every query the account system makes, in one file, so "is this filtered by
   the caller's own id?" can be answered by reading one page. Service-role
   PostgREST only (see sql/accounts.sql: RLS on, no policies). Ids are checked
   against UUID_RE before any URL is built, values are encodeURIComponent'd,
   and nothing here ever builds SQL. */
const { call, headers } = require("../supabase.js");
const { UUID_RE } = require("./crypto.js");

const enc = encodeURIComponent;
const okId = (id) => typeof id === "string" && UUID_RE.test(id);
const JSONH = (extra) => headers(Object.assign({ "Content-Type": "application/json" }, extra || {}));

async function one(path) {
  const r = await call(path, { headers: headers() });
  return r.ok && Array.isArray(r.body) && r.body.length ? r.body[0] : null;
}
/* Like one(), but a database or network failure throws instead of reading as
   "no such row" - a blip must not sign a reader out and clear their device
   (see sessionByHash/userById below; the two callers whose "not found" means
   "signed out" or "no such user" need that distinction preserved). */
async function oneStrict(path) {
  const r = await call(path, { headers: headers() });
  if (!r.ok) throw new Error("db read failed: " + (r.why || ""));
  return Array.isArray(r.body) && r.body.length ? r.body[0] : null;
}
async function many(path) {
  const r = await call(path, { headers: headers() });
  return r.ok && Array.isArray(r.body) ? r.body : [];
}
async function insert(table, row) {
  const r = await call(table, { method: "POST", headers: JSONH({ Prefer: "return=representation" }), body: JSON.stringify(row) });
  return r.ok && Array.isArray(r.body) ? r.body[0] || null : null;
}
async function patch(pathWithFilter, obj) {
  const r = await call(pathWithFilter, { method: "PATCH", headers: JSONH({ Prefer: "return=minimal" }), body: JSON.stringify(obj) });
  return r.ok;
}

const USER_COLS = "select=id,email,google_sub,created_at,last_seen_at";
const userBySub = (sub) => typeof sub === "string" && sub ? one("users?google_sub=eq." + enc(sub) + "&" + USER_COLS) : Promise.resolve(null);
const userByEmail = (email) => typeof email === "string" && email ? one("users?email=eq." + enc(email) + "&" + USER_COLS) : Promise.resolve(null);
const userById = (id) => okId(id) ? oneStrict("users?id=eq." + id + "&" + USER_COLS) : Promise.resolve(null);
const createUser = (u) => insert("users", { email: u.email, google_sub: u.google_sub || null });
const linkGoogle = (id, sub) => okId(id) ? patch("users?id=eq." + id + "&google_sub=is.null", { google_sub: sub }) : Promise.resolve(false);
const touchUser = (id, nowIso) => okId(id) ? patch("users?id=eq." + id, { last_seen_at: nowIso }) : Promise.resolve(false);

const SESS_COLS = "select=id,user_id,label,created_at,last_used_at,expires_at,absolute_expires_at,ended_at,end_reason";
const insertSession = (row) => okId(row && row.user_id) ? insert("sessions", row) : Promise.resolve(null);
const liveSessions = (userId, nowIso) => okId(userId)
  ? many("sessions?user_id=eq." + userId + "&ended_at=is.null&expires_at=gt." + enc(nowIso) + "&order=last_used_at.desc&" + SESS_COLS)
  : Promise.resolve([]);
const sessionByHash = (h) => /^[0-9a-f]{64}$/.test(String(h)) ? oneStrict("sessions?token_hash=eq." + h + "&" + SESS_COLS) : Promise.resolve(null);
const updateSession = (id, p) => okId(id) ? patch("sessions?id=eq." + id, p) : Promise.resolve(false);
function endSessions(ids, reason, nowIso) {
  const list = (ids || []).filter(okId);
  if (!list.length) return Promise.resolve(true);
  return patch("sessions?id=in.(" + list.join(",") + ")&ended_at=is.null", { ended_at: nowIso, end_reason: reason });
}
const endAllSessions = (userId, reason, nowIso) => okId(userId)
  ? patch("sessions?user_id=eq." + userId + "&ended_at=is.null", { ended_at: nowIso, end_reason: reason })
  : Promise.resolve(false);

const insertCode = async (row) => !!(await insert("login_codes", row));
const latestCode = (email) => one("login_codes?email=eq." + enc(email) + "&consumed_at=is.null&order=created_at.desc&limit=1&select=id,email,code_hash,expires_at,attempts,consumed_at");
const updateCode = (id, p) => okId(id) ? patch("login_codes?id=eq." + id, p) : Promise.resolve(false);
const killCodes = (email, nowIso) => patch("login_codes?email=eq." + enc(email) + "&consumed_at=is.null", { consumed_at: nowIso });

const ATT_COLS = "select=id,state_hash,code_verifier,nonce,return_to,handoff_hash,ip_hash,user_id,created_at,expires_at,started_at,consumed_at";
const insertAttempt = (row) => insert("auth_attempts", row);
const attemptById = (id) => okId(id) ? one("auth_attempts?id=eq." + id + "&" + ATT_COLS) : Promise.resolve(null);
const attemptByState = (h) => /^[0-9a-f]{64}$/.test(String(h)) ? one("auth_attempts?state_hash=eq." + h + "&" + ATT_COLS) : Promise.resolve(null);
const attemptByHandoff = (h) => /^[0-9a-f]{64}$/.test(String(h)) ? one("auth_attempts?handoff_hash=eq." + h + "&" + ATT_COLS) : Promise.resolve(null);
const updateAttempt = (id, p) => okId(id) ? patch("auth_attempts?id=eq." + id, p) : Promise.resolve(false);

async function getUserData(userId) {
  if (!okId(userId)) return null;
  const row = await one("user_data?user_id=eq." + userId + "&select=data,version");
  return row ? { data: row.data || {}, version: row.version | 0 } : null;
}
/* Optimistic concurrency: the write only lands if the stored version is the
   one the caller merged against. A miss is a conflict, and api/me re-merges. */
async function putUserData(userId, data, baseVersion) {
  if (!okId(userId)) return { ok: false };
  const now = new Date().toISOString();
  if (!baseVersion) {
    const r = await call("user_data", { method: "POST", headers: JSONH({ Prefer: "return=representation" }),
      body: JSON.stringify({ user_id: userId, data, version: 1, updated_at: now }) });
    if (r.ok) return { ok: true, version: 1 };
    return /23505|409|duplicate/.test(r.why || "") ? { ok: false, conflict: true } : { ok: false };
  }
  const next = (baseVersion | 0) + 1;
  const r = await call("user_data?user_id=eq." + userId + "&version=eq." + (baseVersion | 0), {
    method: "PATCH", headers: JSONH({ Prefer: "return=representation" }),
    body: JSON.stringify({ data, version: next, updated_at: now }) });
  if (!r.ok) return { ok: false };
  return Array.isArray(r.body) && r.body.length ? { ok: true, version: next } : { ok: false, conflict: true };
}

async function featureTiers() {
  const out = {};
  (await many("feature_access?select=feature,tier")).forEach((r) => { out[r.feature] = r.tier; });
  return out;
}
const subscription = (userId) => okId(userId) ? one("subscriptions?user_id=eq." + userId + "&select=plan,status,current_period_end") : Promise.resolve(null);

async function deleteUser(userId) {
  if (!okId(userId)) return false;
  const r = await call("users?id=eq." + userId, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  return r.ok;
}

async function rlHit(key, windowS, limit) {
  const r = await call("rpc/rl_hit", { method: "POST", headers: JSONH(),
    body: JSON.stringify({ p_key: String(key).slice(0, 200), p_window: windowS | 0, p_limit: limit | 0 }) });
  return r.ok && r.body === true;
}

async function housekeep(nowMs) {
  const day = new Date(nowMs - 864e5).toISOString(), month = new Date(nowMs - 30 * 864e5).toISOString();
  const del = (p) => call(p, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
  const rs = await Promise.all([
    del("login_codes?created_at=lt." + enc(day)),
    del("auth_attempts?created_at=lt." + enc(day)),
    del("sessions?ended_at=lt." + enc(month)),
    del("rate_counters?window_start=lt." + enc(day)),
  ]);
  return rs.every((r) => r.ok);
}

/* A PATCH that only matches while the row is still in the state we read, and
   returns what it changed. Empty = another request won the race. This is what
   makes codes, attempts and handoffs single-use under concurrency. */
async function claim(pathWithFilter, obj) {
  const r = await call(pathWithFilter, { method: "PATCH", headers: JSONH({ Prefer: "return=representation" }), body: JSON.stringify(obj) });
  return r.ok && Array.isArray(r.body) && r.body.length === 1;
}
const claimTry = (id, seen) => okId(id) ? claim("login_codes?id=eq." + id + "&attempts=eq." + (seen | 0), { attempts: (seen | 0) + 1 }) : Promise.resolve(false);
const consumeCode = (id, nowIso) => okId(id) ? claim("login_codes?id=eq." + id + "&consumed_at=is.null", { consumed_at: nowIso }) : Promise.resolve(false);
const startAttempt = (id, nowIso) => okId(id) ? claim("auth_attempts?id=eq." + id + "&started_at=is.null", { started_at: nowIso }) : Promise.resolve(false);
const consumeAttempt = (id, nowIso) => okId(id) ? claim("auth_attempts?id=eq." + id + "&consumed_at=is.null", { consumed_at: nowIso }) : Promise.resolve(false);
const claimHandoff = (id, userId, newHash) => okId(id) && okId(userId) && /^[0-9a-f]{64}$/.test(String(newHash))
  ? claim("auth_attempts?id=eq." + id + "&user_id=eq." + userId, { user_id: null, handoff_hash: newHash })
  : Promise.resolve(false);

module.exports = { userBySub, userByEmail, userById, createUser, linkGoogle, touchUser,
  insertSession, liveSessions, sessionByHash, updateSession, endSessions, endAllSessions,
  insertCode, latestCode, updateCode, killCodes,
  insertAttempt, attemptById, attemptByState, attemptByHandoff, updateAttempt,
  getUserData, putUserData, featureTiers, subscription, deleteUser, rlHit, housekeep,
  claimTry, consumeCode, startAttempt, consumeAttempt, claimHandoff };
