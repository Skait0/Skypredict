"use strict";

/**
 * The names two feeds spell differently, and the ones they spell the same
 * while meaning different clubs.
 *
 * Source: a live matcher log the user pasted, sixteen fixtures that could not
 * be priced at all. Each entry here was a real unbookable game. Working
 * through them turned up three things that were NOT abbreviation gaps, and
 * those are the ones worth guarding:
 *
 *   - Women's sides scoring 1.80 against their own men's team. Manchester City
 *     WFC, Arsenal WFC, Aston Villa WFC, Birmingham City WFC, Brighton and
 *     Hove Albion WFC, and Zhfk Krylya Sovetov Samara - eight strong false
 *     pairs on the live board, every one of which would have quoted the men's
 *     record against a women's fixture.
 *   - Reserve sides numbered in the MIDDLE of the name. Arsenal-2 Tula, FC
 *     Zenit-2 St Petersburg, FC Spartak-2 Moscow, Rodina-3 Moscow. The marker
 *     rule is anchored to the end of the name, so all of these read as first
 *     teams.
 *   - An alias that reached further than the club it was written for. See the
 *     QPR test - it is the most useful thing in this file.
 *
 * Measured across all 1,562,940 pairs the live feeds produce: 12 gained, 120
 * lost, and every loss is a coincidence, a women's side or a reserve side.
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
  "\nreturn { simTeams, normTeam, teamMarkers, sameVariant };")();

const strong = (a, b) => M.simTeams(a, b) >= 1.8;
const apart  = (a, b) => M.simTeams(a, b) < 0.6;

/* ------------------------------------------- the sixteen that could not book */

test("every fixture from the matcher log now pairs", () => {
  const PAIRS = [
    ["QPR", "Queens Park Rangers"],
    ["Middlesbrough", "Middlesbrough FC"],
    ["Willem II", "Willem II Tilburg"],
    ["Excelsior", "Excelsior Rotterdam"],
    ["Den Haag", "ADO Den Haag"],
    ["For Sittard", "Fortuna Sittard"],
    ["Nijmegen", "NEC Nijmegen"],
    ["AZ Alkmaar", "Alkmaar"],
    ["Krylya Sovetov", "PFK Krylia Sovetov Samara"],
    ["Krylya Sovetov", "Krylia Sovetov Samara"],
    ["Inverness C", "Inverness Caledonian Thistle FC"],
    ["Raith Rvs", "Raith Rovers FC"],
    ["Queen of Sth", "Queen of the South FC"],
    ["Airdrie Utd", "Airdrieonians FC"],
    ["Volos NFC", "Volos NPS"],
    ["Kalamata", "PAE PS Kalamata"],
    ["Dinamo Bucuresti", "Dinamo Bucuresti 1948"],
    ["FCSB", "Steaua Bucharest"],
    ["Otelul", "Otelul Galati"],
    ["FC Rapid Bucuresti", "Rapid 1923"],
    ["Akron Togliatti", "FK Akron Tolyatti"],
    ["Olympiakos", "Olympiacos"]
  ];
  const missed = PAIRS.filter(([a, b]) => !strong(a, b))
    .map(([a, b]) => a + " => " + b + " (" + M.simTeams(a, b).toFixed(2) + ")");
  assert.deepStrictEqual(missed, [], "unbookable fixtures: " + missed.join("; "));
});

/* --------------------------------------------------- the direction of an alias */

test("QPR does not reach Glasgow Rangers", () => {
  /* THE MOST IMPORTANT TEST IN THIS FILE. The obvious alias - "qpr" spelt out
     as "queens park rangers" - fixes the reported miss and buys two worse
     matches with it, because the long name CONTAINS two other clubs' whole
     names. Written that way, QPR scored 1.80 against Rangers and against
     Queens Park FC. That is a Premiership fixture priced off a Championship
     one, and it is strictly worse than the miss it replaced.
     So the alias runs the other way: the long name collapses to "qpr", which
     contains nothing and is contained by nothing. */
  assert.ok(strong("QPR", "Queens Park Rangers"), "the club must still match itself");
  assert.ok(apart("QPR", "Rangers"), "Glasgow Rangers is a different club");
  assert.ok(apart("QPR", "Queens Park FC"), "so is Queens Park");
  assert.strictEqual(M.normTeam("Queens Park Rangers"), "qpr",
    "the long name must collapse to the short one, not the reverse - reversing " +
    "this line is the bug, and it looks like a tidier alias while it is being " +
    "written");
});

