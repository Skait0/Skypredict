"use strict";

/**
 * The "last 21 days" record is graded from real results, everywhere.
 *
 * Owner ruling 7 Oct 2026 (Task 2b): the record panel headline, the daily-card
 * footer and the hero proof line printed DATA.record, a 21-day holdout
 * BACKTEST of the model, under "every tip checked against the result", beside
 * a 7-day cell graded from published tips. Now the page reads windowRecord(21)
 * over DATA.results, and the build publishes payload.record from the same
 * results through lib/grade.js windowRecord, which every server reader (share
 * card, social posts, shared-slip page, preflight) already prints.
 * Graded history is shorter than 21 days (resultDays is 14), so the window
 * says the days it really covers.
 *
 * Drives the real renderers out of index.html, not source strings.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const G = require("../lib/grade.js");

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
  const hosts = { daily: { innerHTML: "" }, record: { innerHTML: "" }, scProof: { innerHTML: "", hidden: true } };
  const out = new Function("DATA", "HOSTS", [
    "function $(id){ return HOSTS[id]||null; }",
    'var STICKY_PFX="sw.day.";',
    "var localStorage={ getItem:function(){ return null; } };",
    "var V={};",
    "function isoOffset(){ return '" + isoDaysAgo(1) + "'; }",
    "function dayDate(){ return 'Yesterday'; }",
    "function activeDays(){ return []; }",
    grab("esc"), grab("dayOff"), grab("yestCounts"), grab("windowRecord"),
    grab("marketBreakdownHTML"), grab("renderDaily"), grab("renderRecord"), grab("renderProof"),
    "renderDaily(); renderRecord(); renderProof();",
    "return { w21: windowRecord(21) };",
  ].join("\n"))(DATA, hosts);
  return Object.assign(hosts, out);
}

const row = (n, hit, tip, p) => ({ date: isoDaysAgo(n), home: "A", away: "B", tip: tip || "Over 1.5", hit, tip_p: p == null ? 0.8 : p });
/* 8 graded inside 21 days, 5 landed, the oldest 14 days back; one row older
   than the window that must not count. */
const RESULTS = [
  row(1, true), row(1, true), row(1, true, "1X, home or draw", 0.7), row(1, false, "1X, home or draw", 0.7),
  row(3, false), row(3, true),
  row(14, false, "1X, home or draw", 0.75), row(14, false),
  row(25, true),
];
/* The old payload.record: a holdout backtest that disagrees. Nothing may print it. */
const BACKTEST = { total: 2349, correct: 1807, days: 21, brier: 0.176 };

test("server windowRecord: graded tips inside the window, real window length", () => {
  const r = G.windowRecord(RESULTS, 21, isoDaysAgo(0));
  assert.strictEqual(r.total, 8);
  assert.strictEqual(r.correct, 4);
  assert.strictEqual(r.days, 14, "history reaches 14 days back, so the window says 14");
  assert.deepStrictEqual(r.byMarket.map((m) => [m.market, m.correct, m.total]),
    [["Over 1.5", 3, 5], ["Double chance", 1, 3]]);
  assert.strictEqual(typeof r.brier, "number");
  assert.strictEqual(G.windowRecord([], 21, isoDaysAgo(0)), null);
  assert.strictEqual(G.windowRecord(RESULTS, 7, isoDaysAgo(0)).days, 3,
    "7-day window over rows 1 and 3 days back covers 3 days");
});

test("the page and the build compute the same record from the same results", () => {
  const server = G.windowRecord(RESULTS, 21, isoDaysAgo(0));
  const h = render({ results: RESULTS, record: server });
  ["correct", "total", "days", "brier"].forEach((k) =>
    assert.strictEqual(h.w21[k], server[k], k + " differs between page and build"));
  assert.match(h.record.innerHTML, /Over 1\.5<\/span>.*<span class='mk-c'>3\/5<\/span>/,
    "the by-market rows are the graded ones");
});

test("server readers print the graded record the build publishes", () => {
  const record = G.windowRecord(RESULTS, 21, isoDaysAgo(0));
  const S = require("../lib/social.js");
  const posts = [0, 1, 2, 3].map((n) => S.promo({ record }, Date.now(), n).x).join("\n");
  assert.match(posts, /4 of 8 tips landed in the last 14 days \(50%\)/, "X/Telegram promo");
  const SL = require("../lib/sliplink.js");
  const page = SL.renderPage([], record, "/s/x", {});
  assert.match(page, /<b>4 of 8<\/b>\s*in the last 14 days/, "shared-slip page");
});

test("daily footer, record panel and hero proof print the graded record, not the backtest", () => {
  const h = render({ results: RESULTS, record: BACKTEST });
  assert.match(h.daily.innerHTML, /Over the last 14 days, <b>4 of 8<\/b> tips landed \(50%\)/);
  assert.match(h.record.innerHTML, /<b class='pc'>50%<\/b><i>last 14 days · 4\/8<\/i>/);
  assert.match(h.scProof.innerHTML, /50% of our tips landed<\/b> over the last 14 days/);
  assert.strictEqual(h.scProof.hidden, false);
  for (const host of ["daily", "record", "scProof"]) {
    assert.doesNotMatch(h[host].innerHTML, /2349|1807|77%|last 21 days/, host + " printed the backtest");
  }
});

test("no graded results: the record surfaces stay empty rather than borrow the backtest", () => {
  const h = render({ results: [row(25, true)], record: BACKTEST });
  assert.strictEqual(h.daily.innerHTML, "");
  assert.strictEqual(h.record.innerHTML, "");
  assert.strictEqual(h.scProof.hidden, true);
});

test("the build publishes payload.record from graded results, with no 21-day backtest", () => {
  const b = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(b, /GRADE\.windowRecord\(results, cfg\.recordDays/,
    "payload.record must come from the graded results");
  assert.doesNotMatch(b, /days: cfg\.recordDays/, "the 21-day backtest is gone");
});
