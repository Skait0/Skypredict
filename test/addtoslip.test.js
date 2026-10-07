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
    "function saveMy(){} function renderFab(){} function putMissNote(){}",
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

test("Conjure becomes Add once a slip exists - no Conjure again", () => {
  /* "why is there a conjure again? there is no preview" - the panel shows no
     games, so a reroll there changes a slip nobody can see. */
  assert.doesNotMatch(src, /Conjure again/);
  assert.match(src, /html \+= WSP\.conjured\s*\? "<button class='book-btn wsp-go' id='wspAdd'/);
});

test("both builders end on Add selections to slip, not on booking", () => {
  assert.match(src, /\$\("bookBtn"\)\.addEventListener\("click",function\(\)\{ addBuiltToSlip\(BUILD\.picks,"slider"\); \}\);/);
  assert.match(src, /id='wspAdd' type='button'>Add selections to slip<\/button>/);
  assert.match(src, /btn\.textContent="Add selections to slip";/);
});
