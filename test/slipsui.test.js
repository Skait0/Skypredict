"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = html.indexOf("function " + name + "(");
  assert.ok(i >= 0, name);
  let depth = 0;
  for (let k = html.indexOf("{", i); k < html.length; k++) {
    if (html[k] === "{") depth++; else if (html[k] === "}" && --depth === 0) return html.slice(i, k + 1);
  }
}

test("states: running, lost, won", () => {
  const f = new Function(grab("slipState") + "; return slipState;")();
  assert.strictEqual(f({ settled: false }), "run");
  assert.strictEqual(f({ settled: true, won: false }), "lost");
  assert.strictEqual(f({ settled: true, won: true }), "won");
});

test("counts skip a slip that is waiting on Undo", () => {
  const f = new Function("SLIPS", "window", grab("slipState") + grab("slipCounts") + "; return slipCounts;");
  const S = [{ sid: "a", settled: false }, { sid: "b", settled: true, won: true }, { sid: "c", settled: true, won: false }];
  const w = { swPend: { hidden: (sid) => sid === "a" } };
  assert.deepStrictEqual(f(S, w)(), { all: 2, run: 0, lost: 1, won: 1 });
});

test("copy: Lost not Cut, no em dashes in the new slips UI", () => {
  const r = grab("renderMyResults") + grab("renderSlipsSheet");
  assert.doesNotMatch(r, /\bCut\b|—/);
  assert.match(r, /Lost/);
  assert.doesNotMatch(r, /-game slip · ×/, "the old one-slip summary is gone");
});

