// test/auth-session.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const S = require("../lib/auth/session.js");
const { sha256hex } = require("../lib/auth/crypto.js");
const U = "11111111-1111-4111-8111-111111111111";
const DAY = 864e5, T0 = Date.UTC(2026, 8, 29, 10);

/* An in-memory stand-in with the Task 3 contract. */
function memDb() {
  const rows = []; let n = 0;
  return { rows,
    async insertSession(r) { const s = Object.assign({ id: "00000000-0000-4000-8000-00000000000" + (n++), ended_at: null }, r); rows.push(s); return s; },
    async liveSessions(uid, nowIso) { return rows.filter((s) => s.user_id === uid && !s.ended_at && s.expires_at > nowIso)
      .sort((a, b) => (a.last_used_at < b.last_used_at ? 1 : -1)); },
    async endSessions(ids, reason, nowIso) { rows.forEach((s) => { if (ids.includes(s.id) && !s.ended_at) { s.ended_at = nowIso; s.end_reason = reason; } }); return true; },
    async sessionByHash(h) { return rows.find((s) => s.token_hash === h) || null; },
    async updateSession(id, p) { Object.assign(rows.find((s) => s.id === id), p); return true; } };
}
const reqWith = (token) => ({ headers: { cookie: "a=1; " + S.COOKIE + "=" + token + "; b=2" } });

test("the cookie is __Host-, HttpOnly, Secure, SameSite=Lax, whole site", () => {
  const c = S.cookie(S.COOKIE, "tok", 2592000);
  assert.match(c, /^__Host-sw_session=tok; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  assert.doesNotMatch(c, /Domain=/i);
});

test("a new session stores only the hash of a fresh token", async () => {
  const db = memDb();
  const s = await S.startSession(db, U, "Chrome/1 Android", T0);
  assert.strictEqual(db.rows[0].token_hash, sha256hex(s.token));
  assert.ok(!JSON.stringify(db.rows).includes(s.token));
  assert.strictEqual(db.rows[0].label, "Chrome on Android");
});

test("a fourth device signs out the least recently used one", async () => {
  const db = memDb();
  const a = await S.startSession(db, U, "", T0);
  await S.startSession(db, U, "", T0 + 1000);
  await S.startSession(db, U, "", T0 + 2000);
  const d = await S.startSession(db, U, "", T0 + 3000);
  assert.strictEqual(d.displaced.length, 1);
  const r = await S.readSession(db, reqWith(a.token), T0 + 4000);
  assert.deepStrictEqual(r, { state: "ended", reason: "displaced" });
  assert.strictEqual((await db.liveSessions(U, new Date(T0 + 4000).toISOString())).length, 3);
});

test("a live session is renewed at most every ten minutes, never past 90 days", async () => {
  const db = memDb();
  const s = await S.startSession(db, U, "", T0);
  const early = await S.readSession(db, reqWith(s.token), T0 + 5 * 60e3);
  assert.strictEqual(early.state, "ok"); assert.strictEqual(early.setCookie, null);
  const later = await S.readSession(db, reqWith(s.token), T0 + 20 * 60e3);
  assert.match(later.setCookie, /Max-Age=2592000/);
  // Read at intermediate times to renew the session closer to expiry
  const at20d = await S.readSession(db, reqWith(s.token), T0 + 20 * DAY);
  assert.strictEqual(at20d.state, "ok");
  const at40d = await S.readSession(db, reqWith(s.token), T0 + 40 * DAY);
  assert.strictEqual(at40d.state, "ok");
  const at60d = await S.readSession(db, reqWith(s.token), T0 + 60 * DAY);
  assert.strictEqual(at60d.state, "ok");
  const at80d = await S.readSession(db, reqWith(s.token), T0 + 80 * DAY);
  assert.strictEqual(at80d.state, "ok");
  const nearEnd = await S.readSession(db, reqWith(s.token), T0 + 89 * DAY);
  assert.ok(Date.parse(db.rows[0].expires_at) <= T0 + 90 * DAY);
  assert.strictEqual(nearEnd.state, "ok");
  assert.deepStrictEqual(await S.readSession(db, reqWith(s.token), T0 + 90 * DAY + 1), { state: "ended", reason: "expired" });
});

test("no cookie, a malformed cookie or an unknown token is simply signed out", async () => {
  const db = memDb();
  assert.deepStrictEqual(await S.readSession(db, { headers: {} }, T0), { state: "none" });
  assert.deepStrictEqual(await S.readSession(db, reqWith("x' or 1=1"), T0), { state: "none" });
  assert.deepStrictEqual(await S.readSession(db, reqWith("A".repeat(43)), T0), { state: "none" });
});
