"use strict";
const test = require("node:test");
const assert = require("node:assert");
const api = require("../api/predictions.js");
const { chooseResponse, isHealthy, MIN_HEALTHY_FIXTURES,
        FULL_CACHE, SHORT_CACHE } = api;

/* buildPayload only refuses to build on thin RESULTS (<400). Thin FIXTURES
   still count as success, so a day where the fixture feeds failed produced a
   payload with a handful of games - and the six-hour CDN TTL pinned it there,
   with no way to page past tomorrow. These tests pin the rule that a thin
   build is never the copy visitors keep getting. */

const payload = (n, tag) => ({
  fixtures: Array.from({ length: n }, (_, i) => ({ id: i, tag })),
});

test("a healthy build is cached for the full window and stored", () => {
  const fresh = payload(167, "fresh");
  const out = chooseResponse(fresh, null);
  assert.equal(out.body, fresh);
  assert.equal(out.cacheControl, FULL_CACHE);
  assert.equal(out.store, true);
  assert.match(out.cacheControl, /s-maxage=21600/);
});

test("a thin build is NOT cached for hours", () => {
  const out = chooseResponse(payload(4, "thin"), null);
  assert.equal(out.cacheControl, SHORT_CACHE);
  assert.equal(out.store, false, "a thin build must never become the stored copy");
  assert.ok(!/21600/.test(out.cacheControl), "thin must not get the six-hour TTL");
});

test("a thin build yields to the last good payload", () => {
  const good = payload(167, "good");
  const out = chooseResponse(payload(4, "thin"), good);
  assert.equal(out.body, good, "should serve the good payload, not the thin one");
  assert.equal(out.body.fixtures[0].tag, "good");
  assert.equal(out.tag, "thin-served-last-good");
  assert.equal(out.store, false);
});

test("with nothing better, the thin payload is still served - but briefly", () => {
  const thin = payload(4, "thin");
  const out = chooseResponse(thin, null);
  assert.equal(out.body, thin, "an empty site is worse than a thin one");
  assert.equal(out.tag, "thin");
  assert.equal(out.thinCount, 4);
  assert.equal(out.cacheControl, SHORT_CACHE);
});

test("the reported failure: 4 fixtures never gets the long TTL", () => {
  const out = chooseResponse(payload(4, "reported"), null);
  const secs = Number(/s-maxage=(\d+)/.exec(out.cacheControl)[1]);
  assert.ok(secs <= 600, "a broken day must clear in minutes, not hours; got " + secs + "s");
});

test("the health line sits below any real quiet spell", () => {
  assert.ok(MIN_HEALTHY_FIXTURES >= 5, "too low to catch a broken feed");
  assert.ok(MIN_HEALTHY_FIXTURES <= 40, "too high - would flag a genuine quiet day as broken");
  assert.equal(isHealthy(payload(MIN_HEALTHY_FIXTURES)), true);
  assert.equal(isHealthy(payload(MIN_HEALTHY_FIXTURES - 1)), false);
});

test("a malformed payload counts as thin rather than throwing", () => {
  [undefined, null, {}, { fixtures: null }, { fixtures: "nope" }].forEach((p) => {
    assert.equal(isHealthy(p), false, "should not be treated as healthy: " + JSON.stringify(p));
    const out = chooseResponse(p, null);
    assert.equal(out.cacheControl, SHORT_CACHE);
    assert.equal(out.store, false);
  });
});
