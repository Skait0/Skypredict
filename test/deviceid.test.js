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

/* The whole function, brace-matched. An earlier version of these tests sliced
   a fixed 700-character window from the declaration, which silently stopped
   covering the code once the function grew a comment. */
function deviceIdSource() {
  const i = src.search(/(?:^|\n)function swDeviceId\s*\(/m);
  if (i < 0) throw new Error("swDeviceId has gone from index.html");
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

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
  const fn = deviceIdSource();
  assert.ok(/randomUUID|getRandomValues|Math\.random/.test(fn),
    "it has to be random, not derived from anything about the reader");
  assert.ok(!/navigator\.userAgent|screen\.|canvas/.test(fn),
    "and must never be a fingerprint - that is a different thing with different rules");
});

test("storage that throws does not stop a booking", () => {
  /* Private mode, or a browser with site data blocked. The id is a
     convenience for counting, never a precondition for booking. */
  const fn = deviceIdSource();
  assert.match(fn, /try\s*\{/, "reads and writes must be guarded");
  assert.match(fn, /catch/, "and a failure returns nothing rather than throwing");
});

/* ------------------------------------------------- setting it from a link */

/* Reading the id off a phone means a USB cable and chrome://inspect. Setting
 * it means opening one link. So an exempt device is provisioned by visiting
 *
 *   https://www.soccerwizard.live/?swdev=<token>
 *
 * once, on each device we want uncapped - phone, tablet, a borrowed handset
 * for a screenshot - with the same token in SW_QUOTA_EXEMPT.
 *
 * THE TOKEN IS A BYPASS KEY. Anyone with the link books without limit, so it
 * is long and random, never published, and rotated by changing the variable.
 * The parameter is stripped from the address bar afterwards so it does not
 * ride along in a screenshot or a shared URL.
 */

function callDeviceId(search, store) {
  const src2 = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const i = src2.search(/(?:^|\n)function swDeviceId\s*\(/m);
  let d = 0, k = src2.indexOf("{", i);
  for (; k < src2.length; k++) { if (src2[k] === "{") d++; else if (src2[k] === "}") { d--; if (!d) break; } }
  const fn = src2.slice(i, k + 1);
  const replaced = [];
  return new Function("STORE", "SEARCH", "REPLACED",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}," +
    "setItem:function(k,v){STORE[k]=String(v);}};" +
    "var location={search:SEARCH, pathname:'/', hash:''};" +
    "var history={replaceState:function(a,b,url){REPLACED.push(url);}};" +
    "var window={crypto:null, history:history, location:location};" +
    fn + "\nreturn {id:swDeviceId(), replaced:REPLACED};"
  )(store, search, replaced);
}

test("a swdev link sets the device id", () => {
  const store = {};
  const got = callDeviceId("?swdev=exempttoken12345678", store);
  assert.equal(got.id, "exempttoken12345678");
  assert.equal(store["sw.device"], "exempttoken12345678", "and it persists for later visits");
});

test("a swdev link overrides an id this browser already had", () => {
  /* The whole point is provisioning a device that has already been used. */
  const store = { "sw.device": "oldrandomid12345678" };
  const got = callDeviceId("?swdev=exempttoken12345678", store);
  assert.equal(got.id, "exempttoken12345678");
});

test("a malformed token is ignored rather than stored", () => {
  /* It reaches a database key on the server, which refuses anything outside
     [A-Za-z0-9_-]{8,64} - so a bad one here would silently drop the device
     into the shared address bucket instead of failing loudly. */
  for (const bad of ["short", "has spaces", "x".repeat(70), "semi;colon"]) {
    const store = {};
    const got = callDeviceId("?swdev=" + encodeURIComponent(bad), store);
    assert.notEqual(got.id, bad, JSON.stringify(bad) + " must not be accepted");
    /* Asserting the RETURN alone proved nothing: a stored bad value fails the
       shape check on the next line and a fresh random id is minted, so the
       return differs either way while the junk sits in storage. Caught by
       mutation - check what was written. */
    assert.notEqual(store["sw.device"], bad,
      JSON.stringify(bad) + " must never reach storage");
  }
});

test("the token is stripped from the address bar", () => {
  /* Otherwise a bypass key rides along in every screenshot and shared link. */
  const got = callDeviceId("?swdev=exempttoken12345678", {});
  assert.ok(got.replaced.length > 0, "history.replaceState must be called");
  assert.ok(!/swdev/.test(String(got.replaced[0])),
    "and the new URL must not carry the token: " + got.replaced[0]);
});

test("an ordinary visit is untouched by any of this", () => {
  const store = { "sw.device": "existingid12345678" };
  const got = callDeviceId("", store);
  assert.equal(got.id, "existingid12345678");
  assert.equal(got.replaced.length, 0, "no URL rewriting when there is nothing to strip");
});
