"use strict";
/**
 * "Add selections to slip" (owner, 7 Oct 2026): the Slider and the Wizard no
 * longer book from their own panel or fill My slip behind the reader's back.
 * Their slip goes to My slip through addBuiltToSlip, which opens the sheet -
 * and when the slip already holds games, asks first: replace them, or add to
 * them. Owner's choice was "ask".
 *
 * The real function is lifted out of the page and driven with stubs.
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

function harness(slip) {
  return new Function("SLIP", [
    "var MYSLIP=SLIP, WSP={}, opened=0, asked=null, btns={};",
    "function mLabel(f,c){return c;} function kickoffOf(){return 0;}",
    "function saveMy(){} function renderFab(){} function putMissNote(){} function liveCheckMy(){}",
    "function openMySheet(){opened++;}",
    "function showPrompt(t,html){asked=html;return true;} function clearPrompt(){asked=null;}",
    "function promptEl(){return {querySelector:function(s){",
    "  return btns[s]||(btns[s]={addEventListener:function(e,fn){this.fn=fn;}});}};}",
    grab("addBuiltToSlip"),
    "return {add:addBuiltToSlip, slip:function(){return MYSLIP;}, opened:function(){return opened;},",
    "  asked:function(){return asked;}, press:function(s){btns[s].fn();}};",
  ].join("\n"))(slip);
}

const built = [{ id: "a", code: "1X" }, { id: "b", code: "OVER_1.5" }];

test("an empty slip fills and the sheet opens, nothing asked", () => {
  const h = harness([]);
  h.add(built, "slider");
  assert.strictEqual(h.asked(), null);
  assert.strictEqual(h.opened(), 1);
  assert.deepStrictEqual(h.slip().map((x) => x.id + ":" + x.code + ":" + x.via), ["a:1X:slider", "b:OVER_1.5:slider"]);
  assert.ok(h.slip().every((x) => x.auto), "built legs are machine-picked");
});

test("a slip holding games is asked about, and nothing changes until answered", () => {
  const h = harness([{ id: "z", code: "GG", auto: false }]);
  h.add(built, "wizard");
  assert.match(h.asked(), /Your slip already has 1 game\./);
  assert.strictEqual(h.opened(), 0);
  assert.deepStrictEqual(h.slip().map((x) => x.id), ["z"]);
});

test("Replace swaps the whole slip for the built one", () => {
  const h = harness([{ id: "z", code: "GG", auto: false }]);
  h.add(built, "wizard");
  h.press(".confirm-go");
  assert.deepStrictEqual(h.slip().map((x) => x.id), ["a", "b"]);
  assert.strictEqual(h.opened(), 1);
});

test("Add keeps the reader's games, and their own market on a shared game", () => {
  const h = harness([{ id: "z", code: "GG", auto: false }, { id: "a", code: "DC_X2", auto: false }]);
  h.add(built, "slider");
  h.press(".confirm-alt");
  assert.deepStrictEqual(h.slip().map((x) => x.id + ":" + x.code), ["z:GG", "a:DC_X2", "b:OVER_1.5"]);
  assert.strictEqual(h.opened(), 1);
});

test("adding the slip that is already there just opens it", () => {
  const h = harness(built.map((c) => ({ id: c.id, code: c.code, auto: true })));
  h.add(built, "slider");
  assert.strictEqual(h.asked(), null);
  assert.strictEqual(h.opened(), 1);
});

test("the pop-up's X sits above the card body, so a tap reaches it", () => {
  /* Owner, 7 Oct 2026: "the close button here doesnt work". The question's
     first line ran under the X and, coming later in the DOM, took the tap. */
  assert.match(src, /\.ask-x\{position:absolute;[^}]*z-index:2/);
});

