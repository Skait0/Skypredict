"use strict";
/* Gift a pass (owner, 16 Oct 2026): the admin gives a Day, Week or Month pass
   as a gift or a reimbursement; the reader gets an inbox message that says
   which, and a phone ping. api/account.js action "gift", sql/gifts.sql. */
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb, fakeRes, postReq } = require("./helpers/fakes.js");
const S = require("../lib/auth/session.js");

process.env.AUTH_ENABLED = "1";
process.env.AUTH_PEPPER = "p".repeat(64);
const account = require("../api/account.js");

async function world(opts) {
  const o = opts || {};
  const clock = () => Date.UTC(2026, 9, 16, 10);
  const db = fakeDb(clock);
  db.grantFor = async () => null;
  const gifts = [];
  db.giftPass = async (uid, pass, days, reason) => {
    if (o.noSql) throw new Error("gift_pass failed: http 404");
    gifts.push({ uid, pass, days, reason });
    return new Date(clock() + days * 86400000).toISOString();
  };
  const inbox = [], pings = [], log = [];
  const msgs = { add: async (rows) => { if (o.msgDown) return null; rows.forEach((r, i) => inbox.push(Object.assign({ id: i + 1 }, r))); return rows; } };
  const audit = { log: async (row) => { log.push(row); return true; }, list: async () => ({ ok: true, rows: log }) };
  const h = account.make({ db, now: clock, env: { SW_ADMIN_EMAILS: "boss@x.com" }, msgs, audit,
    ping: async (uids, note) => { pings.push({ uids, note }); return 1; } });
  const call = async (who, body) => {
    const r = fakeRes();
    await h(Object.assign(postReq("account", body, { cookie: who.cookie }), { query: { action: "gift" } }), r);
    return r;
  };
  const user = async (email) => {
    const u = await db.createUser({ email });
    return { id: u.id, cookie: S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token };
  };
  const boss = await user("boss@x.com"), plain = await user("a@b.com");
  return { call, boss, plain, gifts, inbox, pings, log };
}

test("a gift adds the pass and opens the message with a gift box", async () => {
  const w = await world();
  const r = await w.call(w.boss, { id: w.plain.id, pass: "week", reason: "gift", note: "Thanks for <b>sticking</b> with us" });
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(w.gifts, [{ uid: w.plain.id, pass: "week", days: 7, reason: "gift" }]);
  const body = w.inbox[0].body;
  assert.strictEqual(w.inbox[0].user_id, w.plain.id);
  assert.match(body, /^<p>🎁 <b>A gift from Soccerwizard<\/b><\/p>/);
  assert.match(body, /Week pass on your account, on us: 20 booking codes a day until 23 Oct/);
  assert.match(body, /Thanks for &lt;b&gt;sticking&lt;\/b&gt; with us/, "the note is text, never markup");
  assert.match(w.pings[0].note.title, /🎁/);
  assert.strictEqual(w.log[0].action, "gift");
});

test("a reimbursement says so, with no gift box", async () => {
  const w = await world();
  const r = await w.call(w.boss, { id: w.plain.id, pass: "month", reason: "reimburse" });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(w.gifts[0].days, 30);
  assert.match(w.inbox[0].body, /^<p><b>Reimbursement<\/b><\/p>/);
  assert.ok(!/🎁/.test(w.inbox[0].body));
  assert.match(w.pings[0].note.title, /Reimbursement/);
});

test("only the admin can gift, and only a real pass and reason", async () => {
  const w = await world();
  assert.strictEqual((await w.call(w.plain, { id: w.plain.id, pass: "day", reason: "gift" })).code, 403);
  assert.strictEqual((await w.call(w.boss, { id: w.plain.id, pass: "year", reason: "gift" })).code, 400);
  assert.strictEqual((await w.call(w.boss, { id: w.plain.id, pass: "day", reason: "bribe" })).code, 400);
  assert.strictEqual((await w.call(w.boss, { id: "not-a-uuid", pass: "day", reason: "gift" })).code, 400);
  assert.strictEqual(w.gifts.length, 0);
});

test("without sql/gifts.sql nothing is given and no message goes", async () => {
  const w = await world({ noSql: true });
  const r = await w.call(w.boss, { id: w.plain.id, pass: "day", reason: "gift" });
  assert.strictEqual(r.code, 503);
  assert.strictEqual(w.inbox.length, 0, "never tell them about a pass they did not get");
});

test("a message that fails to send still leaves the pass given, and says so", async () => {
  const w = await world({ msgDown: true });
  const r = await w.call(w.boss, { id: w.plain.id, pass: "day", reason: "gift" });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.json().sent, false);
  assert.strictEqual(w.gifts.length, 1);
});
