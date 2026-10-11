"use strict";

/**
 * Trust the market most where we disagree with it most.
 *
 * Measured across a 394-fixture live board, our probability for the favourite
 * against the de-vigged book price, under the FLAT 30% blend that used to be
 * the whole rule:
 *
 *   book says fav is   n     we say    gap    home fav   away fav
 *      40-50%         150     42.2%    -2.3      -0.9       -6.1
 *      50-60%          96     47.5%    -6.7      -5.2      -11.5
 *      60-70%          49     53.5%   -11.4      -9.8      -17.1
 *      70-80%          21     59.9%   -14.4     -11.3      -18.5
 *      80%+             5     65.8%   -16.5     -16.5         -
 *
 * The model compresses toward the middle - it will not say anyone is a strong
 * favourite - and it is worse for AWAY favourites at every level. Reported as
 * "im not even seeing outright of Real madrid and big teams on wizard", and
 * that was the cause: Ipswich v Liverpool priced Liverpool at 1.54 (about
 * 65%), we said 41%, and Ipswich-to-score sat at 81%. bestOf takes the highest
 * probability in the band, so 81% beat 41% every time.
 *
 * A flat weight cannot fix a non-flat error. Thirty per cent of a two-point
 * disagreement is noise; thirty per cent of a twenty-point one leaves fourteen
 * points standing. So the weight scales with the gap.
 *
 * After, on the same board: -1.6, -3.9, -5.3, -6.0, -6.2. Roughly flat instead
 * of fanning out, and Liverpool went 41% to 56%.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function lift(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  assert.ok(i >= 0, "not found: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const consts = /var BLEND_MIN=([\d.]+), BLEND_MAX=([\d.]+), BLEND_FULL_GAP=([\d.]+);/.exec(src);
assert.ok(consts, "the blend constants must exist");
const [, MIN, MAX, FULL] = consts.map(Number);
const blendWeight = new Function(consts[0] + lift("blendWeight") + "\nreturn blendWeight;")();

/* ------------------------------------------------------------ the curve */

test("a small disagreement is left almost alone", () => {
  /* The floor sets the weight when we roughly agree with the book. Since
     30 Sep 2026 it is the market-led 0.90 - see the test below. */
  assert.strictEqual(blendWeight(0), MIN, "no disagreement, no extra pull");
  assert.ok(blendWeight(0.02) < MIN + 0.06,
    "two points should barely move the weight");
});

test("a large disagreement is pulled most of the way to the book", () => {
  /* A twenty-point disagreement with a well-calibrated market is
     overwhelmingly our error, not our edge. */
  assert.strictEqual(blendWeight(0.20), MAX);
  assert.strictEqual(blendWeight(0.50), MAX, "and it never exceeds the cap");
});

test("it rises monotonically, with no step", () => {
  /* A threshold would put two nearly identical fixtures on opposite sides of a
     cliff, which is how a rule starts producing answers nobody can explain.
     Monotonic is NOT enough to say that - a step function is monotonic too,
     and mutation testing walked a `gap > 0.1 ? 1 : 0` straight past an
     earlier version of this test. So the size of each step is bounded as
     well: over a 0.20 ramp with a 0.45 range, a 0.005 change in gap should
     move the weight by about 0.011, and a cliff moves it by 0.45. */
  const STEP = 0.005, MAX_JUMP = 0.05;
  let prev = blendWeight(0);
  for (let g = STEP; g <= 0.30; g += STEP) {
    const w = blendWeight(g);
    assert.ok(w >= prev, "weight fell at gap " + g.toFixed(3));
    assert.ok(w >= MIN && w <= MAX, "weight out of range at " + g.toFixed(3));
    assert.ok(w - prev < MAX_JUMP,
      "the weight jumped " + (w - prev).toFixed(3) + " at gap " + g.toFixed(3) +
      " - that is a cliff, not a ramp");
    prev = w;
  }
});

test("direction does not matter, only size", () => {
  /* The gap is measured as a magnitude. Being wildly below the book is the
     same kind of error as being wildly above it. */
  assert.strictEqual(blendWeight(-0.15), blendWeight(0.15));
});

test("the market leads: 0.90 at every gap (owner, 30 Sep 2026)", () => {
  /* scripts/scorecard.js --exp=blend, 7,373 held-out matches with odds:
     1X2 log loss 1.0451 model alone, 1.0137 on the old 0.30-0.75 ramp, 1.0028
     market alone, better with more market at every weight and in every tier.
     Kept a hair under 1 because SportyBet is one book, softer than the average
     price the test used. A lower floor brings back the noise "Better price"
     used to flag. */
  assert.strictEqual(MIN, 0.90);
  assert.strictEqual(MAX, 0.90);
  assert.ok(FULL >= 0.15 && FULL <= 0.30, "the ramp's scale is kept for a future non-flat rule");
});

/* ------------------------------------------------------- how it is applied */

