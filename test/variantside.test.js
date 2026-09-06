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
  "Borussia Dortmund Junioren",
  /* women's sides */
  "PSG Women", "Chelsea Ladies", "Arsenal W", "Bayern Frauen",
  "Lyon Feminin", "Barcelona Femenino", "Ajax Dames",
  /* reserve and B sides */
  "Stuttgart II", "Real Madrid B", "Jong Ajax", "Jong PSV",
  "Rosenborg BK 2", "Porto Reserve", "Celta Reserves",
  /* THE RUSSIAN SHAPE: the marker sits in the MIDDLE, because the city comes
     after it. normTeam turns the punctuation into a space and tokset drops
     the short token, so "FC Spartak-2 Moscow" reduced to {spartak, moscow} -
     an exact token match against the Premier League club. Six of these ten
     got through before the fix; the reported symptom was a Russian lower-tier
     fixture priced off a top-flight rating and picked for a slip. */
  "FC Spartak-2 Moscow", "Arsenal-2 Tula", "Rubin-2 Kazan",
  "FC Ural-2 Yekaterinburg", "Yenisey 2 Krasnoyarsk", "FK Akron-2 Tolyatti",
  "FC Orenburg-2", "FC Chelyabinsk 2", "FC Krylia Sovetov Samara-2",
];

const FIRST_TEAMS = [
  "Fenerbahce", "Besiktas", "Galatasaray", "Aston Villa", "Hull City",
  "Nice", "Le Mans", "Real Madrid", "Barcelona", "Paris Saint-Germain",
  "Brighton", "West Bromwich Albion", "Bayer Leverkusen", "Borussia Dortmund",
  "Sheffield Wednesday", "Bristol City", "Ipswich Town", "Young Boys",
  /* FIRST TEAMS THAT LOOK LIKE VARIANTS, all found by running the guard over
     the 2,597 names on the live feed rather than by imagining them.
     Willem II is an Eredivisie club and the odds matcher already carries a
     special case for it; Boca Juniors and Argentinos Juniors carry "Juniors"
     in their real names. An over-eager guard drops these permanently, and a
     club that can never be predicted is a silent hole in a league we rate. */
  "Willem II Tilburg", "Juan Pablo II College",
  "Boca Juniors", "Argentinos Juniors", "Boca Juniors de Cali",
  "Shenzhen Juniors FC", "B 93",
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

test("a bare 'Juniors' is deliberately NOT treated as a variant", () => {
  /* The honest cost of keeping Boca Juniors and Argentinos Juniors. English
     and Spanish clubs carry "Juniors" in their real names, so the word cannot
     decide this on its own - only the unambiguous German "Junioren" does.
     A youth side written "X Juniors" therefore gets through, and is caught
     later by the competition guard instead, which is where the DFB-Pokal
     Junioren case was already handled. Written down so this reads as a
     decision rather than a gap. */
  assert.equal(M.isVariantSide("Arsenal Juniors"), false);
  assert.equal(M.isVariantSide("Boca Juniors"), false);
  assert.equal(M.isVariantSide("Borussia Dortmund Junioren"), true);
});

test("empty and junk input is not a variant, and does not throw", () => {
  for (const n of [null, undefined, "", "   ", 0, {}, []]) {
    assert.doesNotThrow(() => M.isVariantSide(n));
  }
  assert.equal(M.isVariantSide(""), false);
  assert.equal(M.isVariantSide(null), false);
});
