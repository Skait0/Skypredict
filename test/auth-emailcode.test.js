"use strict";
const test = require("node:test");
const assert = require("node:assert");
const E = require("../lib/auth/emailcode.js");
const P = "pepper";
const row = (code, over) => Object.assign({ id: "x", code_hash: E.codeHash(P, "a@b.com", code),
  expires_at: new Date(1e6 + E.CODE_TTL_MS).toISOString(), attempts: 0, consumed_at: null }, over || {});

test("codes are six digits and spread over the whole range", () => {
  const seen = new Set();
  for (let i = 0; i < 3000; i++) { const c = E.newCode(); assert.match(c, /^\d{6}$/); seen.add(c[0]); }
  assert.strictEqual(seen.size, 10, "leading zero included");
});

test("a right code within ten minutes is ok; typing slop is forgiven", () => {
  assert.strictEqual(E.checkCode(row("048213"), P, "a@b.com", "048213", 1e6), "ok");
  assert.strictEqual(E.checkCode(row("048213"), P, "a@b.com", " 048 213 ", 1e6), "ok");
});

test("wrong, expired, used, dead and missing are all refusals", () => {
  assert.strictEqual(E.checkCode(row("048213"), P, "a@b.com", "048214", 1e6), "wrong");
  assert.strictEqual(E.checkCode(row("048213"), P, "a@b.com", "048213", 1e6 + E.CODE_TTL_MS + 1), "expired");
  assert.strictEqual(E.checkCode(row("048213", { consumed_at: "2026-01-01" }), P, "a@b.com", "048213", 1e6), "used");
  assert.strictEqual(E.checkCode(row("048213", { attempts: E.MAX_TRIES }), P, "a@b.com", "048213", 1e6), "dead");
  assert.strictEqual(E.checkCode(null, P, "a@b.com", "048213", 1e6), "none");
});

test("a code is bound to its email and to the server's pepper", () => {
  assert.strictEqual(E.checkCode(row("048213"), P, "c@d.com", "048213", 1e6), "wrong");
  assert.strictEqual(E.checkCode(row("048213"), "other", "a@b.com", "048213", 1e6), "wrong");
});

test("the code email goes to Resend, from our domain, and says nothing else", async () => {
  process.env.RESEND_API_KEY = "re_test";
  let sent = null;
  global.fetch = async (url, init) => { sent = { url: String(url), init }; return { ok: true, status: 200, text: async () => "{}" }; };
  assert.strictEqual(await E.sendCode("a@b.com", "048213"), true);
  const body = JSON.parse(sent.init.body);
  assert.strictEqual(sent.url, "https://api.resend.com/emails");
  assert.strictEqual(sent.init.headers.Authorization, "Bearer re_test");
  assert.deepStrictEqual(body.to, ["a@b.com"]);
  assert.match(body.from, /@mail\.soccerwizard\.live>$/, "the subdomain Resend verifies, not the main domain");
  assert.match(body.text, /048213/);
  assert.match(body.text, /10 minutes/);
  delete process.env.RESEND_API_KEY;
  delete global.fetch;
});