test("one weight governs all three outcomes", () => {
  /* Weighing home, draw and away separately pulls them apart and needs a
     renormalise that quietly undoes the difference. The largest single
     disagreement sets the weight for the whole three-way. */
  const fn = lift("blendFixture");
  assert.match(fn, /var B3=blendWeight\(Math\.max\(/,
    "the weight must come from the largest of the three gaps");
  assert.match(fn, /f\.home_p=f\.home_p\*\(1-B\)\+m\[0\]\*B; f\.draw_p=f\.draw_p\*\(1-B\)\+m\[1\]\*B; f\.away_p=f\.away_p\*\(1-B\)\+m\[2\]\*B;/,
    "and all three must be blended with it");
  assert.match(fn, /var s=f\.home_p\+f\.draw_p\+f\.away_p; if\(s>0\)\{/,
    "the three-way must still be renormalised to sum to one");
});

test("the two-way markets keep the flat weight", () => {
  /* Over 1.5, Over 2.5 and both-teams-score were not measured as compressed,
     and changing them here would move numbers this evidence says nothing
     about. */
  const fn = lift("blendFixture");
  assert.match(fn, /function two\(ov,un,field\)\{ if\(o\[ov\]&&o\[un\]&&typeof f\[field\]==="number"\)\{var a=1\/o\[ov\],b=1\/o\[un\],s=a\+b; if\(s>0\) f\[field\]=f\[field\]\*\(1-B\)\+\(a\/s\)\*B;\} \}/,
    "two() must still exist");
  assert.match(fn, /var o=f\.sportyOdds; if\(!o\) return; var B=0\.30;/,
    "and the flat 0.30 it reads must still be declared");
});

/* Owner, 11 Oct 2026: "our percentage is higher for the market with the bigger
   odds, is this right?" Aberdeen v St Johnstone, live prices and model. */
test("team to score follows the book's order once blended", () => {
  const run = new Function(consts[0] + lift("blendWeight") + lift("_devig3") +
    "function bestTipFrom(){return null;} function kOf(){return {};} function tipCode(){return null;}" +
    (/var BLEND_FIELDS=\[[\s\S]*?\];/.exec(src) || [""])[0] + lift("blendFixture") + "\nreturn blendFixture;")();
  const f = { home_p: 0.328, draw_p: 0.277, away_p: 0.394, o15: 0.73, o25: 0.5, btts: 0.53,
    h_o05: 0.706, a_o05: 0.744, h_o15: 0.36, a_o15: 0.41, fh_o05: 0.7, o35: 0.25,
    sportyOdds: { "1": 2.23, "X": 3.5, "2": 3.26, "HOME_OVER_0.5": 1.25, "HOME_UNDER_0.5": 3.75,
      "AWAY_OVER_0.5": 1.38, "AWAY_UNDER_0.5": 2.9, "HOME_OVER_1.5": 2.15, "HOME_UNDER_1.5": 1.66,
      "AWAY_OVER_1.5": 2.75, "AWAY_UNDER_1.5": 1.41, "FH_OVER_0.5": 1.41, "FH_UNDER_0.5": 2.85 } };
  run(f);
  assert.ok(f.h_o05 > f.a_o05, "Aberdeen at x1.25 must read likelier than St Johnstone at x1.38: " + f.h_o05 + " / " + f.a_o05);
  assert.ok(Math.abs(f.h_o05 - 0.75) < 0.01 && Math.abs(f.a_o05 - 0.684) < 0.01, "about 75% and 68%");
  assert.ok(f.h_o15 > f.a_o15, "team over 1.5 follows too");
  const g = { home_p: 0.4, draw_p: 0.3, away_p: 0.3, h_o05: 0.7, sportyOdds: { "HOME_OVER_0.5": 1.3 } };
  run(g);
  assert.strictEqual(g.h_o05, 0.7, "one side priced is no two-way price: left alone");
});

test("one-sided combos are de-vigged with the game's own margin and kept between their parts", () => {
  const run = new Function(consts[0] + lift("blendWeight") + lift("_devig3") +
    "function bestTipFrom(){return null;} function kOf(){return {};} function tipCode(){return null;}" +
    (/var BLEND_FIELDS=\[[\s\S]*?\];/.exec(src) || [""])[0] + lift("blendFixture") + "\nreturn blendFixture;")();
  /* Aberdeen v St Johnstone, 11 Oct 2026: model and live SportyBet prices. */
  const f = { home_p: 0.328, draw_p: 0.277, away_p: 0.394, o15: 0.73, o25: 0.5, o35: 0.264, o45: 0.122, btts: 0.53,
    h_o05: 0.706, a_o05: 0.744, home_btts: 0.706, away_btts: 0.744, draw_btts: 0.609,
    home_o25: 0.621, away_o25: 0.645, draw_o25: 0.686,
    sportyOdds: { "1": 2.23, "X": 3.5, "2": 3.26, "OVER_1.5": 1.31, "UNDER_1.5": 3.5, "GG": 1.75, "NG": 2,
      "HOME_OVER_0.5": 1.25, "HOME_UNDER_0.5": 3.75, "AWAY_OVER_0.5": 1.38, "AWAY_UNDER_0.5": 2.9,
      "MIXGG_1": 1.25, "MIXGG_2": 1.38, "MIXGG_X": 1.54 } };
  run(f);
  assert.ok(f.home_btts > f.away_btts, "Aberdeen or both score at x1.25 reads likelier than St Johnstone's at x1.38: " +
    f.home_btts.toFixed(3) + " / " + f.away_btts.toFixed(3));
  for (const [c, part] of [["home_btts", "home_p"], ["away_btts", "away_p"], ["draw_btts", "draw_p"]]) {
    assert.ok(f[c] >= Math.max(f[part], f.btts) - 1e-9, c + " at least as likely as each part");
    assert.ok(f[c] <= Math.min(1, f[part] + f.btts) + 1e-9, c + " no likelier than both together");
  }
  assert.strictEqual(f.home_o25, 0.621, "no price, no change");
  const g = { home_p: 0.4, draw_p: 0.3, away_p: 0.3, btts: 0.5, home_btts: 0.7, sportyOdds: { "MIXGG_1": 1.2 } };
  run(g);
  assert.strictEqual(g.home_btts, 0.7, "no two-sided line to take a margin from: left alone");
});

test("corners, shots and handicap half lines from 1.5 keep the book's de-vigged figure", () => {
  const run = new Function(consts[0] + lift("blendWeight") + lift("_devig3") +
    "function bestTipFrom(){return null;} function kOf(){return {};} function tipCode(){return null;}" +
    (/var BLEND_FIELDS=\[[\s\S]*?\];/.exec(src) || [""])[0] + lift("blendFixture") + "\nreturn blendFixture;")();
  const f = { home_p: 0.5, draw_p: 0.25, away_p: 0.25, sportyOdds: { "1": 2, "X": 3.6, "2": 3.6,
    "CORNERS_OV_9.5": 1.9, "CORNERS_UN_9.5": 1.85, "SHOTS_H_OV_12.5": 1.8, "SHOTS_H_UN_12.5": 1.95,
    "AH_1_-1.5": 3.4, "AH_2_-1.5": 1.3, "AH_1_-0.5": 2, "AH_2_-0.5": 1.8, "AH_1_1": 1.2, "AH_2_1": 4,
    "CORNERS_OV_10.5": 2.4 } };
  run(f);
  const dv = (a, b) => (1 / a) / (1 / a + 1 / b);
  assert.ok(Math.abs(f._bk["CORNERS_OV_9.5"] - dv(1.9, 1.85)) < 1e-12);
  assert.ok(Math.abs(f._bk["SHOTS_H_OV_12.5"] - dv(1.8, 1.95)) < 1e-12);
  assert.ok(Math.abs(f._bk["AH_1_-1.5"] - dv(3.4, 1.3)) < 1e-12);
  assert.ok(Math.abs(f._bk["AH_2_-1.5"] - dv(1.3, 3.4)) < 1e-12);
  assert.ok(!("AH_1_-0.5" in f._bk), "the 0.5 lines come from the blended result");
  assert.ok(!("AH_1_1" in f._bk), "a whole line pushes, so its prices are not a two-way split");
  assert.ok(!("CORNERS_OV_10.5" in f._bk), "one side only: nothing to de-vig against");
  assert.strictEqual(f._bkB, 0.9);
});

test("a refresh blends from the model again, not from the last blend", () => {
  const run = new Function(consts[0] + lift("blendWeight") + lift("_devig3") +
    "function bestTipFrom(){return null;} function kOf(){return {};} function tipCode(){return null;}" +
    (/var BLEND_FIELDS=\[[\s\S]*?\];/.exec(src) || [""])[0] + lift("blendFixture") + "\nreturn blendFixture;")();
  const f = { home_p: 0.328, draw_p: 0.277, away_p: 0.394, h_o05: 0.706, a_o05: 0.744, btts: 0.53,
    sportyOdds: { "1": 2.23, "X": 3.5, "2": 3.26, "HOME_OVER_0.5": 1.25, "HOME_UNDER_0.5": 3.75,
      "AWAY_OVER_0.5": 1.38, "AWAY_UNDER_0.5": 2.9 } };
  run(f); const once = { hp: f.home_p, h: f.h_o05 };
  run(f); run(f);
  assert.strictEqual(f.home_p, once.hp, "home win unchanged by later refreshes with the same prices");
  assert.strictEqual(f.h_o05, once.h, "team to score unchanged too");
  f.sportyOdds = Object.assign({}, f.sportyOdds, { "1": 2.0, "2": 3.8 });
  run(f);
  assert.ok(f.home_p > once.hp, "new prices still move it");
});
