"use strict";
/* The board's odds range and sort (owner, 13 Oct 2026, from a competitor's filters). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\("));
  assert.ok(i >= 0, "not found: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const BSORTS = /var BSORTS=\{[\s\S]*?\n\};/.exec(src)[0];

function board(V, fx) {
  return new Function("V", "FX",
    "function onDay(){return FX;} function countryOf(){return '';} function boardPick(f){return {code:f.c};}" +
    "function legOdd(f,c){return f.o||0;}" + grab("pickOdds") + grab("baseFiltered") + BSORTS +
    "\nreturn {list:baseFiltered(), sort:function(k){return baseFiltered().slice().sort(BSORTS[k].by).map(function(f){return f.home;});}};")(V, fx);
}
const FX = [
  { home: "A", league: "L", away: "x", c: "1", o: 1.25, tip_p: 0.9, kickoff: "2026-10-13T18:00:00Z" },
  { home: "B", league: "L", away: "x", c: "1X", o: 1.55, tip_p: 0.7, kickoff: "2026-10-13T15:00:00Z" },
  { home: "C", league: "L", away: "x", c: "GG", o: 1.8, tip_p: 0.6, kickoff: "2026-10-13T20:00:00Z" },
  { home: "D", league: "L", away: "x", c: "2", o: 0, tip_p: 0.8, kickoff: "2026-10-13T12:00:00Z" },
];
const V = (o) => Object.assign({ q: "", country: "", league: "", omin: 0, omax: 0 }, o || {});

test("an odds range keeps only priced picks inside it, ends included", () => {
  assert.deepStrictEqual(board(V({ omin: 1.3, omax: 1.8 }), FX).list.map((f) => f.home), ["B", "C"]);
  assert.deepStrictEqual(board(V({ omin: 1.5 }), FX).list.map((f) => f.home), ["B", "C"]);
  assert.deepStrictEqual(board(V({ omax: 1.3 }), FX).list.map((f) => f.home), ["A"], "a pick with no price is out while a range is set");
  assert.strictEqual(board(V(), FX).list.length, 4, "no range: every game, priced or not");
});

test("the three sorts", () => {
  const b = board(V(), FX);
  assert.deepStrictEqual(b.sort("strong"), ["A", "D", "B", "C"]);
  assert.deepStrictEqual(b.sort("kick"), ["D", "B", "A", "C"]);
  assert.deepStrictEqual(b.sort("odds"), ["C", "B", "A", "D"], "unpriced last");
});
