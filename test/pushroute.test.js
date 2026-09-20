"use strict";

/**
 * /api/push is unauthenticated, because this site has no accounts. Everything
 * that protects it is in this file's assertions.
 */

const test = require("node:test");
const assert = require("node:assert");

const route = require("../api/push.js");

function res() {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.json = (o) => { r.body = o; return r; };
  r.end = (s) => { r.body = s === undefined ? r.body : s; return r; };
  return r;
}

const GOOD = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "BPu".padEnd(87, "x"), auth: "c2VjcmV0MTIzNDU2" },
};

test("a subscription to somewhere that is not a push service is refused", () => {
  const out = route.parse({ ...GOOD, endpoint: "https://evil.example/collect" });
  assert.strictEqual(out.ok, false);
});

test("a subscription with no keys is refused", () => {
  assert.strictEqual(route.parse({ endpoint: GOOD.endpoint }).ok, false);
  assert.strictEqual(route.parse({ ...GOOD, keys: { p256dh: "x" } }).ok, false);
});

test("an unsubscribe needs only the endpoint", () => {
  /* By the time the client sends DELETE it has already called unsubscribe(),
     so it no longer has the keys - and the row is keyed on endpoint anyway. */
  const out = route.parse({ endpoint: GOOD.endpoint }, { keysNeeded: false });
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.row.endpoint, GOOD.endpoint);
  /* The allowlist still applies: DELETE must not become a way to probe us. */
  assert.strictEqual(
    route.parse({ endpoint: "https://evil.example/x" }, { keysNeeded: false }).ok, false);
});

test("an absurd endpoint is refused before it reaches the database", () => {
  const out = route.parse({ ...GOOD, endpoint: GOOD.endpoint + "x".repeat(3000) });
  assert.strictEqual(out.ok, false);
  assert.match(out.why, /too long/);
});

test("a good subscription parses into exactly the row we store", () => {
  const out = route.parse(GOOD);
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(Object.keys(out.row).sort(), ["auth", "endpoint", "p256dh"]);
  assert.strictEqual(out.row.endpoint, GOOD.endpoint);
});

test("any method other than POST or DELETE is 405, and nothing is cached", async () => {
  const r = res();
  await route({ method: "GET", headers: {}, body: null }, r);
  assert.strictEqual(r.code, 405);
  assert.match(String(r.headers["cache-control"] || ""), /no-store/);
});

test("a malformed body is 400, never 500", async () => {
  const r = res();
  await route({ method: "POST", headers: {}, body: "{not json" }, r);
  assert.strictEqual(r.code, 400);
});
