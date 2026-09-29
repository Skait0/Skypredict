// test/cron-housekeep.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

/* Load api/cron.js with the heavy build and the database replaced. */
function load(housekeep) {
  const stub = (rel, exp) => { const p = require.resolve(path.join("..", rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
  stub("lib/build.js", { buildPayload: async () => ({ generated: "x", matches: 1, leagues: [], fixtures: [], log: [] }) });
  stub("lib/auth/db.js", { housekeep });
  delete require.cache[require.resolve("../api/cron.js")];
  return require("../api/cron.js");
}
function res() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
}

test("with accounts on, the daily run cleans the auth tables", async () => {
  process.env.AUTH_ENABLED = "1";
  let called = 0;
  const r = res();
  await load(async () => { called++; return true; })({ headers: {} }, r);
  assert.strictEqual(called, 1);
  assert.strictEqual(r.body.housekeep, true);
});

test("with accounts off it does nothing, and a failure never breaks the build", async () => {
  process.env.AUTH_ENABLED = "0";
  let r = res();
  await load(async () => { throw new Error("should not run"); })({ headers: {} }, r);
  assert.strictEqual(r.body.housekeep, null);
  process.env.AUTH_ENABLED = "1";
  r = res();
  await load(async () => { throw new Error("db down"); })({ headers: {} }, r);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.housekeep, false);
  delete process.env.AUTH_ENABLED;
});
