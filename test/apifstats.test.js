"use strict";

/**
 * Corners and shots from API-Football reach the models, or the paid day buys
 * nothing. Three hand-offs could each drop them silently: resolve() rebuilding
 * the row, toCSV writing six columns, and the generic layout in normalise not
 * reading them back. Each is driven with real rows here, end to end.
 */

const test = require("node:test");
const assert = require("node:assert");
const L = require("../lib/liveresults.js");

const row = { date: "2025-10-04", league: "Croatia HNL", home: "Rijeka", away: "Osijek",
  hg: 2, ag: 1, hc: 7, ac: 3, hs: 15, as: 8, hst: 6, ast: 2 };

test("statistics survive the file and come back as the models read them", () => {
  const back = L.fromCSV(L.toCSV([row]));
  assert.strictEqual(back.length, 1);
  for (const k of ["hc", "ac", "hs", "as", "hst", "ast"]) {
    assert.strictEqual(back[0][k], row[k], k + " came back");
  }
});

test("a file with no statistics keeps its six columns", () => {
  const plain = { date: "2025-10-04", league: "Croatia HNL", home: "Rijeka", away: "Osijek", hg: 2, ag: 1 };
  assert.strictEqual(L.toCSV([plain]).split("\n")[0], L.HEADER);
  assert.strictEqual(L.fromCSV(L.toCSV([plain]))[0].hc, undefined, "no column is not a zero");
});

test("a row without statistics beside one with them is blank, not zero", () => {
  const plain = { date: "2025-10-05", league: "Croatia HNL", home: "Hajduk Split", away: "Osijek", hg: 0, ag: 0 };
  const back = L.fromCSV(L.toCSV([row, plain]));
  const b = back.find((m) => m.home === "Hajduk Split");
  assert.strictEqual(b.hc, undefined);
  assert.strictEqual(b.hs, undefined);
});

test("resolve keeps the statistics on the row it hands back", () => {
  const M = require("../lib/model.js");
  const lg = new Set(["Croatia HNL"]);
  const out = L.resolve([Object.assign({}, row)], M.buildIndex([]), lg, row.date, lg);
  assert.strictEqual(out.matches.length, 1);
  assert.strictEqual(out.matches[0].hc, 7);
  assert.strictEqual(out.matches[0].ast, 2);
});
