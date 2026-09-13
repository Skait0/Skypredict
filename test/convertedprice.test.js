"use strict";
/* WHAT A LEG IS WORTH WHEN WE HAVE NO IDEA.
 *
 * A converted slip carries pass-through markets - a handicap, corners, a team
 * card - and we hold no probability for any of them. oddOf clamps whatever it
 * is given into 0.06..0.97, so oddOf(null) came back 10.93: a number that
 * looks exactly like a price. It was printed beside a booking button on the
 * live site as "about x10.93" for a single Le Mans +0.5 at 1.55, and it went
 * into the share payload as the leg's odds.
 *
 * Lifted from public/index.html rather than re-implemented, the same way
 * slipsplit.test.js lifts the dealing: a copy would pin my idea of the rule
 * instead of the one that ships.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

/* fixtureById and slipName are the page's own; the picks below carry their
   fixture inline, which is what the converter builds. */
const api = new Function(
  grab("oddOf") + grab("legOdd") + grab("totalOdds") +
  'const SLIP_FS="\\u001f", SLIP_RS="\\u001e";' +
  "function fixtureById(){return null;}" + grab("slipName") + grab("slipPayload") +
  "\nreturn {oddOf,legOdd,totalOdds,slipPayload,SLIP_RS};")();

const fx = (odds) => ({ home: "Le Mans", away: "Amiens", date: "2026-09-14",
  sportyOdds: odds || {} });

test("a market we hold no probability for is not given a price", () => {
  assert.equal(api.legOdd(fx(), "AH_1_-0.5", null), 0);
  assert.equal(api.legOdd(fx(), "AH_1_-0.5", undefined), 0);
  /* The number that shipped. If this ever comes back, so has the bug. */
  assert.ok(api.oddOf(null) > 10, "oddOf still invents a price, as it always did");
});

test("the bookmaker's own price is still used when there is one", () => {
  assert.equal(api.legOdd(fx({ "AH_1_-0.5": 1.55 }), "AH_1_-0.5", null), 1.55);
});

test("a modelled leg is priced exactly as before", () => {
  const p = 0.62;
  assert.equal(api.legOdd(fx(), "OVER_1.5", p), api.oddOf(p));
});

test("an unpriced leg multiplies by nothing, never by noise", () => {
  const priced = { f: fx(), code: "OVER_1.5", p: 0.5 };
  const blind = { f: fx(), code: "AH_1_-0.5", p: null };
  assert.equal(api.totalOdds([priced, blind]), api.totalOdds([priced]));
});

test("a slip with a leg the link cannot carry shares no slip at all", () => {
  /* Not a shorter slip: that is the failure the whole share path exists to
     avoid, and lib/sliplink.js refuses a partial one at the other end. */
  const priced = { f: fx(), code: "OVER_1.5", p: 0.62 };
  const blind = { f: fx(), code: "AH_1_-0.5", p: null };
  assert.equal(api.slipPayload([priced, blind]), "");
  assert.equal(api.slipPayload([priced]).split(api.SLIP_RS).length, 1);
});
