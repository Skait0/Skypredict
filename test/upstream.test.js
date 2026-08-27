"use strict";

/* The feed proxy's job is to keep Railway from seeing per-viewer traffic
   while never letting an upstream blip surface as a broken board. Both of
   those live in feedResponse, so that is what is pinned down here. */

const test = require("node:test");
const assert = require("node:assert");
const { feedResponse, FEEDS } = require("../lib/upstream.js");

const CACHE = FEEDS.live.cache;
const good = { matches: [{ home: "Arsenal" }] };
const older = { matches: [{ home: "Chelsea" }] };

test("a healthy answer is cached at the edge and kept as last-good", () => {
  const out = feedResponse({ ok: true, body: good }, null, CACHE);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, good);
  assert.equal(out.cacheControl, CACHE);
  assert.equal(out.store, true);
});

test("the cache window is what caps origin load, so it must be set", () => {
  /* s-maxage is the number that decides whether a million viewers become a
     million origin requests or a handful. stale-while-revalidate is what
     stops the window lapsing into a stampede. */
  assert.match(FEEDS.live.cache, /s-maxage=\d+/);
  assert.match(FEEDS.live.cache, /stale-while-revalidate=\d+/);
  assert.match(FEEDS.fixtures.cache, /s-maxage=\d+/);

  const live = Number(FEEDS.live.cache.match(/s-maxage=(\d+)/)[1]);
  const fx = Number(FEEDS.fixtures.cache.match(/s-maxage=(\d+)/)[1]);
  assert.ok(live > 0 && live <= 30, "live window stays under the 30s poll");
  assert.ok(fx > live, "fixtures change far less often than scores");
});

test("an upstream failure serves the last good board, not an error", () => {
  const out = feedResponse({ ok: false, why: "http 502" }, older, CACHE);
  assert.equal(out.status, 200);
  assert.deepEqual(out.body, older);
  assert.equal(out.tag, "stale-after-error");
});

test("a stale answer is not stored, so it cannot outlive the outage", () => {
  const out = feedResponse({ ok: false, why: "timeout" }, older, CACHE);
  assert.equal(out.store, false);
});

test("a stale answer gets a short window so the site heals quickly", () => {
  const out = feedResponse({ ok: false, why: "timeout" }, older, CACHE);
  const stale = Number(out.cacheControl.match(/s-maxage=(\d+)/)[1]);
  const healthy = Number(CACHE.match(/s-maxage=(\d+)/)[1]);
  assert.ok(stale <= healthy * 2, "an outage must not be pinned in place");
});

test("failing with nothing to fall back on is never cached", () => {
  /* Caching a 502 would hand every visitor the same outage until it expired,
     long after Railway came back. */
  const out = feedResponse({ ok: false, why: "econnrefused" }, null, CACHE);
  assert.equal(out.status, 502);
  assert.equal(out.cacheControl, "no-store");
  assert.equal(out.store, false);
});

test("recovery replaces the stored copy rather than keeping the old one", () => {
  let lastGood = older;
  let out = feedResponse({ ok: true, body: good }, lastGood, CACHE);
  if (out.store) lastGood = out.body;
  assert.deepEqual(lastGood, good);
});
