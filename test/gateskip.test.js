"use strict";
/* SKIP IS NOT OFFERED TO SOMEONE WHO HAS NEVER SEEN THE GATE.
 *
 * The splash is the first thing the site says. Putting an exit next to it on
 * the very first load answers a question the reader has not asked yet, and it
 * was showing to everyone: the button has always been in the markup, and
 * localStorage only ever changed how it LOOKED - quiet grey text for a
 * first-timer, a bordered pill for a returning reader. It was never hidden.
 *
 * So the rule is: display:none by default, brought back only by
 * html.sw-gate-known, which the head bootstrap sets from
 * localStorage["sw.intro.day"].
 *
 * The two things this must not break, both asserted below: Enter still
 * dismisses the gate, so nobody is trapped behind it, and "I am under 18" is
 * untouched, so the age question keeps both of its answers. A gate with no way
 * out is a worse bug than a Skip button shown too eagerly. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The declaration block for one selector, matched loosely on whitespace so
   reformatting the stylesheet does not fail this. Anchored to the start of a
   line: ".sw-g-under{" also occurs as the tail of the combined
   "html.sw-gate-known ... .sw-g-under{display:none}" rule, and reading that
   block instead is how this file first claimed the age answer was hidden. */
function rule(selector) {
  const i = src.indexOf("\n" + selector);
  if (i < 0) return null;
  const open = src.indexOf("{", i);
  const close = src.indexOf("}", open);
  if (open < 0 || close < 0) return null;
  return src.slice(open + 1, close).replace(/\s+/g, " ").trim();
}

test("the Skip button is hidden by default", () => {
  const base = rule("#swGate .sw-g-skip{");
  assert.ok(base, "the base .sw-g-skip rule has gone - has the class been renamed?");
  assert.match(base, /display:\s*none/,
    "a first-time reader must not be shown Skip; got: " + base);
});

test("a reader who has been here before gets it back", () => {
  const known = rule("html.sw-gate-known #swGate .sw-g-skip{");
  assert.ok(known, "the returning-reader rule has gone");
  assert.match(known, /display:\s*inline-flex/,
    "display:none has to be undone explicitly, or Skip never returns; got: " + known);
  assert.match(known, /border:/, "returning readers keep the bordered pill");
});

test("the class that brings it back is still driven by having seen the gate", () => {
  /* The CSS is only half the rule. If the bootstrap stops setting
     sw-gate-known, Skip disappears for everyone and nothing else fails. */
  assert.match(src, /localStorage\.getItem\("sw\.intro\.day"\)/,
    "sw-gate-known is set from the day stamp; without it Skip is gone for good");
  assert.match(src, /if\(seen\|\|localStorage\.getItem\("sw\.age18"\)==="1"\)\s*D\.className\+=" sw-gate-known"/,
    "the seen check must still add sw-gate-known");
});

test("nobody is trapped: Enter and the age answer are untouched", () => {
  assert.ok(src.includes('id="swGateEnter"'), "Enter must still exist");
  assert.ok(src.includes('id="swGateUnder"'), '"I am under 18" must still exist');
  for (const sel of ["#swGate .sw-g-enter{", "#swGate .sw-g-under{"]) {
    const r = rule(sel);
    assert.ok(r, "missing rule for " + sel);
    assert.doesNotMatch(r, /display:\s*none/,
      sel + " must never be hidden - it is the way out of the gate");
  }
});

test("the button stays in the DOM, so the handler still has something to bind", () => {
  assert.ok(src.includes('id="swGateSkip"'),
    "hidden with CSS, not removed - the script reads getElementById(\"swGateSkip\")");
  assert.match(src, /skip\s*=\s*document\.getElementById\("swGateSkip"\)/,
    "the gate script still wires Skip up for the visit where it is visible");
});
