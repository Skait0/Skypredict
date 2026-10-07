"use strict";

/**
 * The Wizard says what it can reach BEFORE Conjure, and a slip that still falls
 * short says so in the slip header. The Slider speaks one vocabulary.
 *
 * Critique 6 Oct 2026 (docs/design/critique-2026-10-06/critique-builder.md):
 *   P0  x100 picked, Conjure pressed, x15.55 handed back with the reason in
 *       faint text under the legs.
 *   P1  at 60 the dial heading said Bold, the lit tick said Balanced and the
 *       lit slip-style chip said Balanced too.
 *
 * renderWizardPanel and renderMySheet are DRIVEN here, not grepped: the real
 * functions run against the real wspBuild over a stubbed board, with a stub
 * DOM that only records what was written. The pool comes through the real
 * scopeFixtures/leagueAllowed, so the league picker is part of the test.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("function not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
function konst(name) {
  const m = new RegExp("(?:^|\\n)(?:const|var|let)\\s+" + name + "\\s*=\\s*([^;]+);").exec(src);
  if (!m) throw new Error("constant not found in index.html: " + name);
  return "const " + name + "=" + m[1].trim() + ";";
}

/* A DOM that remembers what was written and answers everything else with
   something harmless. Enough for the two renderers; nothing is laid out. */
function stubEl(id) {
  const el = {
    id, innerHTML: "", textContent: "", hidden: false, value: "", _attrs: {},
    style: { setProperty() {} },
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { this._attrs[k] = String(v); }, getAttribute(k) { return this._attrs[k]; },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, appendChild() {}, remove() {}, focus() {},
  };
  return el;
}

const FNS = ["cornersK", "cLgamma", "cornersOver", "cornersOpen", "countryOf", "isSAleague",
  "isAsianLeague", "isAsian", "isSouthAmerican", "saWeight", "isLowerLeague", "isLowerFixture",
  "fid", "oddOf", "legOdd", "bookVerdict", "bookMayTake", "bookIsPriced", "bookIdOf",
  "hasRealOdd", "pricedFixture", "mProb", "allowedMarkets", "preferGoalsOverDouble",
  "isJackpotOdds", "wspMarkets", "codeMarket", "provenMarkets", "isProven", "safeUnpriced",
  "fetchedMarket", "bookAllows", "wspStyleOn", "wspBuild", "wspMaxReach",
  "leagueAllowed", "leagueDefault", "setLeaguePicked",
  "renderWizardPanel", "renderMySheet", "riskWord", "paintTicks"];

