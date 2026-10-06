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
    const f = new Function("SLIPS", "window", "BOOKS", "esc", "$", "slipWhen", "swSwipe", "clearAllControl", "BIN_SVG", "SL_PEEKED", "openSlipsSheet",
      src + "; return renderMyResults;");
    f([s], { swPend: { hidden: () => false } }, { sporty: { label: "SportyBet" } }, (x) => x, () => host, () => when, null, () => {}, "", true, null)();
    return out;
  }
  const base = { sid: "a", settled: false, code: "X1", book: "sporty", odds: 2, at: "x" };
  assert.match(row({ ...base, legs: [1, 2, 3] }, "today's"), /SportyBet, 3 games, today<\/small>/);
  assert.match(row({ ...base, legs: [1] }, "Saturday's"), /1 game, Saturday<\/small>/);
  assert.match(row({ ...base, legs: [1] }, "last"), /SportyBet, 1 game<\/small>/);
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
