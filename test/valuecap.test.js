"use strict";

/**
 * Don't buy our own disagreement with the book.
 *
 * Reported: "when i pick 100 odds in the wizard it picks games like Monaco
 * against PSG to score, Betis to score against Madrid - these teams are
 * playing against giants and might not be able to score... in the slider it
 * picks Real Madrid or draw, PSG game over 1.5, even at the riskiest lever
 * with 32 legs and 3k odds."
 *
 * WHY IT HAPPENED, measured on a 394-fixture board. Our probability minus the
 * bookmaker's implied one, averaged:
 *
 *   every priced option on the board   -3.5 pts   we are higher on 26%
 *   "more games" legs chosen           -0.6 pts   ...on 39%
 *   "balanced" legs chosen            +10.1 pts   ...on 80%
 *   "fewer games" legs chosen         +14.8 pts   ...on 100%
 *
 * The model is not over-confident: across the whole board it sits BELOW the
 * book on every market, team totals included. The fault was in what the
 * builder SELECTED. The Wizard fixes its leg count from the payout and then
 * needs each leg to hit a price; on a lopsided fixture every safe market is
 * 1.05-1.10, all of it under the band, so the only thing in range is the
 * unlikely thing - and `edge` then prefers exactly those, because a high
 * probability at a long price looks efficient. But a high probability at a
 * long price is where our number disagrees with the market's. Band plus edge
 * acted as a filter that isolated our own errors, and the higher the per-leg
 * target the purer it got.
 *
 * The Slider never did this because it has no per-leg price target at all: it
 * takes whatever clears a confidence floor and lets the payout land where it
 * lands. That is why 32 safe legs reach x3000 without reaching for anything.
 *
 * WHICH SIDE IS RIGHT: across 1,752 matches in five top leagues, against a
 * favourite at 65%+ the underdog scored in 52-56% of them. Those legs were
 * claiming 63-74%. The book was right.
 *
 * NOT A BAN ON TEAM-TO-SCORE. That market grades 81.6% against 78% claimed and
 * is among the best calibrated on the board; a rule against it was tried once
 * and was wrong. The aggregate is carried by FAVOURITES scoring, which happens
 * 91-98% of the time, and the underdog subset is where it breaks. So the rule
 * is about the gap and applies to every market equally - after the fix a
 * balanced slip still carries team-to-score legs, just ones the book agrees
 * with (Malaga 83% ours / 78% book, Millwall 69% / 65%).
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ");

/* The real predicate, lifted with its constant. */
function liftOverpriced() {
  const capM = /var VALUE_CAP=([\d.]+);/.exec(src);
  assert.ok(capM, "VALUE_CAP must exist");
  const i = src.indexOf("    function overpriced(c){");
  assert.ok(i > 0, "overpriced() must exist");
  const end = src.indexOf("\n    }", i);
  const body = src.slice(i, end + 6);
  return {
    cap: Number(capM[1]),
    fn: new Function("var VALUE_CAP=" + capM[1] + ";" + body + "\nreturn overpriced;")(),
  };
}
const { cap: VALUE_CAP, fn: overpriced } = liftOverpriced();

const leg = (code_, p, bookOdds) => ({
  code: code_, p,
  f: { sportyOdds: bookOdds == null ? {} : { [code_]: bookOdds } },
});

/* ------------------------------------------------------------ the rule */

test("a leg we like far more than the book is refused", () => {
  /* Levante to score against Barcelona: ours 74%, priced 1.60, so the book
     says at most 62.5%. Twelve points of disagreement, sold as value. */
  assert.strictEqual(overpriced(leg("HOME_OVER_0.5", 0.74, 1.60)), true);
  /* Porto v Moreirense at 2.45 with ours at 56% - fifteen points. */
  assert.strictEqual(overpriced(leg("AWAY_OVER_0.5", 0.56, 2.45)), true);
});

test("ordinary disagreement is still allowed", () => {
  /* The board's own mean is -3.5 points, so a few points either way is the
     normal state of the world, not a signal. These are real legs from the
     slip built after the fix. */
  assert.strictEqual(overpriced(leg("HOME_OVER_0.5", 0.83, 1.28)), false, "Malaga");
  assert.strictEqual(overpriced(leg("HOME_OVER_0.5", 0.69, 1.55)), false, "Millwall");
  assert.strictEqual(overpriced(leg("1X", 0.68, 1.57)), false, "Greuther Furth");
});

