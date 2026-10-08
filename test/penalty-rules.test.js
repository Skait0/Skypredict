// test/penalty-rules.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/penalty.js");

test("power zones: weak, green, over", () => {
  assert.strictEqual(P.strike(0, 0.30).kind, "weak");
  assert.strictEqual(P.strike(0, 0.70).kind, "green");
  assert.strictEqual(P.strike(0, 0.95).kind, "over");
  assert.strictEqual(P.strike(0, P.ZONES.weakBelow).kind, "green", "the edge belongs to green");
});

test("neighbours: same column other height, or same height next column", () => {
  assert.ok(P.neighbour(0, 3));            // left low / left high
  assert.ok(P.neighbour(0, 1));            // left low / middle low
  assert.ok(!P.neighbour(0, 2));           // left low / right low
  assert.ok(!P.neighbour(0, 4));           // diagonal
  assert.ok(!P.neighbour(1, 1));           // the same spot is not a neighbour
});

test("judge: over the top sails over when high, hits the bar when low", () => {
  assert.strictEqual(P.judge({ spot: 4, power: 0.95 }, 0), "over");
  assert.strictEqual(P.judge({ spot: 1, power: 0.95 }, 0), "bar");
});

test("judge: same spot saves, a neighbour saves only a weak shot, elsewhere is a goal", () => {
  assert.strictEqual(P.judge({ spot: 2, power: 0.7 }, 2), "save");
  assert.strictEqual(P.judge({ spot: 2, power: 0.7 }, 5), "goal", "green beats a neighbour");
  assert.strictEqual(P.judge({ spot: 2, power: 0.3 }, 5), "save", "weak loses to a neighbour");
  assert.strictEqual(P.judge({ spot: 2, power: 0.3 }, 0), "goal", "weak still scores past a far dive");
});

test("shootout: ends early once one side cannot catch up", () => {
  // A scores 3, B misses 3: after A's 3rd and B's 3rd, B has 2 left, cannot reach 3.
  const s = P.shootout(["goal", "save", "goal", "save", "goal", "save"]);
  assert.deepStrictEqual([s.a, s.b, s.done, s.winner], [3, 0, true, "a"]);
});

test("shootout: level after five goes to sudden death, decided in a round", () => {
  const five = ["goal", "goal", "save", "save", "goal", "goal", "goal", "goal", "save", "save"];
  let s = P.shootout(five);
  assert.deepStrictEqual([s.a, s.b, s.done, s.next], [3, 3, false, "a"]);
  s = P.shootout(five.concat(["goal", "save"]));
  assert.deepStrictEqual([s.done, s.winner, s.round], [true, "a", 6]);
  s = P.shootout(five.concat(["goal"]));
  assert.strictEqual(s.done, false, "B still has their sudden-death kick");
});

test("shootout: still level after three bonus rounds is a draw", () => {
  const k = [];
  for (let i = 0; i < P.REG + P.BONUS; i++) k.push("goal", "goal");
  const s = P.shootout(k);
  assert.deepStrictEqual([s.done, s.winner, s.a, s.b], [true, "draw", 8, 8]);
});

test("daily dives: same for one Lagos day, different the next, always 0-5", () => {
  const a = P.dailyDives("k".repeat(32), "2026-10-08"), b = P.dailyDives("k".repeat(32), "2026-10-08");
  const c = P.dailyDives("k".repeat(32), "2026-10-09");
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  assert.strictEqual(a.length, 5);
  assert.ok(a.every((d) => Number.isInteger(d) && d >= 0 && d < 6));
});

test("lagosDay rolls at 23:00 UTC", () => {
  assert.strictEqual(P.lagosDay(Date.parse("2026-10-08T22:59:59Z")), "2026-10-08");
  assert.strictEqual(P.lagosDay(Date.parse("2026-10-08T23:00:00Z")), "2026-10-09");
});

test("cleanName keeps letters, numbers and spaces, max 16, else null", () => {
  assert.strictEqual(P.cleanName("  Tobi  "), "Tobi");
  assert.strictEqual(P.cleanName("<img src=x onerror=alert(1)>"), "img srcx onerror");
  assert.strictEqual(P.cleanName("Adé Okafor 9"), "Adé Okafor 9");
  assert.strictEqual(P.cleanName("😤😤"), null);
  assert.strictEqual(P.cleanName("x".repeat(40)).length, 16);
  assert.strictEqual(P.cleanName(42), null);
});

test("ids: six unambiguous characters", () => {
  for (let i = 0; i < 50; i++) assert.match(P.newId(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});

test("validPick and validDive refuse anything outside the board", () => {
  assert.ok(P.validPick({ spot: 5, power: 0.5 }));
  assert.ok(!P.validPick({ spot: 6, power: 0.5 }));
  assert.ok(!P.validPick({ spot: 1, power: 1.5 }));
  assert.ok(!P.validPick({ spot: "1", power: 0.5 }));
  assert.ok(P.validDive(0) && !P.validDive(-1) && !P.validDive(2.5));
});
