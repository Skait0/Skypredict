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
  /* Where a model is allowed to have an opinion, and where "Better price"
     lives. Blending these away would turn the site into a mirror of the book
     and delete its whole reason to exist. */
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

test("the floor is the weight the flat rule already used", () => {
  /* So nothing about the small-gap behaviour changed, and any regression can
     only be in the fixtures that were already worst. */
  assert.strictEqual(MIN, 0.30);
  assert.ok(MAX > MIN && MAX <= 0.85,
    "past about 0.85 we are simply republishing the bookmaker");
  assert.ok(FULL >= 0.15 && FULL <= 0.30,
    "the observed error tops out around 20 points; " + FULL + " is the wrong scale");
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
  assert.match(fn, /function two\(ov,un,field\)\{ if\(o\[ov\]&&o\[un\]\)\{var a=1\/o\[ov\],b=1\/o\[un\],s=a\+b; if\(s>0\) f\[field\]=f\[field\]\*\(1-B\)\+\(a\/s\)\*B;\} \}/,
    "two() must still exist");
  assert.match(fn, /var o=f\.sportyOdds; if\(!o\) return; var B=0\.30;/,
    "and the flat 0.30 it reads must still be declared");
});
