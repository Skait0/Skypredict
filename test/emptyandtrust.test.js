"use strict";
/**
 * TWO SURFACES, JUDGED AGAINST THE TASTE RULES RATHER THAN MY OPINION.
 *
 * 1. THE EMPTY BOARD. Reached by any filter that matches nothing - a search
 *    term, a category, a day. It said:
 *
 *      No games in this filter
 *      Try another category or day. New fixtures arrive Friday for the weekend.
 *
 *    Two faults. It offers no way back: the reader has to work out for
 *    themselves which of four controls they touched, and undo it by hand. And
 *    the second sentence is a claim that is usually false - it was Monday, 14
 *    games were on the board, and the copy still promised fixtures on Friday.
 *    A dead end that also misinforms.
 *
 * 2. THE HERO TRUST ROW. Six items separated by dots, one of them carrying a
 *    literal flame emoji (\ud83d\udd25). Emoji-as-icon is the clearest tell of
 *    a generated interface, and two of the six items said the same thing:
 *    "Sep 7 last updated" and "Rebuilt daily from results" are both freshness.
 *
 * What is deliberately kept: "Estimates, not certainties". It is the one line
 * on the row doing responsible-gambling work, and thinning a row is no reason
 * to drop the sentence that manages expectations on a betting-adjacent site.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* --------------------------------------------------------- the empty board */

test("the empty board offers a way out, not just sympathy", () => {
  /* Anchored on the reset control itself. The first version searched for the
     old headline text, which this change deletes - so it would have failed
     for the wrong reason and told me the button was missing when it was not. */
  const i = src.indexOf("none-reset");
  assert.ok(i > 0, "no reset control anywhere in the empty state");
  assert.match(src, /id='boardReset'|id="boardReset"/,
    "an empty result must carry a control that clears the filters");
  assert.match(src, /_rst\.addEventListener\("click", ?resetBoardFilters\)/,
    "and the control has to be wired to the reset");
});

test("the reset actually clears every filter, not just the obvious one", () => {
  /* Four things can empty the board and a reader does not know which of them
     they touched. Clearing one and leaving the rest is a button that appears
     not to work. */
  const i = src.indexOf("function resetBoardFilters");
  assert.ok(i > 0, "no resetBoardFilters function");
  const fn = src.slice(i, i + 400);
  for (const key of ["q", "cat", "country", "league"]) {
    assert.match(fn, new RegExp("V\." + key + "\s*="), "it must reset V." + key);
  }
});

test("the empty copy no longer promises fixtures on a day it cannot know", () => {
  assert.doesNotMatch(src, /New fixtures arrive Friday for the weekend/,
    "a hardcoded weekday claim is wrong most days it is shown");
});

/* ---------------------------------------------------------- the trust row */

test("no emoji is used as an icon", () => {
  /* The flame in the streak item. Emoji-as-icon renders differently on every
     platform and is the clearest tell of a generated interface.
     Matched with indexOf on the escape's own text rather than a regex: the
     first version of this test wrote the pattern with one backslash too few,
     so it looked for the emoji CHARACTER in a file that contains the escape
     SEQUENCE, found nothing, and passed while proving nothing. */
  assert.equal(src.indexOf("ud83d"), -1,
    "the streak flame must be an SVG or nothing at all");
});

test("the streak still says what it is", () => {
  /* Removing the glyph must not remove the meaning. */
  assert.match(src, /-day streak/, "the streak label has to survive");
});

test("the row does not say freshness twice", () => {
  /* "Sep 7 last updated" and "Rebuilt daily from results" are the same claim
     twice, forty pixels apart. Asserted on the rendered ITEM rather than the
     phrase: two comments in this file discuss the chip by name, and a test
     that bans the words outright would fail on its own explanation. */
  assert.doesNotMatch(src, /<span class="trust-i t-static">Rebuilt daily from results<\/span>/,
    "the dated 'last updated' item already carries this");
});

test("the responsible line stays", () => {
  /* Thinning a row is not a reason to drop the sentence that manages
     expectations on a betting-adjacent site. */
  assert.match(src, /Estimates, not certainties/);
  assert.match(src, /How accurate\?/, "and the route to the evidence stays too");
});
