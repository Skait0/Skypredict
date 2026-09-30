"use strict";
const test = require("node:test");
const assert = require("node:assert");
const C = require("../lib/auth/crypto.js");

test("tokens are 256-bit, url-safe and never repeat", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const t = C.randomToken();
    assert.match(t, C.TOKEN_RE);
    assert.ok(!seen.has(t)); seen.add(t);
  }
});

test("hashes are stable lowercase hex and the HMAC depends on the key", () => {
  assert.strictEqual(C.sha256hex("a"), C.sha256hex("a"));
  assert.match(C.sha256hex("a"), /^[0-9a-f]{64}$/);
  assert.notStrictEqual(C.hmacHex("k1", "x"), C.hmacHex("k2", "x"));
});

test("timing-safe compare accepts only an exact match", () => {
  const h = C.sha256hex("z");
  assert.strictEqual(C.sameHex(h, h), true);
  assert.strictEqual(C.sameHex(h, C.sha256hex("y")), false);
  assert.strictEqual(C.sameHex(h, h.slice(2)), false);
  assert.strictEqual(C.sameHex("zz", "zz"), false, "not hex");
  assert.strictEqual(C.sameHex(null, h), false);
});

test("emails are trimmed and lower-cased; junk is refused", () => {
  assert.strictEqual(C.normEmail("  Ade.Bola@Gmail.COM "), "ade.bola@gmail.com");
  for (const bad of ["", "no-at", "a@b", "a b@c.com", "<x>@y.com", "a@b.c", "x".repeat(250) + "@y.com", null, 7])
    assert.strictEqual(C.normEmail(bad), null, String(bad));
});

test("device labels are short and human", () => {
  assert.strictEqual(C.deviceLabel("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"), "Chrome on Android");
  assert.strictEqual(C.deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1"), "Safari on iPhone");
  assert.strictEqual(C.deviceLabel("Mozilla/5.0 (Linux; Android 13) SamsungBrowser/25.0 Chrome/121 Mobile Safari/537.36"), "Samsung Internet on Android");
  assert.strictEqual(C.deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0"), "Edge on Windows");
  assert.strictEqual(C.deviceLabel(""), "Unknown device");
  assert.ok(C.deviceLabel("<script>".repeat(50)).length <= 40);
});
