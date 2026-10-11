"use strict";

/**
 * "Top flight only" must mean it.
 *
 * Reported: "i get second divison leagues when i click on 'top flight
 * leagues', i get fixtures frm lower divisons!"
 *
 * The filter was a regex over the league's name, looking for "conference",
 * "1st division", "division 2" and so on. Four leagues walked straight past
 * it because the feed spells them differently - England National League (the
 * FIFTH tier, 16 fixtures on the day it was reported), Denmark 1. Division,
 * Ireland First Division and Romania Liga 2.
 *
 * The subtler half, and the reason patching the regex would not have held:
 * the label on a fixture is not always the league the model rated it in.
 * Those National League games arrive labelled "England National League" while
 * the clubs sit in our index under "England Conference National" - so the page
 * was matching a string the model never used, and no pattern written against
 * the label could have been right.
 *
 * So the tier is decided in the build, against the resolved league, and ships
 * as a number on the fixture. These tests cover the ladder and the rule that a
 * fixture is only top flight when BOTH clubs are.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const B = require("../lib/build.js");

/* ------------------------------------------------- the page-side predicate */

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const lists = (src.match(/var POPULAR=\[[\s\S]*?\];/) || [""])[0] + "\n" + (src.match(/var POPULAR_ALIAS=\{[\s\S]*?\};/) || [""])[0];
const page = new Function(lists + "\n" + grab("topKey") + "\n" + grab("topRank") + "\n" + grab("outsideTop") + "\nreturn {outsideTop:outsideTop};")();

/* TOP LEAGUES (owner, 9 Oct 2026) replaced "Top flight only": the top division
   of UEFA's 30 strongest countries plus the three UEFA club competitions -
   not every country's first division. */
test("Popular leagues: the top 20 countries' top divisions and the UEFA cups, everything else out", () => {
  for (const league of ["England Premier League", "Spain La Liga 1", "Germany Bundesliga 1", "Czechia 1. Liga",
    "Croatia HNL", "Sweden Allsvenskan", "International Clubs UEFA Champions League",
    "International Clubs UEFA Europa League", "International Clubs UEFA Conference League"])
    assert.strictEqual(page.outsideTop({ league }), false, league + " is a top league");
  for (const league of ["England Championship", "Kosovo Superliga", "Moldova Super Liga", "Brazil Serie A",
    "USA MLS", "England EFL Cup", "Germany DFB Pokal", "International Clubs CONMEBOL Libertadores",
    "Greece Super League 2", "Nigeria Premier League", "Bulgaria Parva Liga", "Russia Premier League", "Israel Premier League"])
    assert.strictEqual(page.outsideTop({ league }), true, league + " is All leagues only");
});

test("every league the build is configured for has a tier", () => {
  const missing = [];
  for (const league of Object.values(B.MAIN)) {
    if (!B.tierOfLeague(league)) missing.push(league);
  }
  for (const [country, comp] of Object.entries(B.EXTRA)) {
    const league = country + " " + comp;
    if (!B.tierOfLeague(league)) missing.push(league);
  }
  assert.deepStrictEqual(missing, [],
    "a league we train on with no tier will leak through the filter");
});

test("the ladder puts the divisions in the right order", () => {
  assert.strictEqual(B.tierOfLeague("England Premier League"), 1);
  assert.strictEqual(B.tierOfLeague("England Championship"), 2);
  assert.strictEqual(B.tierOfLeague("England League 1"), 3);
  assert.strictEqual(B.tierOfLeague("England League 2"), 4);
  assert.strictEqual(B.tierOfLeague("England Conference National"), 5);
  assert.strictEqual(B.tierOfLeague("Nowhere Invented League"), 0);
});

test("a fixture takes the WORSE of its two clubs' divisions", () => {
  /* This is what a cup tie needs. "Top flight" cannot be answered about the FA
     Cup as a competition - only about the two clubs actually playing. */
  assert.strictEqual(B.fixtureTier("England Premier League", "England Premier League"), 1);
  assert.strictEqual(B.fixtureTier("England Premier League", "England League 2"), 4,
    "a cup tie against a fourth-tier club is not a top-flight game");
  assert.strictEqual(B.fixtureTier("England League 2", "England Premier League"), 4,
    "and the order of the two clubs makes no difference");
});

test("a fixture with either club unplaced is not claimed as top flight", () => {
  assert.strictEqual(B.fixtureTier("England Premier League", "Nowhere Invented League"), 0);
  assert.strictEqual(B.fixtureTier(null, "Italy Serie A"), 0);
});

/* ------------------------------------------------------------- end to end */

test("nothing below the top division survives the filter on the real board", () => {
  let payload;
  try { payload = require("../public/predictions.json"); } catch (e) { return; }
  const fixtures = payload.fixtures || [];
  if (fixtures.length < 50) return;

  const kept = fixtures.filter(f => !page.outsideTop(f));
  assert.ok(kept.length > 0, "the filter cannot empty the board");

  /* By name, not by the stamped tier: the stamp is not reliable for this (11
     Oct 2026 it called a Danish Superliga game tier 2 and Spain's fourth
     tier tier 1). A second-or-lower division never carries a popular name. */
  const wrong = kept.filter(f => /\b(2|ii|championship|segunda|serie b|ligue 2|eerste divisie|1\. lig|superettan)\b/i.test(f.league))
    .map(f => `${f.league}: ${f.home} v ${f.away}`);
  assert.deepStrictEqual(wrong, [],
    wrong.length + " lower-division fixture(s) survived Popular leagues");

  /* And the filter has to actually do something, or it would pass vacuously. */
  assert.ok(fixtures.length - kept.length > 0,
    "no fixtures were filtered at all - the board has no lower divisions to test against");
});

test("Top leagues survive a renamed feed label, and a second division never sneaks in", () => {
  for (const league of ["Spain LaLiga", "Germany Bundesliga", "Turkiye Super Lig", "Czechia Chance Liga", "Croatia SuperSport HNL"])
    assert.strictEqual(page.outsideTop({ league }), false, league);
  for (const league of ["Spain LaLiga 2", "Germany Bundesliga 2", "Greece Super League 2", "Turkiye 1. Lig", "Austria 2. Liga"])
    assert.strictEqual(page.outsideTop({ league }), true, league);
});
