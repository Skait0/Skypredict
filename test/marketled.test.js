"use strict";
/* Market-led confidence in the day's code (owner, 30 Sep 2026: "we are after
 * the best results for our users"). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { marketP, blendedConf } = require("../scripts/mkcode.js");

test("the market's chance for a tip is de-vigged, double chances included", () => {
  const odds = { "1": 1.5, "X": 4, "2": 6, "OVER_2.5": 1.8, "UNDER_2.5": 2, "GG": 1.9, "NG": 1.9 };
  const s = 1 / 1.5 + 1 / 4 + 1 / 6;
  assert.ok(Math.abs(marketP(odds, "1") - (1 / 1.5) / s) < 1e-9);
  assert.ok(Math.abs(marketP(odds, "1X") - (1 / 1.5 + 1 / 4) / s) < 1e-9);
  assert.ok(Math.abs(marketP(odds, "OVER_2.5") - (1 / 1.8) / (1 / 1.8 + 1 / 2)) < 1e-9);
  assert.strictEqual(marketP(odds, "GG"), 0.5);
  assert.strictEqual(marketP(odds, "OVER_3.5"), null, "unpriced stays unknown");
});

test("a tip the market doubts ranks below one it backs", () => {
  const f = (tip, p) => ({ tip, tip_p: p, home: "A", away: "B" });
  const loud = blendedConf(f("Home win", 0.80), { odds: { "1": 3, "X": 3.2, "2": 2.4 } });
  const quiet = blendedConf(f("Home win", 0.62), { odds: { "1": 1.3, "X": 5, "2": 9 } });
  assert.ok(quiet > loud, "the model's 80% on a 3.00 shot loses to 62% on a 1.30 favourite");
  assert.strictEqual(blendedConf(f("Home win", 0.7), null), 0.7, "no book, no change");
});

test("the day's code uses the site's weight", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const js = fs.readFileSync(path.join(__dirname, "..", "scripts", "mkcode.js"), "utf8");
  const site = Number(/var BLEND_MIN=([\d.]+)/.exec(html)[1]);
  const code = Number(/const MARKET_W = ([\d.]+);/.exec(js)[1]);
  assert.strictEqual(code, site);
  assert.match(js, /pool\.sort\(\(a, b\) => blendedConf\(b,/);
});
