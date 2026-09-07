"use strict";
/**
 * THE HEADER, ARRANGED.
 *
 * Measured on the live site at 1920x911 before this change:
 *
 *   column   363 ---------------------------------- 1543   (1180 wide, centred)
 *   logo     379 -- 553     mark 42x48, word 19px
 *   nav      583 -- 825     30px after the logo
 *                  668px of nothing
 *   "Sep 7" 1451 -- 1483    32px wide, muted
 *   toggle  1493 -- 1527    16px to the edge
 *
 * More than half the bar was empty. Everything of substance sat in the left
 * 40% and the right edge held 76px of content anchoring 1180px of header - two
 * small islands with an ocean between them.
 *
 * Two fixes, both here:
 *
 *   the nav is centred on the COLUMN, not on the space left over between the
 *   logo and the toggle. Auto margins would centre it between them, which is
 *   70px off true centre because the logo is 175px and the toggle is 34px -
 *   and off-centre-but-trying reads worse than deliberately left.
 *
 *   the date goes. It duplicated "Sep 7 last updated" in the eyebrow row 40px
 *   below it, and alone up there it was too small to balance anything.
 *
 * Vertical alignment was already right - logo, nav and toggle all centre on
 * y=33 in a 66px bar - and is deliberately untouched.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function rule(selector) {
  const i = src.indexOf("\n" + selector);
  if (i < 0) return null;
  const open = src.indexOf("{", i);
  const close = src.indexOf("}", open);
  if (open < 0 || close < 0) return null;
  return src.slice(open + 1, close).replace(/\s+/g, " ").trim();
}

test("the nav is centred on the column, not on the leftover space", () => {
  const r = rule(".top-in .nav{");
  assert.ok(r, "no centring rule for the header nav");
  assert.match(r, /position:\s*absolute/, "got: " + r);
  assert.match(r, /left:\s*50%/, "got: " + r);
  assert.match(r, /translateX\(-50%\)/, "and pulled back by half its own width: " + r);
});

test("its containing block is the header row", () => {
  /* An absolutely positioned child centres on the nearest positioned
     ancestor. Without this it would centre on the viewport, which is not the
     same thing once the page has a scrollbar. */
  const r = rule(".top-in{");
  assert.ok(r, "the header row rule has gone");
  assert.match(r, /position:\s*relative/, "got: " + r);
});

test("the date is gone from the header at every width", () => {
  /* It was hidden under 720px already; the duplication was on desktop. */
  const r = rule(".top-in .when{");
  assert.ok(r, "no rule for the header date");
  assert.match(r, /display:\s*none/, "got: " + r);
});

test("the element stays in the DOM for whatever writes to it", () => {
  assert.ok(src.includes('id="when"'), "hidden with CSS, not deleted from under the script");
});

test("the phone still gets no header nav at all", () => {
  /* The centring must not resurrect what the mobile rule hides - one
     navigation on a phone, and it is the bottom bar. */
  const i = src.indexOf("\n  .nav{display:none}");
  assert.ok(i > 0, "the phone rule for .nav has gone");
  const before = src.slice(0, i);
  const opened = before.lastIndexOf("@media(max-width:720px)");
  assert.ok(opened > 0);
  assert.equal(before.indexOf("\n}", opened), -1, "the rule escaped its media query");
});

test("the logo and the toggle are left where they were", () => {
  /* The bar's vertical rhythm was already correct and is not part of this
     change. If either grows a position or a margin here, that is a different
     decision and should fail. */
  for (const sel of [".top-in .logo{", ".top-in .tgl{"]) {
    const r = rule(sel);
    if (r) assert.doesNotMatch(r, /position:\s*absolute/, sel + " must stay in flow");
  }
});

test("the toggle is pushed to the right edge on its own", () => {
  /* The date used to carry margin-left:auto, and that - not the date itself -
     was what held the right cluster against the edge. Hiding it collapsed the
     toggle back next to the logo at x=563. Measured, not guessed: the first
     version of this change shipped that way in the working tree. */
  const r = rule(".top-in .tgl{");
  assert.ok(r, "no rule positioning the toggle");
  assert.match(r, /margin-left:\s*auto/, "got: " + r);
});
