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

/* A market a final score cannot settle has nothing to disagree with, so it
   places no constraint at all - the scoreline is drawn from the whole
   distribution exactly as it would be with no tip.
   This used to assert that such a tip gave the same answer as "Over 1.5",
   which was true only while the scoreline ignored the tip entirely. It does
   not any more: Over 1.5 rules out 0-0, 1-0 and 0-1, so it draws from a
   smaller pool. The contract worth pinning is the one below - an unsettleable
   tip constrains nothing. */
test("a tip a scoreline cannot settle constrains nothing", () => {
  const B = require("../lib/build.js");
  const k = marketsFor(1.5, 1.2);
  assert.strictEqual(G.gradeLabel("First half goal", 2, 1), null,
    "precondition: a final score cannot settle this market");
  assert.strictEqual(B.scoreForTip(k, "First half goal"),
                     B.scoreForTip(k, null),
                     "an unsettleable tip must land where no tip lands");
});

/* The scoreline is drawn from a distribution, so it has to be drawn the SAME
   way every time or a fixture would change its result between builds. */
/* Seeds must look like real ones.
   scoreForTip hashes its seed with FNV-1a, which distributes badly over short,
   near-identical strings: "f0".."f199" lands 28% of draws in one bucket and
   none in three others (chi-square 203 against a 16.9 threshold). Probing with
   those measures the hash, not the sampler - it showed 3-1 taking 28% of a
   fixture where its true share is 9%, and sent me looking for a sampling bug
   that was not there. Production seeds are "date|home|away", which tests clean
   at chi-square 5.9, so tests use the same shape. */
function seedFor(i) {
  return "2026-09-0" + (1 + (i % 9)) + "|Team " + i + "|Opponent " + (i * 7 + 3);
}

test("the same fixture always gets the same scoreline", () => {
  const B = require("../lib/build.js");
  const k = marketsFor(1.6, 1.25);
  const seed = "2026-09-05|Arsenal|Chelsea";
  const first = B.scoreForTip(k, "Over 1.5", seed);
  for (let i = 0; i < 20; i++) {
    assert.strictEqual(B.scoreForTip(k, "Over 1.5", seed), first,
      "a fixture's scoreline must be stable across rebuilds");
  }
});

test("different fixtures do not all get the same scoreline", () => {
  const B = require("../lib/build.js");
  const k = marketsFor(1.6, 1.25);
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(B.scoreForTip(k, "Over 1.5", seedFor(i)));
  assert.ok(seen.size >= 4,
    "one distribution should still spread across several scorelines, got " +
    [...seen].join(", "));
});

/* The point of the change: a board has to be able to show the results football
   actually produces. Draws are 29% of real results and were 0% of ours. */
