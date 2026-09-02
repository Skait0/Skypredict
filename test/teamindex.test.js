"use strict";

/**
 * Which division a club is filed under, and which spellings resolve to it.
 *
 * Two separate bugs, both found the same way: three real fixtures were missing
 * from the board and the log said only "(team)", which reads like a spelling
 * problem. One of them was. The other was not.
 *
 *  1. buildIndex bound a club to the league of the FIRST match it happened to
 *     appear in. The build downloads division by division - every season of
 *     E0, then every season of E1 - so a club relegated last summer was met in
 *     the Premier League first and stayed filed there forever. Burnley,
 *     Sunderland, Leeds, Coventry and Hull were all indexed as Premier League
 *     sides while playing in the Championship. Every Burnley fixture was
 *     dropped, because matchTeam only considers clubs in the fixture's own
 *     league, and the model fitted them under the wrong league intercept.
 *
 *     Measured against the clubs actually playing 2026-27 E0 and E1: download
 *     order 4 wrong of 44, first-seen-chronologically 7 wrong, most-recent 0.
 *
 *  2. matchTeam stripped one trailing decoration from a fixed list, so it knew
 *     "Ipswich Town" was Ipswich but not that "Como 1907" was Como or that
 *     "AJ Auxerre" was Auxerre. Both Como's Serie A fixtures and Lyon v
 *     Auxerre were lost to it.
 *
 * The danger in fixing (2) is obvious and is what half these tests are for: a
 * looser matcher that crosses Sheffield United onto Sheffield Wednesday would
 * book the wrong game, which is far worse than dropping it.
 */

const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");

const d = (iso) => new Date(iso + "T00:00:00Z");
const g = (date, league, home, away) => ({ date: d(date), league, home, away, hg: 1, ag: 1 });

/* --------------------------------------------- which division a club is in */

const PL = "England Premier League", CH = "England Championship";

/* A club that played in the Premier League last season and the Championship
   this one, given in the order the build actually concatenates its downloads:
   all of E0 before any of E1. */
const RELEGATED = [
  g("2025-08-16", PL, "Burnley", "Arsenal"),
  g("2026-05-10", PL, "Burnley", "Chelsea"),
  g("2026-08-08", CH, "Burnley", "Middlesbrough"),
  g("2026-08-15", CH, "Watford", "Burnley"),
];

test("a club is filed under the division it plays in now", () => {
  const idx = M.buildIndex(RELEGATED);
  assert.strictEqual(idx.leagues[idx.teamLeague[idx.tIdx["Burnley"]]], CH,
    "Burnley are in the Championship; being met in the Premier League first " +
    "is an accident of download order, not a fact about the club");
});

test("and the answer does not depend on the order matches arrive in", () => {
  /* The property that was missing. The old rule made the index a function of
     how the caller happened to concatenate its files. */
  const forward = M.buildIndex(RELEGATED);
  const backward = M.buildIndex(RELEGATED.slice().reverse());
  const shuffled = M.buildIndex([RELEGATED[2], RELEGATED[0], RELEGATED[3], RELEGATED[1]]);
  for (const idx of [backward, shuffled]) {
    assert.strictEqual(idx.leagues[idx.teamLeague[idx.tIdx["Burnley"]]], CH);
  }
  assert.strictEqual(forward.leagues[forward.teamLeague[forward.tIdx["Burnley"]]], CH);
});

test("promotion is followed too, not just relegation", () => {
  const idx = M.buildIndex([
    g("2025-08-16", CH, "Sunderland", "Leeds"),
    g("2026-08-15", PL, "Sunderland", "Everton"),
  ]);
  assert.strictEqual(idx.leagues[idx.teamLeague[idx.tIdx["Sunderland"]]], PL);
});

test("a club that never moved is unaffected", () => {
  const idx = M.buildIndex([
    g("2025-08-16", CH, "Middlesbrough", "Hull"),
    g("2026-08-15", CH, "Middlesbrough", "Preston"),
  ]);
  assert.strictEqual(idx.leagues[idx.teamLeague[idx.tIdx["Middlesbrough"]]], CH);
});

test("an undated row cannot claim a club", () => {
  /* Otherwise a junk row with no date sorts as "latest" and moves a team. */
  const idx = M.buildIndex([
    g("2026-08-15", CH, "Burnley", "Watford"),
    { date: null, league: PL, home: "Burnley", away: "Arsenal", hg: 1, ag: 1 },
    { date: "not a date", league: PL, home: "Burnley", away: "Spurs", hg: 1, ag: 1 },
  ]);
  assert.strictEqual(idx.leagues[idx.teamLeague[idx.tIdx["Burnley"]]], CH);
});

