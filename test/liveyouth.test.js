"use strict";
/* A YOUTH GAME'S SCORE ON A SENIOR FIXTURE.
 *
 * Reported twice. Galatasaray U19 in September, unexplained at the time, and
 * then live on 14 Sep: the feed carried
 *
 *   {home:"Gaziantep FK", away:"Fenerbahce", homeScore:1, awayScore:1,
 *    minute:45, status:"HT", league:"Turkiye Amateur U19 PAF Ligi"}
 *
 * while the board's fixture was Gaziantep v Fenerbahce in the Super Lig. The
 * guard that exists - teamTag - reads the TEAM name, and this feed writes its
 * youth sides plainly. Both sides tagged senior, both cleared the 0.6 floor,
 * and the wrong match's score went onto the slip.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.indexOf("\nfunction " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* simTeams is stubbed rather than lifted: it drags in the alias table and two
   caches, and none of that is what this file is about. A crude containment
   score is enough to let the real matcher run - the guard under test is the
   age tag, not the similarity. */
function api(live) {
  const body = "var LIVE_WINDOW_MS=4.5*3600*1000;" +
    grab("teamTag") + grab("leagueTag") + grab("ageTag") +
    grab("compTokens") + grab("compAgrees") + grab("kickMs") + grab("couldBeOn") +
    grab("liveMatchFor") +
    ";return {liveMatchFor, ageTag, leagueTag, compAgrees, couldBeOn};";
  const simTeams = (a, b) => {
    const n = (x) => String(x || "").toLowerCase().replace(/[^a-z]/g, "");
    const [x, y] = [n(a), n(b)];
    if (!x || !y) return 0;
    return x === y ? 1 : (x.includes(y) || y.includes(x) ? 0.9 : 0);
  };
  return new Function("LIVE", "simTeams", body)({ matches: live }, simTeams);
}

const SENIOR = { home: "Gaziantep", away: "Fenerbahce", league: "Turkey Super Lig" };

test("a U19 league's score never lands on the senior fixture", () => {
  const { liveMatchFor } = api([
    { home: "Gaziantep FK", away: "Fenerbahce", homeScore: 1, awayScore: 1,
      minute: 45, status: "HT", league: "Turkiye Amateur U19 PAF Ligi" },
  ]);
  assert.equal(liveMatchFor(SENIOR), null,
    "the youth game is being bound to the senior fixture again");
});

test("the senior game still pairs with its own live entry", () => {
  const { liveMatchFor } = api([
    { home: "Gaziantep FK", away: "Fenerbahce Istanbul", homeScore: 0, awayScore: 2,
      minute: 70, status: "H2", league: "Turkiye Super Lig" },
  ]);
  const m = liveMatchFor(SENIOR);
  assert.ok(m, "the real match no longer pairs");
  assert.equal(m.awayScore, 2);
});

test("with both on the feed, the senior one is chosen", () => {
  const { liveMatchFor } = api([
    { home: "Gaziantep FK", away: "Fenerbahce", homeScore: 1, awayScore: 1,
      league: "Turkiye Amateur U19 PAF Ligi" },
    { home: "Gaziantep FK", away: "Fenerbahce Istanbul", homeScore: 0, awayScore: 2,
      league: "Turkiye Super Lig" },
  ]);
  assert.equal(liveMatchFor(SENIOR).awayScore, 2);
});

test("a genuine youth fixture still finds its own game", () => {
  /* The rule is agreement, not exclusion: if we ever list a U19 competition,
     its live entry must still pair. */
  const { liveMatchFor } = api([
    { home: "Gaziantep FK", away: "Fenerbahce", homeScore: 1, awayScore: 1,
      league: "Turkiye Amateur U19 PAF Ligi" },
  ]);
  const youth = { home: "Gaziantep", away: "Fenerbahce", league: "Turkiye U19 PAF Ligi" };
  assert.ok(liveMatchFor(youth), "a youth fixture can no longer find its own match");
});

