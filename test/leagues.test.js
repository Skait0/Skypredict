"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { canonLeague, LEAGUE_ALIASES, MAIN } = require("../lib/build.js");

/* Fixtures used to carry no competition at all, so the build guessed one from
   the teams. That was wrong in both directions: ordinary league games came out
   as "England Cup", and a cup tie between two Premier League sides came out as
   the Premier League. Both feeds now name the competition; these tests cover
   the one thing still done by hand - reconciling the two vocabularies. */

test("SportyBet names fold onto the football-data name for the same competition", () => {
  assert.equal(canonLeague("Spain LaLiga"), "Spain La Liga 1");
  assert.equal(canonLeague("England League One"), "England League 1");
  assert.equal(canonLeague("Germany Bundesliga"), "Germany Bundesliga 1");
  assert.equal(canonLeague("Brazil Brasileiro Serie A"), "Brazil Serie A");
  assert.equal(canonLeague("Turkiye Super Lig"), "Turkey Super Lig");
});

test("names that are already canonical pass through untouched", () => {
  ["England Premier League", "Italy Serie A", "USA MLS", "Scotland Premiership",
   "Norway Eliteserien", "Denmark Superliga"].forEach((n) => {
    assert.equal(canonLeague(n), n, n + " should not be rewritten");
  });
});

test("real cups keep their real names - they are not placeholders", () => {
  /* The old code upgraded any label matching /Cup$/, which would clobber these.
     A competition genuinely called a cup must survive untouched. */
  ["Russia Russian Cup", "England EFL Cup", "Germany DFB Pokal",
   "Brazil Copa do Brasil", "Denmark DBU Pokalen", "Romania Romania Cup",
   "Chile Copa Chile", "Argentina Copa Argentina"].forEach((n) => {
    assert.equal(canonLeague(n), n, n + " must not be rewritten");
  });
});

test("blank and missing input do not throw or invent a name", () => {
  assert.equal(canonLeague(""), "");
  assert.equal(canonLeague(null), "");
  assert.equal(canonLeague(undefined), "");
  assert.equal(canonLeague("  Italy Serie A  "), "Italy Serie A");
});

test("no alias maps a competition onto itself, or onto another alias key", () => {
  for (const [from, to] of Object.entries(LEAGUE_ALIASES)) {
    assert.notEqual(from, to, from + " aliases to itself");
    assert.ok(!LEAGUE_ALIASES[to],
      to + " is both an alias target and an alias key - canonLeague would be order-dependent");
  }
});

test("every alias target is a name football-data actually uses", () => {
  /* Guards against folding a competition onto a name nothing else produces,
     which would leave it orphaned in the filter instead of merged. */
  const known = new Set(Object.values(MAIN));
  const extra = new Set(["Brazil Serie A", "China Super League",
                         "Argentina Liga Profesional"]); // combined-country files
  for (const to of Object.values(LEAGUE_ALIASES)) {
    assert.ok(known.has(to) || extra.has(to),
      "alias target not a football-data name: " + to);
  }
});
