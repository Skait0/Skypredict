"use strict";

/**
 * COMPETITIONS WE HOLD NO RATINGS FOR MUST NOT BE PRICED.
 *
 * Reported: a Russian lower-division fixture picked for a slip. Two separate
 * routes led there, and only one was a team-name problem.
 *
 * The first is fixed in model.js - Russian reserve sides are written
 * "<club>-2 <city>", the marker sits mid-name, and "FC Spartak-2 Moscow"
 * reduced to {spartak, moscow}, an exact token match against the Premier
 * League club.
 *
 * The second has no marker to catch. A second-tier fixture between two
 * ordinary clubs stays off the board only for as long as neither name happens
 * to collide with a club we DO rate - the fuzzy matcher behaving, not a
 * guarantee. So the competition itself is refused.
 *
 * THE DISTINCTION THAT MATTERS: leagues, not cups. A cup tie between rated
 * clubs resolves correctly per-team through leagueOfTeam and belongs on the
 * board. A league we hold no results for is different - by definition its
 * clubs are not clubs we rate, so any match is a collision.
 */

const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");

const refuse = B.isUnratedCompetition;

test("isUnratedCompetition is exported", () => {
  assert.equal(typeof refuse, "function");
});

test("unrated senior leagues are refused", () => {
  /* All observed on the live SportyBet feed. The four second tiers were being
     published at tier=1, because relegated clubs keep their top-flight
     ratings - a second-division match dressed as a first-division one. */
  const bad = [
    "Russia 2. Liga, Division A",
    "Russia 2. Liga, Division B, Group 2",
    "Russia 2. Liga, Division B, Group 4",
    "Russia 1. Liga",
    "Denmark 1. Division",
    "Norway 1st Division",
    "Poland 1. Liga",
    "Japan J2 League",
  ];
  const allowed = bad.filter((l) => !refuse(l));
  assert.deepEqual(allowed, [], "these would be priced off borrowed ratings: " + allowed.join(", "));
});

test("youth, reserve and women's competitions stay refused", () => {
  for (const l of ["DFB-Pokal Junioren", "Turkey U19 Ligi", "Russia Superleague, Women",
                   "Primavera 1", "Reserve League", "Frauen-Bundesliga"]) {
    assert.equal(refuse(l), true, l + " should be refused");
  }
});

test("CUPS ARE NOT REFUSED - they resolve per-team and are correct", () => {
  /* The thing most likely to be broken by a careless widening of the list.
     All four of these are published today and all four are right: their clubs
     are rated in their own divisions, and the cross-tier path prices the gap
     between those divisions deliberately. */
  for (const l of ["England EFL Cup", "England EFL Trophy", "Scotland League Cup",
                   "Argentina Copa Argentina", "Ireland FAI Cup", "Russia Russian Cup"]) {
    assert.equal(refuse(l), false, l + " is a cup between rated clubs and must stay");
  }
});

test("rated leagues are not refused", () => {
  for (const l of ["Russia Premier League", "England Premier League", "England Championship",
                   "England National League", "Japan J1 League", "Denmark Superliga",
                   "Norway Eliteserien", "Poland Ekstraklasa", "Spain La Liga 2",
                   "Italy Serie B", "Germany Bundesliga 2"]) {
    assert.equal(refuse(l), false, l + " is rated and must stay on the board");
  }
});

test("junk input is survivable", () => {
  for (const l of [null, undefined, "", "   ", 0, {}]) {
    assert.doesNotThrow(() => refuse(l));
  }
  assert.equal(refuse(""), false);
});
