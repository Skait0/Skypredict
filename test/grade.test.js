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

/* WIN EITHER HALF WAS PUBLISHED AND NEVER GRADED. The label names a team, so
   it matched nothing here and fell through to null - the same silence a market
   we genuinely cannot settle returns, which is why nobody noticed. */
const WH = (hth, hta) => ({ hth, hta, home: "Arsenal", away: "Spurs" });

test("a side that led at the interval won a half", () => {
  assert.strictEqual(gradeLabel("Arsenal to win a half", 1, 1, WH(1, 0)), true);
});
test("a side that won the second half won a half", () => {
  /* 1-1 at the break, 3-2 at the end: Arsenal took the second 2-1. */
  assert.strictEqual(gradeLabel("Arsenal to win a half", 3, 2, WH(1, 1)), true);
});
test("two drawn halves is a miss, not a void", () => {
  assert.strictEqual(gradeLabel("Arsenal to win a half", 1, 1, WH(0, 0)), false);
});
test("the away side is graded on the away column", () => {
  assert.strictEqual(gradeLabel("Spurs to win a half", 1, 2, WH(0, 1)), true);
  assert.strictEqual(gradeLabel("Spurs to win a half", 2, 1, WH(1, 0)), false);
});
test("a 2-0 win whose halves were both 1-0 still lands", () => {
  assert.strictEqual(gradeLabel("Arsenal to win a half", 2, 0, WH(1, 0)), true);
});
test("without the interval, or without the teams, it is unknowable", () => {
  assert.strictEqual(gradeLabel("Arsenal to win a half", 2, 0, null), null);
  assert.strictEqual(gradeLabel("Arsenal to win a half", 2, 0, { hth: 1, hta: 0 }), null,
    "a name the caller cannot place is not a miss");
  assert.strictEqual(gradeLabel("Chelsea to win a half", 2, 0, WH(1, 0)), null,
    "a team that is not in this fixture is not a miss either");
});
test("the negative is left ungraded rather than guessed at", () => {
  /* Only the Y side is ever offered, and "Arsenal not to win a half" would
     otherwise parse as a team called "Arsenal not". */
  assert.strictEqual(gradeLabel("Arsenal not to win a half", 2, 0, WH(1, 0)), null);
});

test("both graders settle win-either-half the same way", () => {
  const { marketOf } = require("../lib/grade.js");
  assert.strictEqual(marketOf("Arsenal to win a half"), "Win either half",
    "the live record must land on the name the backtest writes");
  /* model.js grades it from the same arithmetic in gradeEveryMarket: whichever
     half the side took. Checked here across every split of a 2-1. */
  for (const [hth, hta] of [[0,0],[1,0],[0,1],[1,1],[2,0],[2,1]]) {
    const hg = 2, ag = 1;
    if (hth > hg || hta > ag) continue;
    const mine = gradeLabel("Arsenal to win a half", hg, ag, WH(hth, hta));
    const took = (hth > hta) || ((hg - hth) > (ag - hta));
    assert.strictEqual(mine, took, `${hth}-${hta} at the break of a ${hg}-${ag}`);
  }
});

test("the confirm paths hand the grader the teams, not only the interval", () => {
  /* Teaching grade.js the market is half the fix: a caller that passes
     { hth, hta } alone leaves every one of these tips ungraded exactly as
     before, and silently. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "build.js"), "utf8");
  const calls = src.match(/GRADE\.gradeLabel\([^;]*?\{ hth[^;]*?\}/g) || [];
  assert.ok(calls.length >= 2, "both score-confirming paths must be here");
  for (const c of calls)
    assert.match(c, /home:.*away:/s,
      "a half-time context without the teams cannot settle win-either-half");
});
