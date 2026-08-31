"use strict";

/**
 * The record, published per market.
 *
 * The site's claim is that every tip is checked. Until 31 Aug that was only
 * true of the headline tip - `bestTip` can return a match result, a double
 * chance or Over 1.5 and nothing else, so every other market the slip builder
 * offers had no published record at all.
 *
 * Now every market is graded on every held-out match and the numbers go on
 * /how-it-works. This file guards the two ways that page could lie: showing a
 * figure with no sample behind it, and drifting out of step with the payload
 * it is supposed to be reporting.
 */

const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

const ROWS = [
  { market: "Double chance", total: 1821, correct: 1348, exp: 1821 * 0.71 },
  { market: "Over 1.5", total: 1821, correct: 1428, exp: 1821 * 0.75 },
  { market: "Team over 0.5", total: 1821, correct: 1512, exp: 1821 * 0.78 },
];
const page = (markets) => P.renderHowItWorks({ results: 29594, leagues: 47, markets });

test("the table reports every market it is given", () => {
  const h = page(ROWS);
  ROWS.forEach((r) => assert.ok(h.includes(r.market), "missing row: " + r.market));
  assert.match(h, /The record, market by market/);
  assert.match(h, /<table class='cal'>/);
});

test("it shows what we said next to what happened", () => {
  /* A hit rate on its own is not checkable. "Over 3.5 landed 32%" reads as a
     failure until you know we only ever claimed 30%. The pair is the point. */
  const h = page(ROWS);
  assert.match(h, /<th>We said<\/th>/);
  assert.match(h, /<th>Landed<\/th>/);
  assert.match(h, /78%[\s\S]{0,80}83%/,
    "Team over 0.5 should print its claim (78%) and its outcome (83%)");
});

test("a market without a real sample is not published", () => {
  /* A 2-of-2 is not a 100% record, and a table is exactly where that reads as
     one. The bar is a real sample or no row. */
  const thin = [{ market: "First-half goal", total: 12, correct: 9, exp: 12 * 0.7 }];
  assert.strictEqual(P.renderHowItWorks({ markets: thin }).includes("First-half goal"), false,
    "a 12-match sample was published as a record");
});

test("no rows at all means no table, not an empty one", () => {
  [null, undefined, []].forEach((v) => {
    const h = page(v);
    assert.ok(!h.includes("<table class='cal'>"), "rendered an empty table for " + JSON.stringify(v));
    assert.ok(h.includes("Where the numbers come from"), "the rest of the page must survive");
  });
});

test("a row missing its predicted figure is skipped, not shown as zero", () => {
  /* `exp` arrived later than the counts. A payload baked before it existed
     would otherwise print "we said 0%", which is worse than saying nothing. */
  const noExp = [{ market: "Double chance", total: 1821, correct: 1348 }];
  assert.strictEqual(page(noExp).includes("Double chance"), false);
});

test("the difference is signed and takes its colour from the direction", () => {
  const over = page([{ market: "Over 1.5", total: 1821, correct: 1428, exp: 1821 * 0.75 }]);
  assert.match(over, /class='gap over'>\+/, "landing more often than claimed should read as a plus");
  const under = page([{ market: "Over 1.5", total: 1821, correct: 900, exp: 1821 * 0.75 }]);
  assert.match(under, /class='gap under'>-/,
    "landing LESS often than claimed must be visible, not hidden");
});

test("the note says the matches were unseen", () => {
  /* Without that, a reader is entitled to assume we graded ourselves on the
     data we fitted on, which would make the whole table worthless. */
  assert.match(page(ROWS), /had not seen when it made the call/);
});

test("the build passes the market rows to the page", () => {
  const pre = require("fs").readFileSync(
    require("path").join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.match(pre, /markets: \(payload && payload\.record && payload\.record\.markets\) \|\| null/,
    "prebuild does not hand the market record to the page, so the table is always empty");
});

test("the table scrolls itself rather than the page", () => {
  /* Five columns do not fit a 320px phone, and a table that widens the body
     breaks every other page on the site too. */
  const h = page(ROWS);
  assert.match(h, /\.cal-wrap\{overflow-x:auto/);
});
