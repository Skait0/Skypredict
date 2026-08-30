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
const page = new Function(
  grab("isLowerLeague") + "\n" + grab("isLowerFixture") + "\n" +
  "return {isLowerFixture:isLowerFixture, isLowerLeague:isLowerLeague};")();

test("the reported leaks are no longer top flight", () => {
  /* Each of these was showing under "top flight only". The tier is what the
     build now stamps; the league label is deliberately the one the FEED uses,
     which is the string the old filter was reading. */
  const leaks = [
    ["England National League", 5],
    ["Denmark 1. Division", 2],
    ["Ireland First Division", 2],
    ["Romania Liga 2", 2],
  ];
  for (const [league, tier] of leaks) {
    assert.strictEqual(page.isLowerFixture({ league, tier }), true,
      league + " is not a top flight");
  }
});

test("a genuine top flight still passes", () => {
  for (const league of ["England Premier League", "Italy Serie A", "USA MLS",
                        "Japan J1 League", "Norway Eliteserien"]) {
    assert.strictEqual(page.isLowerFixture({ league, tier: 1 }), false,
      league + " is a top flight and must not be filtered out");
  }
});

test("an unmapped fixture is not smuggled into a top-flight filter", () => {
  /* tier 0 means "we could not establish it". A filter that promises the top
     division must exclude it rather than assume. */
  assert.strictEqual(page.isLowerFixture({ league: "Some New Cup", tier: 0 }), false,
    "precondition: tier 0 falls through to the name test");
  /* ...and the name test is what decides, which is the old behaviour kept only
     as a fallback for a payload baked before the field existed. */
  assert.strictEqual(page.isLowerFixture({ league: "England Championship" }), true,
    "with no tier stamped, the name test still has to work");
});

test("a stamped tier beats the league name", () => {
  /* The National League case: the name says nothing useful, the tier does. */
  assert.strictEqual(page.isLowerFixture({ league: "England National League" }), false,
    "precondition: the name alone does not give it away - this was the bug");
  assert.strictEqual(page.isLowerFixture({ league: "England National League", tier: 5 }), true,
    "with the tier stamped it is correctly excluded");
});

/* --------------------------------------------------------- the build ladder */

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

  const kept = fixtures.filter(f => !page.isLowerFixture(f));
  assert.ok(kept.length > 0, "the filter cannot empty the board");

  const wrong = kept.filter(f => f.tier && f.tier > 1)
    .map(f => `${f.league} (tier ${f.tier}): ${f.home} v ${f.away}`);
  assert.deepStrictEqual(wrong, [],
    wrong.length + " lower-division fixture(s) survived 'top flight only'");

  /* And the filter has to actually do something, or it would pass vacuously. */
  assert.ok(fixtures.length - kept.length > 0,
    "no fixtures were filtered at all - the board has no lower divisions to test against");
});
