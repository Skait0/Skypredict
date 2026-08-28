"use strict";

/**
 * A published fixture must not contradict itself.
 *
 * The card shows a tip and, beside it, "most likely score". Those came from
 * the same distribution but were chosen independently: the tip is the best
 * outcome, the scoreline was the single modal cell. For a strong home
 * favourite the modal cell is routinely 1-1 - Barcelona v Vallecano, lh 1.93,
 * la 1.02, home win 58%, most likely exact scoreline 1-1 - so the page read
 * "predicted 1-1 / tip: Home win". Both numbers were correct and the pair was
 * indefensible. It affected 10 of 357 fixtures on the day it was found.
 *
 * The rule this file enforces is the one a reader would apply: take the
 * scoreline we printed, settle our own tip against it with the same grader
 * that settles real results, and it must not come out a loss.
 */

const test = require("node:test");
const assert = require("node:assert");

const M = require("../lib/model.js");
const G = require("../lib/grade.js");

/* markets() needs a joint distribution, so build one the way the model does
   rather than hand-writing a matrix that could not arise in practice. */
function marketsFor(lh, la) {
  const p = M.predictTotalsFrom
    ? M.predictTotalsFrom(lh, la)
    : { lh: lh, la: la, total: lh + la, matrix: M.scoreMatrix(lh, la, 200), k: 200 };
  return M.markets(p, { k: 200 });
}

/* The shapes that actually produced the contradiction, plus the mirror image
   and a coin-flip. */
const SHAPES = [
  { name: "strong home favourite", lh: 1.93, la: 1.02 },
  { name: "very strong home favourite", lh: 2.35, la: 0.85 },
  { name: "strong away favourite", lh: 0.95, la: 1.90 },
  { name: "even, low scoring", lh: 1.05, la: 1.05 },
  { name: "even, high scoring", lh: 1.85, la: 1.85 },
  { name: "goal-heavy home favourite", lh: 2.60, la: 1.40 },
];

test("markets() offers a ranked scoreline shortlist", () => {
  const k = marketsFor(1.93, 1.02);
  assert.ok(Array.isArray(k.scores) && k.scores.length > 1, "no shortlist");
  assert.strictEqual(k.scores[0].s, k.score, "the head of the list is the mode");
  for (let i = 1; i < k.scores.length; i++) {
    assert.ok(k.scores[i].p <= k.scores[i - 1].p, "shortlist must be ranked");
  }
});

/* The bug itself, reproduced from the numbers that caused it. */
test("a strong home favourite still has 1-1 as its modal scoreline", () => {
  const k = marketsFor(1.93, 1.02);
  assert.strictEqual(k.score, "1-1", "if this changes the premise below has moved");
  assert.ok(k.home > k.draw && k.home > k.away, "and yet home win is the likely outcome");
  assert.strictEqual(G.gradeLabel("Home win", 1, 1), false,
    "which is exactly why the pair read as a contradiction");
});

test("the scoreline chosen for a tip is one that tip survives", () => {
  const B = require("../lib/build.js");
  const pick = B.scoreForTip;
  assert.strictEqual(typeof pick, "function", "scoreForTip must be exported to be testable");

  for (const shape of SHAPES) {
    const k = marketsFor(shape.lh, shape.la);
    for (const tip of ["Home win", "Away win", "Draw", "1X, home or draw",
                       "X2, draw or away", "Over 1.5", "Over 2.5",
                       "Both teams score"]) {
      const s = pick(k, tip);
      assert.match(s, /^\d+-\d+$/, shape.name + " / " + tip + " gave " + s);
      const [h, a] = s.split("-").map(Number);
      const verdict = G.gradeLabel(tip, h, a);
      assert.notStrictEqual(verdict, false,
        shape.name + ": published " + s + " beside tip \"" + tip + "\", which loses on it");
    }
  }
});

/* A market a final score cannot settle has nothing to disagree with, so the
   ordinary scoreline stands - no reaching for an alternative that solves a
   conflict which does not exist. */
test("a tip a scoreline cannot settle leaves the scoreline alone", () => {
  const B = require("../lib/build.js");
  const k = marketsFor(1.5, 1.2);
  assert.strictEqual(G.gradeLabel("First half goal", 2, 1), null,
    "precondition: a final score cannot settle this market");
  assert.strictEqual(B.scoreForTip(k, "First half goal"),
                     B.scoreForTip(k, "Over 1.5"),
                     "same fixture, same scoreline - the tip changed nothing");
});

test("a missing shortlist degrades to the mode instead of throwing", () => {
  const B = require("../lib/build.js");
  assert.strictEqual(B.scoreForTip({ score: "2-1" }, "Home win"), "2-1");
  assert.strictEqual(B.scoreForTip({ score: "2-1" }, null), "2-1");
  /* No markets object at all: nothing to publish, and nothing thrown either. */
  assert.ok(!B.scoreForTip(null, "Home win"));
});

/* The end-to-end guard. Runs over the real published payload when one is on
   disk, so a regression anywhere between the model and the file is caught by
   the reader's own test rather than by a reader. */
