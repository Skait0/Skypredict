"use strict";
/**
 * /s - the page a reader lands on when somebody shares a slip.
 *
 * 118 lines, and nothing exercised it. It is the only route that writes cache
 * policy by hand rather than taking one of the named policies, and it is the
 * one a stranger sees first: a link pasted into WhatsApp is most people's
 * introduction to the site.
 *
 * What it decides, and what is asserted here:
 *
 *   a slip that will not decode      400, cached nowhere
 *   a short code we have never seen  404, cached nowhere
 *   a slip still playing             200, minutes at the edge
 *   a slip that has finished         200, a week at both tiers
 *
 * THE STALENESS NUMBERS ARE THE POINT. They are measured with the same
 * lib/cachepolicy.js arithmetic the board is held to, not re-derived here -
 * the static board drifted precisely because it kept its own copy.
 */
const test = require("node:test");
const assert = require("node:assert");
const SL = require("../lib/sliplink.js");
const { servedAgeOf, worstServedAge, windowOf } = require("../lib/cachepolicy.js");
const handler = require("../api/s.js");

const LEG = { home: "Thun", away: "Lausanne", date: "2026-09-02",
              code: "OVER_1.5", od: 1.25, p: 0.91 };
const RESULT = { date: "2026-09-02", home: "Thun", away: "Lausanne", hg: 2, ag: 1 };

/* A response that records rather than sends. */
function res() {
  const o = { headers: {}, statusCode: 0, body: "" };
  return {
    setHeader(k, v) { o.headers[k] = v; },
    end(b) { o.body = b == null ? "" : String(b); return o; },
    get statusCode() { return o.statusCode; },
    set statusCode(v) { o.statusCode = v; },
    _o: o,
  };
}

/* The route fetches /predictions.json off its own host to grade the legs.
   Stubbed so the test never touches the network, and restored immediately -
   a leaked global fetch would poison every test file that runs after this. */
async function call(req, board) {
  const real = global.fetch;
  global.fetch = async () => ({ ok: board != null, json: async () => board });
  const r = res();
  try {
    await handler(req, r);
  } finally {
    global.fetch = real;
  }
  return r._o;
}

const policyOf = (o) => ({
  browser: o.headers["Cache-Control"],
  cdn: o.headers["CDN-Cache-Control"],
  vercel: o.headers["Vercel-CDN-Cache-Control"],
});

const good = () => SL.encode([LEG]);

/* ------------------------------------------------------------- refusals */

test("a slip that will not decode is a 400 and is cached nowhere", () => {
  /* The usual cause is a link truncated by a chat app. Caching the refusal
     would punish the next person who pastes it whole. */
  return call({ query: { p: "not-a-slip" }, url: "/s?p=not-a-slip", headers: {} }, null)
    .then((o) => {
      assert.equal(o.statusCode, 400);
      const p = policyOf(o);
      for (const tier of ["browser", "cdn", "vercel"]) {
        assert.match(p[tier], /no-store/, tier + " must refuse to store a refusal");
      }
      assert.equal(worstServedAge(p), 0);
    });
});

test("a short code we have no slip for is a 404, also cached nowhere", async () => {
  /* Supabase is not configured in a test run, so getSharedSlip answers
     "not configured" - which this route must treat the same as "no such
     slip": a page saying so, not a 500. */
  const o = await call({ query: {}, url: "/s/MS0LJY", headers: {} }, null);
  assert.equal(o.statusCode, 404);
  assert.match(policyOf(o).cdn, /no-store/);
  assert.ok(o.body.length > 0, "a reader gets a page, not an empty body");
});

/* --------------------------------------------------------- the two lives */

test("a slip still playing is held for minutes, not hours", async () => {
  const o = await call({ query: { p: good() }, url: "/s?p=x", headers: { host: "x.test" } }, null);
  assert.equal(o.statusCode, 200);
  const p = policyOf(o);
  assert.equal(windowOf(p.cdn), 150, "fresh window on Cloudflare");
  assert.equal(windowOf(p.vercel), 150, "and the same on Vercel");
  /* The honest number, which the fresh windows do not show: 150 + 1800 on
     Cloudflare and 150 + 3600 on Vercel. A reader can be handed a slip 95
     minutes old while its games are still being played. That is the trade -
     slips are shared in bursts and the edge absorbs the burst - but it is
     recorded here rather than living only in a header. */
  assert.equal(servedAgeOf(p.cdn), 1950);
  assert.equal(servedAgeOf(p.vercel), 3750);
  assert.equal(worstServedAge(p), 5700, "95 minutes, in seconds");
});

test("a finished slip can sit on the edge for a week", async () => {
  const board = { results: [RESULT], record: { total: 80, correct: 58 } };
  const o = await call({ query: { p: good() }, url: "/s?p=x", headers: { host: "x.test" } }, board);
  assert.equal(o.statusCode, 200);
  const p = policyOf(o);
  assert.equal(windowOf(p.cdn), 604800, "a week");
  assert.equal(windowOf(p.vercel), 604800);
  /* Safe in a way the board is not: a slip's content is decided entirely by
     its own URL, so no deploy can change what this address means. */
  assert.ok(worstServedAge(p) > worstServedAge({ cdn: "public, s-maxage=150, stale-while-revalidate=1800",
                                                 vercel: "public, s-maxage=150, stale-while-revalidate=3600" }),
    "a settled slip is allowed to outlive one that is still playing");
});

test("the browser revalidates on both paths, settled or not", async () => {
  for (const board of [null, { results: [RESULT] }]) {
    const o = await call({ query: { p: good() }, url: "/s?p=x", headers: { host: "x.test" } }, board);
    assert.match(policyOf(o).browser, /max-age=0/,
      "the one tier we cannot purge must not hold a copy");
    assert.match(policyOf(o).browser, /must-revalidate/);
  }
});

/* ------------------------------------------------------- the link preview */

test("a slip declares its own address, not the bare route", async () => {
  /* Every shared slip used to say og:url = "/s", so X and WhatsApp collapsed
     them onto one canonical URL and the first slip crawled supplied the
     preview for every slip after it. */
  const p = good();
  const o = await call({ query: { p }, url: "/s?p=x", headers: { host: "x.test" } }, null);
  assert.ok(o.body.includes("/s?p=" + encodeURIComponent(p)),
    "the long form must carry the payload in its own og:url");
  assert.ok(!/og:url" content="\/s"/.test(o.body), "and never the bare route");
});

test("a slip opened by its short code says so in og:url", async () => {
  /* The branch the test above does not reach. Caught by mutation: collapsing
     `code ? "/s/" + code : ...` back to a bare "/s" left every assertion
     passing, because nothing here had ever passed a code. */
  const o = await call({ query: { p: good(), c: "MS0LJY" }, url: "/s?p=x&c=MS0LJY",
                         headers: { host: "x.test" } }, null);
  assert.ok(o.body.includes("/s/MS0LJY"),
    "a short code has a real address and the preview must use it");
  assert.ok(!o.body.includes('content="/s"'), "never the bare route");
});

test("a grading failure renders the slip anyway", async () => {
  /* The record at the bottom is credibility, not content. A slow or broken
     predictions.json must not cost the reader the page they clicked. */
  const real = global.fetch;
  global.fetch = async () => { throw new Error("upstream down"); };
  const r = res();
  try {
    await handler({ query: { p: good() }, url: "/s?p=x", headers: { host: "x.test" } }, r);
  } finally {
    global.fetch = real;
  }
  assert.equal(r._o.statusCode, 200, "the page still renders");
  assert.ok(r._o.body.includes("Thun"), "with the slip on it");
});
