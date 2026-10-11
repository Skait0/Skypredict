"use strict";

/**
 * 3 or more goals in a row - No (owner, 11 Oct 2026). Goal order was shown
 * random given the score on 3,711 matches, so the page prices the run from
 * the scoring rates alone; these pin that maths to a brute-force count and the
 * research figures, and the grading to the score where the score decides it.
 */

const test = require("node:test");
const assert = require("node:assert");
const { fn } = require("./books.js");
const K = new Function(fn("nr3Poisson") + fn("nr3Grade") + "return {nr3Poisson, nr3Grade};")();

function brute(lh, la) {
  const lam = lh + la, p = lh / lam, out = { any: 0, h: 0, a: 0 };
  let w = Math.exp(-lam);
  for (let n = 0; n <= 14; n++) {
    if (n) w = w * lam / n;
    let any = 0, h = 0, a = 0;
    for (let m = 0; m < (1 << n); m++) {
      let pr = 1, runH = 0, runA = 0, bigH = 0, bigA = 0;
      for (let i = 0; i < n; i++) {
        const home = (m >> i) & 1; pr *= home ? p : 1 - p;
        if (home) { runH++; runA = 0; } else { runA++; runH = 0; }
        bigH = Math.max(bigH, runH); bigA = Math.max(bigA, runA);
      }
      if (bigH < 3) h += pr; if (bigA < 3) a += pr; if (bigH < 3 && bigA < 3) any += pr;
    }
    out.any += w * any; out.h += w * h; out.a += w * a;
  }
  return out;
}

test("the run maths matches a brute-force count of every goal order", () => {
  for (const [lh, la] of [[1.27, 1.35], [2.4, 0.84], [0.6, 0.5]]) {
    const got = K.nr3Poisson(lh, la), want = brute(lh, la);
    for (const w of ["any", "h", "a"]) assert.ok(Math.abs(got[w] - want[w]) < 1e-9, `${lh}/${la} ${w}: ${got[w]} v ${want[w]}`);
  }
});

test("and lands on the research figures (Crystal Palace v Forest, 11 Oct 2026)", () => {
  const r = K.nr3Poisson(1.27, 1.35);
  assert.ok(Math.abs(r.any - 0.821) < 0.002 && Math.abs(r.h - 0.917) < 0.002 && Math.abs(r.a - 0.902) < 0.002);
});

test("graded from the score where the score decides it, otherwise left open", () => {
  assert.strictEqual(K.nr3Grade(2, 2, "any"), true, "two each cannot hold a run of 3");
  assert.strictEqual(K.nr3Grade(3, 0, "any"), false, "three against none must");
  assert.strictEqual(K.nr3Grade(3, 1, "any"), null, "a 3-1 needs the goal order");
  assert.strictEqual(K.nr3Grade(3, 1, "a"), true, "the away side scored one");
  assert.strictEqual(K.nr3Grade(0, 4, "h"), true);
  assert.strictEqual(K.nr3Grade(0, 4, "a"), false);
});

test("with the goal order, the open cases settle too", () => {
  assert.strictEqual(K.nr3Grade(3, 1, "any", "HHAH"), true, "H H A H: no run of three");
  assert.strictEqual(K.nr3Grade(3, 1, "any", "AHHH"), false, "the last three in a row");
  assert.strictEqual(K.nr3Grade(3, 1, "a", "AHHH"), true, "away never ran three");
  assert.strictEqual(K.nr3Grade(2, 4, "h", "AAAHHA"), true);
  assert.strictEqual(K.nr3Grade(2, 4, "a", "AAAHHA"), false);
  assert.strictEqual(K.nr3Grade(3, 1, "any", "HHA"), null, "an order that does not rebuild the score is ignored");
});

test("the slip grader settles a 3-in-a-row leg without throwing (11 Oct 2026)", () => {
  /* gradeCode named its argument `code`; the first cut said `c`, which threw
     at settle time - and settling runs inside load(). Run it for real. */
  const g = new Function(fn("nr3Grade") + fn("gradeCode") + "return gradeCode;")();
  assert.strictEqual(g("NR3_ANY", 2, 2), "win");
  assert.strictEqual(g("NR3_H", 3, 0), "lose");
  assert.strictEqual(g("NR3_ANY", 3, 1), null, "open: left for the goal order");
});
