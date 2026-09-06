"use strict";
/* The floor is the only history this repo can rely on: football-data.co.uk
   has been answering 503 since 5 Sep 2026, and the whole point of committing
   finished seasons was that they never change. The European offset fit reads
   the same files the build reads, so the two can never disagree about what a
   club's rating was. */
const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");

test("the floor loads without touching the network", () => {
  const ms = B.loadFloorMatches();
  assert.ok(ms.length > 40000, "expected the committed floor, got " + ms.length + " matches");
  for (const m of ms.slice(0, 50)) {
    assert.ok(m.date instanceof Date && !isNaN(m.date), "every row needs a real date");
    assert.equal(typeof m.league, "string");
    assert.ok(m.league.length > 0, "a match with no league cannot be fitted");
    assert.equal(typeof m.hg, "number");
  }
});

test("league names are the ones the model indexes on, not raw division codes", () => {
  const leagues = new Set(B.loadFloorMatches().map((m) => m.league));
  assert.ok(leagues.has("England Premier League"), "expected mapped names, not E0");
  assert.ok(!leagues.has("E0"), "a raw division code means the mapping was skipped");
});
