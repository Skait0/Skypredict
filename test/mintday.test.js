"use strict";

/**
 * The mint must survive a day with no card.
 *
 * 23 September 2026: the board held one fixture for the whole day - the card
 * was cup ties in competitions the model has no ratings for - and
 * scripts/mkcode.js threw "only 1 bookable fixtures left on 2026-09-23". The
 * cost was not the missing code. The job exits non-zero, so nothing was
 * committed; nothing committed means Vercel never rebuilt; and the board sat
 * twenty hours stale while the Pick and the Slip of the day moved on to games
 * no reader had been shown.
 *
 * So an unasked-for date walks forward to the first day that can fill a slip,
 * and the entry is stamped with the day it really belongs to.
 */

const test = require("node:test");
const assert = require("node:assert");
const { chooseDay } = require("../scripts/mkcode.js");

/* 2026-09-23T12:00Z, so "not started" means later the same afternoon. */
const NOW = Date.parse("2026-09-23T12:00:00.000Z");

function fx(date, n, opts) {
  const o = opts || {};
  return Array.from({ length: n }, (_, i) => ({
    date: date,
    home: "Home " + date + " " + i, away: "Away " + date + " " + i,
    league: "England Premier League",
    kickoff: o.kickoff || date + "T19:00:00.000Z",
    tip: "Over 1.5", market: "OVER_1.5", tip_p: 0.9 - i * 0.01,
    home_p: 0.5, draw_p: 0.25, away_p: 0.25, o25: 0.7,
  }));
}

test("a day that can fill the slip is used as it stands", () => {
  const got = chooseDay(fx("2026-09-23", 6), {
    from: "2026-09-23", legs: 5, walk: true, now: NOW,
  });
  assert.equal(got.date, "2026-09-23");
  assert.equal(got.pool.length, 6);
  assert.equal(got.log.length, 1, "no walking, so nothing to narrate");
});

test("an empty day falls forward to the next day that has a card", () => {
  const board = fx("2026-09-23", 1).concat(fx("2026-09-24", 1), fx("2026-09-25", 6));
  const got = chooseDay(board, { from: "2026-09-23", legs: 5, walk: true, now: NOW });
  assert.equal(got.date, "2026-09-25", "23rd and 24th are both too thin");
  assert.equal(got.pool.length, 6);
  assert.match(got.log[0], /2026-09-23.*looking at 2026-09-24/);
});

test("the walk gives up rather than running off into an empty week", () => {
  const got = chooseDay(fx("2026-09-23", 1), {
    from: "2026-09-23", legs: 5, walk: true, now: NOW,
  });
  assert.ok(got.pool.length < 5, "nothing to mint, and the caller must still throw");
  assert.ok(got.log.length <= 8, "at most a week of hops");
});

test("an explicit date is taken literally", () => {
  const board = fx("2026-09-23", 1).concat(fx("2026-09-25", 6));
  const got = chooseDay(board, { from: "2026-09-23", legs: 5, walk: false, now: NOW });
  assert.equal(got.date, "2026-09-23",
    "--date is a human asking for that day; it must not wander");
});

test("a game already under way is not a leg", () => {
  const board = fx("2026-09-23", 6, { kickoff: "2026-09-23T09:00:00.000Z" });
  const got = chooseDay(board, { from: "2026-09-23", legs: 5, walk: false, now: NOW });
  assert.equal(got.pool.length, 0, "kicked off three hours ago");
});

test("the pool is most confident first", () => {
  const got = chooseDay(fx("2026-09-23", 6), {
    from: "2026-09-23", legs: 5, walk: true, now: NOW,
  });
  const ps = got.pool.map((f) => f.tip_p);
  assert.deepEqual(ps, ps.slice().sort((a, b) => b - a));
});
