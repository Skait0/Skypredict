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
  /* Just enough of the picker's elements for renderLeaguePicker to paint. */
  const el = () => ({ textContent: "", innerHTML: "", hidden: false, _wired: 1,
    classList: { toggle() {} }, querySelectorAll() { return []; } });
  const EL = { lgpOpen: el(), lgpBox: el(), lgpList: el(), lgpSum: el(), lgpCount: el(), lgpClear: el() };
  const H = new Function("FX", "STORE", "UI", "BTN", "EL",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}," +
    "setItem:function(k,v){STORE[k]=String(v);},removeItem:function(k){delete STORE[k];}};" +
    "var DATA={fixtures:FX};" +
    "var SCOPE='all', SDAY=0, SPAN=3, TOD='all', TOP_ONLY=(STORE['sw.favmode']!=='0'), TIER_UNRANKED=6, WSP={};" +
    "function notStarted(){return true;}" +
    "function dayOff(){return 0;}" + "function fDay(f){return f.date;}" +
    "function todFixtures(l){return l;}" +
    "function outsideTop(f){return !!(f.tier&&f.tier>1);}" +
    "function leagueRank(){return 1;}" +
    "function esc(s){return String(s);}" +
    "function setTopOnly(v){TOP_ONLY=!!v;STORE['sw.favmode']=v?'1':'0';}" +
    "function renderBuilder(){UI.renders++;}" +
    "var ASK={go:null,keep:null};" +
    "function $(id){return EL[id];}" + "function dayName(){return 'Today';}" +
    "function showPrompt(t,h,l){UI.html=h; UI.target=t; UI.label=l; ASK.go=BTN('confirm-go'); ASK.keep=BTN('confirm-cancel'); return true;}" +
    "function promptEl(){return {querySelector:function(s){return s==='.confirm-go'?ASK.go:ASK.keep;}};}" +
    "function clearPrompt(t){UI.cleared++;}" +
    "function updateFiltersSum(){}" +
    "function favLeague(l){return !isVolatile(l);}" +
    "var BLD_PICK={}, VOL_IN=false, VOL_SRC=null, VOL_MAP={};" +
    grab("tierOf") + grab("compOf") + grab("countryOf") +
    grab("loadLeaguePicks") + grab("isVolatile") + grab("leagueDefault") +
    grab("leagueAllowed") + grab("leaguesChosen") + grab("leaguePicksTouched") +
    grab("setLeaguePicked") + grab("clearLeaguePicks") + grab("setVolIn") +
    grab("inScope") + grab("scopeFixtures") + grab("windowWords") + grab("leaguesOnBoard") + grab("leagueCount") +
    grab("resetLeagues") + grab("askVolatile") + grab("renderLeaguePicker") + "\n" +
    "loadLeaguePicks();" +
    "return {scopeFixtures:scopeFixtures, leaguesOnBoard:leaguesOnBoard," +
    " setLeaguePicked:setLeaguePicked, leagueAllowed:leagueAllowed, isVolatile:isVolatile," +
    " resetLeagues:resetLeagues, renderLeaguePicker:renderLeaguePicker, ask:ASK, store:STORE, topOnly:function(){return TOP_ONLY;}};"
  )(fixtures, store, ui, btn, EL);
  H.ui = ui;
  H.summary = () => { H.renderLeaguePicker(); return EL.lgpSum.textContent; };
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

/* ------------------------------------------------ fix round 1 ------------ */

test("the volatile ask names itself, not as a booking step", () => {
  const H = harness(BOARD);
  H.resetLeagues();
  assert.strictEqual(H.ui.label, "Add volatile leagues?");
});

test("showPrompt labels the dialog, defaulting to the booking label", () => {
  /* The card is aria-labelledby a hidden span; showPrompt writes the label. */
  assert.match(grab("askHost"), /aria-labelledby='askLbl'/);
  assert.match(grab("askHost"), /<span class='sr-only' id='askLbl'>/);
  const lbl = { textContent: "" };
  const body = { innerHTML: "", querySelector() { return null; } };
  const show = new Function("M", "BODY", "LBL",
    "var INLINE_ASK={}, ASK_FOR=null;" +
    "function askHost(){return M;} function askLock(){}" +
    "function $(id){return id==='askBody'?BODY:id==='askLbl'?LBL:null;}" +
    grab("showPrompt") + ";return showPrompt;")({ hidden: true }, body, lbl);
  show("bookResult", "<p>x</p>");
  assert.strictEqual(lbl.textContent, "Before we book");
  show("volAsk", "<p>x</p>", "Add volatile leagues?");
  assert.strictEqual(lbl.textContent, "Add volatile leagues?");
  show("bookResult", "<p>x</p>");
  assert.strictEqual(lbl.textContent, "Before we book", "a later booking ask resets it");
});
