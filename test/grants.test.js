"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb, fakeRes, postReq, getReq } = require("./helpers/fakes.js");
const S = require("../lib/auth/session.js");

process.env.AUTH_ENABLED = "1";
process.env.AUTH_PEPPER = "p".repeat(64);
const account = require("../api/account.js");

async function world() {
  const clock = () => Date.UTC(2026, 9, 6, 10);
  const db = fakeDb(clock);
  const rows = [];
  db.listGrants = async () => rows.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  db.upsertGrant = async (email, by) => { rows.push({ email, granted_by: by, created_at: new Date(clock() + rows.length).toISOString(), revoked_at: null }); return {}; };
  db.revokeGrant = async (email, iso) => { rows.forEach((r) => { if (r.email === email && !r.revoked_at) r.revoked_at = iso; }); return true; };
  const h = account.make({ db, now: clock, env: { SW_ADMIN_EMAILS: "Boss@x.com" } });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const user = async (email) => {
    const u = await db.createUser({ email });
    return S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token;
  };
  return { db, rows, call, admin: await user("boss@x.com"), plain: await user("a@b.com") };
}
const q = (r, action) => Object.assign(r, { query: { action } });
const get = (cookie) => q(getReq("account", {}, { cookie }), "grants");
const post = (cookie, action, body, hdr) => q(postReq("account", body, Object.assign({ cookie }, hdr || {})), action);

test("non-admin gets 403 on all three and nothing is written", async () => {
  const w = await world();
  assert.strictEqual((await w.call(get(w.plain))).code, 403);
  const g = await w.call(post(w.plain, "grant", { email: "x@y.com" }));
  assert.strictEqual(g.code, 403);
  assert.deepStrictEqual(g.json(), { error: "forbidden" });
  assert.strictEqual((await w.call(post(w.plain, "revoke", { email: "x@y.com" }))).code, 403);
  assert.strictEqual(w.rows.length, 0);
});

test("admin lists, grants and revokes", async () => {
  const w = await world();
  assert.deepStrictEqual((await w.call(get(w.admin))).json(), { grants: [] });
  assert.deepStrictEqual((await w.call(post(w.admin, "grant", { email: " Mum@Home.com " }))).json(), { ok: true });
  await w.call(post(w.admin, "grant", { email: "dad@home.com" }));
  const l = (await w.call(get(w.admin))).json().grants;
  assert.deepStrictEqual(l.map((g) => g.email), ["dad@home.com", "mum@home.com"]);
  assert.ok(l[0].created_at);
  assert.deepStrictEqual((await w.call(post(w.admin, "revoke", { email: "MUM@home.com" }))).json(), { ok: true });
  assert.deepStrictEqual((await w.call(get(w.admin))).json().grants.map((g) => g.email), ["dad@home.com"]);
});

test("bad email is 400 and a missing CSRF header is rejected", async () => {
  const w = await world();
  for (const email of ["nope", "", undefined, "a@b.c".padEnd(260, "x") + "@y.com"]) {
    const r = await w.call(post(w.admin, "grant", { email }));
    assert.strictEqual(r.code, 400);
    assert.deepStrictEqual(r.json(), { error: "bad_email" });
  }
  const r = await w.call(post(w.admin, "grant", { email: "x@y.com" }, { "x-sw-request": "" }));
  assert.strictEqual(r.code, 403);
  assert.strictEqual(w.rows.length, 0);
});

test("signed out is 401", async () => {
  const w = await world();
  assert.strictEqual((await w.call(get(""))).code, 401);
});

test("a failed grant or revoke write is 503 unavailable, not ok", async () => {
  const w = await world();
  const db = { upsertGrant: async () => null, revokeGrant: async () => false };
  for (const [action, fn] of [["grant", "upsertGrant"], ["revoke", "revokeGrant"]]) {
    const w2 = await world();
    w2.db[fn] = db[fn];
    const r = await w2.call(post(w2.admin, action, { email: "x@y.com" }));
    assert.strictEqual(r.code, 503);
    assert.deepStrictEqual(r.json(), { error: "unavailable" });
  }
});
