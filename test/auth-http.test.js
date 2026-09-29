"use strict";
const test = require("node:test");
const assert = require("node:assert");
const H = require("../lib/auth/http.js");

const req = (over) => Object.assign({ method: "POST", headers: { "x-sw-request": "1", origin: H.ORIGIN } }, over || {});

test("state changes need POST, our header and our origin", () => {
  assert.strictEqual(H.guardPost(req()), null);
  assert.deepStrictEqual(H.guardPost(req({ method: "GET" })), { status: 405, error: "method" });
  assert.deepStrictEqual(H.guardPost(req({ headers: { origin: H.ORIGIN } })), { status: 403, error: "forbidden" });
  assert.deepStrictEqual(H.guardPost(req({ headers: { "x-sw-request": "1", origin: "https://evil.example" } })), { status: 403, error: "forbidden" });
  assert.deepStrictEqual(H.guardPost(req({ headers: { "x-sw-request": "1" } })), { status: 403, error: "forbidden" });
});

test("only our own paths come back from a sign-in", () => {
  for (const ok of ["/", "/booking-codes", "/?go=convert&code=AB12CD", "/install"]) assert.strictEqual(H.safeReturn(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "evil.com", "/%2F%2Fevil.com",
    "/" + "a".repeat(300), null, 5, "/\nSet-Cookie:x"]) assert.strictEqual(H.safeReturn(bad), "/", String(bad));
});

test("bodies over the limit or not JSON are refused", async () => {
  assert.deepStrictEqual(await H.readJson({ body: { a: 1 } }, 100), { a: 1 });
  assert.strictEqual(await H.readJson({ body: "{bad" }, 100), null);
  assert.strictEqual(await H.readJson({ body: { a: "x".repeat(500) } }, 100), null);
  assert.strictEqual(await H.readJson({ body: [1, 2] }, 100), null, "an array is not an object");
});

test("responses are never cached and pages carry no script", () => {
  const out = { headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, end(b) { this.body = b; } };
  H.sendHtml(out, 400, "Sign-in failed", "<script>alert(1)</script>");
  assert.strictEqual(out.headers["cache-control"], "no-store");
  assert.doesNotMatch(out.body, /<script>alert/);
  assert.match(out.body, /&lt;script&gt;/);
});

test("the network key is a hash, never the address itself", () => {
  const k = H.ipKey({ headers: { "x-forwarded-for": "102.89.1.2, 10.0.0.1" } });
  assert.match(k, /^[0-9a-f]{32}$/);
  assert.notStrictEqual(k, H.ipKey({ headers: { "x-forwarded-for": "102.89.1.3" } }));
});

test("everything is off unless AUTH_ENABLED is exactly 1", () => {
  delete process.env.AUTH_ENABLED; assert.strictEqual(H.enabled(), false);
  process.env.AUTH_ENABLED = "true"; assert.strictEqual(H.enabled(), false);
  process.env.AUTH_ENABLED = "1"; assert.strictEqual(H.enabled(), true);
  delete process.env.AUTH_ENABLED;
});
