"use strict";

/**
 * Competitions we hold no ratings for must not be priced.
 *
 * Reported: "you picked a[n] Amateur match for me. VFB Stuttgart vs SC
 * Freiburg lol". The fixture was Germany Amateur DFB-Pokal Junioren - a youth
 * cup tie - and it went onto a slip looking exactly like a Bundesliga game.
 *
 * The mechanism is worth stating, because it is not "a low-quality league
 * slipped through the net". The fixture's own competition is not one we hold
 * results for, so league resolution fell through to matching on team name
 * alone, found "Stuttgart" and "Freiburg" in Bundesliga 1, and priced the
 * youth tie off the two senior first teams. The output was not a worse
 * prediction; it was a confident answer to a different question. The same
 * applies to the women's fixtures in the feed, whose clubs also share a name
 * with the men's sides - the objection there is that we would be quoting the
 * men's record, not anything about the competition.
 *
 * So the rule under test is: if we have no ratings for the competition, we
 * publish nothing for it, rather than borrowing a rating that fits the name.
 */

const test = require("node:test");
const assert = require("node:assert");

const { isUnratedCompetition } = require("../lib/build.js");

test("the reported fixture's competition is refused", () => {
  assert.strictEqual(isUnratedCompetition("Germany Amateur DFB-Pokal Junioren"), true);
});

test("every unrated competition in the published feed is caught", () => {
  /* The five that were actually in the payload when this was reported. */
  const seen = [
    "Germany Amateur DFB-Pokal Junioren",
    "Germany Amateur Women Bundesliga",
    "Portugal U19 Campeonato Nacional",
    "Turkiye Amateur U19 PAF Ligi",
    "Mexico U21 Liga MX",
  ];
  for (const l of seen) {
    assert.strictEqual(isUnratedCompetition(l), true, l + " should be refused");
  }
});

test("the shapes these names come in", () => {
  for (const l of [
    "Spain U19 Division de Honor", "Italy Primavera 1", "Netherlands Jong Eredivisie",
    "England Premier League U21", "Germany A-Junioren Bundesliga",
    "France Feminine Division 1", "Spain Primera Femenina", "Germany Frauen Bundesliga",
    "England Women Super League", "Portugal Youth Cup", "Croatia Reserve League",
    "Belgium Academy Cup", "Austria Amateure Liga",
  ]) {
    assert.strictEqual(isUnratedCompetition(l), true, l + " should be refused");
  }
});

/* The other half of the job, and the easier one to get wrong: a filter this
   blunt must not quietly eat the real card. */
test("the senior leagues we do rate are untouched", () => {
  for (const l of [
    "England Premier League", "Germany Bundesliga 1", "Germany Bundesliga 2",
    "Spain La Liga 1", "Italy Serie A", "France Ligue 1", "Netherlands Eredivisie",
    "England Championship", "Scotland Premiership", "Portugal Liga 1",
    "Belgium Pro League", "Turkiye Super Lig", "Mexico Liga MX", "Brazil Serie A",
    "Norway Eliteserien", "Sweden Allsvenskan", "Japan J1 League", "USA MLS",
    "England EFL Cup", "Germany DFB-Pokal", "Spain Copa del Rey",
  ]) {
    assert.strictEqual(isUnratedCompetition(l), false, l + " must NOT be refused");
  }
});

test("a league is not refused for merely containing the letters", () => {
  /* "Junior" inside "Juniors FC" is a club, not a competition marker; the word
     boundaries are what keep this from being a substring match. */
  assert.strictEqual(isUnratedCompetition("Uruguay Primera Division"), false,
    "Primera is not Primavera");
  assert.strictEqual(isUnratedCompetition("Argentina Primera Nacional"), false);
  assert.strictEqual(isUnratedCompetition("Denmark Superliga"), false);
});

test("nothing and nonsense are safe to ask about", () => {
  assert.strictEqual(isUnratedCompetition(""), false);
  assert.strictEqual(isUnratedCompetition(null), false);
  assert.strictEqual(isUnratedCompetition(undefined), false);
});

/* The end-to-end guard: whatever is on disk must be clean. Runs against the
   real payload so a regression is caught on the actual card. */
test("no unrated competition survives into the built payload", () => {
  let payload;
  try { payload = require("../public/predictions.json"); } catch (e) { return; }
  const bad = [];
  for (const f of (payload.fixtures || []).concat(payload.results || [])) {
    if (f && isUnratedCompetition(f.league)) {
      bad.push(f.league + ": " + f.home + " v " + f.away);
    }
  }
  assert.deepStrictEqual(bad, [], bad.length + " unrated fixture(s) published");
});