/* ------------------------------------------------- which spellings resolve */

function pool(league, names) {
  return { teams: names, teamLeague: names.map(() => 0), leagues: [league] };
}

const LIGUE1 = pool("France Ligue 1", ["Auxerre", "Lyon", "Lens", "Marseille", "Paris SG"]);
const SERIEA = pool("Italy Serie A", ["Como", "Genoa", "Inter", "Parma", "Udinese"]);

test("a vendor's leading initials still find the club", () => {
  assert.strictEqual(M.matchTeam(LIGUE1, "AJ Auxerre", 0), "Auxerre");
  assert.strictEqual(M.matchTeam(LIGUE1, "RC Lens", 0), "Lens");
});

test("and a founding year appended to the name", () => {
  assert.strictEqual(M.matchTeam(SERIEA, "Como 1907", 0), "Como");
  assert.strictEqual(M.matchTeam(pool("Germany Bundesliga 1", ["Schalke", "Mainz"]),
    "Schalke 04", 0), "Schalke");
});

test("the decorations it already knew still work", () => {
  assert.strictEqual(M.matchTeam(pool("England Championship", ["Ipswich", "Norwich"]),
    "Ipswich Town", 0), "Ipswich");
});

/* ------------------------------------- and the thing that must never happen */

test("it will not cross two clubs that share a name", () => {
  /* The reason the stripping demands an EXACT, UNIQUE remainder. Booking the
     wrong Sheffield is far worse than dropping the fixture. */
  const sheff = pool("England Championship", ["Sheffield United", "Sheffield Wednesday"]);
  assert.strictEqual(M.matchTeam(sheff, "Sheffield", 0), null);
  const bristol = pool("England League 1", ["Bristol City", "Bristol Rovers"]);
  assert.strictEqual(M.matchTeam(bristol, "Bristol", 0), null);
});

test("a stripped name that matches nothing is refused, not guessed", () => {
  assert.strictEqual(M.matchTeam(LIGUE1, "AJ Nowhere", 0), null);
  assert.strictEqual(M.matchTeam(SERIEA, "Atlantis 1907", 0), null);
});

test("reserve and youth sides never resolve to the senior club", () => {
  /* Unchanged by this work and the worst failure available here, so it is
     asserted alongside rather than assumed. */
  const p = pool("Spain La Liga 1", ["Real Sociedad", "Barcelona"]);
  assert.strictEqual(M.matchTeam(p, "Real Sociedad B", 0), null);
  assert.strictEqual(M.matchTeam(p, "Barcelona U19", 0), null);
});

test("stripping never eats the whole name", () => {
  /* "St" is two letters and would strip, leaving nothing to match on. */
  const p = pool("Belgium Pro League", ["St Truiden", "Gent"]);
  assert.strictEqual(M.matchTeam(p, "St Truiden", 0), "St Truiden");
  assert.strictEqual(M.matchTeam(p, "AS", 0), null);
});

test("an ambiguous stripped name is refused, even though one entry would fit", () => {
  /* The uniqueness half of the rule, which the Sheffield test above does NOT
     reach: "Sheffield" has no decoration to strip, so it is rejected earlier,
     by the fuzzy margin. This gets all the way into the stripping path and
     finds TWO candidates.

     The pool here is realistic: the index genuinely holds the same club under
     two spellings when two feeds disagree, which is most of the duplicate
     "(team)" noise in a build log. Picking whichever came first would be a
     coin flip on club identity. */
  const dupes = pool("Germany Bundesliga 1", ["Koln", "FC Koln"]);
  assert.strictEqual(M.matchTeam(dupes, "AJ Koln", 0), null,
    "two entries normalise to the same name, so there is no unique answer");
});

test("a two or three letter remainder is refused on principle", () => {
  /* Deliberate conservatism rather than a proven harm: once a strip leaves
     three characters, the remainder is too weak a basis on which to rewrite a
     club's identity, and a wrong club is far worse than a missing fixture.
     Pinned because nothing else depends on it and it would otherwise be
     deleted by anyone tidying the condition. */
  const p = pool("France Ligue 1", ["Ren", "Marseille"]);
  assert.strictEqual(M.matchTeam(p, "AJ Ren", 0), null);
});
