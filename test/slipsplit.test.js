"use strict";
/* SPLITTING ONE SLIP INTO SEVERAL TICKETS.
 *
 * The dealing is three lines and every one of them is a way to lose somebody's
 * bet: a leg dropped, a leg booked twice, or a ticket handed out with one game
 * in it. None of that is visible in a screenshot - a split that quietly loses
 * the eighth leg looks exactly like a split that worked - so it is pinned here.
 *
 * Lifted out of public/index.html rather than re-implemented, the same way
 * tipparity.test.js lifts bestTipFrom: a copy would test my idea of the rule
 * instead of the rule that ships.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

const splitPicks = new Function(grab("splitPicks") + "\nreturn splitPicks;")();
const splitWays = new Function(grab("splitWays") + "\nreturn splitWays;")();

const legs = (n) => Array.from({ length: n }, (_, i) => ({ id: "g" + i }));

test("every leg lands in exactly one ticket", () => {
  /* The one that matters. A leg dropped is a game the punter thought they had
     backed; a leg dealt twice is a game they paid for two ways without
     choosing to. */
  for (let len = 4; len <= 20; len++) {
    for (const n of splitWays(len)) {
      const parts = splitPicks(legs(len), n);
      const flat = parts.flat();
      assert.equal(flat.length, len, `${len} legs into ${n}: lost or gained one`);
      assert.equal(new Set(flat.map((c) => c.id)).size, len,
        `${len} legs into ${n}: a leg is in two tickets`);
    }
  }
});

test("the tickets come out the same size, to within one leg", () => {
  /* Dealing rather than chopping is the whole point: a cut slip puts the
     confident end in ticket one and the long shots in the last. */
  for (let len = 4; len <= 20; len++) {
    for (const n of splitWays(len)) {
      const sizes = splitPicks(legs(len), n).map((p) => p.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1,
        `${len} legs into ${n} came out ${sizes.join("/")}`);
    }
  }
});

test("consecutive legs never share a ticket", () => {
  /* What dealing buys over chopping, stated directly: neighbours in the slip -
     which is where the optimiser puts similarly priced games - end up on
     different tickets. */
  const parts = splitPicks(legs(8), 2);
  assert.deepEqual(parts[0].map((c) => c.id), ["g0", "g2", "g4", "g6"]);
  assert.deepEqual(parts[1].map((c) => c.id), ["g1", "g3", "g5", "g7"]);
});

test("no ticket is ever offered with fewer than two games in it", () => {
  /* A "split" that hands somebody a single has changed their bet into a
     different one. Two is the floor, so a slip has to reach four before it can
     be split at all. */
  for (let len = 0; len <= 24; len++) {
    for (const n of splitWays(len)) {
      const sizes = splitPicks(legs(len), n).map((p) => p.length);
      assert.ok(Math.min(...sizes) >= 2,
        `${len} legs into ${n} produced a ticket of ${Math.min(...sizes)}`);
    }
  }
});

test("a slip too short to split is offered nothing", () => {
  for (const len of [0, 1, 2, 3]) {
    assert.deepEqual(splitWays(len), [], len + " legs should offer no split");
  }
});

test("four ways is the ceiling however long the slip is", () => {
  assert.deepEqual(splitWays(8), [2, 3, 4]);
  assert.deepEqual(splitWays(40), [2, 3, 4],
    "a forty-leg slip is still at most four tickets");
  assert.deepEqual(splitWays(5), [2],
    "five legs can only be two tickets - three would leave a single");
});

test("the legs keep their order within a ticket", () => {
  /* The slip is ordered, and a ticket that reshuffles it reads as a different
     slip when the punter checks it against the one they built. */
  const parts = splitPicks(legs(9), 3);
  for (const p of parts) {
    const idx = p.map((c) => Number(c.id.slice(1)));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  }
});