const api = new Function("STUB", [
  "var TOP_ONLY=false, SCOPE='all', SDAY=0, SPAN=3, TOD='all', BLD_PICK={}, VOL_IN=true;",
  "var FIXTURES=[], MYSLIP=[], BUILD={mode:'wizard',risk:45};",
  "var DATA=null, localStorage={getItem(){return null},setItem(){},removeItem(){}};",
  "var BOOKS={sporty:{key:'sporty',odds:'sportyOdds',id:'eventId'}};",
  "var ELS={}; function $(id){ return ELS[id]||(ELS[id]=STUB(id)); }",
  "var document={querySelector:function(s){return s==='.slider-panel .risk-ticks'?$('ticks'):null;},",
  "  querySelectorAll:function(){return [];},documentElement:{classList:{contains(){return true}}}};",
  "var window={};",
  "function isVolatile(){return false;}",
  "function notStarted(){return true;}",
  "function todFixtures(a){return a;}",
  "function inScope(){return true;}",
  /* The real predicate, so a league taken out of the picker leaves the pool. */
  grab("scopeFixtures"),
  "function slipUse(){return {};}",
  "function paintBookPickers(){} function pruneMy(){} function fixtureById(){return null;}",
  "function swapOptions(){return [];} function oddCell(){return '';} function esc(s){return String(s);}",
  "function myOdds(){return MYSLIP.reduce(function(a,x){return a*x.o;},1);}",
  "function showPrompt(){return false;} function clearPrompt(){}",
  "var XSVG=''; function inkOn(){return '#fff';}",
  konst("SAFE_UNPRICED"), konst("BOOK_ONLY"), konst("CORNER_CODES"), konst("TEAM_CORNER_CODES"),
  konst("SHOTS_CODES"), konst("TEAM_SHOTS_CODES"), konst("HCAP_CODES"), konst("ESTIMATE_SHRINK"),
  "function curBook(){return {key:'sporty',label:'SportyBet',full:true,odds:'sportyOdds',id:'eventId'};}",
  konst("JACKPOT_ODDS"), konst("JACKPOT_LEG_CAP"),
  konst("HIGH_SCORING_O25"), konst("SA_MIN_EURO"), konst("ASIA_MIN_EURO"),
  konst("SA_COUNTRIES"), konst("ASIA_PREFIXES"), konst("SPREAD_PEN"), konst("SPREAD_MULT"),
  (/^var WSP=\{[\s\S]*?\};/m.exec(src) || [""])[0],
  (/^var SLIP_STYLES=[\s\S]*?;$/m.exec(src) || [""])[0],
  "var WSP_REACH={};",
].concat(FNS.map(grab)).join("\n") + `
  return { WSP, ELS, $, wspMaxReach, renderWizardPanel, renderMySheet, paintTicks,
           setLeaguePicked, SLIP_STYLES,
           setFixtures(f){ FIXTURES = f; DATA = {fixtures: f}; },
           setSlip(s){ MYSLIP = s; } };
`)(stubEl);

/* Twelve games across three leagues, priced from their own probabilities.
   Small on purpose: the whole board multiplies to a few hundred at most, so
   the top rungs of the ladder are genuinely out of reach. */
function fx(i, league) {
  const hp = 0.55 + (i % 4) * 0.03, ap = 0.2, dp = 1 - hp - ap;
  const o = (p) => Math.round((1 / p) * 100) / 100;
  const f = { date: "2026-10-07", league, home: "H" + i, away: "A" + i,
    home_p: hp, draw_p: dp, away_p: ap, dc1x: hp + dp, dcx2: ap + dp, dc12: hp + ap,
    anybody: hp + ap, o15: 0.78, o25: 0.55, o35: 0.3, btts: 0.52, fh_o05: 0.72,
    h_o05: 0.85, h_o15: 0.5, a_o05: 0.65, a_o15: 0.27 };
  f.sportyOdds = { "1": o(hp), "2": o(ap), "X": o(dp), "1X": o(f.dc1x), "X2": o(f.dcx2),
    "12": o(f.dc12), "OVER_1.5": o(f.o15), "OVER_2.5": o(f.o25), "GG": o(f.btts),
    "HOME_OVER_0.5": o(f.h_o05), "AWAY_OVER_0.5": o(f.a_o05) };
  return f;
}
const LEAGUES = ["England Premier League", "Spain La Liga", "Italy Serie A"];
const BOARD = Array.from({ length: 12 }, (_, i) => fx(i, LEAGUES[i % 3]));

function reset() {
  api.setFixtures(BOARD);
  Object.assign(api.WSP, { odds: null, legodd: 1.4, everyGame: false, seed: 4242,
                           shuffles: 0, conjured: false, removed: {}, _miss: null });
  api.WSP.mk = { wd: true, any: false, out: true, o15: true, o25: true, o35: false, fh: false,
                 tts: false, tts2: false, both: true, draw: false, dro25: false, drgg: false,
                 rsgg: false, rso25: false, weh: false, corn: false, tcorn: false,
                 shots: false, tshots: false, hcap: false, dro15: false, rso15: false };
}
function chips(html) {
  const out = {};
  html.replace(/<button class='wsp-chip wsp-risk[^>]*data-o='(\d+)'([^>]*)>/g,
    (_, o, rest) => { out[o] = /disabled/.test(rest); });
  return out;
}

