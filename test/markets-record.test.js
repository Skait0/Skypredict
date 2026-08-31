"use strict";

/**
 * Every market gets graded, not just the one that headlined.
 *
 * The record used to be built from `bestTip` alone, and bestTip can only ever
 * return a match result, a double chance, or Over 1.5. So every other market
 * the slip builder offers - team goals, Over 2.5, both teams to score, the
 * first half - had no record at all, and no route to ever earning one. They
 * were being served to people on a site whose whole claim is that every tip is
 * checked.
 *
 * That surfaced when team over 0.5 was made a default and the wizard began
 * leading with it on lopsided games. The instinct to distrust it was right; the
 * conclusion was wrong. Graded properly over 1,821 held-out matches it comes in
 * at 83% against a stated 78% - one of the strongest and best-calibrated
 * markets on the board.
 *
 * The bug this file exists to prevent is subtler than a wrong count, and it
 * shipped: `markets()` returns camelCase (hO05, aO05, fhO05) while the payload
 * uses snake_case (h_o05). Grading read the payload names, got undefined, and
 * `undefined >= undefined` is false - so it silently graded "did the AWAY team
 * score" on every match. The row still looked entirely plausible. Only
 * comparing what we predicted against what happened exposed it.
 */

const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");

/* A full set of probabilities using the names markets() really emits. */
const K = { home: .75, draw: .15, away: .10, dc1x: .90, dcx2: .25,
  o15: .80, o25: .60, o35: .35, btts: .50,
  hO05: .93, aO05: .55, hO15: .75, aO15: .25, fhO05: .70 };

function grade(k, mm) { const acc = {}; M.gradeEveryMarket(acc, k, mm); return acc; }
const row = (acc, name) => acc[name] || { total: 0, correct: 0, exp: 0 };

test("a 3-0 grades every market the way a person would", () => {
  const a = grade(K, { hg: 3, ag: 0 });
  const won = (n) => row(a, n).correct === 1;
  assert.ok(won("Match result"), "home was likeliest and home won");
  assert.ok(won("Double chance"), "1X was preferred and the home side did not lose");
  assert.ok(won("Over 1.5"), "three goals");
  assert.ok(won("Over 2.5"), "three goals");
  assert.ok(!won("Over 3.5"), "three is not more than three and a half");
  assert.ok(!won("Both to score"), "the away side did not score");
  assert.ok(won("Team over 0.5"), "the favoured side scored");
  assert.ok(won("Team over 1.5"), "the favoured side scored three");
});

/**
 * The bug, pinned three ways.
 */
test("it backs the side the model prefers, not a fixed one", () => {
  /* Home is the favourite here and only home scored. Reading the wrong field
     names made this grade the away side, which loses. */
  const a = grade(K, { hg: 2, ag: 0 });
  assert.strictEqual(row(a, "Team over 0.5").correct, 1,
    "graded the wrong side: the model favours home (hO05 .93 v aO05 .55) and home scored");
});

test("and it follows the preference when the away side is favoured", () => {
  const away = Object.assign({}, K, { hO05: .40, aO05: .88, hO15: .20, aO15: .60 });
  const a = grade(away, { hg: 0, ag: 2 });
  assert.strictEqual(row(a, "Team over 0.5").correct, 1);
  const b = grade(away, { hg: 2, ag: 0 });
  assert.strictEqual(row(b, "Team over 0.5").correct, 0,
    "the away side was favoured and did not score, so this must be a loss");
});

test("a missing probability throws rather than grading something else", () => {
  /* The original failure was silent. An undefined made the comparison false and
     the away side was graded every time, and the resulting row looked fine. */
  const bad = Object.assign({}, K); delete bad.hO05;
  assert.throws(() => grade(bad, { hg: 1, ag: 1 }), /missing probability field/,
    "an absent field must be loud, not quietly resolved to one side");
});

