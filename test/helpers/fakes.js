// test/helpers/fakes.js
"use strict";
/* In-memory stand-ins with the exact contracts of lib/auth/db.js (Task 3)
   and of a Vercel request/response, shared by the route tests. */
const { ORIGIN } = require("../../lib/auth/http.js");
const { COOKIE } = require("../../lib/auth/session.js");

function fakeDb(clock) {
  const t = { users: [], sessions: [], codes: [], attempts: [], data: {}, subs: {}, tiers: {}, rl: {} };
  let n = 0;
  const uuid = () => "00000000-0000-4000-8000-" + String(++n).padStart(12, "0");
  const nowIso = () => new Date(clock()).toISOString();
  const find = (arr, f) => arr.find(f) || null;
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const db = {
    t, onPut: null,
    async rlHit(key, w, limit) { t.rl[key] = (t.rl[key] || 0) + 1; return t.rl[key] <= limit; },
    async userBySub(sub) { const u = find(t.users, (x) => x.google_sub === sub); return u ? copy(u) : null; },
    async userByEmail(e) { const u = find(t.users, (x) => x.email === e); return u ? copy(u) : null; },
    async userById(id) { const u = find(t.users, (x) => x.id === id); return u ? copy(u) : null; },
    async createUser(u) {
      if (t.users.some((x) => x.email === u.email)) return null;
      const r = { id: uuid(), email: u.email, google_sub: u.google_sub || null, created_at: nowIso(), last_seen_at: nowIso() };
      t.users.push(r); return r;
    },
    async linkGoogle(id, sub) { const u = find(t.users, (x) => x.id === id && !x.google_sub); if (u) u.google_sub = sub; return true; },
    async touchUser() { return true; },
    async insertSession(r) { const s = Object.assign({ id: uuid(), ended_at: null, end_reason: null }, r); t.sessions.push(s); return s; },
    async liveSessions(uid, iso) {
      return t.sessions.filter((s) => s.user_id === uid && !s.ended_at && s.expires_at > iso)
        .sort((a, b) => (a.last_used_at < b.last_used_at ? 1 : a.last_used_at > b.last_used_at ? -1 : 0))
        .map(copy);
    },
    async sessionByHash(h) { const s = find(t.sessions, (x) => x.token_hash === h); return s ? copy(s) : null; },
    async updateSession(id, p) { const s = find(t.sessions, (x) => x.id === id); if (s) Object.assign(s, p); return true; },
    async endSessions(ids, reason, iso) { t.sessions.forEach((s) => { if (ids.includes(s.id) && !s.ended_at) { s.ended_at = iso; s.end_reason = reason; } }); return true; },
    async endAllSessions(uid, reason, iso) { t.sessions.forEach((s) => { if (s.user_id === uid && !s.ended_at) { s.ended_at = iso; s.end_reason = reason; } }); return true; },
    async insertCode(r) { t.codes.push(Object.assign({ id: uuid(), attempts: 0, consumed_at: null, created_at: nowIso() }, r)); return true; },
    async latestCode(e) { const l = t.codes.filter((c) => c.email === e && !c.consumed_at); return l.length ? copy(l[l.length - 1]) : null; },
    async killCodes(e, iso) { t.codes.forEach((c) => { if (c.email === e && !c.consumed_at) c.consumed_at = iso; }); return true; },
    async claimTry(id, seen) { const c = find(t.codes, (x) => x.id === id && x.attempts === seen); if (!c) return false; c.attempts++; return true; },
    async consumeCode(id, iso) { const c = find(t.codes, (x) => x.id === id && !x.consumed_at); if (!c) return false; c.consumed_at = iso; return true; },
    async insertAttempt(r) { const a = Object.assign({ started_at: null, consumed_at: null, created_at: nowIso() }, r); a.id = a.id || uuid(); t.attempts.push(a); return a; },
    async attemptById(id) { const a = find(t.attempts, (x) => x.id === id); return a ? copy(a) : null; },
    async attemptByState(h) { const a = find(t.attempts, (x) => x.state_hash === h); return a ? copy(a) : null; },
    async startAttempt(id, iso) { const a = find(t.attempts, (x) => x.id === id && !x.started_at); if (!a) return false; a.started_at = iso; return true; },
    async consumeAttempt(id, iso) { const a = find(t.attempts, (x) => x.id === id && !x.consumed_at); if (!a) return false; a.consumed_at = iso; return true; },
    async getUserData(uid) { const r = t.data[uid]; return r ? { data: copy(r.data), version: r.version } : null; },
    async putUserData(uid, data, base) {
      if (db.onPut) { const f = db.onPut; db.onPut = null; f(); }          // another device writes first
      const r = t.data[uid];
      if (!base) { if (r) return { ok: false, conflict: true }; t.data[uid] = { data: copy(data), version: 1 }; return { ok: true, version: 1 }; }
      if (!r || r.version !== base) return { ok: false, conflict: true };
      r.data = copy(data); r.version = base + 1; return { ok: true, version: r.version };
    },
    async featureTiers() { return Object.assign({}, t.tiers); },
    async subscription(uid) { return t.subs[uid] || null; },
    async deleteUser(uid) {
      t.users = t.users.filter((u) => u.id !== uid); t.sessions = t.sessions.filter((s) => s.user_id !== uid);
      delete t.data[uid]; delete t.subs[uid]; return true;
    },
    async housekeep() { return true; },
  };
  return db;
}

function fakeRes() {
  return {
    code: 0, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    end(b) { this.body = b == null ? "" : String(b); },
    json() { return JSON.parse(this.body); },
    cookies() { const c = this.headers["set-cookie"]; return c ? [].concat(c) : []; },
  };
}

const BASE = { "x-sw-request": "1", origin: ORIGIN, "x-forwarded-for": "102.89.1.2",
  "user-agent": "Mozilla/5.0 (Linux; Android 13) Chrome/129.0 Mobile Safari/537.36" };
const postReq = (route, body, headers) => ({ method: "POST", query: { route }, body: body || {}, headers: Object.assign({}, BASE, headers || {}) });
const getReq = (route, query, headers) => ({ method: "GET", query: Object.assign({ route }, query || {}), headers: Object.assign({}, BASE, headers || {}) });
/* "__Host-sw_session=<token>" from a response, ready to send back as a Cookie header. */
function sessionCookie(res) {
  const c = res.cookies().find((x) => x.startsWith(COOKIE + "=") && !/Max-Age=0$/.test(x));
  return c ? c.split(";")[0] : null;
}

module.exports = { fakeDb, fakeRes, postReq, getReq, sessionCookie };
