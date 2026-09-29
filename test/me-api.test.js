"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb, fakeRes, postReq, getReq } = require("./helpers/fakes.js");
const S = require("../lib/auth/session.js");
const Y = require("../lib/sync.js");

process.env.AUTH_ENABLED = "1";
process.env.AUTH_PEPPER = "p".repeat(64);
const me = require("../api/me.js");
const account = require("../api/account.js");

const leg = { id: "f1", code: "OV_1.5", p: 0.8, odd: 1.3 };
const slip = (sid, over) => Object.assign({ sid, at: "2026-09-20T10:00:00.000Z", code: null, legs: [leg], settled: false }, over || {});
const payload = (items, extra) => Object.assign(Y.empty(), { slips: { items, tomb: {} } }, extra || {});

function world() {
  let T = Date.UTC(2026, 8, 29, 10);
  const clock = () => T;
  const db = fakeDb(clock);
  const w = { db, clock, advance(ms) { T += ms; } };
  const hMe = me.make({ db, now: clock }), hAcc = account.make({ db, now: clock });
  w.me = async (req) => { const r = fakeRes(); await hMe(req, r); return r; };
  w.acc = async (req) => { const r = fakeRes(); await hAcc(req, r); return r; };
  w.user = async (email) => {
    const u = await db.createUser({ email });
    const s = await S.startSession(db, u.id, "Chrome/129 Android", clock());
    return { id: u.id, cookie: S.COOKIE + "=" + s.token };
  };
  return w;
}
const meGet = (cookie) => Object.assign(getReq("me", {}, { cookie }), { query: {} });
const mePost = (cookie, body) => Object.assign(postReq("me", body, { cookie }), { query: {} });

test("switched off, /api/me is a 404 and the page shows nothing", async () => {
  const w = world();
  process.env.AUTH_ENABLED = "0";
  try { assert.strictEqual((await w.me(meGet(""))).code, 404); } finally { process.env.AUTH_ENABLED = "1"; }
});

test("signed out is a 401, not an error", async () => {
  const w = world();
  assert.deepStrictEqual((await w.me(meGet(""))).json(), { error: "signed_out", reason: null });
});

test("a reader only ever sees their own data", async () => {
  const w = world();
  const a = await w.user("a@b.com"), b = await w.user("b@b.com");
  await w.me(mePost(a.cookie, { base_version: 0, data: payload({ sa: slip("sa") }) }));
  await w.me(mePost(b.cookie, { base_version: 0, data: payload({ sb: slip("sb") }) }));
  const ra = (await w.me(meGet(a.cookie))).json();
  assert.strictEqual(ra.email, "a@b.com");
  assert.deepStrictEqual(Object.keys(ra.data.slips.items), ["sa"]);
  assert.deepStrictEqual(ra.entitlements, {});
});

test("plan, email and user_id cannot be written through sync", async () => {
  const w = world();
  const a = await w.user("a@b.com"), b = await w.user("b@b.com");
  const r = await w.me(mePost(a.cookie, { base_version: 0, user_id: b.id,
    data: Object.assign(payload({ s1: slip("s1") }), { plan: "paid", email: "b@b.com", user_id: b.id }) }));
  assert.strictEqual(r.code, 200);
  assert.strictEqual(w.db.t.data[b.id], undefined, "nothing written for B");
  const stored = w.db.t.data[a.id].data;
  assert.strictEqual(stored.plan, undefined); assert.strictEqual(stored.email, undefined); assert.strictEqual(stored.user_id, undefined);
  assert.strictEqual(w.db.t.users.find((u) => u.id === a.id).email, "a@b.com");
});

test("a payload over 256 KB is refused with 413", async () => {
  const w = world();
  const a = await w.user("a@b.com");
  const big = payload({ s1: slip("s1", { legs: new Array(60).fill(Object.assign({}, leg, { label: "x".repeat(499) })) }) });
  for (let i = 2; i < 12; i++) big.slips.items["s" + i] = big.slips.items.s1;
  const r = await w.me(mePost(a.cookie, { base_version: 0, data: big }));
  assert.strictEqual(r.code, 413); assert.deepStrictEqual(r.json(), { error: "too_big" });
});

