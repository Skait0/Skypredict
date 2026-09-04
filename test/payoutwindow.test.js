"use strict";

/**
 * A payout only the wider window can reach should say so, and offer the switch.
 *
 * Asked for as: "fire an informative warning when someone types in xN that can
 * only be gotten from 'all upcoming'... and offer to switch scope."
 *
 * The ladder tops out at x6,000 on a single day and x50,000 on All upcoming,
 * because the jackpot rungs want about twenty legs and one fixture day rarely
 * holds that many worth backing. Typing x20,000 on Today was clamped to x6,000
 * in silence: the box changed under the fingers that had just typed it, and
 * nothing said why, or that the number asked for was one tap away.
 *
 * Verified in the browser across six cases, because the interesting part is
 * sequencing rather than arithmetic:
 *   20000 on Today          -> asks, clamps to 6000
 *   "Use all upcoming"      -> SCOPE=all, target 20000, x20k chip lit
 *   "Keep x6k"              -> SCOPE stays day, target 6000, prompt cleared
 *   99999 on Today          -> no offer: no window reaches it
 *   250 on Today            -> no offer: Today reaches it fine
 *
 * THE BUG THAT ONLY THE BROWSER FOUND: the ask was raised before the panel was
 * redrawn, and #payAsk lives inside the panel that renderBuilder replaces - so
 * showPrompt succeeded, wrote into a node, and the redraw immediately threw
 * that node away. It fired correctly and left nothing on screen. The ask is
 * now raised after the render.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ");

/* ------------------------------------------------------------ the trigger */

test("it fires only when the wider window would actually help", () => {
  /* Three conditions, and dropping any one of them makes the offer wrong:
     over the current ceiling, currently on a single day, and within reach of
     the wide ladder. An offer that changes nothing is worse than the silent
     clamp it replaced. */
  const m = /var _needsWider=(.*);/.exec(code);
  assert.ok(m, "the trigger must exist");
  assert.match(m[1], /_typed>_ceil/, "only when the number was clamped");
  assert.match(m[1], /SCOPE==="day"/, "only from the narrow window");
  assert.match(m[1], /_typed<=\(WSP\._wideMaxTarget\|\|50000\)/,
    "and only when the wide ladder actually reaches it");
});

test("the ask is raised AFTER the redraw, not before", () => {
  /* The whole bug. #payAsk is inside the panel renderBuilder replaces, so an
     ask raised first is destroyed by the render that follows - silently,
     because showPrompt succeeded against a node that no longer exists. */
  const i = code.indexOf("var _needsWider=");
  const j = code.indexOf("renderBuilder();", i);
  const k = code.indexOf("if(_needsWider) askWiderWindow", i);
  assert.ok(i > 0 && j > i && k > j,
    "askWiderWindow must come after the renderBuilder that follows the commit");
});

/* -------------------------------------------------------------- the offer */

test("both answers are real, and both clear the prompt", () => {
  const fn = /window\.askWiderWindow=function[\s\S]*?\n  \};/.exec(code);
  assert.ok(fn, "the ask must exist");
  assert.match(fn[0], /confirm-go/, "an accept");
  assert.match(fn[0], /confirm-cancel/, "and a decline");
  assert.strictEqual((fn[0].match(/clearPrompt\("payAsk"\)/g) || []).length, 2,
    "both paths must clear it, or a stale sentence survives the choice");
});

test("accepting switches the window AND keeps the number asked for", () => {
  /* Switching scope without applying the target would answer half the
     question: the reader typed a number, and the point of the offer is that
     they get it. */
  const fn = /window\.askWiderWindow=function[\s\S]*?\n  \};/.exec(code)[0];
  assert.match(fn, /setScope\("all"\)/, "the window must actually change");
  assert.match(fn, /WSP\.odds=typed;/, "and the typed target must be applied");
  assert.match(fn, /renderBuilder\(\)/, "and the panel redrawn to show both");
});

test("accepting clears the slip drawn from the old window", () => {
  /* Same reset the scope buttons perform. The pool the slip came from has just
     changed, so a removal list and a booking code from the old one are stale. */
  const fn = /window\.askWiderWindow=function[\s\S]*?\n  \};/.exec(code)[0];
  assert.match(fn, /WSP\.removed=\{\}/);
  assert.match(fn, /WSP\._slip=null/);
  assert.match(fn, /bookResult/, "and the old code must not sit under a new slip");
});

/* ------------------------------------------------------- one ladder, sliced */

test("both ceilings come from one list", () => {
  /* The offer promises "All upcoming can reach it" and names a number. A
     second hand-written copy of the ladder would drift the first time a rung
     moved, and the offer would promise a payout the wider window does not
     carry. */
  assert.match(code, /var WIDE_ODDS=\[10,50,100,500,1000,2000,6000,20000,50000\];/);
  assert.match(code, /var odds=jackOK\?WIDE_ODDS:WIDE_ODDS\.filter\(function\(o\)\{return o<JACKPOT_FROM;\}\);/,
    "the day ladder must be a slice of the wide one, not a second literal");
  assert.match(code, /WSP\._wideMaxTarget=WIDE_ODDS\[WIDE_ODDS\.length-1\];/,
    "and the wide ceiling must be read off the end of it");
});

test("the day ladder still holds exactly what it used to", () => {
  /* The refactor above must not quietly change which chips a single day
     offers. JACKPOT_FROM is 20000, so the slice is the first seven rungs. */
  const WIDE = [10, 50, 100, 500, 1000, 2000, 6000, 20000, 50000];
  const JACKPOT_FROM = Number(/JACKPOT_ODDS=(\d+)/.exec(code)[1]);
  assert.deepStrictEqual(WIDE.filter((o) => o < JACKPOT_FROM),
    [10, 50, 100, 500, 1000, 2000, 6000]);
  assert.strictEqual(WIDE[WIDE.length - 1], 50000);
});

/* --------------------------------------------------------------- the copy */

test("it names both numbers the way the chips do", () => {
  /* The ladder says x6k, not x6000. A sentence about those chips that spells
     the number out reads as a different number. */
  assert.match(code, /function payLbl\(n\)\{ return n>=1000 \? \(n\/1000\)\+"k" : String\(n\); \}/);
  const fn = /window\.askWiderWindow=function[\s\S]*?\n  \};/.exec(code)[0];
  assert.ok((fn.match(/payLbl\(/g) || []).length >= 3,
    "the typed target and the ceiling must both be formatted");
});

test("the note takes no space when there is nothing to say", () => {
  assert.match(code, /#payAsk:not\(:empty\)\{margin:10px 0 2px\}/,
    "an empty ask must not leave a gap under the ladder");
});
