"use strict";

/**
 * A reserve, youth or women's side is not its first team.
 *
 * The results matcher (lib/oracle.js) got this guard when the bug bit there.
 * The odds matcher in index.html never had it, and it had the same hole:
 * `tokset` drops tokens under three characters — which is exactly what "II"
 * and "B" are — and `simTeams` then scores a containing name at 1.8, the same
 * score it gives a genuine match.
 *
 * Measured before the fix, every one of these collided at 1.80: Stuttgart II,
 * Bayern Munich II, Real Madrid B, Jong Ajax, Jong PSV, Barcelona U19, Chelsea
 * Women.
 *
 * Not hypothetical. Run against the live card, 30 name pairs changed verdict
 * and every single one was a variant being separated from its first team —
 * Chelsea U21, Jong PSV Eindhoven, Portland Timbers II, Rosenborg BK 2,
 * Sarpsborg 08 2, and the whole MLS Next Pro shadow league. The consequence
 * was hanging a reserve fixture's odds on a first-team pick, and the
 * kick-off fallback would have accepted it, because that fallback only asks
 * for ONE side to score 1.8.
 *
 * One of the 30 ran the other way: our own "Sociedad B" fixture was matching
 * SportyBet's "Real Sociedad" — the first team's odds on a B-team prediction.
 *
 * Nothing else changed across 560,348 pairs, which is the check that matters:
 * a matcher fix that quietly stops matching correct pairs is worse than the
 * bug it fixed.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
/* The whole normalisation block: aliases, cache, normTeam, normTeamRaw,
   tokset, then the variant guard and simTeams itself. */
const block = src.slice(src.indexOf("var TEAM_ALIASES ="), src.indexOf("/* A reserve, youth"));
const api = new Function(block + grab("teamMarkers") + grab("sameVariant") + grab("simTeams") +
  "\nreturn {simTeams: simTeams, sameVariant: sameVariant, normTeam: normTeam};")();

/* Two different thresholds, and confusing them is easy: the caller requires
   each SIDE to clear 0.6 and then the two sides COMBINED to reach 1.2. So a
   side scoring 1.00 - which is what token-level agreement gives, e.g.
   "Portland Timbers II" against "Portland Timbers 2" where the marker itself
   is dropped as a short token - is a perfectly good side score. These tests
   are about one side at a time, so 0.6 is the bar. */
const SIDE = 0.6;

test("a first team never matches its own reserve or youth side", () => {
  const pairs = [
    ["Stuttgart", "Stuttgart II"],
    ["Bayern Munich", "Bayern Munich II"],
    ["Real Madrid", "Real Madrid B"],
    ["Ajax", "Jong Ajax Amsterdam"],
    ["PSV Eindhoven", "Jong PSV Eindhoven"],
    ["Chelsea", "Chelsea U21"],
    ["Manchester United", "Manchester United U21"],
    ["Portland Timbers", "Portland Timbers II"],
    ["Rosenborg", "Rosenborg BK 2"],
    ["Orlando City", "Orlando City B"],
    ["Real Sociedad", "Sociedad B"],
    ["Chelsea", "Chelsea Women"],
    ["Barcelona", "Barcelona Femenino"],
  ];
  const bad = pairs
    .filter(([a, b]) => api.simTeams(a, b) >= SIDE)
    .map(([a, b]) => `${a} matched ${b} at ${api.simTeams(a, b).toFixed(2)}`);
  assert.deepStrictEqual(bad, [],
    bad.length + " first team(s) matched a side that is not them");
});

test("but a variant still matches its own variant", () => {
  /* The guard must separate, not censor. Reserve leagues are real fixtures we
     price and book. */
  const pairs = [
    ["Stuttgart II", "VfB Stuttgart II"],
    ["Jong Ajax", "Jong Ajax Amsterdam"],
    ["Chelsea U21", "Chelsea FC U21"],
    ["Portland Timbers II", "Portland Timbers 2"],
  ];
  pairs.forEach(([a, b]) => {
    assert.ok(api.simTeams(a, b) >= SIDE,
      `${a} should still match ${b}, got ${api.simTeams(a, b).toFixed(2)}`);
  });
});

test("the reserve marker is a suffix, not any stray letter", () => {
  /* B 93 is a Copenhagen club and B36/B68 are Faroese — their names simply
     begin with a B. Matching the marker anywhere would flag them as reserve
     sides, and then one feed writing "B93" against another writing "B 93"
     would disagree about the marker and refuse a good match. */
  assert.ok(api.sameVariant("B 93", "B93 Copenhagen"),
    "B 93 is a club name, not a reserve marker");
  assert.ok(api.sameVariant("B36 Torshavn", "B 36 Torshavn"));
  assert.ok(!api.sameVariant("Sociedad", "Sociedad B"),
    "a trailing B is still a reserve side");
});

test("an ordinary pair of names is untouched by the guard", () => {
  assert.ok(api.sameVariant("Arsenal", "Arsenal FC"));
  assert.ok(api.sameVariant("Bayern Munich", "FC Bayern Munchen"));
  assert.ok(api.sameVariant("Sarpsborg 08", "Sarpsborg 08 FF"),
    "a number in the club's own name is not a reserve marker");
});

/* ------------------------------------------------- names that needed aliases */

/**
 * Both of these were matching, but only on kick-off time with the name scoring
 * 0.00 — the clock carrying a pairing the names could not:
 *
 *   [sporty] BY KICK-OFF: Levadeiakos v Panathinaikos -> APO Levadiakos FC ...
 *   [sporty] BY KICK-OFF: Buyuksehyr v Kasimpasa -> Istanbul BB v Kasimpasa ...
 *
 * That works right up until two games in the same league start together, and
 * then the fallback correctly refuses and the fixture goes unpriced. Fixed with
 * aliases rather than a general rule, which is what this codebase's own
 * comments argue for: a speculative "univ" -> "universidad" already broke
 * Romania once.
 */
test("names the clock was carrying now match on the name", () => {
  assert.ok(api.simTeams("Levadeiakos", "APO Levadiakos FC") >= SIDE,
    "Greek ει against ι is one letter and the containment rule missed by a hair");
  assert.ok(api.simTeams("Buyuksehyr", "Istanbul BB") >= SIDE,
    "Basaksehir is spelt as a different word by each feed");
});

test("the Istanbul alias does not swallow the other Istanbul clubs", () => {
  /* Aliasing Buyuksehyr to plain "istanbul" would have matched Kasimpasa
     Istanbul too — which is why it goes to "basaksehir" instead. */
  assert.ok(api.simTeams("Buyuksehyr", "Kasimpasa Istanbul") < SIDE,
    "Basaksehir must not match Kasimpasa");
  assert.ok(api.simTeams("Buyuksehyr", "Galatasaray Istanbul") < SIDE);
  assert.ok(api.simTeams("Kasimpasa", "Kasimpasa Istanbul") >= SIDE,
    "and Kasimpasa must still match itself");
});