test("two clubs called America stay in two countries", () => {
  assert.ok(apart("Club America", "America de Cali"),
    "Liga MX and the Categoria Primera A are not the same fixture");
});

/* ------------------------------------------------------- women's sides */

test("a women's side never matches its own men's team", () => {
  /* Not a judgement about the football: we hold no ratings for these clubs, so
     a match here quotes the men's record against a women's fixture. */
  for (const [a, b] of [
    ["Man City", "Manchester City WFC"],
    ["Arsenal", "Arsenal WFC"],
    ["Aston Villa", "Aston Villa WFC"],
    ["Birmingham", "Birmingham City WFC"],
    ["Brighton", "Brighton and Hove Albion WFC"],
    ["Krylya Sovetov", "Zhfk Krylya Sovetov Samara"]
  ]) assert.ok(apart(a, b), a + " must not pair with " + b);
});

test("and the marker is read wherever the abbreviation appears", () => {
  assert.ok(M.teamMarkers("Zhfk Krylia Sovetov Samara").women, "ZhFK, prefixed");
  assert.ok(M.teamMarkers("Manchester City WFC").women, "WFC, suffixed");
  assert.ok(!M.teamMarkers("Manchester City").women, "and not on the men's side");
});

/* ------------------------------------------------------- reserve sides */

test("a hyphenated number is a reserve side wherever it sits in the name", () => {
  /* The Russian feeds put the city after the number, so the end-anchored rule
     never saw these. */
  for (const [a, b] of [
    ["Arsenal", "Arsenal-2 Tula"],
    ["Zenit", "FC Zenit-2 St Petersburg"],
    ["Spartak Moscow", "FC Spartak-2 Moscow"],
    ["Dynamo Makhachkala", "FC Dynamo-2 Makhachkala"],
    ["Rodina Moscow", "Rodina-3 Moscow"]
  ]) assert.ok(apart(a, b), a + " must not pair with " + b);
});

test("but a hyphen alone is not a marker", () => {
  /* The rule needs the hyphen AND a number. Plenty of clubs carry a hyphen. */
  assert.ok(!M.teamMarkers("Oud-Heverlee Leuven").reserves);
  assert.ok(!M.teamMarkers("Sint-Truiden").reserves);
  assert.ok(!M.teamMarkers("Oud-Heverlee Leuven II").reserves === false,
    "the hyphen rule must not fire here, but the end-anchored one still must");
  /* And the end-anchored rule still has to leave B 93 and B36 alone - they are
     the reason it is anchored in the first place. */
  assert.ok(!M.teamMarkers("B 93").reserves, "B 93 is a first team");
  assert.ok(!M.teamMarkers("B36 Torshavn").reserves, "so is B36");
  assert.ok(M.sameVariant("B 93", "B93"), "and the two spellings must agree");
});

test("the end-anchored reserve rule is untouched", () => {
  for (const [a, b] of [
    ["Stuttgart", "Stuttgart II"],
    ["Rosenborg BK", "Rosenborg BK 2"],
    ["PSV", "Jong PSV"],
    ["Chelsea", "Chelsea U21"]
  ]) assert.ok(apart(a, b), a + " must not pair with " + b);
});

/* ------------------------------------------------------------ the caveat */

test("the FCSB alias is documented as division-dependent", () => {
  /* CSA Steaua Bucuresti is a different, lower-division club carrying the same
     name. The alias is safe only while the tier filter keeps them apart, and
     that is worth a comment somebody will actually hit when they loosen it. */
  assert.match(src, /CSA Steaua Bucuresti is a DIFFERENT/,
    "if this alias is ever edited, the reason it is safe must travel with it");
});
