"use strict";

/**
 * Yesterday is one number, wherever the page shows it.
 *
 * Critique 6 Oct 2026 (board, P1): the daily card said "26 of 39 tips landed"
 * while the record panel said "16/21 yesterday", both on screen at once. They
 * came from different places: the card graded yesterday's tips from
 * DATA.results, the panel printed DATA.recordYest - a one-day holdout backtest
 * over the LAST day in the results feed, which runs two or three days behind,
 * so it was often not even yesterday. Both cells now read windowRecord(1).
 *
 * Drives the real renderDaily and renderRecord with one fixture and reads what
 * reaches each host, rather than asserting source strings.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

function isoDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  const p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function render(DATA) {
  const hosts = { daily: { innerHTML: "" }, record: { innerHTML: "" } };
  new Function("DATA", "HOSTS", [
    "function $(id){ return HOSTS[id]||null; }",
    'var STICKY_PFX="sw.day.";',
    "var localStorage={ getItem:function(){ return null; } };",
    "var V={};",
    "function isoOffset(){ return '" + isoDaysAgo(1) + "'; }",
    "function dayDate(){ return 'Yesterday'; }",
    "function activeDays(){ return []; }",
    grab("esc"), grab("dayOff"), grab("yestCounts"), grab("windowRecord"),
    grab("marketBreakdownHTML"), grab("renderDaily"), grab("renderRecord"),
    "renderDaily(); renderRecord();",
  ].join("\n"))(DATA, hosts);
  return hosts;
}

const y = isoDaysAgo(1), older = isoDaysAgo(3);
const row = (date, hit) => ({ date, home: "A", away: "B", tip: "Over 1.5", hit });
const FIXTURE = {
  results: [row(y, true), row(y, true), row(y, true), row(y, false),
            row(older, false), row(older, true)],
  record: { total: 80, correct: 58, days: 21 },
  /* The old second source, deliberately disagreeing. Nothing may print it. */
  recordYest: { total: 21, correct: 16 },
};

test("the daily card and the record panel print the same yesterday", () => {
  const h = render(FIXTURE);
  assert.match(h.daily.innerHTML, /<span class='dl-big num'>3<\/span><span class='dl-of'>of 4 tips landed/,
    "daily card: 3 of yesterday's 4 graded tips landed");
  assert.match(h.record.innerHTML, /<b>3\/4<\/b><i>yesterday<\/i>/,
    "record panel's yesterday cell must be the same 3/4");
  assert.doesNotMatch(h.record.innerHTML, /16\/21/, "the backtest figure must not reach the panel");
});

test("no graded results yesterday: the panel drops the cell rather than borrow a number", () => {
  const h = render(Object.assign({}, FIXTURE, { results: [row(older, true)] }));
  assert.doesNotMatch(h.record.innerHTML, /<i>yesterday<\/i>/);
  assert.doesNotMatch(h.record.innerHTML, /16\/21/);
});
