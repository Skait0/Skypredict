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

/* ------------------------------- vendor qualifiers the model file omits */

/**
 * 99 fixtures were being dropped on 2 September for this alone - whole rounds
 * of the Eredivisie, Serie B, Ligue 2, Belgium, Switzerland, Poland and
 * Romania. The fixture feed decorates club names with a city, a region or a
 * legal form; football-data, which the model index is built from, does not.
 */

const NL = pool("Netherlands Eredivisie", ["Twente", "Willem II", "Excelsior", "Sparta Rotterdam", "Heerenveen"]);

test("a trailing city is dropped to find the club", () => {
  assert.strictEqual(M.matchTeam(NL, "FC Twente Enschede", 0), "Twente");
  assert.strictEqual(M.matchTeam(NL, "Willem II Tilburg", 0), "Willem II");
  assert.strictEqual(M.matchTeam(NL, "Excelsior Rotterdam", 0), "Excelsior");
});

test("club-type initialisms the feed uses are folded away", () => {
  const be = pool("Belgium Pro League", ["Kortrijk", "Westerlo", "Standard"]);
  assert.strictEqual(M.matchTeam(be, "KV Kortrijk", 0), "Kortrijk");
  assert.strictEqual(M.matchTeam(be, "KVC Westerlo", 0), "Westerlo");
  const se = pool("Sweden Allsvenskan", ["Mjallby", "Goteborg", "Malmo FF"]);
  assert.strictEqual(M.matchTeam(se, "Mjallby AIF", 0), "Mjallby");
  assert.strictEqual(M.matchTeam(se, "IFK Goteborg", 0), "Goteborg");
});

/* ------------------------- the guard, which is the point of the exercise */

test("a word that is itself a club is never dropped", () => {
  /* THE HAZARD. An earlier draft of the trailing-qualifier rule turned
     "Queens Park Rangers" into Queens Park, a different and real club, and
     "Tokyo Verdy" into FC Tokyo. Both would have booked the wrong game.
     Refusing the fixture is the correct outcome here. */
  const scot = pool("Scotland League 1", ["Queens Park", "Stirling", "Rangers"]);
  assert.strictEqual(M.matchTeam(scot, "Queens Park Rangers", 0), null,
    "Rangers is a club, so it cannot be treated as a qualifier");

  /* Tokyo Verdy now has a hand-checked alias, so it resolves to the RIGHT
     club rather than being refused. What must never happen either way is it
     landing on FC Tokyo, which is what the tail rule did before the guard. */
  const jp = pool("Japan J1 League", ["FC Tokyo", "Verdy", "Machida"]);
  assert.notStrictEqual(M.matchTeam(jp, "Tokyo Verdy", 0), "FC Tokyo",
    "Tokyo Verdy must never collapse onto FC Tokyo");
  assert.strictEqual(M.matchTeam(jp, "Tokyo Verdy", 0), "Verdy");

  /* And the guard itself, on a name with no alias to rescue it. */
  const jp2 = pool("Japan J1 League", ["FC Tokyo", "Machida"]);
  assert.strictEqual(M.matchTeam(jp2, "Machida Tokyo", 0), null,
    "Tokyo is a club here, so it cannot be treated as a qualifier");
});

test("the guard looks across the whole index, not one league", () => {
  /* Where the first version of the guard failed. Rangers play in the
     Premiership and Queens Park in League One, so checking only the pool
     being searched let the wrong match through anyway. */
  const idx = {
    teams: ["Queens Park", "Stirling", "Rangers"],
    teamLeague: [0, 0, 1],
    leagues: ["Scotland League 1", "Scotland Premiership"],
  };
  assert.strictEqual(M.matchTeam(idx, "Queens Park Rangers", 0), null);
});

test("a qualifier that is not a club is still dropped", () => {
  /* The guard must not be so broad it undoes the fix. */
  const ch = pool("Switzerland Super League", ["Servette", "Young Boys", "Lausanne"]);
  assert.strictEqual(M.matchTeam(ch, "Servette Geneva", 0), "Servette");
  assert.strictEqual(M.matchTeam(ch, "Young Boys Bern", 0), "Young Boys");
  assert.strictEqual(M.matchTeam(ch, "Lausanne-Sport", 0), "Lausanne");
});

test("dropping a qualifier still needs a unique answer", () => {
  const sheff = pool("England Championship", ["Sheffield United", "Sheffield Wednesday"]);
  assert.strictEqual(M.matchTeam(sheff, "Sheffield Rovers", 0), null);
});

test("the club-token list carries names the other rules cannot reach", () => {
  /* These nine needed the extended token list specifically - measured by
     removing it and re-running against the day's dropped fixtures, which took
     recovery from 52 to 44. Without a case here the list looks like dead
     weight and gets deleted. */
  assert.strictEqual(M.matchTeam(pool("Sweden Allsvenskan", ["Malmo FF", "Mjallby"]),
    "Malmo", 0), "Malmo FF", "our own name carries the suffix, the feed's does not");
  assert.strictEqual(M.matchTeam(pool("Italy Serie B", ["Padova", "Ascoli"]),
    "Calcio Padova", 0), "Padova");
  assert.strictEqual(M.matchTeam(pool("Belgium Pro League", ["St Truiden", "Gent"]),
    "St. Truidense VV", 0), "St Truiden");
  assert.strictEqual(M.matchTeam(pool("Poland Ekstraklasa", ["Cracovia", "Legia"]),
    "KS Cracovia Krakow", 0), "Cracovia");
});