test("Review Focus 1: another device saved in between; nothing from either is lost", async () => {
  const w = world();
  const a = await w.user("a@b.com");
  await w.me(mePost(a.cookie, { base_version: 0, data: payload({ s1: slip("s1") }) }));
  // Between our read and our write, another device writes s2.
  w.db.onPut = () => { const row = w.db.t.data[a.id]; row.data.slips.items.s2 = slip("s2"); row.version++; };
  const r = await w.me(mePost(a.cookie, { base_version: 1, data: payload({ s1: slip("s1"), s3: slip("s3") }) }));
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(Object.keys(r.json().data.slips.items).sort(), ["s1", "s2", "s3"]);
  assert.strictEqual(r.json().version, 3);
});

test("Review Focus 3: a displaced or deleted account's cookie gets a clear signed-out answer", async () => {
  const w = world();
  const a = await w.user("a@b.com");
  for (let i = 0; i < 3; i++) { w.advance(1000); await S.startSession(w.db, a.id, "", w.clock()); }
  const displaced = await w.me(meGet(a.cookie));
  assert.strictEqual(displaced.code, 401);
  assert.deepStrictEqual(displaced.json(), { error: "signed_out", reason: "displaced" });
  const b = await w.user("b@b.com");
  await w.db.deleteUser(b.id);
  const gone = await w.me(meGet(b.cookie));
  assert.strictEqual(gone.code, 401);
  assert.strictEqual(gone.json().error, "signed_out");
});

test("writes are limited to 60 a minute per reader", async () => {
  const w = world();
  const a = await w.user("a@b.com");
  let last;
  for (let i = 0; i < 61; i++) last = await w.me(mePost(a.cookie, { base_version: 0, data: payload({}) }));
  assert.strictEqual(last.code, 429);
});

test("export downloads only the reader's own things, as a file", async () => {
  const w = world();
  const a = await w.user("a@b.com"), b = await w.user("b@b.com");
  await w.me(mePost(b.cookie, { base_version: 0, data: payload({ sb: slip("sb") }) }));
  const r = await w.acc(getReq("x", { action: "export" }, { cookie: a.cookie }));
  assert.strictEqual(r.code, 200);
  assert.match(r.headers["content-disposition"], /attachment; filename="soccerwizard-my-data\.json"/);
  const j = r.json();
  assert.strictEqual(j.profile.email, "a@b.com");
  assert.strictEqual(JSON.stringify(j).includes("sb"), false);
  assert.strictEqual(j.devices.length, 1);
  assert.strictEqual(JSON.stringify(j).includes("token_hash"), false);
});

test("delete needs a sign-in from the last 10 minutes, then removes everything", async () => {
  const w = world();
  const a = await w.user("a@b.com");
  w.advance(11 * 60e3);
  const late = await w.acc(Object.assign(postReq("x", {}, { cookie: a.cookie }), { query: { action: "delete" } }));
  assert.deepStrictEqual(late.json(), { error: "reauth" });
  const fresh = await w.user("c@b.com");
  const ok = await w.acc(Object.assign(postReq("x", {}, { cookie: fresh.cookie }), { query: { action: "delete" } }));
  assert.strictEqual(ok.code, 200);
  assert.match(ok.cookies()[0], /Max-Age=0$/);
  assert.strictEqual(w.db.t.users.some((u) => u.id === fresh.id), false);
  const d = await w.user("d@b.com");
  const cross = await w.acc(Object.assign(postReq("x", {}, { cookie: d.cookie, origin: "https://evil.example" }), { query: { action: "delete" } }));
  assert.strictEqual(cross.code, 403);
  assert.deepStrictEqual(cross.json(), { error: "forbidden" });
  assert.strictEqual(w.db.t.users.some((u) => u.id === d.id), true);
});

test("a session row with no created_at fails the reauth check closed, not open", async () => {
  const w = world();
  const a = await w.user("a@b.com");
  const s = w.db.t.sessions.find((x) => x.user_id === a.id);
  delete s.created_at;
  const r = await w.acc(Object.assign(postReq("x", {}, { cookie: a.cookie }), { query: { action: "delete" } }));
  assert.deepStrictEqual(r.json(), { error: "reauth" });
  assert.strictEqual(w.db.t.users.some((u) => u.id === a.id), true);
});
