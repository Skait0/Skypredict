"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { gradeLabel } = require("../lib/grade.js");
const M = require("../lib/model.js");

/* The cases that were wrong before there was one grader. Each of these was
   graded the other way by the page, and the full-time ledger was writing that
   verdict down as a result. */
test("a 1-1 does not land Over 2.5", () => {
  assert.strictEqual(gradeLabel("Over 2.5", 1, 1), false);
});
test("a 2-1 lands Over 2.5", () => {
  assert.strictEqual(gradeLabel("Over 2.5", 2, 1), true);
});
test("a goalless draw lands Under 2.5", () => {
  assert.strictEqual(gradeLabel("Under 2.5", 0, 0), true);
});
test("a 3-0 does not land Under 2.5", () => {
  assert.strictEqual(gradeLabel("Under 2.5", 3, 0), false);
});
test("a 1-1 lands Over 1.5", () => {
  assert.strictEqual(gradeLabel("Over 1.5", 1, 1), true);
});
test("a 1-0 does not land Over 1.5", () => {
  assert.strictEqual(gradeLabel("Over 1.5", 1, 0), false);
});
test("Over 3.5 is graded at its own line, not at 1.5", () => {
  assert.strictEqual(gradeLabel("Over 3.5", 2, 1), false);
  assert.strictEqual(gradeLabel("Over 3.5", 3, 1), true);
});

test("a draw is a miss for a home win, not a void", () => {
  assert.strictEqual(gradeLabel("Home win", 1, 1), false);
  assert.strictEqual(gradeLabel("Away win", 1, 1), false);
});

test("double chance reads its prefix, gloss and all", () => {
  assert.strictEqual(gradeLabel("1X, home or draw", 1, 1), true);
  assert.strictEqual(gradeLabel("1X, home or draw", 0, 1), false);
  assert.strictEqual(gradeLabel("X2, draw or away", 1, 2), true);
  assert.strictEqual(gradeLabel("X2, draw or away", 2, 1), false);
  assert.strictEqual(gradeLabel("12, any team to win", 1, 1), false);
  assert.strictEqual(gradeLabel("12, any team to win", 2, 1), true);
});

test("a combination is not mistaken for a plain goal line", () => {
  // 0-0: the draw half carries it, even with no goals.
  assert.strictEqual(gradeLabel("Draw or over 2.5", 0, 0), true);
  assert.strictEqual(gradeLabel("Draw or over 2.5", 2, 1), true);
  assert.strictEqual(gradeLabel("Draw or over 2.5", 1, 0), false);
  assert.strictEqual(gradeLabel("Draw or both teams score", 1, 1), true);
  assert.strictEqual(gradeLabel("Both score and over 2.5", 2, 1), true);
  assert.strictEqual(gradeLabel("Both score and over 2.5", 1, 1), false);
});

test("both teams to score", () => {
  assert.strictEqual(gradeLabel("Both teams score", 1, 1), true);
  assert.strictEqual(gradeLabel("Both teams score", 2, 0), false);
});

/* The two shapes that must never be guessed at. */
test("a first-half market is ungraded without a half-time score", () => {
  assert.strictEqual(gradeLabel("First half goal", 3, 0), null);
  assert.strictEqual(gradeLabel("First half goal", 3, 0, { hth: 1, hta: 0 }), true);
  assert.strictEqual(gradeLabel("First half goal", 3, 0, { hth: 0, hta: 0 }), false);
});
test("an unknown label is ungraded rather than guessed", () => {
  assert.strictEqual(gradeLabel("Corners over 9.5", 2, 1), null);
  assert.strictEqual(gradeLabel("", 2, 1), null);
  assert.strictEqual(gradeLabel(null, 2, 1), null);
});
test("a missing score is ungraded", () => {
  assert.strictEqual(gradeLabel("Home win", null, 1), null);
  assert.strictEqual(gradeLabel("Home win", 1, undefined), null);
});

/* The build grades the record with lib/model.js. Where both graders have an
   opinion they have to agree, or the same match is a hit in the results view
   and a miss in the record. gradeTip returns null for markets it does not
   cover (Over 1.5 among them) - those are the ledger's to fill, not a
   disagreement. */
test("the two graders agree wherever both will answer", () => {
  const scores = [[0,0],[1,0],[0,1],[1,1],[2,0],[2,1],[3,0],[2,2],[3,1],[4,0]];
  const labels = ["Home win","Away win","Draw","Over 2.5","Under 2.5",
    "Both teams score","1X, home or draw","X2, draw or away","12, any team to win",
    "Draw or over 2.5","Draw or both teams score","Both score and over 2.5"];
  for (const label of labels) {
    for (const [hg, ag] of scores) {
      const mine = gradeLabel(label, hg, ag);
      const theirs = M.gradeTip(label, { hg, ag });
      if (theirs === null || mine === null) continue;
      assert.strictEqual(mine, theirs,
        `${label} at ${hg}-${ag}: grade.js says ${mine}, model.js says ${theirs}`);
    }
  }
});
