"use strict";

/**
 * Two matcher bugs, both found by measuring rather than by reading.
 *
 * The handbook rule for this file is "prove the fix costs nothing by running
 * both versions over every name pair the live feeds produce and diffing the
 * verdicts". That was done: 570 of our names against 2,742 of theirs, all
 * 1,562,940 pairs, old code against new. One pair gained, 102 lost, and every
 * one of the 102 is a substring coincidence - Gent inside arGENTinos Juniors,
 * Rakow inside kRAKOW, Angers inside rANGERS, Lens inside smoLENSk, and Farul
 * Constanta against "Tanta FC", which is the one that was a single date check
 * away from booking somebody onto the wrong fixture.
 *
 * 1. CONTAINMENT IGNORED WORD BOUNDARIES. A plain indexOf scored those at 1.8,
 *    the figure reserved for an exact or containing name. A wrong match is the
 *    one failure nothing downstream can correct.
 *
 * 2. A FIRST TEAM WHOSE NAME ENDS IN A MARKER. The reserve-team guard anchors
 *    markers to the end of the name, so "Willem II" reads as a reserve side
 *    while "Willem II Tilburg" does not; the two disagreed and simTeams
 *    returned 0. An Eredivisie club that could never be matched at all,
 *    whatever the feed called it.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const ALIASES = (/^var TEAM_ALIASES\s*=\s*\{[\s\S]*?^\};/m.exec(src) || [""])[0];
const M = new Function([
  "var NT_CACHE={},NT_SIZE=0,NT_MAX=5000;", ALIASES
].concat(["normTeam", "normTeamRaw", "tokset", "containsWords", "sameVariant",
          "teamMarkers", "teamTag", "simTeams"].map(grab)).join("\n") +
  "\nreturn { simTeams, containsWords, sameVariant, normTeam };")();

const STRONG = 1.8;
const strong = (a, b) => M.simTeams(a, b) >= STRONG;

/* ------------------------------------------------------------ boundaries */

test("containment is on whole words", () => {
  assert.ok(M.containsWords("otelul galati", "otelul"), "a leading word");
  assert.ok(M.containsWords("pae ps kalamata", "kalamata"), "a trailing word");
  assert.ok(M.containsWords("willem ii tilburg", "willem ii"), "a run of words");
  assert.ok(!M.containsWords("argentinos juniors", "gent"), "inside a word");
  assert.ok(!M.containsWords("wisla krakow", "rakow"), "the tail of a word");
  assert.ok(!M.containsWords("queens park rangers", "angers"), "the tail again");
});

test("a trailing letter still ends the word", () => {
  /* Nordic genitives and Spanish feminines carry it as part of the same name,
     not as a different club. These were the ONLY real clubs a strict boundary
     lost across the full 1.56m-pair diff, and allowing the one letter brings
     back none of the coincidences: every one of those fails on the character
     BEFORE the match, not after it. */
  assert.ok(M.containsWords("djurgardens if", "djurgarden"), "Djurgardens IF");
  assert.ok(M.containsWords("aalesunds fk", "aalesund"), "Aalesunds FK");
  assert.ok(M.containsWords("union espanola", "espanol"), "Union Espanola");
  /* And it is one letter, not a free ride to the end of the word. */
  assert.ok(!M.containsWords("lillestroem sk", "lille"), "Lille is not Lillestroem");
  assert.ok(!M.containsWords("nublense", "lens"));
});

test("the coincidences the old rule scored as certain now score as nothing", () => {
  /* Each of these was a 1.8 - the score reserved for an exact or containing
     name - straight from the live feeds. */
  for (const [a, b] of [
    ["Gent", "Argentinos Juniors"],
    ["Rakow", "Wisla Krakow"],
    ["Angers", "Queens Park Rangers"],
    ["Lens", "Iskra Smolensk"],
    ["Roma", "Spartak Kostroma"],
    ["Farul Constanta", "Tanta FC"],
    ["Nice", "MKS Chojniczanka Chojnice"],
    ["West Ham", "We SC"]
  ]) assert.ok(!strong(a, b), a + " must not pair strongly with " + b);
});

test("and the real containments still do", () => {
  for (const [a, b] of [
    ["Otelul", "Otelul Galati"],
    ["Kalamata", "PAE PS Kalamata"],
    ["Nijmegen", "NEC Nijmegen"],
    ["Den Haag", "ADO Den Haag"],
    ["Excelsior", "Excelsior Rotterdam"],
    ["Middlesbrough", "Middlesbrough FC"]
  ]) assert.ok(strong(a, b), a + " must still pair with " + b);
});

/* ------------------------------------------- a marker that is part of a name */

test("Willem II is a club, not a reserve side", () => {
  assert.ok(M.sameVariant("Willem II", "Willem II Tilburg"),
    "the marked name is a word-prefix of the unmarked one, so the II belongs " +
    "to the name and the extra words are the rest of the club");
  assert.ok(strong("Willem II", "Willem II Tilburg"),
    "and the pair must actually reach a strong score");
});

test("but a reserve side still is one", () => {
  /* The direction is the whole rule. Here the UNMARKED name is the prefix and
     the marker is a suffix on a name that stands alone without it - which is
     exactly what a reserve team looks like. */
  assert.ok(!M.sameVariant("Stuttgart", "Stuttgart II"));
  assert.ok(!strong("Stuttgart", "Stuttgart II"));
  assert.ok(!M.sameVariant("PSV", "Jong PSV"));
  assert.ok(!strong("Chelsea", "Chelsea U21"));
  assert.ok(!strong("Rosenborg BK", "Rosenborg BK 2"));
  assert.ok(!strong("Portland Timbers", "Portland Timbers II"));
});

test("two names carrying the SAME markers are still compared as before", () => {
  /* The equal-count path is untouched, and B 93 and B36 must keep working -
     they are why markers are anchored to the end of the name in the first
     place. */
  assert.ok(M.sameVariant("B 93", "B93"));
  assert.ok(M.sameVariant("Stuttgart II", "VfB Stuttgart II"));
  assert.ok(!M.sameVariant("Stuttgart II", "Stuttgart U19"));
});

test("the allowance is a prefix rule, not a contains rule", () => {
  /* Willem II Tilburg starts with Willem II. A marked name buried in the
     middle or at the end of a longer one is not the same claim, and letting it
     through is how a reserve side rejoins its first team by the back door. */
  assert.ok(!M.sameVariant("Stuttgart II", "Kickers Stuttgart II Reserve"),
    "equal marker counts here, but if that ever changes the prefix rule is " +
    "the only thing standing between a II side and the club's own name");
  assert.ok(!strong("United II", "Manchester United II Youth"));
});
