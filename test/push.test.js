"use strict";

/**
 * WEB PUSH: the parts that can be wrong silently.
 *
 * A push that is signed wrongly comes back as a bare 401 from Google with no
 * explanation, and a push sent at the wrong moment wakes somebody up. Both are
 * cheap to assert here and expensive to discover in production.
 */

const test = require("node:test");
const assert = require("node:assert");

const DB = require("../lib/supabase.js");

test("the push helpers refuse to run unconfigured rather than throwing", async () => {
  /* No SUPABASE_URL in the test environment, so every call takes the guard
     path. It must be the same shape as every other helper in the file: an
     answer, not an exception, because the caller is a daily workflow. */
  const put = await DB.putPushSub({ endpoint: "https://fcm.googleapis.com/x", p256dh: "k", auth: "a" });
  assert.strictEqual(put.ok, false);
  const list = await DB.listPushSubs();
  assert.strictEqual(list.ok, false);
  assert.deepStrictEqual(list.rows, []);
});

test("dropping nothing is a no-op, not a request", async () => {
  const out = await DB.dropPushSubs([]);
  assert.deepStrictEqual(out, { ok: true, dropped: 0 });
});

test("a subscription with no endpoint is never stored", async () => {
  const out = await DB.putPushSub({ p256dh: "k", auth: "a" });
  assert.strictEqual(out.ok, false);
  assert.match(out.why, /nothing to store/);
});