/* ------------------------------------------------------------ the Wizard */

test("a rung the pool cannot reach is disabled before Conjure, and the ceiling is said", () => {
  reset();
  const ceil = api.wspMaxReach(19999);
  assert.ok(ceil > 10 && ceil < 6000, `fixture board should top out mid-ladder, got x${ceil}`);
  api.renderWizardPanel();
  const html = api.ELS.wizardPanel.innerHTML;
  const c = chips(html);
  assert.ok(Object.keys(c).length >= 5, "the ladder must be drawn: " + JSON.stringify(c));
  for (const o of Object.keys(c)) {
    assert.strictEqual(c[o], +o > ceil, `x${o} disabled=${c[o]} against a ceiling of x${ceil.toFixed(1)}`);
  }
  const m = /class='wsp-reach'>[^<]*<b>×([\d,]+)<\/b>/.exec(html);
  assert.ok(m, "the ceiling line must be drawn when a rung is out of reach");
  assert.strictEqual(+m[1].replace(/,/g, ""), Math.round(ceil));
});

test("the ceiling is the pool the Wizard builds from: the league picker moves it", () => {
  reset();
  const all = api.wspMaxReach(19999);
  api.setLeaguePicked(LEAGUES[0], false);
  api.setLeaguePicked(LEAGUES[1], false);
  try {
    const one = api.wspMaxReach(19999);
    assert.ok(one < all, `taking two leagues out must lower the ceiling (x${all} -> x${one}); ` +
      "a key without the picker would keep the old one");
    api.renderWizardPanel();
    const c = chips(api.ELS.wizardPanel.innerHTML);
    assert.ok(Object.keys(c).some(o => +o <= all && +o > one && c[o]),
      "a rung reachable before the picker change must be disabled after it");
  } finally {
    api.setLeaguePicked(LEAGUES[0], true);
    api.setLeaguePicked(LEAGUES[1], true);
  }
});

test("a rung below the jackpot tier is judged at the 40-leg cap, not the jackpot's", () => {
  /* Sixty games, double chance only at 1.22: forty legs make about x2,850,
     fifty make about x20,800. One probe at 1e12 would call x6k reachable and
     Conjure would then build forty legs and fall short. Measured 7 Oct. */
  reset();
  Object.keys(api.WSP.mk).forEach(k => { api.WSP.mk[k] = (k === "wd"); });
  api.setFixtures(Array.from({ length: 60 }, (_, i) => {
    const f = fx(i, LEAGUES[i % 3]); f.sportyOdds = { "1X": 1.22 }; return f; }));
  const forty = api.wspMaxReach(19999), fifty = api.wspMaxReach(1e12);
  assert.ok(forty < 6000 && fifty >= 20000, `board shape drifted: x${forty} / x${fifty}`);
  api.renderWizardPanel();
  const html = api.ELS.wizardPanel.innerHTML, c = chips(html);
  assert.strictEqual(c["6000"], true, "x6k cannot be built in forty legs");
  assert.strictEqual(c["2000"], false);
  const m = /class='wsp-reach'>[^<]*<b>×([\d,]+)<\/b>/.exec(html);
  assert.strictEqual(+m[1].replace(/,/g, ""), Math.round(forty),
    "the line names the ceiling of the rungs it sits under");
});

test("a chosen rung that goes out of reach is dropped, not left lit", () => {
  reset();
  api.WSP.odds = 6000;
  api.renderWizardPanel();
  assert.strictEqual(api.WSP.odds, null);
  assert.ok(!/wsp-risk on/.test(api.ELS.wizardPanel.innerHTML));
});

