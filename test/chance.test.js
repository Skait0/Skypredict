"use strict";

/**
 * Saying how likely a slip is to land.
 *
 * The builder's headline figure was "Average confidence" - the mean of the
 * legs. It reads as the chance of winning and it is not that. A 25-leg slip at
 * 66% average is one in nineteen thousand, not a two-in-three shot, and the
 * number on screen was the flattering half of the pair.
 *
 * It also inverted a decision. Of the three slip styles, the one with the
 * HIGHEST average confidence was the least likely to land - it won zero of 42
 * head-to-heads - because more legs is more results that have to come in. The
 * per-leg average did not merely fail to help; it ranked the options backwards
 * and the labels agreed with it.
 *
 * So the compound probability is the headline now, and the per-leg average
 * stays underneath it as the secondary figure it always was.
 *
 * Phrased as "1 in N" rather than a string of zeros, because that is how
 * anybody pricing a long shot already thinks and it is the same information
 * the total odds carry from the other side. No warnings attached: everyone
 * using this understands what an accumulator is, and a lecture would be both
 * patronising and ignored.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const m = /function chanceLabel\(p\)\{[\s\S]*?\n\}/.exec(src);
assert.ok(m, "chanceLabel not found in index.html");
const chanceLabel = new Function(m[0] + "\nreturn chanceLabel;")();

test("a real chance is a percentage", () => {
  assert.strictEqual(chanceLabel(0.5), "50%");
  assert.strictEqual(chanceLabel(0.12), "12%");
  assert.strictEqual(chanceLabel(0.10), "10%");
});

test("a long shot is odds against, not a decimal with zeros", () => {
  assert.strictEqual(chanceLabel(0.043), "1 in 23");
  assert.strictEqual(chanceLabel(0.001), "1 in 1000");
  assert.strictEqual(chanceLabel(0.0004), "1 in 2500");
  /* "0.005%" makes a reader count zeros; "1 in 20k" does not. */
  assert.strictEqual(chanceLabel(0.00005), "1 in 20k");
  assert.strictEqual(chanceLabel(0.0000005), "1 in 2.0m");
});

test("nothing sensible in, nothing silly out", () => {
  for (const bad of [0, -1, null, undefined, NaN]) {
    assert.strictEqual(chanceLabel(bad), "-", String(bad) + " should render as a dash");
  }
});

test("it never claims a certainty it cannot have", () => {
  /* 1.0 would print "100%", which no accumulator ever is. It can only arise
     from a bug upstream, so it must not be dressed up as a sure thing. */
  const out = chanceLabel(1);
  assert.strictEqual(out, "100%",
    "a probability of exactly 1 can only come from bad input; if this ever " +
    "appears on screen the fault is in what was passed, not here");
});

test("the builder shows the compound chance, not the per-leg average", () => {
  /* The regression that matters: someone 'simplifying' this back to the mean
     would restore a headline that ranks the slip styles backwards. */
  assert.match(src, /<i>Chance it lands<\/i>/,
    "the headline stat must be the chance the slip lands");
  assert.match(src, /chanceLabel\(picks\.reduce\(/,
    "and it must be the PRODUCT of the legs, not their average");
  assert.match(src, /average per game/,
    "the per-leg average should still be shown, as the secondary figure");
});

test("the slip styles are not named for a promise they cannot keep", () => {
  /* "Safer, more games" was the least likely of the three to land. More legs
     is a longer shot, whatever each leg's own confidence says. */
  /* Scoped to the styles array on purpose. The old label still appears in the
     comment that explains why it went, and a whole-file search would fail on
     the explanation rather than on the thing being explained. */
  const line = /var styles=\[\[[\s\S]*?\]\];/.exec(src);
  assert.ok(line, "styles array not found");
  assert.doesNotMatch(line[0], /Safer/,
    'the "Safer" label told people the opposite of the truth');
  assert.match(line[0], /\[1\.25,\s*"More games"\]/);
  assert.match(line[0], /\[1\.7,\s*"Fewer games"\]/);
});

/* The arithmetic the whole thing rests on, so the claim in the comments above
   stays checkable rather than becoming folklore. */
test("more legs at higher confidence really is the longer shot", () => {
  const spread = Math.pow(0.74, 27);   // "more games"
  const tight  = Math.pow(0.56, 12);   // "fewer games"
  assert.ok(spread < tight,
    `27 legs at 74% (${(spread * 100).toFixed(3)}%) must be longer odds than ` +
    `12 at 56% (${(tight * 100).toFixed(3)}%) - this is why the label mattered`);
});
