"use strict";

/**
 * Shuffling has to change the games, not just their order.
 *
 * Reported: "when i shuffle, some games dont leave the ticket."
 *
 * True of the wizard, not the slider, and the reason is the size of the jitter
 * against the spread it has to bridge.
 *
 * The slider jitters multiplicatively at +/-45-95%, and across 30 shuffles no
 * game appeared in even half the slips. The wizard added a flat +/-0.05 to a
 * cost built from log(p)/log(odds). Measured on a x100 target: 24 candidates
 * for a 12-leg slip, costs running 0.55 to 1.43. Around the cutoff the gaps
 * between adjacent legs are 0.003 to 0.046, so +/-0.05 swapped those freely —
 * eight of twelve slots did rotate. But the best leg sat at 0.55 with a 0.22
 * gap to the next, and the twelfth at about 1.06. Nothing that jitter could
 * reach would move the top six. Those were the six that never left.
 *
 * Widening it flat would mean routinely trading a 0.55 leg for a 1.0 one —
 * buying variety with the quality that makes the slip worth taking. So it
 * escalates, the same way the South America and Asia gates already do: the
 * first shuffle varies the margins, and somebody still shuffling on the fourth
 * is asking for different games rather than a rearrangement of the same ones.
 *
 * Measured after the change, 25 builds at each level:
 *
 *   shuffles  distinct games  always present  avg confidence
 *   0         22              6               66.7%
 *   1         42              2               66.5%
 *   2         55              1               66.7%
 *   4         62              1               66.9%
 *
 * Nearly three times the variety, and the confidence did not move. The payout
 * target still holds too: a x100 ask returned a median x115 on the first tap
 * and x120 after four shuffles, never below the target.
 *
 * Not changed, and worth knowing: legs added by hand never leave on a shuffle,
 * because a conjure only replaces the ones it marked `auto`. That is
 * deliberate, and it is the likelier explanation when the games that stay are
 * ones that were chosen by hand.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function jitterLine() {
  const m = /var jit=Math\.min\(([\d.]+),\s*([\d.]+)\+([\d.]+)\*shuffles\);/.exec(src);
  assert.ok(m, "the escalating shuffle jitter is gone");
  return { cap: +m[1], base: +m[2], step: +m[3] };
}

test("the jitter widens with each shuffle", () => {
  const j = jitterLine();
  assert.ok(j.step > 0, "it has to grow, or repeated shuffles say nothing new");
  const at = (n) => Math.min(j.cap, j.base + j.step * n);
  assert.ok(at(1) > at(0));
  assert.ok(at(4) > at(1));
});

test("the first tap stays close to the best legs", () => {
  /* Shuffling should not be the price of a good slip. Somebody who has not
     asked for variety gets the ranking, near enough untouched. */
  const j = jitterLine();
  assert.ok(j.base <= 0.12,
    `the opening jitter is ${j.base}; above about 0.12 it starts trading away ` +
    `the best legs before anyone has asked it to`);
});

test("and it stops widening before the ranking stops meaning anything", () => {
  /* The candidate costs span 0.883 end to end. A jitter that could span that
     would make the shuffle a random draw and the edge ranking decorative. */
  const j = jitterLine();
  assert.ok(j.cap <= 0.6,
    `capped at ${j.cap}; the whole cost spread measured 0.883, so a cap near ` +
    `that turns selection into a lottery`);
  assert.ok(j.cap >= 0.3,
    `capped at ${j.cap}; the top leg leads the twelfth by about 0.5, so a ` +
    `smaller cap can never displace it however many times you shuffle`);
});

test("a fresh conjure resets the escalation", () => {
  /* The counter only ever incremented. One shuffle would otherwise leave the
     session permanently jittery for every target chosen afterwards. */
  const i = src.indexOf("function wspConjure");
  assert.ok(i > 0);
  const fn = src.slice(i, i + 600);
  assert.match(fn, /else\s*\{WSP\.removed=\{\};WSP\.shuffles=0;\}/,
    "a conjure that is not a shuffle must clear the counter");
});

test("shuffling still counts up when it is a shuffle", () => {
  const i = src.indexOf("function wspConjure");
  const fn = src.slice(i, i + 600);
  assert.match(fn, /WSP\.shuffles=\(WSP\.shuffles\|\|0\)\+1/,
    "without the increment nothing escalates");
});
