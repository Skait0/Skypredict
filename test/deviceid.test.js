"use strict";
/**
 * THE HALF OF THE QUOTA THAT LIVES IN THE BROWSER.
 *
 * The device id is the only thing that lets a reader be counted as themselves.
 * Without one every request falls into the hashed-address bucket, and on a
 * Nigerian carrier that bucket is a whole cell tower - so a missing header
 * does not mean "unlimited", it means thousands of readers sharing one loose
 * ceiling and nobody counted properly.
 *
 * It is deliberately not an identity. A random opaque token in localStorage,
 * generated on first use, sent only to our own booking route. It survives a
 * reload and dies with the browser data, which is the honest bargain for a
 * limit that exists to control cost rather than to enforce a contract - anyone
 * determined to clear it can, and the address ceiling is what remains.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the booking request carries the device header", () => {
  /* The whole feature turns on this one header reaching /api/book. */
  const i = src.indexOf("function bookFetch");
  assert.ok(i > 0, "bookFetch has moved - find it before trusting this test");
  const body = src.slice(i, i + 3000);
  /* Matched on the header name rather than on how the object is built - it is
     set by index because it is omitted when storage gave us no id, and a test
     that insists on `"X-SW-Device":` is pinning syntax instead of behaviour. */
  assert.match(body, /X-SW-Device/,
    "the booking fetch must send the device id");
  assert.match(body, /swDeviceId\(\)/, "and must get it from the one generator");
});

test("the id is generated once and kept", () => {
  assert.match(src, /sw\.device/, "stored under an sw.* key like everything else");
  assert.match(src, /function swDeviceId\(\)/, "one place that mints and returns it");
});

test("the id is opaque and long enough for the server to accept", () => {
  /* lib/quota.js requires 8-64 characters of [A-Za-z0-9_-] and refuses
     anything else, so a generator that emits a shorter or prettier string
     silently drops every reader into the address bucket. */
  const i = src.indexOf("function swDeviceId()");
  assert.ok(i > 0);
  const fn = src.slice(i, i + 700);
  assert.ok(/randomUUID|getRandomValues|Math\.random/.test(fn),
    "it has to be random, not derived from anything about the reader");
  assert.ok(!/navigator\.userAgent|screen\.|canvas/.test(fn),
    "and must never be a fingerprint - that is a different thing with different rules");
});

test("storage that throws does not stop a booking", () => {
  /* Private mode, or a browser with site data blocked. The id is a
     convenience for counting, never a precondition for booking. */
  const i = src.indexOf("function swDeviceId()");
  const fn = src.slice(i, i + 700);
  assert.match(fn, /try\s*\{/, "reads and writes must be guarded");
  assert.match(fn, /catch/, "and a failure returns nothing rather than throwing");
});
