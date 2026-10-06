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