test("nothing is disabled and no ceiling line in every-game mode", () => {
  reset();
  api.WSP.everyGame = true;
  api.renderWizardPanel();
  const html = api.ELS.wizardPanel.innerHTML;
  assert.ok(!Object.values(chips(html)).some(Boolean));
  assert.ok(!/wsp-reach/.test(html));
});

test("a short Wizard slip says the result in the slip header", () => {
  reset();
  api.WSP._miss = { want: 100 };
  api.setSlip([{ id: "a", code: "1X", label: "", p: 0.8, o: 4, auto: true, via: "wizard" },
               { id: "b", code: "1X", label: "", p: 0.8, o: 4, auto: true, via: "wizard" }]);
  api.renderMySheet();
  const h = api.ELS.mySheetMiss;
  assert.strictEqual(h.hidden, false);
  assert.match(h.innerHTML, /<b>×16\.00<\/b> of your ×100/);
  /* Gone once the slip reaches the target, or holds no wizard legs. */
  api.setSlip([{ id: "a", code: "1X", label: "", p: 0.8, o: 120, auto: true, via: "wizard" }]);
  api.renderMySheet();
  assert.strictEqual(h.hidden, true);
  api.setSlip([{ id: "a", code: "1X", label: "", p: 0.8, o: 4, auto: false }]);
  api.renderMySheet();
  assert.strictEqual(h.hidden, true);
});

test("wspConjure records the shortfall from the build it just made", () => {
  const fn = grab("wspConjure");
  assert.match(fn, /WSP\._miss=r\.short\?\{want:WSP\.odds\}:null;[\s\S]*openMySheet\(\)/,
    "the miss must be set before the sheet renders");
});

/* ------------------------------------------------------------ the Slider */

test("the dial's ticks are riskWord's words and the lit one matches the heading", () => {
  const ticks = /<div class="risk-ticks[^"]*">([\s\S]*?)<\/div>/.exec(src)[1]
    .match(/<span>([^<]+)<\/span>/g).map(s => s.replace(/<\/?span>/g, ""));
  const words = [0, 25, 50, 70, 90].map(r => new Function(grab("riskWord") + "return riskWord(" + r + ");")());
  assert.deepStrictEqual(ticks, words);
  /* Drive paintTicks over the real tick markup. */
  const spans = ticks.map(t => stubEl(t));
  spans.forEach((s, i) => { s.textContent = ticks[i]; });
  api.ELS.ticks = Object.assign(stubEl("ticks"), { querySelectorAll: () => spans });
  for (const r of [10, 35, 60, 79, 95]) {
    api.paintTicks(r);
    const lit = spans.filter(s => s.classList.contains("zone-live")).map(s => s.textContent);
    const want = new Function(grab("riskWord") + "return riskWord(" + r + ");")();
    assert.deepStrictEqual(lit, [want], `at ${r} the heading says ${want}`);
    assert.strictEqual(api.ELS.risk._attrs["aria-valuetext"], want);
  }
});

test("the slip-style chips share no word with the dial", () => {
  const dial = ["Safest", "Safe", "Balanced", "Bold", "Risky"];
  for (const st of api.SLIP_STYLES) {
    for (const w of dial) assert.ok(!new RegExp("\\b" + w + "\\b").test(st[1] + " " + st[2]),
      `style "${st[1]}" reuses the dial word ${w}`);
  }
});

test("the Slider subtitle reads as a per-pick floor, not a second confidence figure", () => {
  assert.match(src, /" \\u00b7 each pick "\+P0\(p\.minConf\)\+"%\+"/);
  assert.doesNotMatch(src, /"%\+ confidence"/);
});

test("the Slider shows the total once: no odds tile beside the gold foot", () => {
  const fn = grab("renderBuilderOutput");
  assert.match(fn, /var _tileOdds=isWiz;/);
  assert.match(fn, /\(!_tileOdds\?"":"<div class='stat odds'>/);
  assert.match(src, /\.bf-odds b\{[^}]*color:var\(--win\)/, "the foot total is the gold one");
});