/**
 * The caller-level guard. This is the test that would have caught it: it does
 * not trust either name list, it asks markets() what it actually emits.
 */
test("the fields grading reads are the fields markets() emits", () => {
  const n = 8, mat = [];
  for (let i = 0; i < n; i++) {
    const r = new Float64Array(n);
    for (let j = 0; j < n; j++) r[j] = Math.exp(-(i + j)) / 10;
    mat.push(r);
  }
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += mat[i][j];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) mat[i][j] /= s;
  const k = M.markets({ matrix: mat, lh: 1.4, la: 1.1 }, { k: 6 });

  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "model.js"), "utf8");
  const body = src.slice(src.indexOf("function gradeEveryMarket("),
                         src.indexOf("function backtest("));
  const used = [...new Set([...body.matchAll(/\bk\.([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((m) => m[1]))];
  assert.ok(used.length >= 10, "expected grading to read many fields, saw " + used.length);
  used.forEach((f) => assert.ok(typeof k[f] === "number",
    "gradeEveryMarket reads k." + f + ", which markets() does not emit as a number. " +
    "This is the snake_case/camelCase mismatch that silently graded the away side."));
});

test("what we predicted is recorded alongside what happened", () => {
  /* Without this column a wrong grading still produces a believable count. It
     is the only thing that exposed the bug above. */
  const a = grade(K, { hg: 3, ag: 0 });
  assert.ok(Math.abs(row(a, "Team over 0.5").exp - 0.93) < 1e-9,
    "the favoured side's probability must be the one recorded");
  assert.ok(Math.abs(row(a, "Over 1.5").exp - 0.80) < 1e-9);
  assert.ok(Math.abs(row(a, "Match result").exp - 0.75) < 1e-9,
    "the likeliest outcome's probability, since that is what would be backed");
});

test("the first half is graded only when a half-time score came with the match", () => {
  assert.strictEqual(row(grade(K, { hg: 1, ag: 1 }), "First-half goal").total, 0);
  const a = grade(K, { hg: 1, ag: 1, hth: 1, hta: 0 });
  assert.strictEqual(row(a, "First-half goal").total, 1);
  assert.strictEqual(row(a, "First-half goal").correct, 1);
});

test("a match with no final score grades nothing", () => {
  assert.deepStrictEqual(grade(K, { hg: null, ag: 2 }), {});
  assert.deepStrictEqual(grade(K, {}), {});
});

test("counts accumulate across matches", () => {
  const acc = {};
  M.gradeEveryMarket(acc, K, { hg: 3, ag: 0 });
  M.gradeEveryMarket(acc, K, { hg: 0, ag: 0 });
  assert.strictEqual(row(acc, "Over 1.5").total, 2);
  assert.strictEqual(row(acc, "Over 1.5").correct, 1);
});

/* ------------------------------------------------------------ the wiring */

test("the build runs a wider window for markets than for the headline", () => {
  const b = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(b, /days: cfg\.marketDays \|\| 120/,
    "market verification should not be limited to the 21-day headline window");
  assert.match(b, /if \(record && marketRecord\) record\.markets = marketRecord;/,
    "the market rows are never attached to the payload");
});

test("the market families match the names the record is grouped by", () => {
  /* gradeEveryMarket names families directly. lib/grade.js names them from tip
     labels, and index.html names them from market codes. All three must agree
     or a market can never be found in the record. */
  const G = require("../lib/grade.js");
  const a = grade(K, { hg: 3, ag: 0, hth: 1, hta: 0 });
  const named = Object.keys(a);
  ["Match result", "Double chance", "Over 1.5", "Over 2.5", "Both to score"]
    .forEach((f) => assert.ok(named.includes(f), "missing family: " + f));
  assert.strictEqual(G.marketOf("Levante over 0.5 goals"), "Team over 0.5");
  assert.ok(named.includes("Team over 0.5"),
    "grade.js maps team goals to 'Team over 0.5'; grading must use the same name");
});
