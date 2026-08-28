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

/* The live feed sends every match five times. Measured 28 Aug: 400 entries,
   80 distinct pairings, byte-identical down to the minute - one snapshot
   emitted five times, not five moments. The board polls it every 30 seconds
   over mobile connections, so four fifths of that traffic was copies. */
const { dedupeMatches } = require("../lib/upstream.js");

test("five copies of a match collapse to one", () => {
  const one = { home: "Bayern Munich", away: "Stuttgart", league: "Germany Bundesliga",
                homeScore: 1, awayScore: 0, minute: 89, status: "H2" };
  const body = { matches: [one, one, one, one, one] };
  const out = dedupeMatches(body);
  assert.strictEqual(out.matches.length, 1);
  assert.deepStrictEqual(out.matches[0], one);
});

/* Different games must survive, including two ties that share a club. */
test("genuinely different matches are all kept", () => {
  const body = { matches: [
    { home: "A", away: "B", league: "L1", homeScore: 0, awayScore: 0 },
    { home: "A", away: "C", league: "L1", homeScore: 1, awayScore: 0 },
    { home: "D", away: "B", league: "L1", homeScore: 2, awayScore: 2 },
    { home: "A", away: "B", league: "L2", homeScore: 0, awayScore: 1 },
  ]};
  assert.strictEqual(dedupeMatches(body).matches.length, 4);
});

/* If the upstream is ever fixed this must cost nothing and change nothing. */
test("a clean feed is passed through untouched", () => {
  const body = { matches: [{ home: "A", away: "B", league: "L" }], other: 1 };
  assert.strictEqual(dedupeMatches(body), body, "same object, no needless copy");
});

test("a body with no matches array is left alone", () => {
  assert.deepStrictEqual(dedupeMatches({ error: "x" }), { error: "x" });
  assert.strictEqual(dedupeMatches(null), null);
});
