"use strict";

/**
 * football-data as a third score source.
 *
 * The build downloads these CSVs every run to fit the model - it refuses to
 * build on fewer than 400 results - and then graded tips against two entirely
 * different feeds. The results were in memory the whole time.
 *
 * So this costs nothing: no request, no key, no quota, nobody to be blocked by.
 *
 * It sits SECOND, not first. SoccerVista is the fastest and the widest and it
 * took grading from 132 rows to 308, so it keeps the front - demoting the best
 * source to feel less dependent on somebody else's feed trades real coverage
 * for a feeling, and it does not answer the licence question either way. It
 * sits ahead of the oracle because the oracle has 100 requests a day and there
 * is no reason to spend one on a date something already downloaded can answer.
 *
 * The half-time score is what makes it more than a backup. gradeLabel refuses
 * a first-half market outright without one, so every FH_OVER_0.5 tip has come
 * back ungraded - and the builder offers that market.
 */

const test = require("node:test");
const assert = require("node:assert");
const FD = require("../lib/footballdata.js");
const B = require("../lib/build.js");
const G = require("../lib/grade.js");

const MATCHES = [
  { date: new Date("2026-08-31T00:00:00Z"), league: "England Premier League",
    home: "Aston Villa", away: "Arsenal", hg: 0, ag: 1, hth: 0, hta: 0 },
  { date: new Date("2026-08-31T00:00:00Z"), league: "England Premier League",
    home: "Chelsea", away: "Fulham", hg: 2, ag: 2, hth: 1, hta: 0 },
  { date: new Date("2026-08-30T00:00:00Z"), league: "Italy Serie A",
    home: "Inter", away: "Udinese", hg: 3, ag: 0, hth: 2, hta: 0 },
];

test("results already in memory become a source", () => {
  const fd = FD.fromMatches(MATCHES);
  assert.strictEqual(fd.configured(), true);
  assert.strictEqual(fd.size(), 2, "two distinct dates");
});

test("it answers for a date, in the shape every caller already speaks", async () => {
  const r = await FD.fromMatches(MATCHES).resultsFor("2026-08-31");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.rows.length, 2);
  const villa = r.rows.find((x) => x.home === "Aston Villa");
  assert.strictEqual(villa.hg, 0);
  assert.strictEqual(villa.ag, 1);
  assert.strictEqual(villa.status, "FT");
});

test("a date it has nothing for is an empty answer, not a failure", async () => {
  /* ok:false would read as "the source broke" and is not true - it simply has
     no league football on that day. */
  const r = await FD.fromMatches(MATCHES).resultsFor("2026-01-01");
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.rows, []);
});

test("it carries the half-time score, which nothing else does", async () => {
  const r = await FD.fromMatches(MATCHES).resultsFor("2026-08-31");
  const chelsea = r.rows.find((x) => x.home === "Chelsea");
  assert.strictEqual(chelsea.hth, 1);
  assert.strictEqual(chelsea.hta, 0);
});

test("and that finally settles a first-half tip", () => {
  /* The whole reason this is more than a backup. Without a half-time score
     gradeLabel returns null - correctly, since a full-time score cannot settle
     one - and the tip goes ungraded forever. */
  assert.strictEqual(G.gradeLabel("First half goal", 2, 2), null,
    "no half-time score: unknowable, and it must say so");
  assert.strictEqual(G.gradeLabel("First half goal", 2, 2, { hth: 1, hta: 0 }), true,
    "with one: a goal before the break");
  assert.strictEqual(G.gradeLabel("First half goal", 2, 2, { hth: 0, hta: 0 }), false,
    "and a goalless half is a miss, not an unknown");
});

test("a missing half-time score is not read as nil-nil", async () => {
  /* Some rows have no half-time columns. Treating a missing value as 0-0 would
     settle a first-half tip as a loss on no evidence, and an ungraded tip is
     far better than a wrongly graded one. */
  const r = await FD.fromMatches([
    { date: new Date("2026-08-31T00:00:00Z"), home: "A", away: "B", hg: 1, ag: 1 },
  ]).resultsFor("2026-08-31");
  assert.strictEqual(r.rows[0].hth, null);
  assert.strictEqual(G.gradeLabel("First half goal", 1, 1, null), null);
});

test("junk in the results does not become a row", async () => {
  const fd = FD.fromMatches([
    null, {}, { date: new Date("2026-08-31T00:00:00Z"), home: "A", away: "B" },
    { date: "not a date", home: "C", away: "D", hg: 1, ag: 0 },
  ]);
  assert.strictEqual(fd.configured(), false, "nothing usable is nothing at all");
});

/* ------------------------------------------------------- the ordering */

test("the order is SoccerVista, football-data, oracle", () => {
  const names = B.scoreSources(MATCHES).map((s) => s.name);
  assert.deepStrictEqual(names, ["soccervista", "footballdata", "oracle"]);
});

test("SoccerVista stays first", () => {
  /* It is the fastest and the widest and it took grading from 132 rows to 308.
     Reordering does not answer a licence question, and demoting the best
     source to feel independent costs real coverage. */
  assert.strictEqual(B.scoreSources(MATCHES)[0].name, "soccervista");
});

test("football-data comes before the oracle, which is rationed", () => {
  /* The oracle has 100 requests a day and an account was already suspended for
     overrunning it. Spending one on a date we already downloaded would be
     paying for something free. */
  const names = B.scoreSources(MATCHES).map((s) => s.name);
  assert.ok(names.indexOf("footballdata") < names.indexOf("oracle"));
});

test("with no results downloaded the list is unchanged", () => {
  /* A caller with nothing in hand still gets the two remote sources rather
     than a source that will answer "nothing" for every date and stop the
     others being asked. */
  assert.deepStrictEqual(B.scoreSources([]).map((s) => s.name),
    ["soccervista", "oracle"]);
  assert.deepStrictEqual(B.scoreSources(null).map((s) => s.name),
    ["soccervista", "oracle"]);
});

test("the build hands its own results to the source", () => {
  /* Call-site assertion. The source is worthless unless the build actually
     passes the matches it downloaded, and every test above would still pass if
     it did not. */
  const fs = require("fs"), path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /cfg\._sources = scoreSources\(matches\)/,
    "built from the results the model was just fitted on");
  assert.match(src, /confirmScores\(pending, log, scoreBudget, cfg\._sources\)/);
  assert.match(src, /recordPublishedTips\(cfg\.prevFixtures, log, scoreBudget, cfg\._sources\)/);
  /* And the half-time score has to survive the trip. Without this the source
     can carry it perfectly and the grader never sees it, which is the whole
     point of adding football-data rather than just another backup. */
  /* BOTH grading passes, counted rather than matched. There are two -
     confirmScores and recordPublishedTips - and a single `assert.match` passes
     while one of them still carries the half-time score, so dropping it from
     the other went unnoticed. Half the tips graded without it is not half a
     bug. */
  const passes = (src.match(/gradeLabel\([^;]*m\.hth != null && m\.hta != null/g) || []).length;
  assert.strictEqual(passes, 2,
    "both grading passes must hand the half-time score on, got " + passes);
});