test("being BELOW the book is never refused", () => {
  /* Only one direction is dangerous. If the book says 75% and we say 57%, the
     book is probably right and the leg is safer than we think - refusing it
     would throw away good bets to enforce a symmetry nobody asked for. */
  assert.strictEqual(overpriced(leg("2", 0.57, 1.33)), false);
  assert.strictEqual(overpriced(leg("OVER_1.5", 0.76, 1.29)), false);
});

test("an estimated price carries no opinion to disagree with", () => {
  /* Half the card has no team-totals market at all. Where the book has not
     priced something there is nothing to be more confident than, and judging
     our own estimate against itself would refuse every unpriced fixture. */
  assert.strictEqual(overpriced(leg("HOME_OVER_0.5", 0.95, null)), false);
  assert.strictEqual(overpriced(leg("HOME_OVER_0.5", 0.95, 1.0)), false,
    "a nonsense price is not a price");
});

test("the cap is calibrated to the board, not picked round", () => {
  assert.ok(VALUE_CAP >= 0.03 && VALUE_CAP <= 0.08,
    "the board mean is -3.5 points; " + VALUE_CAP + " is outside the range "
    + "where this separates ordinary disagreement from the +10 to +15 tail");
});

/* --------------------------------------------------- where it is applied */

test("it filters the pool before anything is ranked", () => {
  /* Not after. A capped leg must not be able to win the band, the under-band
     fallback, or a tie-break - and bestOf has three separate return paths. */
  const i = code.indexOf("function bestOf(pool){");
  assert.ok(i > 0);
  const head = code.slice(i, i + 320);
  assert.match(head, /pool=pool\.filter\(function\(c\)\{ return !overpriced\(c\); \}\);/,
    "bestOf must filter its pool first");
});

test("and the swap alternatives too - this was the leak", () => {
  /* Two later loops reach into _alts to LENGTHEN a leg: the overshoot trim and
     the "still short" rescue. Neither re-checks how the price got there.
     Filtering bestOf alone left a hole they both walked through, and Porto v
     Moreirense went onto a slip at 2.45 with our number 15 points above the
     book - the exact leg the cap exists to refuse. */
  assert.match(code, /var altsOk=alts\.filter\(function\(x\)\{ return !overpriced\(x\); \}\);/,
    "_alts must carry the cap, or a later phase reinstates a capped leg");
  assert.match(code, /_alts:altsOk\.length\?altsOk:\[pick\]/,
    "and the fallback must be the already-vetted pick, not the raw list");
});

/* ------------------------------------------------- the leg count floats */

test("the leg count already floats, and it floats in phase 2", () => {
  /* Worth recording because I got this wrong and built it twice.
     With the cap on, a fixture whose only in-band option was our own
     disagreement contributes a shorter, safer leg instead, so the product
     grows more slowly and the target needs more legs than `want`. I raised
     phase 1's ceiling to allow that - and it was already allowed. Phase 1
     stops at `want` deliberately: it takes the best-RANKED legs, and the slip
     style's leg count is its whole promise. Phase 2 then runs to the hard
     40-leg cap taking the best-FITTING leg each time, which is what reaches
     the target without overshooting it.
     Duplicating that in phase 1 meant more best-ranked and fewer best-fitting
     legs, for no gain, and it broke the contract test/overshoot-target.test.js
     exists to hold. Reverted. Measured after the revert: x100 comes back at
     1.00-1.04x across all three styles. */
  assert.match(code, /while\(picks\.length<want && \(WSP\.everyGame\|\|WSP\.odds==null\|\|prod<T\)\)\{/,
    "phase 1 must still stop at want");
  assert.match(code, /while\(prod<T && picks\.length<cap\)\{/,
    "and phase 2 is what carries the slip to the target, up to the 40-leg cap");
});

test("nothing is stretched to get there", () => {
  /* A longer slip is not a looser one. Every extra leg phase 2 adds comes from
     `chosen`, which bestOf already filtered, and from `_alts`, which carries
     the cap too - so the slip may grow in length and never in optimism. */
  const cap40 = /var T=WSP\.odds, cap=isJackpotOdds\(T\)\?JACKPOT_LEG_CAP:40/.test(code);
  assert.ok(cap40, "the hard 40-leg cap still bounds everything");
  assert.ok(!/VALUE_CAP\s*[*+]/.test(code),
    "the cap is a constant; scaling it with slip length would undo the fix");
});
