"use strict";

/**
 * The circuit breaker in front of the Railway feeds.
 *
 * What it is for: during an upstream outage the fallback already works -
 * nobody sees an error, they see the stored board. But they see it TIMEOUT_MS
 * late, on every poll, for as long as the outage lasts. The breaker turns "up
 * but crawling" into "up": an outage costs one slow request per cooldown
 * rather than one per visitor.
 *
 * Everything here drives the real state machine with an injected clock. No
 * timers and no network - the same standard feedResponse is held to, and for
 * the same reason: a breaker that is hard to test is a breaker nobody adjusts,
 * and the failure it guards against is one you cannot reproduce on demand.
 *
 * The tests are written as the sequences that actually matter, because a
 * breaker's bugs are all in its transitions:
 *   a blip must not trip it        (or the breaker becomes the outage)
 *   a real outage must trip it     (or it does nothing)
 *   recovery must be automatic     (or an outage becomes permanent)
 *   a failed probe must not open the floodgates
 *   a lost probe must not wedge it open for ever
 */

const test = require("node:test");
const assert = require("node:assert");
const { makeBreaker, BREAKER, feedResponse, FEEDS } = require("../lib/upstream.js");

const COOLDOWN = BREAKER.cooldownMs;
const TRIP = BREAKER.failsToTrip;

/* A clock you drive by hand. */
function clock(t0) {
  let t = t0 || 1000;
  return { now: () => t, tick: (ms) => (t += ms) };
}

/* ------------------------------------------------------- it stays out of the way */

test("a healthy upstream is never interfered with", () => {
  const b = makeBreaker(), c = clock();
  for (let i = 0; i < 50; i++) {
    assert.ok(b.shouldTry(c.now()), "call " + i + " must go through");
    b.onSuccess();
    c.tick(20000);
  }
  assert.strictEqual(b.state(c.now()), "closed");
});

test("a blip does not trip it", () => {
  /* One timeout is a blip. Tripping on it would make the breaker itself the
     outage - the site would stop asking a perfectly healthy upstream. */
  const b = makeBreaker(), c = clock();
  for (let i = 0; i < TRIP - 1; i++) {
    assert.ok(b.shouldTry(c.now()));
    b.onFailure(c.now());
    c.tick(1000);
  }
  assert.strictEqual(b.state(c.now()), "closed", "still closed below the threshold");
  assert.ok(b.shouldTry(c.now()), "and still calling");
});

test("failures have to be consecutive", () => {
  /* An upstream that fails one call in two is unwell, but it is answering, and
     the stored board is worse than what it returns. The count resets on any
     success.
     The state is checked immediately AFTER each failure, which is the only
     moment it can be wrong. Asserting at the end of the loop instead - after a
     success, which closes the circuit - hides a breaker that tripped in the
     middle and was closed again on the way past. Mutation testing found that:
     dropping the reset in onSuccess left this test green. */
  const b = makeBreaker(), c = clock();
  for (let i = 0; i < 10; i++) {
    b.shouldTry(c.now());
    b.onFailure(c.now());
    assert.strictEqual(b.state(c.now()), "closed",
      "tripped on failure " + (i + 1) + ", but no two failures were consecutive");
    c.tick(1000);
    b.shouldTry(c.now());
    b.onSuccess();
    c.tick(1000);
  }
  assert.strictEqual(b.state(c.now()), "closed");
});

/* --------------------------------------------------------------- it trips */

test("a real outage trips it, and then nothing else waits", () => {
  const b = makeBreaker(), c = clock();
  for (let i = 0; i < TRIP; i++) {
    assert.ok(b.shouldTry(c.now()), "the failing calls themselves must happen");
    b.onFailure(c.now());
    c.tick(1000);
  }
  assert.strictEqual(b.state(c.now()), "open");
  /* This is the whole point: the next hundred visitors do not each wait out
     the timeout. */
  for (let i = 0; i < 100; i++) {
    assert.ok(!b.shouldTry(c.now()), "request " + i + " must be served without calling");
    c.tick(100);
  }
});

/* ------------------------------------------------------------ and recovers */

function trip(b, c) {
  for (let i = 0; i < TRIP; i++) { b.shouldTry(c.now()); b.onFailure(c.now()); }
}

