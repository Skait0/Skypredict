"use strict";
/* Resolution is safe here for one reason: openfootball stamps the country on
   every club - "Athletic Club (ESP)" - so every lookup is matchTeam's narrow
   league-filtered case (bar 0.82) and never the whole-index case (bar 0.90)
   that produced confident singular errors. Measured over 367 distinct clubs
   across five seasons this produced zero ambiguous and zero wrong matches. */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");
const R = require("../lib/euroresolve.js");

const D = new Date("2026-05-01");
const m = (league, home, away) => ({ date: D, league, home, away, hg: 1, ag: 0 });
const idx = M.buildIndex([
  m("Spain La Liga 1", "Real Madrid", "Barcelona"),
  m("England Premier League", "Arsenal", "Chelsea"),
  m("Italy Serie A", "Inter", "Juventus"),
]);

const row = (home, homeCC, away, awayCC, hg, ag) =>
  ({ home, homeCC, away, awayCC, hg, ag, hth: null, hta: null, aet: false, pen: false });

test("a cross-border tie between two clubs we rate comes through named as we name them", () => {
  const out = R.resolve([row("Real Madrid CF", "ESP", "Arsenal FC", "ENG", 2, 1)], idx);
  assert.equal(out.matches.length, 1);
  const g = out.matches[0];
  assert.equal(g.home, "Real Madrid");
  assert.equal(g.away, "Arsenal");
  assert.equal(g.homeCountry, "Spain");
  assert.equal(g.awayCountry, "England");
  assert.equal(g.homeLeague, "Spain La Liga 1");
  assert.deepEqual([g.hg, g.ag], [2, 1]);
});

test("a club from a country we hold no ratings for is dropped, not guessed", () => {
  const out = R.resolve([row("Real Madrid CF", "ESP", "Qarabag Agdam FK", "AZE", 3, 0)], idx);
  assert.equal(out.matches.length, 0);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0].why, /country/i);
});

test("a club we cannot name is dropped and reported by name", () => {
  const out = R.resolve([row("Real Madrid CF", "ESP", "Some Unknown FC", "ENG", 1, 1)], idx);
  assert.equal(out.matches.length, 0);
  assert.match(out.dropped[0].why, /resolve/i);
  assert.match(out.dropped[0].what, /Some Unknown FC/);
});

test("a domestic tie is kept out of byCountry - it carries no cross-border signal", () => {
  const out = R.resolve([
    row("Real Madrid CF", "ESP", "FC Barcelona", "ESP", 1, 1),
    row("Real Madrid CF", "ESP", "Arsenal FC", "ENG", 2, 1),
  ], idx);
  assert.equal(out.matches.length, 2, "both are usable matches");
  assert.equal(out.byCountry.Spain, 1, "only the cross-border one counts as evidence");
  assert.equal(out.byCountry.England, 1);
});
