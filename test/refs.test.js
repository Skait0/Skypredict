"use strict";
/* Tracking links (owner, 19 Oct 2026).
   The admin's numbers must credit a link only with what came after it:
   a new account is one made after the device first arrived, and a pass
   counts only when paid after that account's own hit. */
const test = require("node:test");
const assert = require("node:assert");
const RF = require("../lib/refs.js");
const make = require("../api/ref.js").make;

const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";

test("summary counts visits, new and old accounts, and only passes paid after the hit", () => {
  const hits = [
    { ref: "x1", kind: "visit", who: "dev00001", at: "2026-10-19T11:00:00Z" },
    { ref: "x1", kind: "visit", who: "dev00002", at: "2026-10-19T11:05:00Z" },
    { ref: "x1", kind: "user", who: U1, at: "2026-10-19T11:10:00Z" },
    { ref: "x1", kind: "user", who: U2, at: "2026-10-19T11:20:00Z" },
    { ref: "other", kind: "visit", who: "dev00003", at: "2026-10-19T12:00:00Z" }];
  const users = [{ id: U1, created_at: "2026-10-19T11:09:00Z" }, { id: U2, created_at: "2026-09-01T00:00:00Z" }];
  const paid = [
    { user_id: U1, amount_kobo: 80000, paid_at: "2026-10-19T11:30:00Z" },
    { user_id: U2, amount_kobo: 20000, paid_at: "2026-10-01T00:00:00Z" }];
  const [p, o] = RF.summary(hits, users, paid);
  assert.deepStrictEqual([p.ref, p.visits, p.users, p.newUsers, p.passes, p.naira], ["x1", 2, 2, 1, 1, 800]);
  assert.deepStrictEqual([o.ref, o.visits, o.users], ["other", 1, 0]);
});

test("tags are lower-cased and anything else is refused", () => {
  assert.strictEqual(RF.tag("X1"), "x1");
  for (const bad of ["", "a b", "x".repeat(25), "<script>", null]) assert.strictEqual(RF.tag(bad), null);
});

function run(handler, body, session) {
  return new Promise((resolve) => {
    const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; }, end(b) { resolve({ status: this.statusCode, body: b }); } };
    const req = { method: "POST", headers: { origin: "https://www.soccerwizard.live", "x-sw-request": "1", "content-type": "application/json" }, body };
    handler(req, res);
  });
}

test("the route records the visit, and the account only when signed in", async () => {
  const added = [];
  const db = { rlHit: async () => true, addRefHit: async (...a) => { added.push(a.join("|")); return true; },
    sessionByHash: async () => null };
  const h = make({ db });
  const r = await run(h, { ref: "X1", v: "dev00001" });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(added, ["x1|visit|dev00001"]);
  const bad = await run(h, { ref: "pan dev", v: "dev00001" });
  assert.strictEqual(bad.status, 400);
});
