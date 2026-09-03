"use strict";

/**
 * A market you can switch on and get nothing from.
 *
 * Reported: 'draw only says "no games to conjure"', and then, decisively,
 * "even after i used all upcoming". That second line is the whole diagnosis.
 * "All upcoming" widens everything a user can widen, so a filter that survives
 * it is not a filter over FIXTURES - and the path pins the per-leg target at
 * 1.01, which does not widen the band, it narrows it to 1.01 x 1.40 = 1.41.
 *
 * The builder chooses each fixture's market from a band around a per-leg
 * target: g x 0.92 up to g x OVERSHOOT. g came from the Slip style - 1.4 for
 * Balanced - so the band accepted legs of roughly 1.3 to 2.0. That is right
 * while the enabled markets can be bought at those prices, and fatal the
 * moment they cannot. A draw is priced around 3.2. Every draw overshot the
 * band; nothing sat under it; bestOf returned null on EVERY fixture; the slip
 * came back empty. Measured on the live board before and after, same code
 * either side of these two lines: 0 legs, then 5 at a x100 target and 6 on
 * "all upcoming".
 *
 * The fix asks the board what a leg costs instead of assuming, and the shape
 * of it is the point: max(style, reachable). With the usual spread of markets
 * on, reachable lands near 1.05, the style stays in charge, and no existing
 * slip changes. It only bites when the markets have been narrowed to ones that
 * are inherently long - and then it tells the truth, that a slip of draws
 * reaches x100 in five legs rather than fourteen.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The real function, with what it closes over injected - a re-implementation
   would quietly "fix" the very assumption under test. */
function liftReachable() {
  const i = src.indexOf("    function reachablePerLeg(){");
  assert.ok(i > 0, "reachablePerLeg must exist in wspBuild");
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  const body = src.slice(i, k + 1);
  return new Function("list", "hasReal", "priced", "safeUnpriced",
    body + "\nreturn reachablePerLeg();");
}
const reachable = liftReachable();

const hasReal      = (c) => !!(c.f && c.f.sportyOdds && c.f.sportyOdds[c.code] > 1.01);
const priced       = (f) => !!(f && f.sportyOdds && Object.keys(f.sportyOdds).length);
const safeUnpriced = (c) => ["1", "2", "X", "1X", "X2", "12"].indexOf(c) >= 0;

/* A fixture whose candidates carry real bookmaker prices. */
function fx(id, prices) {
  const f = { sportyOdds: {} };
  for (const c in prices) f.sportyOdds[c] = prices[c];
  return { f, id, cands: Object.keys(prices).map((c) => ({ f, id, code: c, p: 0.5, od: prices[c] })) };
}

/* The band the builder actually uses, read from the source rather than typed
   in again - so retuning OVERSHOOT moves the test with it. */
const OVERSHOOT = Number(/var OVERSHOOT=([\d.]+);/.exec(src)[1]);
const LO = Number(/var lo=g\*([\d.]+), hi=g\*OVERSHOOT;/.exec(src)[1]);
const inBand = (od, g) => od >= g * LO && od <= g * OVERSHOOT;

/* ------------------------------------------------ what a leg actually costs */

test("a draw-only board reports what a draw really costs", () => {
  const list = [fx("a", { X: 3.10 }), fx("b", { X: 3.30 }), fx("c", { X: 2.95 })];
  assert.strictEqual(reachable(list, hasReal, priced, safeUnpriced), 3.10,
    "the median of each fixture's cheapest bookable leg");
});

test("a normal board still reports the short markets, so the style stays in charge", () => {
  const list = [
    fx("a", { "1X": 1.04, "OVER_1.5": 1.12, X: 3.20 }),
    fx("b", { "1X": 1.08, "OVER_1.5": 1.20, X: 3.40 }),
    fx("c", { "1X": 1.06, "OVER_1.5": 1.15, X: 3.05 })
  ];
  const r = reachable(list, hasReal, priced, safeUnpriced);
  assert.ok(r < 1.4,
    "with cheap markets on the board this must stay UNDER the Slip style " +
    "figure, or max() would raise the target and change every existing slip");
});

test("the median is a numeric one", () => {
  /* Array.sort() is lexicographic by default, and on a board of 2.x and 3.x
     odds it happens to give the same order - so the bug hides until the day a
     double-digit price turns up. That day is any mismatch where the bookmaker
     lists nothing but 1X2 and the cheapest leg on the fixture is the underdog.
     Sorted as text, "11.00" files between "1.50" and "2.00" and the median
     becomes the longest leg on the board rather than the middle one. */
  const list = [fx("a", { "2": 11.00 }), fx("b", { "1X": 1.50 }), fx("c", { "1X": 2.00 })];
  assert.strictEqual(reachable(list, hasReal, priced, safeUnpriced), 2.00,
    "1.50, 2.00 and 11.00 have a median of 2.00");
});

/* ----------------------------------------------- the bug, and that it is gone */

test("the old target excluded every draw - band 1.29 to 1.96 against a 3.2 leg", () => {
  const per = 1.4, T = 100;
  const want = Math.max(4, Math.ceil(Math.log(T) / Math.log(per)));
  const g = Math.pow(T, 1 / want);
  assert.ok(!inBand(3.20, g),
    "if a 3.2 draw fits the old band the bug never existed and this test is " +
    "measuring nothing");
  /* Nothing under the band either: that is why bestOf fell through to null
     rather than settling for a shorter market. */
  assert.ok(3.20 > g * OVERSHOOT, "a draw overshoots rather than undershoots");
});

test("the new target admits it, because the leg count comes from the real cost", () => {
  const T = 100;
  const per = 1.4, reach = 3.10;
  const perEff = Math.max(per, reach);
  const want = Math.max(4, Math.ceil(Math.log(T) / Math.log(perEff)));
  const g = Math.pow(T, 1 / want);
  assert.ok(inBand(3.10, g),
    "a draw at the board's own median must sit in the band; got g=" + g.toFixed(2));
  assert.strictEqual(want, 5,
    "and x100 out of draws is five legs, not the fourteen a 1.4 target implies");
});

test('"all upcoming" widens the band instead of pinning it at 1.41', () => {
  /* The reported tell. This path takes every qualifying fixture, so its target
     exists only to choose each fixture's market - but flat at 1.01 it chose
     none at all. */
  const m = /g=WSP\.everyGame \? ([^:]+) : Math\.pow\(T,1\/want\);/.exec(src);
  assert.ok(m, "the everyGame target must still be a distinct branch");
  assert.match(m[1], /reach/,
    'the "all upcoming" target must be derived from the reachable cost; ' +
    "pinned at a constant it re-creates the empty-draw-slip bug on the one " +
    "setting users reach for when a slip comes back empty");
  const g = Math.max(1.01, 3.10 * 0.95);
  assert.ok(inBand(3.10, g), "and a draw must land in that band too");
});

/* --------------------------------------------------------- no free widening */

test("the target is raised by the board, never lowered", () => {
  assert.match(src, /var perEff=Math\.max\(per, reach\);/,
    "max, not min and not a replacement: the Slip style sets the ambition " +
    "and the board only sets a floor under it. Reversed, a board full of " +
    "cheap markets would drag every slip's target below the style the user " +
    "chose.");
  assert.match(src, /Math\.ceil\(Math\.log\(T\)\/Math\.log\(perEff\)\)/,
    "the leg count must use the effective target, or it asks for fourteen " +
    "legs of a market only six fixtures offer");
});
