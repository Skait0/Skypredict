"use strict";

/**
 * Choosing which leagues a slip may draw from.
 *
 * Asked for: "is there a way we can simply select the legues we want in a
 * ticket?"
 *
 * The board already had league pinning and a top-flight toggle, but the slip
 * engines ignored all of it - both drew from scopeFixtures(), which filtered
 * by day and kick-off window only. So this is one filter added at the single
 * point both engines already share, rather than a second selection system.
 *
 * The rule that matters, and the one most likely to be broken by a later
 * change: an EMPTY selection means every league, not no leagues. A stored set
 * that emptied itself would otherwise build nothing and read as a broken site.
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

function harness(fixtures) {
  const store = {};
  return new Function("FX", "STORE",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}," +
    "setItem:function(k,v){STORE[k]=String(v);},removeItem:function(k){delete STORE[k];}};" +
    "var DATA={fixtures:FX};" +
    "var SCOPE='all', SDAY=0, TOD='all', TOP_ONLY=false;" +
    "function notStarted(){return true;}" +
    "function dayOff(){return 0;}" +
    "function todFixtures(l){return l;}" +
    "function isLowerFixture(f){return !!(f.tier&&f.tier>1);}" +
    "function leagueRank(){return 1;}" +
    "var BLD_LEAGUES={};" +
    grab("leaguesChosen") + grab("leagueAllowed") + grab("leagueChosenCount") +
    grab("setLeaguePicked") + grab("clearLeaguePicks") +
    grab("scopeFixtures") + grab("leaguesOnBoard") + "\n" +
    "return {scopeFixtures:scopeFixtures, leaguesOnBoard:leaguesOnBoard," +
    " setLeaguePicked:setLeaguePicked, clearLeaguePicks:clearLeaguePicks," +
    " leagueAllowed:leagueAllowed, leagueChosenCount:leagueChosenCount," +
    " leaguesChosen:leaguesChosen, store:STORE," +
    " setTopOnly:function(v){TOP_ONLY=v;}};"
  )(fixtures, store);
}

const BOARD = [
  { league: "England Premier League", home: "Arsenal", away: "Chelsea", tier: 1 },
  { league: "England Premier League", home: "Leeds", away: "Everton", tier: 1 },
  { league: "England Championship", home: "Luton", away: "Hull", tier: 2 },
  { league: "Italy Serie A", home: "Milan", away: "Roma", tier: 1 },
  { league: "Spain La Liga 1", home: "Betis", away: "Cadiz", tier: 1 },
];

test("with nothing chosen, every league is in play", () => {
  const H = harness(BOARD);
  assert.strictEqual(H.leaguesChosen(), false);
  assert.strictEqual(H.scopeFixtures().length, BOARD.length,
    "an empty selection must mean ALL leagues, never none");
});

test("choosing leagues narrows the pool to exactly those", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("England Premier League", true);
  H.setLeaguePicked("Italy Serie A", true);
  const pool = H.scopeFixtures();
  assert.strictEqual(pool.length, 3);
  assert.deepStrictEqual([...new Set(pool.map(f => f.league))].sort(),
    ["England Premier League", "Italy Serie A"]);
});

test("un-choosing the last league returns to every league, not none", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("Italy Serie A", true);
  assert.strictEqual(H.scopeFixtures().length, 1);
  H.setLeaguePicked("Italy Serie A", false);
  assert.strictEqual(H.leagueChosenCount(), 0);
  assert.strictEqual(H.scopeFixtures().length, BOARD.length,
    "emptying the selection must not empty the board");
});

test("clearing restores every league and forgets the stored set", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("England Premier League", true);
  assert.ok(H.store["sw.bldleagues"], "precondition: the choice was stored");
  H.clearLeaguePicks();
  assert.strictEqual(H.store["sw.bldleagues"], undefined);
  assert.strictEqual(H.scopeFixtures().length, BOARD.length);
});

test("a choice survives a reload", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("Italy Serie A", true);
  assert.deepStrictEqual(JSON.parse(H.store["sw.bldleagues"]), { "Italy Serie A": 1 });
});

test("choosing a league that is not playing empties the pool rather than ignoring the choice", () => {
  /* The honest behaviour: the reader asked for a league with no games, and
     silently building from other leagues would be a slip they did not ask for.
     The builder's empty state names the league filter as the cause. */
  const H = harness(BOARD);
  H.setLeaguePicked("Germany Bundesliga 1", true);
  assert.strictEqual(H.scopeFixtures().length, 0);
});

/* -------------------------------------------------------- the picker's list */

test("the picker offers the leagues actually on the board, with counts", () => {
  const H = harness(BOARD);
  assert.deepStrictEqual(H.leaguesOnBoard(), [
    { league: "England Championship", n: 1 },
    { league: "England Premier League", n: 2 },
    { league: "Italy Serie A", n: 1 },
    { league: "Spain La Liga 1", n: 1 },
  ]);
});

test("the list does not shrink as leagues are chosen", () => {
  /* Counted before the league filter on purpose: if choosing one league
     removed the others from the list, there would be no way to add a second. */
  const H = harness(BOARD);
  const before = H.leaguesOnBoard().length;
  H.setLeaguePicked("Italy Serie A", true);
  assert.strictEqual(H.leaguesOnBoard().length, before,
    "the picker must still offer every league after one is chosen");
});

test("top-flight only also narrows what the picker offers", () => {
  const H = harness(BOARD);
  H.setTopOnly(true);
  const offered = H.leaguesOnBoard().map(x => x.league);
  assert.ok(!offered.includes("England Championship"),
    "a second-tier league must not be offered while top flight only is on");
  assert.ok(offered.includes("England Premier League"));
});