test("no fixture in the built payload loses its own tip on its own scoreline", () => {
  let payload;
  try {
    payload = require("../public/predictions.json");
  } catch (e) {
    return; // nothing baked locally; the shape tests above still ran
  }
  const bad = [];
  for (const f of (payload.fixtures || []).concat(payload.results || [])) {
    if (!f || !f.tip || !/^\d+-\d+$/.test(f.score || "")) continue;
    const [h, a] = f.score.split("-").map(Number);
    if (G.gradeLabel(f.tip, h, a) === false) {
      bad.push(f.home + " v " + f.away + ": score " + f.score + " beside tip \"" + f.tip + "\"");
    }
  }
  assert.deepStrictEqual(bad, [], bad.length + " self-contradicting fixture(s)");
});

/* ------------------------------------------------- percentages that add up */

/* Home, draw and away are one split of one certainty. Rounding each on its own
   printed 37 / 27 / 37 for a fixture that was exactly 36.6 / 26.8 / 36.6 -
   101%, on a page whose whole business is numbers. */
const P = require("../lib/pages.js");

test("three shares always print as a hundred", () => {
  const cases = [
    [0.366, 0.268, 0.366],   // the fixture that was reported
    [0.5378, 0.2491, 0.2132],
    [0.3333, 0.3333, 0.3334],
    [0.6228, 0.1891, 0.1881],
    [0.05, 0.05, 0.90],
    [0.499, 0.002, 0.499],
  ];
  for (const c of cases) {
    const out = P.split100(c);
    const sum = out.reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 100, c.join("/") + " printed as " + out.join("/"));
    /* and no share may drift more than a point from its true value */
    c.forEach((v, i) => {
      assert.ok(Math.abs(out[i] - v * 100) <= 1.0 + 1e-9,
        "share " + i + " of " + c.join("/") + " printed " + out[i]);
    });
  }
});

test("the reported case specifically no longer reads 101", () => {
  const out = P.split100([0.366, 0.268, 0.366]);
  assert.strictEqual(out.reduce((a, b) => a + b, 0), 100);
  assert.ok(!(out[0] === 37 && out[1] === 27 && out[2] === 37));
});

test("values that do not sum to one are normalised, not printed raw", () => {
  const out = P.split100([0.30, 0.20, 0.30]);   // sums to 0.8
  assert.strictEqual(out.reduce((a, b) => a + b, 0), 100);
});

test("all-zero input does not invent a hundred percent", () => {
  const out = P.split100([0, 0, 0]);
  assert.ok(out.every(v => v === null || v === 0), "got " + JSON.stringify(out));
});

/* Coherence alone is not enough, and chasing it blindly made things worse.
   Taking the first scoreline the tip merely survives printed 1-1 on 87% of the
   card: a draw satisfies both 1X and X2, two goals clears Over 1.5, and 1-1 is
   the modal cell for most fixtures. Every number was defensible and the board
   was useless - a page of identical draws beside tips that mostly favour a
   side. A scoreline has to agree with the model's lean as well as the tip. */

test("the scoreline follows the model's lean, not just the tip", () => {
  const B = require("../lib/build.js");
  const homeFav = marketsFor(1.93, 1.02);
  assert.ok(homeFav.home > homeFav.draw, "precondition: home is favoured");
  const s = B.scoreForTip(homeFav, "1X, home or draw");
  const [h, a] = s.split("-").map(Number);
  assert.ok(h > a, `1X on a home favourite should show a home win, got ${s}`);

  const awayFav = marketsFor(0.95, 1.90);
  assert.ok(awayFav.away > awayFav.draw, "precondition: away is favoured");
  const s2 = B.scoreForTip(awayFav, "X2, draw or away");
  const [h2, a2] = s2.split("-").map(Number);
  assert.ok(a2 > h2, `X2 on an away favourite should show an away win, got ${s2}`);
});

/* Where the model really does favour the draw, 1-1 is the honest answer and
   must still be reachable - the fix is variety that reflects the model, not
   variety for its own sake. */
test("a genuinely drawish fixture may still show a draw", () => {
  const B = require("../lib/build.js");
  const k = marketsFor(1.02, 1.02);
  const s = B.scoreForTip(k, "1X, home or draw");
  const [h, a] = s.split("-").map(Number);
  if (k.draw >= k.home && k.draw >= k.away) {
    assert.strictEqual(h, a, "an evenly matched, low-scoring game may draw");
  }
  assert.notStrictEqual(GRADE_OK(s, "1X, home or draw"), false);
  function GRADE_OK(sc, tip) {
    const [x, y] = sc.split("-").map(Number);
    return G.gradeLabel(tip, x, y);
  }
});

/* The measurement that caught it: no single scoreline may dominate the board.
   Runs over the built payload, so it fails on the real card rather than on a
   shape chosen to pass. */
test("no one scoreline takes over the whole card", () => {
  let payload;
  try { payload = require("../public/predictions.json"); } catch (e) { return; }
  const counts = {};
  let total = 0;
  for (const f of payload.fixtures || []) {
    if (!/^\d+-\d+$/.test(f.score || "")) continue;
    counts[f.score] = (counts[f.score] || 0) + 1;
    total++;
  }
  if (total < 50) return;
  const [top, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const share = n / total;
  assert.ok(share < 0.55,
    `"${top}" is ${(share * 100).toFixed(0)}% of ${total} fixtures - ` +
    `a board of one scoreline tells the reader nothing`);
});
