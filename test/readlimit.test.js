"use strict";
/* THE BRAKE ON READING CODES.
 *
 * /api/slip is not behind the booking quota and should not be: reading a slip
 * somebody already holds must not cost them a booking code. It still spends a
 * request to a bookmaker per call, and too many of those at once is the one
 * thing that has already cost this project an outage.
 *
 * The route is exercised here, not only the window: a limiter nobody calls is
 * the failure mode that ships.
 */
const test = require("node:test");
const assert = require("node:assert");

const { makeLimiter } = require("../lib/readlimit.js");

const at = (t) => () => t;

test("a subject gets its allowance and then a wait", () => {
  let now = 1000;
  const take = makeLimiter({ limit: 3, windowMs: 60000, now: () => now });
  assert.equal(take("a").allow, true);
  assert.equal(take("a").allow, true);
  const third = take("a");
  assert.equal(third.allow, true);
  assert.equal(third.remaining, 0);
  const blocked = take("a");
  assert.equal(blocked.allow, false);
  assert.equal(blocked.retryAfter, 60, "wait out the oldest call in the window");
});

test("the window slides rather than resetting on the minute", () => {
  let now = 0;
  const take = makeLimiter({ limit: 2, windowMs: 60000, now: () => now });
  take("a"); now = 30000; take("a");
  now = 59000;
  assert.equal(take("a").allow, false, "both calls are still inside the window");
  now = 60001;
  assert.equal(take("a").allow, true, "the first has fallen out of it");
  assert.equal(take("a").allow, false, "the second has not");
});

test("one reader's flood does not touch another's", () => {
  const take = makeLimiter({ limit: 1, windowMs: 60000, now: at(1) });
  assert.equal(take("a").allow, true);
  assert.equal(take("a").allow, false);
  assert.equal(take("b").allow, true, "a shared bucket would have refused this");
});

test("no subject and no limit both mean allow", () => {
  const off = makeLimiter({ limit: 0, windowMs: 60000, now: at(1) });
  for (let i = 0; i < 50; i++) assert.equal(off("a").allow, true);
  const on = makeLimiter({ limit: 1, windowMs: 60000, now: at(1) });
  assert.equal(on(null).allow, true);
  assert.equal(on(null).allow, true, "nothing to key on is not a reason to refuse");
});

/* ------------------------------------------------------------ the route */

function resSpy() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const reqFor = (device, code) => ({
  method: "GET",
  query: { book: "sporty", code: code || "ABCD12" },
  headers: { "x-sw-device": device, "x-forwarded-for": "102.89.1.1" },
});

test("the route refuses the flood without calling the bookmaker", async () => {
  process.env.SW_SLIP_READS_PER_MIN = "3";
  delete require.cache[require.resolve("../api/slip.js")];
  const handler = require("../api/slip.js");

  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (u) => {
    calls.push(u);
    return { status: 200, text: async () => JSON.stringify({ success: true, legs: [] }) };
  };
  try {
    const dev = "device-aaaaaaaa";
    for (let i = 0; i < 3; i++) {
      const r = resSpy();
      await handler(reqFor(dev), r);
      assert.equal(r.code, 200, "call " + (i + 1) + " is inside the allowance");
    }
    const r = resSpy();
    await handler(reqFor(dev), r);
    assert.equal(r.code, 429);
    assert.equal(calls.length, 3, "the refused read costs the bookmaker nothing");
    assert.ok(Number(r.headers["retry-after"]) > 0, "say when to come back");
    assert.match(String(r.body.error), /try again/);

    /* A second reader is unaffected, which is the whole point of keying on the
       device rather than counting the route. */
    const other = resSpy();
    await handler(reqFor("device-bbbbbbbb"), other);
    assert.equal(other.code, 200);
  } finally {
    global.fetch = realFetch;
    delete process.env.SW_SLIP_READS_PER_MIN;
    delete require.cache[require.resolve("../api/slip.js")];
  }
});

test("a malformed code is refused without spending the allowance", async () => {
  process.env.SW_SLIP_READS_PER_MIN = "1";
  delete require.cache[require.resolve("../api/slip.js")];
  const handler = require("../api/slip.js");
  const realFetch = global.fetch;
  global.fetch = async () => ({ status: 200, text: async () => "{\"success\":true}" });
  try {
    const bad = resSpy();
    await handler(reqFor("device-cccccccc", "no"), bad);
    assert.equal(bad.code, 400);
    const good = resSpy();
    await handler(reqFor("device-cccccccc"), good);
    assert.equal(good.code, 200, "the typo did not eat the read");
  } finally {
    global.fetch = realFetch;
    delete process.env.SW_SLIP_READS_PER_MIN;
    delete require.cache[require.resolve("../api/slip.js")];
  }
});