test("draws and low-scoring games are reachable at all", () => {
  const B = require("../lib/build.js");
  const k = marketsFor(1.45, 1.30);
  const out = [];
  for (let i = 0; i < 200; i++) out.push(B.scoreForTip(k, "1X, home or draw", seedFor(i)));
  const draws = out.filter(s => { const [h, a] = s.split("-").map(Number); return h === a; });
  assert.ok(draws.length > 0, "a level scoreline must be reachable - it never was before");
  /* THIS NUMBER WAS 6 AND IS NOW 4, deliberately, and the trade is worth
     stating. The goals gate removes every 0 and 1 goal cell on a fixture this
     shape (2.75 expected goals, 76% over 1.5), which costs two of the six.
     What it buys is that the board stops contradicting its own goals row,
     which was 19% of the live card.
     The property this assertion actually protects - a card that does not show
     the same scoreline everywhere - was checked at card level instead, on the
     real board: 280 scorelines came out 32% draws and spread 0g=6, 1g=17,
     2g=110, 3g=84, 4+=63. Variety survived; it moved to where the model says
     the goals are. */
  assert.ok(new Set(out).size >= 4, "one distribution must still spread across several scorelines");

  /* THE ONE-GOAL ASSERTION MOVED, and this is why rather than a weakening.
     This shape is 1.45 + 1.30 = 2.75 expected goals, which the same fixture
     publishes as roughly 76% for over 1.5. A 0-0 or 1-0 here is not a quiet
     game honestly reported, it is the board contradicting its own goals row -
     the "barca predicts 0-0 at 69 percent" report, which measured at 19% of
     the live card. The goals gate in scoreForTip now refuses it.
     The intent of this assertion is still guarded, on a fixture where a quiet
     scoreline is the honest answer: see "a low-scoring fixture may still print
     0-0 or 1-0" below, which uses 0.75 + 0.70. */
  const kQuiet = marketsFor(0.75, 0.70);
  const quiet = [];
  for (let i = 0; i < 200; i++) quiet.push(B.scoreForTip(kQuiet, "1X, home or draw", seedFor(i)));
  const low = quiet.filter(s => { const [h, a] = s.split("-").map(Number); return h + a <= 1; });
  assert.ok(low.length > 0, "a game of one goal or none must still be reachable where it fits");
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

/* This used to assert that a 1X tip on a home favourite always showed a home
   win, and an X2 on an away favourite an away win. That rule is what made
   draws unpublishable: it fired on every level scoreline, all 130 of them on a
   276-fixture board, and the card ended up with 0% draws against 29% in
   reality.
   It is gone. A draw satisfies 1X, so a draw is a legitimate thing to print
   beside it - across 300 seeds this fixture gives 177 home wins and 123 draws,
   which is roughly the split the model itself implies.
   What must NEVER happen is the scoreline losing the tip. That is the real
   invariant, it is checked over the whole distribution rather than one draw,
   and it is the thing the lean rule was a clumsy proxy for. */
test("the scoreline never contradicts its own tip, over the whole distribution", () => {
  const B = require("../lib/build.js");

  const homeFav = marketsFor(1.93, 1.02);
  assert.ok(homeFav.home > homeFav.draw, "precondition: home is favoured");
  let sawDraw = false, sawHome = false;
  for (let i = 0; i < 200; i++) {
    const [h, a] = B.scoreForTip(homeFav, "1X, home or draw", seedFor(i)).split("-").map(Number);
    assert.ok(h >= a, `1X must never show an away win, got ${h}-${a}`);
    if (h === a) sawDraw = true; else sawHome = true;
  }
  assert.ok(sawHome, "a home favourite should mostly show a home win");
  assert.ok(sawDraw, "and a draw must still be reachable - that was the bug");

  const awayFav = marketsFor(0.95, 1.90);
  assert.ok(awayFav.away > awayFav.draw, "precondition: away is favoured");
  for (let i = 0; i < 200; i++) {
    const [h, a] = B.scoreForTip(awayFav, "X2, draw or away", seedFor(i)).split("-").map(Number);
    assert.ok(a >= h, `X2 must never show a home win, got ${h}-${a}`);
  }
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

/* ---------------------------------------------- coherence with the GOALS row

   The gates above stop a scoreline contradicting the fixture's home/draw/away
   numbers. Nothing stopped it contradicting the GOALS numbers, and the board
   publishes those in the same row.

   Reported twice by the owner - "barca predicts 0-0 at 69 percent". Measured
   on the live board it was not one fixture: 54 of 280 scorelines (19%) showed
   0 or 1 goal on a fixture the same row called 70%+ for over 1.5. Chelsea v
   Hull printed 0-0 beside "78% over 1.5" and an expected 2.85 goals.

   Cause: DRAW_WEIGHT damps draws to 0.60 to correct a real selection effect,
   which pushes 1-1 below 1-0 - and 1-0 is a one-goal game on a card expecting
   nearly three. */

test("a fixture that expects goals does not print a 0 or 1 goal scoreline", () => {
  const B = require("../lib/build.js");
  const GOALY = [
    { name: "even, high scoring", lh: 1.85, la: 1.85 },
    { name: "goal-heavy home favourite", lh: 2.60, la: 1.40 },
    { name: "the reported shape", lh: 1.35, la: 1.50 },
  ];
  const bad = [];
  for (const shape of GOALY) {
    const k = marketsFor(shape.lh, shape.la);
    if (!(k.o15 >= 0.70)) continue;   // the guard only claims to act above this
    for (const tip of ["Home win", "Away win", "Draw", "1X, home or draw",
                       "X2, draw or away", "Over 1.5"]) {
      const s = B.scoreForTip(k, tip, shape.name + "|" + tip);
      const m = /^(\d+)-(\d+)$/.exec(String(s || ""));
      if (!m) continue;
      const goals = Number(m[1]) + Number(m[2]);
      if (goals <= 1) bad.push(shape.name + " / " + tip + " -> " + s + " (o15 " + k.o15.toFixed(2) + ")");
    }
  }
  assert.deepEqual(bad, [], "scorelines contradicting their own over-1.5 call: " + bad.join("; "));
});

test("the tip still wins when the two coherence rules disagree", () => {
  /* The ordering that matters. A scoreline losing its own tip is the worse
     contradiction, so the goals gate must never be allowed to cause one - it
     is applied after the tip filter and may not empty the pool.
     "Under 2.5" on a goal-heavy fixture is where the two pull hardest. */
  const B = require("../lib/build.js");
  const G2 = require("../lib/grade.js");
  const k = marketsFor(2.60, 1.40);
  for (const tip of ["Under 2.5", "Draw", "Home win"]) {
    const s = B.scoreForTip(k, tip, "clash|" + tip);
    const m = /^(\d+)-(\d+)$/.exec(String(s || ""));
    assert.ok(m, tip + " produced no scoreline");
    assert.notStrictEqual(G2.gradeLabel(tip, Number(m[1]), Number(m[2])), false,
      tip + " got a scoreline it loses: " + s);
  }
});

test("a low-scoring fixture may still print 0-0 or 1-0", () => {
  /* The guard is conditional, not a blanket ban on quiet games. Where the
     model does NOT expect goals, a one-goal scoreline is the honest answer and
     must stay reachable. */
  const B = require("../lib/build.js");
  const k = marketsFor(0.75, 0.70);
  assert.ok(k.o15 < 0.70, "premise: this shape should not be a goals fixture");
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(B.scoreForTip(k, "1X, home or draw", "quiet|" + i));
  const low = [...seen].filter((s) => {
    const m = /^(\d+)-(\d+)$/.exec(String(s || ""));
    return m && Number(m[1]) + Number(m[2]) <= 1;
  });
  assert.ok(low.length > 0, "a quiet fixture should still be able to print a quiet score");
});