test("Conjure goes straight to My slip - no Add step, no Conjure again", () => {
  /* Owner, 8 Oct 2026: "add to selection after conjure kills the magic". One
     tap builds and fills the slip; a slip with games gets the Replace/Add ask. */
  assert.doesNotMatch(src, /Conjure again/);
  assert.doesNotMatch(src, /id='wspAdd'/);
  assert.match(src, /buzzConjure\(\); wspConjure\(false\);\s*if\(WSP\.conjured\) addBuiltToSlip\(BUILD\.picks,"wizard"\);/);
});

test("a new payout or slip style brings Conjure back", () => {
  /* Owner, 7 Oct 2026: "when i select another xN after i have conjured and
     added previously, it only shows add selection to slip, the button should
     go back to conjure, thats the magic!" Chip, typed payout, wider-window
     offer and style chip each lower the flag. */
  assert.match(src, /WSP\.odds=\+c\.dataset\.o;WSP\._sig=null;WSP\.conjured=false;/, "payout chip");
  assert.match(src, /WSP\.odds=v; WSP\._sig=null; WSP\.conjured=false;/, "typed payout");
  assert.match(src, /WSP\.odds=typed; WSP\._sig=null; WSP\.conjured=false;/, "wider window");
  assert.match(src, /WSP\.legodd=\+c\.dataset\.lo;[\s\S]{0,120}WSP\._sig=null;WSP\.conjured=false;renderBuilder\(\);/, "style chip");
});

test("the Slider ends on Add selections to slip, not on booking", () => {
  assert.match(src, /\$\("bookBtn"\)\.addEventListener\("click",function\(\)\{ addBuiltToSlip\(BUILD\.picks,"slider"\); \}\);/);
  assert.match(src, /btn\.textContent="Add selections to slip";/);
});

test("a built slip is checked on SportyBet's live card as it lands", async () => {
  /* Owner, 9 Oct 2026: what the reader sees in My slip is what books. A moved
     goals line takes SportyBet's line and price and says what it was; a
     closed one leaves the slip; an unanswered leg stays as it was. */
  let sent = null, toast = null;
  const F = { a: { id: "a", eventId: "e1", sportyOdds: {} }, b: { id: "b", eventId: "e2" }, c: { id: "c", eventId: "e3" } };
  const run = new Function("F", "FETCH", "TOAST", [
    "var MYBOOK_GEN=0, B={key:'sporty',book:'/api/book?book=sporty',odds:'sportyOdds',id:'eventId',",
    "  sel:function(c){return {eventId:F[c.id].eventId,prediction:c.code};}};",
    "var MYSLIP=[{id:'a',code:'HOME_OVER_0.5',label:'HOME_OVER_0.5'},{id:'b',code:'OVER_1.5',label:'OVER_1.5'},",
    "  {id:'c',code:'1',label:'1'}];",
    "function curBook(){return B;} function bookIdOf(c){return F[c.id].eventId;} function fixtureById(id){return F[id];}",
    "function mLabel(f,c){return c;} function mProb(){return 0.7;} function saveMy(){} function renderFab(){}",
    "function $(){return null;} var fetch=FETCH, window={swToast:TOAST};",
    grab("liveCheckMy"),
    "liveCheckMy(MYSLIP.slice()); return function(){return MYSLIP;};",
  ].join("\n"));
  const slip = run(F, (url, o) => { sent = JSON.parse(o.body); return Promise.resolve({ json: () => ({ verdicts: [
    { eventId: "e1", prediction: "HOME_OVER_0.5", reason: "line_moved", now: "HOME_OVER_1.5", odds: 1.62 },
    { eventId: "e2", prediction: "OVER_1.5", reason: "closed" }] }) }); }, (m) => { toast = m; });
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(sent.goals, true, "goals lines are asked about");
  assert.deepStrictEqual(slip().map((x) => x.code), ["HOME_OVER_1.5", "1"]);
  assert.strictEqual(slip()[0].was, "HOME_OVER_0.5");
  assert.strictEqual(F.a.sportyOdds["HOME_OVER_1.5"], 1.62, "SportyBet's live price");
  assert.match(toast, /1 line updated, 1 game closed/);
});