test("after the cooldown exactly one probe goes through", () => {
  const b = makeBreaker(), c = clock();
  trip(b, c);
  c.tick(COOLDOWN);
  assert.strictEqual(b.state(c.now()), "half-open");
  assert.ok(b.shouldTry(c.now()), "the probe");
  /* Concurrent requests in the same container must not all become probes -
     that would send a burst at an upstream we already believe is unwell. */
  for (let i = 0; i < 20; i++)
    assert.ok(!b.shouldTry(c.now()), "only one probe, not " + (i + 2));
});

test("a successful probe closes it completely", () => {
  const b = makeBreaker(), c = clock();
  trip(b, c);
  c.tick(COOLDOWN);
  b.shouldTry(c.now());
  b.onSuccess();
  assert.strictEqual(b.state(c.now()), "closed");
  assert.ok(b.shouldTry(c.now()), "back to normal service");
  /* And the failure count went with it: recovery must be a real reset, not a
     breaker sitting one failure away from tripping again. */
  b.onFailure(c.now());
  assert.strictEqual(b.state(c.now()), "closed", "one failure after recovery is a blip again");
});

test("a failed probe reopens immediately rather than letting everything through", () => {
  /* The subtle one. If a failed probe only incremented the counter, the
     breaker would sit half-open and let requests through until the threshold
     was reached again - which is the stampede it exists to prevent, arriving
     once per cooldown. */
  const b = makeBreaker(), c = clock();
  trip(b, c);
  c.tick(COOLDOWN);
  b.shouldTry(c.now());
  b.onFailure(c.now());
  assert.strictEqual(b.state(c.now()), "open", "straight back to open");
  assert.ok(!b.shouldTry(c.now()));
  /* And the clock restarted: the next probe is a full cooldown away, not
     immediate because the original trip was long ago. */
  c.tick(COOLDOWN - 1);
  assert.strictEqual(b.state(c.now()), "open", "the cooldown restarted from the probe");
  c.tick(1);
  assert.strictEqual(b.state(c.now()), "half-open");
});

test("a long outage costs one probe per cooldown, not one wait per visitor", () => {
  const b = makeBreaker(), c = clock();
  trip(b, c);
  let calls = 0;
  /* An hour down, polled every 20 seconds. */
  for (let i = 0; i < 180; i++) {
    if (b.shouldTry(c.now())) { calls++; b.onFailure(c.now()); }
    c.tick(20000);
  }
  const hours = (180 * 20000) / COOLDOWN;
  assert.ok(calls <= Math.ceil(hours) + 1,
    "expected about " + Math.ceil(hours) + " probes, got " + calls);
  assert.ok(calls > 0, "it must keep checking, or the outage never ends");
});

/* ------------------------------------------------------- it cannot get stuck */

test("a probe that never reports back does not wedge it open for ever", () => {
  /* The request killed mid-flight is the very failure being handled, so it
     will happen: shouldTry marks a probe in flight, and if neither onSuccess
     nor onFailure is ever called the flag would stay set and no probe could
     ever be issued again. The breaker would be permanently open on a healthy
     upstream - strictly worse than not having one. */
  const b = makeBreaker(), c = clock();
  trip(b, c);
  c.tick(COOLDOWN);
  assert.ok(b.shouldTry(c.now()), "first probe issued");
  /* ...and nothing ever comes back. */
  c.tick(COOLDOWN);
  assert.ok(b.shouldTry(c.now()), "a stalled probe must be retired, not waited on");
});

/* ------------------------------------------------ what the user actually gets */

test("a skipped call is still a served board, just immediately", () => {
  /* The breaker only decides whether to CALL. What gets sent is feedResponse's
     job, unchanged - which is why tripping is safe: the reader sees the same
     stored board either way. */
  const stored = { matches: [{ home: "Arsenal" }] };
  const out = feedResponse({ ok: false, why: "circuit open" }, stored, FEEDS.live.cache);
  assert.strictEqual(out.status, 200);
  assert.deepStrictEqual(out.body, stored);
  assert.strictEqual(out.store, false, "a stale board must not be re-stored");
});

test("the cooldown is short enough that a recovered upstream is not ignored", () => {
  /* The CDN already caps origin load, so this number is about how long a
     healthy Railway stays ignored, not about sparing it work. Long cooldowns
     are for protecting a fragile upstream; that is not the problem here. */
  assert.ok(COOLDOWN <= 60000, "a minute is the outside limit for healing");
  assert.ok(COOLDOWN >= 5000, "and below a few seconds it is not a cooldown");
});