test("Recent row copy: no possessive, no ', last', singular game", () => {
  const src = grab("slipState") + grab("slipCounts") + grab("bookMark") + grab("renderMyResults");
  function row(s, when) {
    let out = "";
    const host = { set innerHTML(v) { out = v; }, querySelectorAll() { return []; }, querySelector() { return null; } };
    const f = new Function("SLIPS", "window", "BOOKS", "esc", "$", "slipWhen", "swSwipe", "clearAllControl", "BIN_SVG", "SL_PEEKED", "openSlipsSheet", "slipWhenPlain",
      src + "; return renderMyResults;");
    const mockSlipWhenPlain = (iso) => when === "last" ? "" : when.replace(/'s$/, "");
    f([s], { swPend: { hidden: () => false } }, { sporty: { label: "SportyBet" } }, (x) => x, () => host, () => when, null, () => {}, "", true, null, mockSlipWhenPlain)();
    return out;
  }
  const base = { sid: "a", settled: false, code: "X1", book: "sporty", odds: 2, at: "x" };
  assert.match(row({ ...base, legs: [1, 2, 3] }, "today's"), /SportyBet, 3 games, today<\/small>/);
  assert.match(row({ ...base, legs: [1] }, "Saturday's"), /1 game, Saturday<\/small>/);
  assert.match(row({ ...base, legs: [1] }, "last"), /SportyBet, 1 game<\/small>/);
});

test("sheet meta copy: no possessive, no ', last'", () => {
  const src = grab("dayOff") + grab("dayName") + grab("slipWhen") + grab("slipWhenPlain");
  const f = new Function(src + "; return slipWhenPlain;")();
  const badIso = "baddate";
  assert.strictEqual(f(badIso), "", "slipWhenPlain returns empty for invalid dates (slipWhen returns last)");
});

test("the sheet: filters with counts, top actions, gold code, progress, no avatar", () => {
  const r = grab("renderSlipsSheet") + grab("progressWords");
  for (const w of ["All", "Running", "Lost", "Won", "Share", "Rebuild", "Copy", "Show ", "landed", "to play"]) assert.match(r, new RegExp(w), w);
  assert.match(r, /data-slsafe/, "Make it safer stays, only when running");
  assert.match(r, /swSwipe\(/); assert.match(r, /clearAllControl\(/);
  const sheet = /<div class="sheet slips-sheet" id="slipsSheet"[\s\S]*?id="slipsBody"/.exec(html)[0];
  assert.doesNotMatch(sheet, /\/av\//);
  assert.doesNotMatch(r, /Clear slip history|askRemoveSlip/);
});

test("progress words", () => {
  const f = new Function(grab("progressWords") + "; return progressWords;")();
  assert.strictEqual(f([{ res: "win" }, { res: "win" }, {}, {}]), "<b>2</b> landed, 2 to play");
  assert.strictEqual(f([{ res: "win" }, { res: "lose" }]), "<b>1</b> landed, <b>1</b> lost");
  assert.strictEqual(f([{}, {}]), "<b>0</b> landed, 2 to play");
});

const SHEET_FNS = ["slipWhen", "slipWhenPlain", "slipState", "slipCounts", "progressWords", "renderSlipsSheet", "wireSlipButtons", "slipMenuItems", "slipMoreMenu"];
function sheetEnv(extra) {
  const names = ["SLIPS", "window", "document", "BOOKS", "esc", "$", "slipWhen", "swSwipe", "clearAllControl", "BIN_SVG", "SHARE_SVG", "SAFE_SVG", "RB_SVG", "MORE_SVG", "COPY_SVG", "CHEV_SVG", "bookMark", "isJackpotSlip", "shareWin", "SLOPEN", "SL_POP_CLOSE"];
  const src = SHEET_FNS.map(grab).join("\n") + "; return {renderSlipsSheet, wireSlipButtons, slipMoreMenu, slipMenuItems};";
  return (vals) => new Function(...names, src)(...names.map((n) => vals[n]));
}

test("the sheet draws without throwing and its helpers are defined", () => {
  let out = "";
  const body = { set innerHTML(v) { out = v; }, querySelectorAll() { return []; }, querySelector() { return null; } };
  const SLIPS = [{ sid: "a", settled: true, won: true, code: "X1", book: "sporty", odds: 2, at: "x", legs: [{ res: "win" }, {}] }];
  const mk = sheetEnv();
  const slipWhenFn = () => "today's";
  const fns = mk({ SLIPS, window: { swPend: { hidden: () => false } }, document: {}, BOOKS: { sporty: { label: "S" } }, esc: (x) => x, $: () => body, slipWhen: slipWhenFn, swSwipe() {}, clearAllControl() {}, BIN_SVG: "", SHARE_SVG: "", SAFE_SVG: "", RB_SVG: "", MORE_SVG: "", COPY_SVG: "", CHEV_SVG: "", bookMark: () => "", isJackpotSlip: () => false, shareWin() {}, SLOPEN: null, SL_POP_CLOSE: null });
  assert.doesNotThrow(() => fns.renderSlipsSheet());
  assert.match(out, /data-slcp/);
  assert.strictEqual(typeof fns.wireSlipButtons, "function");
  assert.strictEqual(typeof fns.slipMoreMenu, "function");
  assert.deepStrictEqual(fns.slipMenuItems({ settled: true, won: true }), ["Share your win", "Delete"]);
  assert.deepStrictEqual(fns.slipMenuItems({ settled: true, won: false }), ["Delete"]);
  assert.deepStrictEqual(fns.slipMenuItems({ settled: false }), ["Delete"]);
});

test("the more menu closes on Escape, on choosing, and leaves no listeners behind", () => {
  const listeners = {};
  const doc = {
    body: { appendChild() {} },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
    createElement() {
      const items = [];
      return { style: {}, offsetHeight: 40, removed: false, setAttribute() {}, remove() { this.removed = true; }, contains() { return false; },
        set innerHTML(v) { items.length = 0; (v.match(/<button/g) || []).forEach((_, i) => items.push({ textContent: i ? "Delete" : (/Share your win/.test(v) ? "Share your win" : "Delete"), focus() { items.focused = true; } })); this._items = items; },
        querySelectorAll() { return items; }, querySelector() { return items[0]; } };
    },
  };
  const calls = [];
  const mk = sheetEnv();
  const fns = mk({ SLIPS: [{ sid: "a", settled: true, won: true, legs: [] }], window: { innerHeight: 800, innerWidth: 400, swPend: { del: (s) => calls.push("del " + s) } }, document: doc, BOOKS: {}, esc: (x) => x, $: () => null, slipWhen: () => "", swSwipe() {}, clearAllControl() {}, BIN_SVG: "", SHARE_SVG: "", SAFE_SVG: "", RB_SVG: "", MORE_SVG: "", COPY_SVG: "", CHEV_SVG: "", bookMark: () => "", isJackpotSlip: () => false, shareWin: () => calls.push("win"), SLOPEN: null, SL_POP_CLOSE: null });
  let focused = false;
  const btn = { getBoundingClientRect: () => ({ bottom: 10, right: 300 }), focus() { focused = true; } };
  const count = () => (listeners.pointerdown || []).length + (listeners.keydown || []).length;
  fns.slipMoreMenu(btn, "a"); assert.strictEqual(count(), 2);
  listeners.keydown[0]({ key: "Escape", stopPropagation() {} });
  assert.strictEqual(count(), 0); assert.ok(focused, "focus returns to the button");
  fns.slipMoreMenu(btn, "a"); fns.slipMoreMenu(btn, "a"); assert.strictEqual(count(), 2, "reopening does not stack listeners");
  listeners.pointerdown[0]({ target: {} }); assert.strictEqual(count(), 0, "outside tap closes");
});
