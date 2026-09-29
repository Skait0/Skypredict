"use strict";
const test = require("node:test");
const assert = require("node:assert");
const A = require("../lib/access.js");
const U = "11111111-1111-4111-8111-111111111111";
const NOW = Date.UTC(2026, 8, 29, 10);

function db(tiers, sub) {
  const d = { calls: 0, async featureTiers() { d.calls++; return Object.assign({}, tiers); }, async subscription() { return sub; } };
  return d;
}

test("a feature nobody has gated is free for everyone, signed in or not", async () => {
  A._reset();
  assert.strictEqual(await A.access(db({}, null), null, "wizard", NOW), true);
  A._reset();
  assert.strictEqual(await A.access(db({ wizard: "free" }, null), U, "wizard", NOW), true);
});

test("a paid feature needs an active subscription that has not run out", async () => {
  const tiers = { wizard: "paid" };
  const cases = [
    [null, false, "no subscription"],
    [{ status: "active", current_period_end: new Date(NOW + 864e5).toISOString() }, true, "active"],
    [{ status: "active", current_period_end: new Date(NOW - 1).toISOString() }, false, "ran out"],
    [{ status: "canceled", current_period_end: new Date(NOW + 864e5).toISOString() }, false, "cancelled"],
  ];
  for (const [sub, want, name] of cases) { A._reset(); assert.strictEqual(await A.access(db(tiers, sub), U, "wizard", NOW), want, name); }
  A._reset();
  assert.strictEqual(await A.access(db(tiers, cases[1][0]), null, "wizard", NOW), false, "signed out");
});

test("the feature table is read at most once a minute", async () => {
  A._reset();
  const d = db({}, null);
  await A.access(d, U, "a", NOW); await A.access(d, U, "b", NOW + 30e3);
  assert.strictEqual(d.calls, 1);
  await A.access(d, U, "a", NOW + 61e3);
  assert.strictEqual(d.calls, 2);
});

test("entitlements answer for every feature asked", async () => {
  A._reset();
  assert.deepStrictEqual(await A.entitlements(db({ x: "paid" }, null), U, ["x", "y"], NOW), { x: false, y: true });
  assert.deepStrictEqual(A.FEATURES, []);
});

test("a failed read of the feature table never makes a paid feature free", async () => {
  A._reset();
  const down = { async featureTiers() { return null; }, async subscription() { return null; } };
  await assert.rejects(A.access(down, U, "wizard", NOW), /feature tiers unavailable/);
  A._reset();
  const flaky = { n: 0, async featureTiers() { return this.n++ ? null : { wizard: "paid" }; }, async subscription() { return null; } };
  assert.strictEqual(await A.access(flaky, U, "wizard", NOW), false);
  assert.strictEqual(await A.access(flaky, U, "wizard", NOW + 61e3), false, "keeps the last good copy, stays paid");
});