test("the marker is read from the team as well as the league", () => {
  const { ageTag, leagueTag } = api([]);
  assert.equal(ageTag("Fenerbahce U19", "Some League"), "u19", "the team's own marker wins");
  assert.equal(ageTag("Fenerbahce", "Turkiye Amateur U19 PAF Ligi"), "u19");
  assert.equal(ageTag("Fenerbahce", "Turkiye Super Lig"), "");
  assert.equal(leagueTag("Primavera 1"), "res");
  assert.equal(leagueTag("Womens Super League"), "w");
});

/* ------------------------------------------------------------------ *
 * THE SAME BUG WITH NOTHING TO READ.
 *
 * Every guard above works off a marker somebody wrote down. A reserve side
 * named plainly, in a competition named plainly, carries no marker at all -
 * both tags come back empty, correctly, and the names still belong to
 * different teams. What is left is the competition, and both sides have one.
 * ------------------------------------------------------------------ */

test("a plainly-named side in somebody else's competition does not pair", () => {
  const { liveMatchFor } = api([
    { home: "Fenerbahce", away: "Besiktas", homeScore: 3, awayScore: 0,
      league: "Azerbaijan Birinci Dasta" },
  ]);
  assert.equal(liveMatchFor(
    { home: "Fenerbahce", away: "Besiktas", league: "Turkey Super Lig" }), null,
    "a match from another competition entirely is being bound by name alone");
});

test("the same clubs in the same country still pair", () => {
  /* The rule is deliberately weak: one shared word is agreement. A country's
     league and its cup are the same clubs on the same feed, and separating
     those is the clock's job, not this one's. */
  const { compAgrees } = api([]);
  assert.equal(compAgrees("Spain LaLiga", "Spain Copa del Rey"), true);
  assert.equal(compAgrees("England Premier League", "Premier League"), true);
  assert.equal(compAgrees("Romania Superliga", "Romania Superliga"), true);
  assert.equal(compAgrees("Turkey Super Lig", "Turkiye Amateur U19 PAF Ligi"), false);
});

test("a competition we cannot read is not a disagreement", () => {
  const { compAgrees } = api([]);
  assert.equal(compAgrees("", "Italy Serie A"), true, "unknown must allow");
  assert.equal(compAgrees("Italy Serie A", null), true);
});

/* ------------------------------------------------------------------ *
 * AND THE CLOCK.
 *
 * noteLiveSeen calls the matcher with no time check of its own and WRITES what
 * it finds - the last score seen, saved and reused as a final score. It was
 * the one caller with no guard.
 * ------------------------------------------------------------------ */

const HOUR = 3600 * 1000;
const at = (ms) => new Date(ms).toISOString();

test("a fixture days from kickoff cannot be paired with a game in play", () => {
  const { liveMatchFor } = api([
    { home: "Gaziantep FK", away: "Fenerbahce", homeScore: 1, awayScore: 1,
      league: "Turkey Super Lig" },
  ]);
  const twoDaysOut = { home: "Gaziantep", away: "Fenerbahce",
    league: "Turkey Super Lig", kickoff: at(Date.now() + 48 * HOUR) };
  assert.equal(liveMatchFor(twoDaysOut), null,
    "a fixture that has not kicked off is taking another game's score");
});

test("a fixture played yesterday cannot be paired either", () => {
  const { liveMatchFor } = api([
    { home: "Gaziantep FK", away: "Fenerbahce", homeScore: 2, awayScore: 0,
      league: "Turkey Super Lig" },
  ]);
  assert.equal(liveMatchFor({ home: "Gaziantep", away: "Fenerbahce",
    league: "Turkey Super Lig", kickoff: at(Date.now() - 30 * HOUR) }), null);
});

test("a fixture that is actually on still pairs", () => {
  const { liveMatchFor } = api([
    { home: "Gaziantep FK", away: "Fenerbahce", homeScore: 1, awayScore: 1,
      league: "Turkey Super Lig" },
  ]);
  const m = liveMatchFor({ home: "Gaziantep", away: "Fenerbahce",
    league: "Turkey Super Lig", kickoff: at(Date.now() - HOUR) });
  assert.ok(m, "a match in play no longer pairs");
  assert.equal(m.homeScore, 1);
});

test("a kickoff we cannot read allows the pairing, it does not block it", () => {
  const { couldBeOn } = api([]);
  assert.equal(couldBeOn({ home: "A", away: "B" }), true,
    "an unreadable kickoff must not silently switch live scores off");
});