test("a qualifier drop that leaves too little is refused", () => {
  /* Deliberate conservatism, pinned so it is not tidied away: three
     characters is too weak a basis on which to decide a club's identity, even
     when it happens to match. */
  const p = pool("France Ligue 2", ["Ren", "Grenoble"]);
  assert.strictEqual(M.matchTeam(p, "Ren Foot", 0), null);
  assert.strictEqual(M.matchTeam(p, "Grenoble Foot", 0), "Grenoble",
    "but a full name still resolves");
});

/* --------------------------------------------- names that cannot be derived */

test("hand-checked aliases resolve", () => {
  /* No rule turns "Heart of Midlothian" into "Hearts" or "Fortuna Sittard"
     into football-data's "For Sittard". These 41 pairs were read off the live
     feed against the index and checked one by one; they recovered 50 of the
     53 fixtures still being dropped. */
  assert.strictEqual(M.matchTeam(pool("Scotland Premiership", ["Hearts", "Hibernian"]),
    "Heart of Midlothian FC", 0), "Hearts");
  assert.strictEqual(M.matchTeam(pool("Netherlands Eredivisie", ["For Sittard", "Ajax"]),
    "Fortuna Sittard", 0), "For Sittard");
  assert.strictEqual(M.matchTeam(pool("England Championship", ["QPR", "Cardiff"]),
    "Queens Park Rangers", 0), "QPR");
  assert.strictEqual(M.matchTeam(pool("Japan J1 League", ["Verdy", "FC Tokyo"]),
    "Tokyo Verdy", 0), "Verdy");
});

test("an alias beats the fuzzy pass", () => {
  /* Tokyo Verdy is the case that matters: left to similarity it drifts toward
     FC Tokyo, a different club. A hand-checked pair must not be overruled by
     a coincidence of spelling. */
  const jp = pool("Japan J1 League", ["FC Tokyo", "Verdy"]);
  assert.strictEqual(M.matchTeam(jp, "Tokyo Verdy", 0), "Verdy");
});

test("an alias still has to find its target in that league", () => {
  /* Fails closed. An alias whose target is not in the pool being searched
     resolves to nothing rather than reaching into another division. */
  const wrongLeague = pool("Italy Serie A", ["Inter", "Milan"]);
  assert.strictEqual(M.matchTeam(wrongLeague, "Heart of Midlothian FC", 0), null);
});

test("the two clubs we deliberately refuse to guess stay out of the table", () => {
  /* Panaitolikos: the nearest name we hold is Panathinaikos, a different
     Athens club, and we do not carry Panaitolikos at all.
     CS Universitatea Craiova: the index holds U Craiova, Univ. Craiova AND
     U Craiova 1948, and the 1948 side is a different club from a split.
     Both are better dropped than guessed, and this test exists so nobody
     "completes" the table later without reading why. */
  const keys = Object.keys(M.TEAM_ALIAS).join(" ");
  assert.ok(!/panaitolikos/.test(keys), "Panaitolikos must not be aliased to Panathinaikos");
  assert.ok(!/craiova/.test(keys), "Craiova is ambiguous in our own index");
});

test("no alias points at itself or at nothing", () => {
  for (const [from, to] of Object.entries(M.TEAM_ALIAS)) {
    assert.ok(to && to.length, from + " has an empty target");
    assert.notStrictEqual(from, to, from + " aliases to itself, which does nothing");
  }
});

test("an alias cannot reach across leagues", () => {
  /* Needs a real two-league index: the single-league `pool` helper above
     makes the pool and the whole index the same array, so a mutation that
     scans everything instead of the league looks identical there. */
  const idx = {
    teams: ["Hearts", "Inter"],
    teamLeague: [0, 1],
    leagues: ["Scotland Premiership", "Italy Serie A"],
  };
  assert.strictEqual(M.matchTeam(idx, "Heart of Midlothian FC", 1), null,
    "searching Serie A must not pull a Scottish club in by alias");
  assert.strictEqual(M.matchTeam(idx, "Heart of Midlothian FC", 0), "Hearts",
    "but it still resolves in its own league");
});

test("an alias with two possible targets is refused", () => {
  /* The index holds the same club under two spellings often enough - it is
     most of the duplicate "(team)" noise in a build log. Taking whichever
     came first would be a coin flip on identity. */
  const idx = {
    teams: ["Hearts", "Hearts FC"],
    teamLeague: [0, 0],
    leagues: ["Scotland Premiership"],
  };
  assert.strictEqual(M.matchTeam(idx, "Heart of Midlothian FC", 0), null,
    "two entries normalise to the alias target, so there is no unique answer");
});
