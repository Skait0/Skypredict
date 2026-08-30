"use strict";

/**
 * Saying how likely a slip is, without talking the reader out of it.
 *
 * The builder's headline is "Average confidence" - the mean of the legs. It is
 * not the chance of winning, and for a while the headline was that instead: the
 * compound probability, phrased "1 in 19,000".
 *
 * That was replaced on the user's instruction. "chance it lands is mad
 * discouraging", and "we should do more encouraging not the opposite". The
 * arithmetic was right and it was the wrong thing to lead with. A reader
 * looking at a slip they built already knows an accumulator is a long shot; the
 * total odds say it from the other side, and printing "1 in 19,000" beside
 * their own picks reads as the site arguing against them. Correct is not the
 * only bar a headline figure has to clear.
 *
 * So: average confidence is the headline, and the compound figure is not shown
 * at all. What survives from that episode is the part that was a real fault
 * rather than a matter of tone - the slip-style LABELS. "Safer, more games" was
 * the least likely of the three to land, losing all 42 head-to-heads, because
 * more legs is more results that have to come in. That label told people the
 * opposite of the truth, which is different from telling them a truth they did
 * not want to hear. It stays fixed. These tests hold both halves.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the headline stat is the average confidence", () => {
  assert.match(src, /<i>Average confidence<\/i>/,
    "the builder's headline figure must be the per-leg average");
});

test("the discouraging compound figure is not on screen", () => {
  /* The specific thing that was asked for twice: removed, not relabelled or
     demoted to a sub-line. Someone reinstating it as "the honest number"
     should read the comment at the top of this file first. */
  assert.doesNotMatch(src, /Chance it lands/,
    'the "Chance it lands" headline was removed as discouraging');
  assert.doesNotMatch(src, /chanceLabel/,
    "and the helper that phrased it as 1-in-N went with it");
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
  assert.match(line[0], /\[1\.25,\s*"More games","lesser odds"\]/);
  assert.match(line[0], /\[1\.7,\s*"Fewer games","bigger odds"\]/);
});

test("each style says which way its odds go", () => {
  /* The names alone said what you get and nothing about the trade. The
     qualifier is per-leg odds, not the payout - the payout is the target you
     already chose, and it is the same whichever style you pick. More legs at
     lower odds each, or fewer at higher; that is the entire choice. */
  const line = /var styles=\[\[[\s\S]*?\]\];/.exec(src)[0];
  const lo = /\[([\d.]+),"More games"/.exec(line)[1];
  const hi = /\[([\d.]+),"Fewer games"/.exec(line)[1];
  assert.ok(+lo < +hi,
    `"lesser odds" must be the lower per-leg target (${lo}) and "bigger odds" ` +
    `the higher (${hi}) - swapping these would print the opposite of the truth, ` +
    `which is the mistake the previous labels made`);
});

/* The arithmetic the labels rest on, so the claim in the comments above stays
   checkable rather than becoming folklore. */
test("more legs at higher confidence really is the longer shot", () => {
  const spread = Math.pow(0.74, 27);   // "more games"
  const tight  = Math.pow(0.56, 12);   // "fewer games"
  assert.ok(spread < tight,
    `27 legs at 74% (${(spread * 100).toFixed(3)}%) must be longer odds than ` +
    `12 at 56% (${(tight * 100).toFixed(3)}%) - this is why the label mattered`);
});
