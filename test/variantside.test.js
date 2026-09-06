"use strict";

/**
 * A YOUTH, RESERVE OR WOMEN'S SIDE MUST NEVER RESOLVE TO THE SENIOR CLUB.
 *
 * Reported from a live slip: a Turkish under-19 fixture, Fenerbahce v
 * Besiktas, published with the senior clubs' ratings. The guard in matchTeam
 * existed and was too narrow - it caught "Fenerbahce U19" and let through
 * every one of the shapes below, because the feeds disagree about whether an
 * age group carries a hyphen, a space or nothing at all, and because the word
 * forms were never listed.
 *
 * The asymmetry that sets the strictness: a false reject drops one fixture and
 * nobody sees it. A false accept books somebody onto a youth game off a
 * first-team prediction, and nothing downstream can correct it. So this errs
 * cheap every time.
 */

const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");

const VARIANTS = [
  /* the reported one, and the separators the feeds actually use */
  "Fenerbahce U19", "Fenerbahce U-19", "Fenerbahce U 19",
  "Besiktas U19", "Besiktas U-21", "Besiktas U 23", "Barcelona U19",
  /* word forms, several languages */
  "Fenerbahce Youth", "Fenerbahce Akademi", "Besiktas Youth",
  "Ajax Academy", "Bayern Akademie", "Sassuolo Primavera",
  "Arsenal Juniors", "Porto Junior",
  /* women's sides */
  "PSG Women", "Chelsea Ladies", "Arsenal W", "Bayern Frauen",
  "Lyon Feminin", "Barcelona Femenino", "Ajax Dames",
  /* reserve and B sides */
  "Stuttgart II", "Real Madrid B", "Jong Ajax", "Jong PSV",
  "Rosenborg BK 2", "Porto Reserve", "Celta Reserves",
];

const FIRST_TEAMS = [
  "Fenerbahce", "Besiktas", "Galatasaray", "Aston Villa", "Hull City",
  "Nice", "Le Mans", "Real Madrid", "Barcelona", "Paris Saint-Germain",
  "Brighton", "West Bromwich Albion", "Bayer Leverkusen", "Borussia Dortmund",
  "Sheffield Wednesday", "Bristol City", "Ipswich Town", "Young Boys",
];

test("isVariantSide is exported", () => {
  assert.equal(typeof M.isVariantSide, "function");
});

test("every youth, reserve and women's shape is refused", () => {
  const missed = VARIANTS.filter((n) => !M.isVariantSide(n));
  assert.deepEqual(missed, [], "these would resolve to the senior club: " + missed.join(", "));
});

test("no first team is refused", () => {
  /* The cost of getting this wrong is silent: the fixture is dropped and never
     appears, so a careless widening of the pattern quietly shrinks the card. */
  const wrong = FIRST_TEAMS.filter((n) => M.isVariantSide(n));
  assert.deepEqual(wrong, [], "these first teams would be dropped: " + wrong.join(", "));
});

test("the exact shapes that got through before are covered", () => {
  /* Regression pins, named so a future edit that re-narrows the pattern says
     which reported bug it is reopening. */
  for (const n of ["Fenerbahce U-19", "Fenerbahce U 19", "Fenerbahce Youth",
                   "Fenerbahce Akademi", "Besiktas Youth", "PSG Women",
                   "Chelsea Ladies", "Arsenal W"]) {
    assert.equal(M.isVariantSide(n), true, n + " got through again");
  }
});

test("empty and junk input is not a variant, and does not throw", () => {
  for (const n of [null, undefined, "", "   ", 0, {}, []]) {
    assert.doesNotThrow(() => M.isVariantSide(n));
  }
  assert.equal(M.isVariantSide(""), false);
  assert.equal(M.isVariantSide(null), false);
});
