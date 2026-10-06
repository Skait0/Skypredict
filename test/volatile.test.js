"use strict";

/**
 * Volatile leagues: third division and below (ruling R1, tierOf(f) >= 3 on
 * every fixture the league has on the board). Listed in the picker but
 * unticked by default; "All leagues" asks whether to add them, every time,
 * through the page's own ask pop-up (showPrompt / promptEl / clearPrompt).
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

/* A fake button that records its click handler, and a prompt host that hands
   them out by class - enough of the DOM for askVolatile to wire itself up. */
function harness(fixtures, store) {
  store = store || {};
  const ui = { html: null, cleared: 0, focused: null, renders: 0 };
  const btn = (cls) => ({ cls, h: null, addEventListener(ev, fn) { this.h = fn; },
    focus() { ui.focused = cls; }, click() { this.h(); } });
  const H = new Function("FX", "STORE", "UI", "BTN",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}," +
    "setItem:function(k,v){STORE[k]=String(v);},removeItem:function(k){delete STORE[k];}};" +
    "var DATA={fixtures:FX};" +
    "var SCOPE='all', SDAY=0, SPAN=3, TOD='all', TOP_ONLY=true, TIER_UNRANKED=6, WSP={};" +
    "function notStarted(){return true;}" +
    "function dayOff(){return 0;}" + "function fDay(f){return f.date;}" +
    "function todFixtures(l){return l;}" +
    "function isLowerFixture(f){return !!(f.tier&&f.tier>1);}" +
    "function leagueRank(){return 1;}" +
    "function esc(s){return String(s);}" +
    "function setTopOnly(v){TOP_ONLY=!!v;}" +
    "function renderBuilder(){UI.renders++;}" +
    "var ASK={go:null,keep:null};" +
    "function showPrompt(t,h){UI.html=h; UI.target=t; ASK.go=BTN('confirm-go'); ASK.keep=BTN('confirm-cancel'); return true;}" +
    "function promptEl(){return {querySelector:function(s){return s==='.confirm-go'?ASK.go:ASK.keep;}};}" +
    "function clearPrompt(t){UI.cleared++;}" +
    "var BLD_PICK={}, VOL_IN=false, VOL_SRC=null, VOL_MAP={};" +
    grab("tierOf") + grab("compOf") + grab("countryOf") +
    grab("loadLeaguePicks") + grab("isVolatile") + grab("leagueDefault") +
    grab("leagueAllowed") + grab("leaguesChosen") + grab("leaguePicksTouched") +
    grab("setLeaguePicked") + grab("clearLeaguePicks") + grab("setVolIn") +
    grab("inScope") + grab("scopeFixtures") + grab("leaguesOnBoard") +
    grab("resetLeagues") + grab("askVolatile") + "\n" +
    "loadLeaguePicks();" +
    "return {scopeFixtures:scopeFixtures, leaguesOnBoard:leaguesOnBoard," +
    " setLeaguePicked:setLeaguePicked, leagueAllowed:leagueAllowed, isVolatile:isVolatile," +
    " resetLeagues:resetLeagues, ask:ASK, store:STORE, topOnly:function(){return TOP_ONLY;}};"
  )(fixtures, store, ui, btn);
  H.ui = ui;
  return H;
}

const BOARD = [
  { league: "England Premier League", tier: 1 },
  { league: "England Championship", tier: 2 },
  { league: "England League 1", tier: 3 },
  { league: "England League 2", tier: 4 },
  { league: "Italy Serie C, Group A", tier: 3 },
  { league: "Spain La Liga 1", tier: 1 },
];
const leagues = (list) => [...new Set(list.map(f => f.league))].sort();
const SAFE = ["England Championship", "England Premier League", "Spain La Liga 1"];

test("volatile = every fixture tier 3 or lower; unranked does not count", () => {
  const H = harness(BOARD.concat([
    { league: "Russia Russian Cup", tier: 3 }, { league: "Russia Russian Cup", tier: 1 },
    { league: "Old Payload League" },
  ]));
  assert.strictEqual(H.isVolatile("England League 1"), true);
  assert.strictEqual(H.isVolatile("England League 2"), true);
  assert.strictEqual(H.isVolatile("England Championship"), false);
  assert.strictEqual(H.isVolatile("Russia Russian Cup"), false, "one top-flight fixture keeps it in");
  assert.strictEqual(H.isVolatile("Old Payload League"), false,
    "no tier stamped must not bench a league");
});

test("volatile leagues are listed but left out by default", () => {
  const H = harness(BOARD);
  assert.deepStrictEqual(leagues(H.scopeFixtures()), SAFE);});

test("a single volatile league can be ticked on its own", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("England League 1", true);
  assert.deepStrictEqual(leagues(H.scopeFixtures()), SAFE.concat(["England League 1"]).sort());
  assert.strictEqual(H.leagueAllowed("England League 2"), false, "the others stay out");
  assert.deepStrictEqual(JSON.parse(H.store["sw.bldpick"]), { "England League 1": 1 });
});

test("All leagues clears taps, turns Top flight off and asks, naming them and why", () => {
  const H = harness(BOARD);
  H.setLeaguePicked("Spain La Liga 1", false);
  H.resetLeagues();
  assert.strictEqual(H.topOnly(), false);
  assert.strictEqual(H.store["sw.bldpick"], undefined, "taps cleared");
  const html = H.ui.html;
  assert.ok(html, "the pop-up must open while volatile leagues are on the board");
  assert.match(html, /volatile/i);
  assert.match(html, /third divisions and below/);
  assert.match(html, /swing a lot/);
  assert.match(html, /League 1 \(England\)/);
  assert.match(html, /Serie C, Group A \(Italy\)/);
  assert.match(html, />Add them</);
  assert.match(html, />Keep them out</);
  assert.strictEqual(H.ui.focused, "confirm-cancel", "Keep them out takes focus by default");
});

test("Keep them out (also Escape / backdrop, which press it) leaves them out", () => {
  const H = harness(BOARD);
  H.resetLeagues();
  H.ask.keep.click();
  assert.strictEqual(H.store["sw.volin"], "0");
  assert.deepStrictEqual(leagues(H.scopeFixtures()), SAFE);
  assert.strictEqual(H.ui.cleared, 1, "the pop-up closes");
});

test("Add them brings every volatile league in, and it survives a reload", () => {
  const store = {};
  const H = harness(BOARD, store);
  H.resetLeagues();
  H.ask.go.click();
  assert.strictEqual(store["sw.volin"], "1");
  assert.strictEqual(H.scopeFixtures().length, BOARD.length);
  assert.strictEqual(harness(BOARD, store).scopeFixtures().length, BOARD.length);
});

test("asked on every click, and Keep after Add takes them back out", () => {
  const H = harness(BOARD);
  H.resetLeagues(); H.ask.go.click();
  H.ui.html = null;
  H.resetLeagues();
  assert.ok(H.ui.html, "asked again");
  H.ask.keep.click();
  assert.deepStrictEqual(leagues(H.scopeFixtures()), SAFE);
});

test("no volatile league on the board, no pop-up", () => {
  const H = harness(BOARD.filter(f => f.tier < 3));
  H.resetLeagues();
  assert.strictEqual(H.ui.html, null);
});

test("the backdrop and Escape route through the card's cancel button", () => {
  /* askHost's close path clicks .confirm-cancel, which is Keep them out. */
  const host = grab("askHost");
  assert.match(host, /querySelector\("\.confirm-cancel"\)/);
  assert.match(host, /e\.key==="Escape"/);
});
