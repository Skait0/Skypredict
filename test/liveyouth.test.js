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
  const body = grab("teamTag") + grab("leagueTag") + grab("ageTag") +
    grab("liveMatchFor") + ";return {liveMatchFor, ageTag, leagueTag};";
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
