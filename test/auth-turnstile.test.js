"use strict";
const test = require("node:test");
const assert = require("node:assert");
const T = require("../lib/auth/turnstile.js");

function stub(reply) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: new URLSearchParams(init.body) });
    if (reply instanceof Error) throw reply;
    return { ok: true, status: 200, json: async () => reply };
  };
  return calls;
}

test("a passed check is true, and the secret goes with it", async () => {
  process.env.TURNSTILE_SECRET = "ts_secret";
  const calls = stub({ success: true });
  assert.strictEqual(await T.verify("tok", "102.89.1.2"), true);
  assert.strictEqual(calls[0].url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.strictEqual(calls[0].body.get("secret"), "ts_secret");
  assert.strictEqual(calls[0].body.get("response"), "tok");
  assert.strictEqual(calls[0].body.get("remoteip"), "102.89.1.2");
});

test("a failed check, an outage or a junk token is false", async () => {
  process.env.TURNSTILE_SECRET = "ts_secret";
  stub({ success: false, "error-codes": ["invalid-input-response"] });
  assert.strictEqual(await T.verify("tok", ""), false);
  stub(new Error("down"));
  assert.strictEqual(await T.verify("tok", ""), false);
  const calls = stub({ success: true });
  assert.strictEqual(await T.verify("", ""), false);
  assert.strictEqual(await T.verify("x".repeat(3000), ""), false);
  assert.strictEqual(await T.verify(null, ""), false);
  assert.strictEqual(calls.length, 0, "junk never reaches Cloudflare");
});

test("no secret configured means no email codes, never an open door", async () => {
  delete process.env.TURNSTILE_SECRET;
  const calls = stub({ success: true });
  assert.strictEqual(await T.verify("tok", ""), false);
  assert.strictEqual(calls.length, 0);
});
