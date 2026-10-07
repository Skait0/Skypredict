"use strict";
const test = require("node:test");
const assert = require("node:assert");
const R = require("../lib/roles.js");

const env = { SW_ADMIN_EMAILS: " Boss@X.com , other@y.com" };
const db = (row) => ({ grantFor: async () => row });

test("admin from env, case and space insensitive", async () => {
  assert.strictEqual(await R.roleOf(db(null), { id: "1", email: "BOSS@x.com " }, env), "admin");
  assert.strictEqual(await R.roleOf(db(null), { id: "1", email: "other@y.com" }, env), "admin");
});
test("ff from live grant, free otherwise", async () => {
  const u = { id: "1", email: "a@b.com" };
  assert.strictEqual(await R.roleOf(db({ email: "a@b.com", revoked_at: null }), u, env), "ff");
  assert.strictEqual(await R.roleOf(db(null), u, env), "free");
});
test("db throw or no env -> free, never throws", async () => {
  const bad = { grantFor: async () => { throw new Error("x"); } };
  assert.strictEqual(await R.roleOf(bad, { id: "1", email: "a@b.com" }, {}), "free");
  assert.strictEqual(await R.roleOf(db(null), { id: "1" }, {}), "free");
  assert.strictEqual(await R.roleOf(db(null), null, {}), "free");
});
test("avatarsFor sizes and ff excludes owner skins", () => {
  assert.strictEqual(R.avatarsFor("admin").length, 14);
  assert.strictEqual(R.avatarsFor("ff").length, 11);
  assert.strictEqual(R.avatarsFor("free").length, 6);
  for (const a of ["afro", "storm", "lich"]) assert.ok(!R.avatarsFor("ff").includes(a));
  for (const a of R.avatarsFor("free")) assert.ok(R.avatarsFor("ff").includes(a));
});
test("codeLimitFor and planLabel", () => {
  assert.strictEqual(R.codeLimitFor("admin"), Infinity);
  assert.strictEqual(R.codeLimitFor("ff"), 100);
  assert.strictEqual(R.codeLimitFor("free"), null);
  assert.strictEqual(R.planLabel("admin"), "Admin");
  assert.strictEqual(R.planLabel("ff"), "Family & friends");
  assert.strictEqual(R.planLabel("free"), "Free plan");
  assert.strictEqual(R.normEmail("  A@B.Com "), "a@b.com");
});
