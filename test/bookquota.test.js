"use strict";
/**
 * THE GATE ON /api/book.
 *
 * The route the quota exists for, and the one that must survive it. Booking is
 * the only call that costs real money - Railway CPU on a $5 plan, and
 * bookmaker goodwill that has already been spent once - while slip building is
 * free client-side compute. So this is the single place a limit belongs.
 *
 * THREE RULES, ALL ASSERTED BELOW.
 *
 * 1. It fails OPEN. Every path where the counter cannot answer - Supabase
 *    down, no device id, quota code throwing - must book anyway. A reader who
 *    loses a slip because our meter broke has been charged for our outage.
 *
 * 2. Only a SUCCESSFUL booking is counted. A rejection comes back 400 with an
 *    `unbookable` list, and index.html drops those legs and retries
 *    immediately. Counting attempts would let one slip burn a reader's whole
 *    day in three automatic retries they never asked for.
 *
 * 3. A refusal is a 429 that says what to do, cached nowhere. It is the only
 *    response here a reader can act on by waiting.
 */
const test = require("node:test");
const assert = require("node:assert");
const BP = require("../lib/bookproxy.js");

/* A request shaped like the one Vercel hands the route. */
const post = (extra) => Object.assign({
  method: "POST",
  query: { book: "sporty" },
  headers: { "x-sw-device": "device-abc123", "x-forwarded-for": "105.112.4.9" },
  body: { selections: [{ eventId: "1", prediction: "1X" }] },
}, extra || {});

function res() {
  const o = { headers: {}, code: 0, body: null };
  const self = {
    setHeader(k, v) { o.headers[k] = v; },
    status(c) { o.code = c; return self; },
    json(b) { o.body = b; return o; },
    end(b) { o.body = b; return o; },
    _o: o,
  };
  return self;
}

/* The upstream, stubbed at the fetch boundary so the real postUpstream path
   runs. Returns whatever the test wants the bookmaker to have said. */
async function withUpstream(status, body, fn) {
  const real = global.fetch;
  global.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
    headers: { get: () => "application/json" },
  });
  try { return await fn(); } finally { global.fetch = real; }
}

const CODE = { success: true, code: "MS0LJY" };

/* A gate the test drives directly, standing in for the Supabase-backed one. */
const gate = (verdict) => async () => verdict;

/* ------------------------------------------------------------- refusing */

test("a device over its cap is refused with a 429 and never reaches the bookmaker", async () => {
  let reached = false;
  const real = global.fetch;
  global.fetch = async () => { reached = true; throw new Error("must not be called"); };
  try {
    const r = res();
    await BP.makeHandler({ gate: gate({ allow: false, counted: true, remaining: 0 }) })(post(), r);
    assert.equal(r._o.code, 429);
    assert.equal(reached, false, "a refused booking must not cost an upstream call");
    assert.equal(r._o.body.success, false);
    assert.ok(String(r._o.body.message).length > 0, "the reader is told why");
  } finally { global.fetch = real; }
});

test("a refusal is cached nowhere", async () => {
  const r = res();
  await BP.makeHandler({ gate: gate({ allow: false, counted: true, remaining: 0 }) })(post(), r);
  assert.match(r._o.headers["Cache-Control"], /no-store/,
    "tomorrow's allowance must not be answered from a cache");
});

/* -------------------------------------------------------------- passing */

test("a device under its cap books, and the answer is passed through untouched", async () => {
  const r = res();
  await withUpstream(200, CODE, () =>
    BP.makeHandler({ gate: gate({ allow: true, counted: true, remaining: 6 }) })(post(), r));
  assert.equal(r._o.code, 200);
  assert.equal(r._o.body.code, "MS0LJY", "the booking code must survive the gate");
});

test("what is left is told to the client", async () => {
  /* So the page can say "4 codes left today" rather than surprising someone
     with a refusal on their next tap. */
  const r = res();
  await withUpstream(200, CODE, () =>
    BP.makeHandler({ gate: gate({ allow: true, counted: true, remaining: 4 }) })(post(), r));
  assert.equal(r._o.headers["X-Sw-Quota-Remaining"], "4");
});

test("nothing is claimed about what is left when nothing was counted", async () => {
  const r = res();
  await withUpstream(200, CODE, () =>
    BP.makeHandler({ gate: gate({ allow: true, counted: false, remaining: null }) })(post(), r));
  assert.equal(r._o.headers["X-Sw-Quota-Remaining"], undefined,
    "an uncounted request must not report a number it does not have");
});

/* --------------------------------------------------------- failing open */

test("a gate that throws still books", async () => {
  const r = res();
  await withUpstream(200, CODE, () =>
    BP.makeHandler({ gate: async () => { throw new Error("supabase down"); } })(post(), r));
  assert.equal(r._o.code, 200, "our outage must not become the reader's");
  assert.equal(r._o.body.code, "MS0LJY");
});

test("no gate configured at all books exactly as before", async () => {
  /* The route's behaviour with the feature switched off has to be the old
     behaviour, byte for byte. */
  const r = res();
  await withUpstream(200, CODE, () => BP.makeHandler()(post(), r));
  assert.equal(r._o.code, 200);
  assert.equal(r._o.body.code, "MS0LJY");
});

/* ------------------------------------------------------------ recording */

test("a successful booking is recorded once", async () => {
  const seen = [];
  const r = res();
  await withUpstream(200, CODE, () =>
    BP.makeHandler({
      gate: gate({ allow: true, counted: true, remaining: 9 }),
      record: async (req) => { seen.push(req); },
    })(post(), r));
  assert.equal(seen.length, 1, "one booking, one row");
});

test("a rejected slip is NOT recorded", async () => {
  /* The load-bearing one. A 400 carries `unbookable` and index.html drops
     those legs and retries at once; counting attempts would spend a reader's
     whole day on retries they never asked for. */
  const seen = [];
  const r = res();
  await withUpstream(400, { success: false, unbookable: [{ eventId: "1" }] }, () =>
    BP.makeHandler({
      gate: gate({ allow: true, counted: true, remaining: 9 }),
      record: async () => { seen.push(1); },
    })(post(), r));
  assert.equal(r._o.code, 400, "the rejection still reaches the client");
  assert.ok(r._o.body.unbookable, "with the list it retries on");
  assert.equal(seen.length, 0, "and costs the reader nothing");
});

test("a recording failure never costs the reader their code", async () => {
  const r = res();
  await withUpstream(200, CODE, () =>
    BP.makeHandler({
      gate: gate({ allow: true, counted: true, remaining: 9 }),
      record: async () => { throw new Error("insert failed"); },
    })(post(), r));
  assert.equal(r._o.code, 200);
  assert.equal(r._o.body.code, "MS0LJY");
});

/* ------------------------------------------------- the old rules survive */

test("the checks that ran before the gate still run first", async () => {
  /* A malformed request must be refused on its own terms, not counted against
     a quota it never reached. */
  const seen = [];
  const g = { gate: async () => { seen.push("gated"); return { allow: true, counted: true, remaining: 9 }; } };
  const bad = res();
  await BP.makeHandler(g)(post({ method: "GET" }), bad);
  assert.equal(bad._o.code, 405);
  const noSel = res();
  await BP.makeHandler(g)(post({ body: { selections: [] } }), noSel);
  assert.equal(noSel._o.code, 400);
  assert.equal(seen.length, 0, "neither should have consulted the quota");
});
