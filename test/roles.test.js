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
  assert.strictEqual(R.avatarsFor("admin").length, 28);
  assert.strictEqual(R.avatarsFor("ff").length, 25);
  assert.strictEqual(R.avatarsFor("free").length, 6);
  assert.deepStrictEqual(R.OWNER_AVATARS.slice().sort(), ["afro", "lich", "storm"]);
  for (const r of ["free", "ff", "admin"]) for (const k of R.PERSONAL_AVATARS) assert.ok(!R.avatarsFor(r).includes(k), r + " " + k);
  for (const a of ["afro", "storm", "lich"]) assert.ok(!R.avatarsFor("ff").includes(a));
  for (const a of R.avatarsFor("free")) assert.ok(R.avatarsFor("ff").includes(a));
});
test("any role but free has the skins, so a future paid role needs no change", () => {
  assert.deepStrictEqual(R.avatarsFor("pro"), R.avatarsFor("ff"));
  for (const a of ["afro", "storm", "lich", "dread"]) assert.ok(!R.avatarsFor("pro").includes(a), a);
  for (const r of [null, undefined, "", "free"]) assert.deepStrictEqual(R.avatarsFor(r), R.avatarsFor("free"));
  for (const k of ["runes", "noir", "goldbeard", "nebula", "cyber", "blaze", "synth", "abyss", "alchemist", "ink", "magma", "ent", "nomad", "wired"]) {
    assert.ok(!R.avatarsFor("free").includes(k) && R.avatarsFor("ff").includes(k) && R.avatarsFor("admin").includes(k), k);
  }
});
test("personalAvatars: only the listed email, only personal keys, case and space insensitive", () => {
  const env = { SW_PERSONAL_AVATARS: " DREAD : Pal@Example.com , storm:pal@example.com, dread:other@example.com" };
  assert.deepStrictEqual(R.personalAvatars(" pal@EXAMPLE.com", env), ["dread"]);
  assert.deepStrictEqual(R.personalAvatars("other@example.com", env), ["dread"]);
  assert.deepStrictEqual(R.personalAvatars("boss@x.com", env), []);
  assert.deepStrictEqual(R.personalAvatars("pal@example.com", {}), []);
  assert.deepStrictEqual(R.personalAvatars("", env), []);
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
