"use strict";

/**
 * Choosing which leagues a slip may draw from - untick to remove.
 *
 * Every league starts ticked; a tap takes out (or puts back) just that one.
 * BLD_PICK stores only the taps that differ from the default. The old
 * include-set (sw.bldleagues) is dropped on load (ruling R2) and unticking
 * every league is an empty pool, not "all" (R3).
 *
 * Driven through the real callers - scopeFixtures, leaguesOnBoard,
 * buildableOn/All - grabbed out of index.html, not a transcription of them.
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

function harness(fixtures, store) {
  store = store || {};
  return new Function("FX", "STORE",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}," +
    "setItem:function(k,v){STORE[k]=String(v);},removeItem:function(k){delete STORE[k];}};" +
    "var DATA={fixtures:FX};" +
    "var SCOPE='all', SDAY=0, SPAN=3, TOD='all', TOP_ONLY=false, TIER_UNRANKED=6;" +
    "function notStarted(){return true;}" +
    "function dayOff(){return 0;}" + "function fDay(f){return f.date;}" +
    "function todFixtures(l){return l;}" +
    "function isLowerFixture(f){return !!(f.tier&&f.tier>1);}" +
    "function leagueRank(){return 1;}" +
    "var BLD_PICK={}, VOL_IN=false, VOL_SRC=null, VOL_MAP={};" +
    grab("tierOf") + grab("loadLeaguePicks") + grab("isVolatile") + grab("leagueDefault") +
    grab("leagueAllowed") + grab("leaguesChosen") + grab("leaguePicksTouched") +
    grab("setLeaguePicked") + grab("clearLeaguePicks") + grab("setVolIn") +
    grab("inScope") + grab("scopeFixtures") + grab("leaguesOnBoard") +
    grab("buildableOn") + grab("buildableAll") + "\n" +
    "loadLeaguePicks();" +
    "return {scopeFixtures:scopeFixtures, leaguesOnBoard:leaguesOnBoard," +
    " buildableOn:buildableOn, buildableAll:buildableAll," +
    " setLeaguePicked:setLeaguePicked, clearLeaguePicks:clearLeaguePicks," +
    " leagueAllowed:leagueAllowed, leaguesChosen:leaguesChosen," +
    " leaguePicksTouched:leaguePicksTouched, setVolIn:setVolIn, store:STORE," +
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
const leagues = (list) => [...new Set(list.map(f => f.league))].sort();

test("by default every league is in play", () => {
  const H = harness(BOARD);
  assert.strictEqual(H.leaguesChosen(), false);
  assert.strictEqual(H.leaguePicksTouched(), false);
  assert.strictEqual(H.scopeFixtures().length, BOARD.length);
  assert.strictEqual(H.buildableAll().length, BOARD.length);
  assert.ok(H.leaguesOnBoard().every(x => H.leagueAllowed(x.league)),
    "every row in the picker starts ticked");
});

test("tapping a league takes out that one only", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("Italy Serie A", false);
  assert.deepStrictEqual(leagues(H.scopeFixtures()),
    ["England Championship", "England Premier League", "Spain La Liga 1"]);
  assert.strictEqual(H.buildableOn(0).length, BOARD.length - 1);
  assert.strictEqual(H.leaguesChosen(), true, "the reader has narrowed the pool");
});

test("tapping it again puts it back and leaves no stored override", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("Italy Serie A", false);
  H.setLeaguePicked("Italy Serie A", true);
  assert.strictEqual(H.scopeFixtures().length, BOARD.length);
  assert.strictEqual(H.leaguePicksTouched(), false);
  assert.deepStrictEqual(JSON.parse(H.store["sw.bldpick"]), {});
});

test("unticking every league is an empty pool, not all (R3)", () => {
  const H = harness(BOARD);
  H.leaguesOnBoard().forEach(x => H.setLeaguePicked(x.league, false));
  assert.strictEqual(H.scopeFixtures().length, 0);
  assert.strictEqual(H.buildableAll().length, 0);
});

test("clearing restores every league and forgets the stored taps", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("England Premier League", false);
  assert.ok(H.store["sw.bldpick"], "precondition: the tap was stored");
  H.clearLeaguePicks();
  assert.strictEqual(H.store["sw.bldpick"], undefined);
  assert.strictEqual(H.scopeFixtures().length, BOARD.length);
});

test("a tap survives a reload", () => {
  const store = {};
  harness(BOARD, store).setLeaguePicked("Italy Serie A", false);
  assert.deepStrictEqual(JSON.parse(store["sw.bldpick"]), { "Italy Serie A": 0 });
  const H2 = harness(BOARD, store);
  assert.strictEqual(H2.leagueAllowed("Italy Serie A"), false);
  assert.strictEqual(H2.scopeFixtures().length, BOARD.length - 1);
});

test("the old include-set sw.bldleagues is ignored and removed on load (R2)", () => {
  const store = { "sw.bldleagues": JSON.stringify({ "Italy Serie A": 1 }) };
  const H = harness(BOARD, store);
  assert.strictEqual(store["sw.bldleagues"], undefined, "the old key must be removed");
  assert.strictEqual(H.scopeFixtures().length, BOARD.length,
    "everyone starts all-ticked, not narrowed to the old picks");
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

test("the list does not shrink as leagues are unticked", () => {
  /* Counted before the league filter on purpose: an unticked league that
     vanished from the list could never be ticked back. */
  const H = harness(BOARD);
  const before = H.leaguesOnBoard().length;
  H.setLeaguePicked("Italy Serie A", false);
  assert.strictEqual(H.leaguesOnBoard().length, before);
});

test("top-flight only also narrows what the picker offers", () => {
  const H = harness(BOARD);
  H.setTopOnly(true);
  const offered = H.leaguesOnBoard().map(x => x.league);
  assert.ok(!offered.includes("England Championship"));
  assert.ok(offered.includes("England Premier League"));
});
