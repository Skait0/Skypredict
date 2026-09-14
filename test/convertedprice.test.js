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
/* legOdd asks which book is selected now, so the harness carries the real
   table and the real curBook rather than a stub. A stub is a second copy of
   the rule and would drift from it, which is the thing this file exists not
   to do. */
const { decl, fn } = require("./books.js");

const api = new Function(
  decl("BOOKS") + "\nvar BOOKMAKER='sporty';\n" + fn("curBook") + "\n" +
  grab("oddOf") + grab("legOdd") + grab("totalOdds") +
  grab("splitWays") + grab("splitPicks") + grab("splitBoxInner") +
  'const SLIP_FS="\\u001f", SLIP_RS="\\u001e";' +
  /* slipPayload reads the link's vocabulary, so the page's own copy comes
     with it - inventing one here would test the invention. */
  (/var LINK_MARKETS=\{[\s\S]*?\};/.exec(src) || [""])[0] +
  "function fixtureById(){return null;}" + grab("slipName") + grab("slipPayload") +
  "\nreturn {oddOf,legOdd,totalOdds,slipPayload,splitBoxInner,SLIP_RS,BOOKS," +
  "setBook:function(k){BOOKMAKER=k;}};")();

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

test("a converted slip can still be split, without a made-up payout", () => {
  /* The first fix took the whole box away when a leg was unpriced, which
     removed a working feature to avoid printing one wrong number. The dealing
     never needed a price; only the label did. */
  const priced = (i) => ({ f: fx(), code: "OVER_1.5", p: 0.6 + i / 100, id: "p" + i });
  const legs = [priced(1), priced(2), priced(3),
    { f: fx(), code: "AH_1_-0.5", p: null, id: "blind" }];

  const blind = api.splitBoxInner(legs);
  assert.match(blind, /Split it into separate tickets/, "the split is still offered");
  assert.match(blind, /priced at the bookmaker/);
  assert.doesNotMatch(blind, /about x/, "no payout is claimed for a slip we cannot price");

  const known = api.splitBoxInner([priced(1), priced(2), priced(3), priced(4)]);
  assert.match(known, /about x/, "a fully priced slip still quotes the payout");
});

/* ---------------------------------------------- whose price are we showing */

/* Reported as "the odds are a little off" on a BetKing slip, and it was not a
   little: legOdd read f.sportyOdds whatever book was selected, so every leg,
   every total, the shared payload and the record carried SportyBet's numbers.
   Measured on 701 fixtures both books carry - median -0.72% per leg, 7.5% of
   legs more than 5% apart - which over a 22-leg slip compounds to 8-15%, in
   the direction that OVERSTATES the payout. */
const both = (odds) => ({ home: "Le Mans", away: "Amiens", date: "2026-09-14",
  sportyOdds: odds.sporty || {}, b9Odds: odds.b9 || {}, bkOdds: odds.bk || {} });

test("a leg is priced by the book the reader picked", () => {
  const f = both({ sporty: { "OVER_2.5": 1.80 }, bk: { "OVER_2.5": 1.71 } });
  try {
    api.setBook("sporty");
    assert.equal(api.legOdd(f, "OVER_2.5", 0.55), 1.80);
    api.setBook("betking");
    assert.equal(api.legOdd(f, "OVER_2.5", 0.55), 1.71,
      "a BetKing slip showing SportyBet's price is the bug this fixed");
  } finally { api.setBook("sporty"); }
});

test("a total is the product of that book's own prices", () => {
  const f = both({ sporty: { "1": 2.00, "GG": 2.00 }, bk: { "1": 1.90, "GG": 1.90 } });
  const picks = [{ f, code: "1", p: 0.5 }, { f, code: "GG", p: 0.5 }];
  try {
    api.setBook("sporty");
    assert.equal(api.totalOdds(picks).toFixed(2), "4.00");
    api.setBook("betking");
    assert.equal(api.totalOdds(picks).toFixed(2), "3.61");
  } finally { api.setBook("sporty"); }
});

test("a market this book does not publish keeps the price we had", () => {
  /* The tempting rule was "their price, else our estimate", and it buys a
     regression: measured 14 Sep, BetKing's feed carries NO team goals and no
     first-half line, Bet9ja's carries neither those nor GG/NG, and
     team-over-0.5 is a default chip. So that rule swaps a real published price
     for a model estimate on a large share of legs. Never worse than before is
     the bar. */
  const f = both({ sporty: { "HOME_OVER_0.5": 1.30 }, bk: { "1": 2.10 } });
  try {
    api.setBook("betking");
    assert.equal(api.legOdd(f, "HOME_OVER_0.5", 0.77), 1.30);
  } finally { api.setBook("sporty"); }
});

test("with no price anywhere it is still the estimate, and still 0 without one", () => {
  const f = both({ bk: {} });
  try {
    api.setBook("betking");
    assert.ok(api.legOdd(f, "OVER_2.5", 0.55) > 1, "a probability still prices");
    assert.equal(api.legOdd(f, "AH_1_-0.5", null), 0, "and nothing still prices at 0");
  } finally { api.setBook("sporty"); }
});

test("the slip of the day is priced on SportyBet whatever the reader picked", () => {
  /* It is locked for the day and it is the same slip for everyone. Following
     the reader's book would compose a different slip per reader against a
     target of 2.0, and whichever reader loaded first would write THEIR
     version into the lock. */
  const body = src.slice(src.indexOf("function sotdUnderCap("));
  assert.match(body.slice(0, 400), /legOdd\([^)]*BOOKS\.sporty\)/,
    "sotdUnderCap must pin its book");
  const total = src.slice(src.indexOf("var odds=SOTD.reduce"));
  assert.match(total.slice(0, 120), /legOdd\([^)]*BOOKS\.sporty\)/,
    "the slip of the day's total must pin its book too");
});
