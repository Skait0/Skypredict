"use strict";

/**
 * "How we did yesterday" has to say which number is which.
 *
 * Reported: "this says 28 of 35 graded. but all 36 are graded."
 *
 * The card read `28` big, then "of 35 graded so far". Both numbers were right -
 * 28 tips landed out of 35 results graded - but the label described the wrong
 * quantity. "28 of 35 graded" is naturally read as "28 of the 35 have been
 * graded so far", i.e. seven still pending, so on a day when every result was
 * in the card looked broken.
 *
 * Verified against the live payload at the time: both the baked
 * predictions.json and the /api/predictions freshness path agreed at 35 results
 * and 28 hits for that date, and resultsOnDay() - which the past-results page
 * uses - applies the identical filter. Nothing was miscounted; the sentence was
 * simply wrong about what it was counting.
 *
 * The site says "tips landed" everywhere else, and the percentage pill beside
 * the number agrees with that reading. Whether more results are still to come
 * is a separate question, and the card already has a separate sentence for it.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function dailyFn() {
  const i = src.search(/\nfunction renderDaily\s*\(/);
  assert.ok(i > 0, "renderDaily is gone");
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

test("the headline number is labelled as tips that landed", () => {
  const fn = dailyFn();
  assert.match(fn, /of "\+res\.length\+" tips landed/,
    "the denominator label must say what the big number is");
  assert.doesNotMatch(fn, /graded so far<\/span>/,
    '"of N graded so far" describes grading progress, not the hit count');
});

test("the big number really is the hit count, not a graded count", () => {
  /* If these ever diverge the label becomes wrong again in the other
     direction, so pin the arithmetic the sentence now claims. */
  const fn = dailyFn();
  assert.match(fn, /var hit=res\.filter\(function\(r\)\{return r\.hit;\}\)\.length;/,
    "hit counts results whose tip landed");
  assert.match(fn, /Math\.round\(100\*hit\/res\.length\)/,
    "and the percentage is hits over graded, which is what 'tips landed' means");
});

test("pending grading is still said, separately", () => {
  /* Removing the ambiguous fraction must not remove the honest signal that
     more results are still arriving. */
  const fn = dailyFn();
  assert.match(fn, /still being graded - results arrive over the next day or two/,
    "the card must still be able to say more results are coming");
});
