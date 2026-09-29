// test/auth-db.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

process.env.SUPABASE_URL = "https://sb.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
delete require.cache[require.resolve("../lib/supabase.js")];
const DB = require("../lib/auth/db.js");
const U1 = "11111111-1111-4111-8111-111111111111";

function capture(reply) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || "GET", body: init && init.body, headers: init && init.headers });
    const r = typeof reply === "function" ? reply(String(url), init) : reply;
    return { ok: r.status < 400, status: r.status, text: async () => JSON.stringify(r.body) };
  };
  return calls;
}

test("lookups filter by an encoded value and carry the service key", async () => {
  const calls = capture({ status: 200, body: [{ id: U1, email: "a+b@x.com" }] });
  const u = await DB.userByEmail("a+b@x.com");
  assert.strictEqual(u.id, U1);
  assert.match(calls[0].url, /\/rest\/v1\/users\?email=eq\.a%2Bb%40x\.com&select=/);
  assert.strictEqual(calls[0].headers.Authorization, "Bearer svc");
});

test("a malformed id never reaches the database", async () => {
  const calls = capture({ status: 200, body: [] });
  assert.strictEqual(await DB.userById("1 or 1=1"), null);
  assert.strictEqual(await DB.getUserData("../users"), null);
  assert.strictEqual(await DB.deleteUser("*"), false);
  assert.strictEqual(calls.length, 0);
});

test("live sessions are the unended, unexpired ones, most recent first", async () => {
  const calls = capture({ status: 200, body: [] });
  await DB.liveSessions(U1, "2026-09-29T10:00:00.000Z");
  assert.match(calls[0].url, new RegExp("sessions\\?user_id=eq\\." + U1 +
    "&ended_at=is\\.null&expires_at=gt\\.2026-09-29T10%3A00%3A00\\.000Z&order=last_used_at\\.desc"));
});

test("saving user data is conditional on the version it was based on", async () => {
  const calls = capture({ status: 200, body: [] });           // no row matched the version
  const r = await DB.putUserData(U1, { v: 1 }, 4);
  assert.deepStrictEqual(r, { ok: false, conflict: true });
  assert.strictEqual(calls[0].method, "PATCH");
  assert.match(calls[0].url, new RegExp("user_data\\?user_id=eq\\." + U1 + "&version=eq\\.4"));
  assert.strictEqual(JSON.parse(calls[0].body).version, 5);
});

test("a first save inserts version 1; a clash on insert is a conflict", async () => {
  capture({ status: 201, body: [{ version: 1 }] });
  assert.deepStrictEqual(await DB.putUserData(U1, { v: 1 }, 0), { ok: true, version: 1 });
  capture({ status: 409, body: { code: "23505", message: "duplicate key" } });
  assert.deepStrictEqual(await DB.putUserData(U1, { v: 1 }, 0), { ok: false, conflict: true });
});

test("the rate limiter fails closed", async () => {
  capture({ status: 500, body: { message: "down" } });
  assert.strictEqual(await DB.rlHit("send:e:abc", 900, 3), false);
  capture({ status: 200, body: true });
  assert.strictEqual(await DB.rlHit("send:e:abc", 900, 3), true);
});

test("claims are conditional: only the request that changed the row wins", async () => {
  let calls = capture({ status: 200, body: [{ id: U1 }] });
  assert.strictEqual(await DB.claimTry(U1, 2), true);
  assert.match(calls[0].url, new RegExp("login_codes\\?id=eq\\." + U1 + "&attempts=eq\\.2"));
  assert.strictEqual(JSON.parse(calls[0].body).attempts, 3);
  calls = capture({ status: 200, body: [] });                 // someone else got there first
  assert.strictEqual(await DB.consumeCode(U1, "2026-09-29T10:00:00.000Z"), false);
  assert.match(calls[0].url, /consumed_at=is\.null/);
  calls = capture({ status: 200, body: [] });
  assert.strictEqual(await DB.claimHandoff(U1, U1, "a".repeat(64)), false);
  assert.match(calls[0].url, new RegExp("auth_attempts\\?id=eq\\." + U1 + "&user_id=eq\\." + U1));
  assert.strictEqual(await DB.startAttempt("nope", "x"), false);
});

test("a database blip on a lookup throws, rather than reading as signed out", async () => {
  capture({ status: 500, body: { message: "down" } });
  await assert.rejects(DB.sessionByHash("a".repeat(64)), /db read failed/);
  await assert.rejects(DB.userById(U1), /db read failed/);
});
