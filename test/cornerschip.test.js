"use strict";
/**
 * The corners chip offers a line only where SportyBet has it open.
 *
 * 23 Sep 2026: the first ticket the chip built was seven corners legs on
 * games 17 days out, and neither book would take them - SportyBet "can't take
 * 6 of these", Bet9ja "no market there for 7 of 7". Books open corners a few
 * days before kick-off, and some leagues never. The sweep now asks for market
 * 166, so a fixture carries the lines SportyBet actually quotes, and a line it
 * does not quote is not a leg.
 */
const test = require("node:test");
const assert = require("node:assert");
const { fn } = require("./books.js");

const cornersOpen = new Function(
  'var BOOKS={sporty:{odds:"sportyOdds"}};' + fn("cornersOpen") + "\nreturn cornersOpen;")();

test("a corners line SportyBet quotes is offered", () => {
  const f = { sportyOdds: { "CORNERS_OV_8.5": 1.44, "CORNERS_UN_8.5": 2.6 } };
  assert.equal(cornersOpen(f, "CORNERS_OV_8.5"), true);
  assert.equal(cornersOpen(f, "CORNERS_UN_8.5"), true);
});

test("a line it does not quote is not, even on a fixture it prices", () => {
  const f = { sportyOdds: { "1X": 1.3, "CORNERS_OV_9.5": 1.8 } };
  assert.equal(cornersOpen(f, "CORNERS_OV_7.5"), false);
});

test("a fixture with no SportyBet prices offers no corners at all", () => {
  /* Unlike the goals markets, where no prices means "the feed may be slow, an
     estimate is honest": corners are closed on most fixtures most of the time,
     so not knowing has to read as closed. */
  assert.equal(cornersOpen({}, "CORNERS_OV_8.5"), false);
  assert.equal(cornersOpen({ sportyOdds: null }, "CORNERS_OV_8.5"), false);
});

test("every other market is untouched by the gate", () => {
  for (const c of ["1X", "OVER_2.5", "GG", "WINHALF_H_Y"]) {
    assert.equal(cornersOpen({}, c), true, c);
  }
});
