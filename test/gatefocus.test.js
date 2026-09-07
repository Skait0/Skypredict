"use strict";
/**
 * THE BOARD MUST NOT WEAR A FOCUS RING AFTER THE GATE CLOSES.
 *
 * Reported: "white selection box over the whole prediction section till i
 * click on something", entering through the wizard.
 *
 * The gate hands focus to the board on its way out, deliberately - see
 * dismiss() in index.html:
 *
 *   var t = document.querySelector("main") || ...
 *   t.setAttribute("tabindex","-1"); t.focus({preventScroll:true});
 *
 * That is correct behaviour and worth keeping: without it the next Tab starts
 * from the top of the document with no visible cue, and a screen reader is
 * left wherever the removed dialog used to be. The bug is only that the
 * browser then draws its own ring around the container, which here is the
 * entire predictions column - a white box over everything until the next
 * click moves focus.
 *
 * So the ring is silenced on that one element and nowhere else. Every real
 * control keeps its own, which is the whole point of the outline rules
 * elsewhere in this file - a blanket `outline:none` would be the classic
 * accessibility own-goal.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the programmatic focus target does not draw a ring", () => {
  assert.match(src, /main\[tabindex="-1"\]:focus\s*\{[^}]*outline:\s*none/,
    "no rule silencing the focus ring on the board container");
});

test("the gate still hands focus over", () => {
  /* The fix must not be "stop focusing it" - that trades a visual blemish for
     a keyboard and screen-reader regression. */
  assert.match(src, /t\.setAttribute\("tabindex",\s*"-1"\);\s*t\.focus/,
    "dismiss() must still move focus to the board");
});

test("real controls keep their focus rings", () => {
  /* The one thing this change must not become. */
  assert.doesNotMatch(src, /(^|\n)\s*\*\s*:focus\s*\{[^}]*outline:\s*none/,
    "a blanket :focus outline:none would strip every control's ring");
  assert.match(src, /:focus-visible/,
    "the file must still style focus-visible for the controls that need it");
});

test("only the board container is silenced, not every tabindex=-1 element", () => {
  /* Sheets, modals and the gate itself also carry tabindex="-1" and may want
     their own treatment; this is scoped to main deliberately. */
  assert.doesNotMatch(src, /(^|\n)\s*\[tabindex="-1"\]:focus\s*\{[^}]*outline:\s*none/,
    "scope the rule to the board, not to every -1 element on the page");
});
