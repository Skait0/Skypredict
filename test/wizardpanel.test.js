"use strict";

/**
 * What the Wizard's Slip style row is allowed to draw, and what it must not
 * reach for.
 *
 * These three guards outlived test/sliderhandoff.test.js, which was deleted
 * along with the handover it existed to describe. Kept here because each one
 * records a failure this panel has actually had, and none of them is about the
 * Slider's ceiling.
 *
 * Source-level, all three, because the branches live inside a string-building
 * render with no DOM to drive from node. The BEHAVIOUR they sit next to is
 * asserted properly in engines.test.js, which drives wspBuild for real.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the Wizard builds its own way and never defers to the Slider", () => {
  /* Until 3 Sep it did the opposite. Given a payout, the Wizard quietly
     answered with the Slider's method whenever the Slider could reach it -
     which on All upcoming was every rung on the ladder, so "fewer games,
     bigger odds" appeared to do nothing at all. Reported as exactly that.
     Measured on a full Saturday with live prices, that method also lost every
     rung: 30 legs landing 0.001% at x6000 where "Fewer games" built 16 landing
     0.182%. The Slider is a tab now, reached by a link out of this panel. */
  const fn = src.slice(src.indexOf("function wspBuild()"),
                       src.indexOf("function wspBuild()") + 1800);
  assert.ok(!/sliderReach\(WSP\.odds/.test(fn),
    "wspBuild must build its own way, not defer to the Slider");
  assert.match(src, /id=.wspToSlider./,
    "and the Slider must still be reachable, by a link out of the panel");
});

test("the style chips and the Slider link are only wired when they are drawn", () => {
  /* This earns its place. The listener used to call querySelectorAll on the
     container unconditionally, so hiding the chips threw a TypeError and
     blanked the entire Wizard panel - a far worse failure than the dead
     buttons it was fixing. The link out has the same shape and needs the same
     guard, because it is absent until a payout is chosen too. */
  assert.match(src, /var _sty=\$\("wspStyleChips"\);\s*\n\s*if\(_sty\)/,
    "the style-chip listener must tolerate the chips being absent");
  assert.match(src, /var _toSlider=\$\("wspToSlider"\);\s*\n\s*if\(_toSlider\)/,
    "the Slider link must tolerate being absent");
});

test("the style row is offered whatever the payout is, except in every-game", () => {
  /* It used to appear only once a target existed, on the no-dead-controls rule.
     legodd is not an answer to the payout in front of you though - it is
     remembered across builds and reloads, so setting it first is pre-loading an
     answer rather than pressing a dead button, and the row flickering in and
     out while a custom number was typed was the same fault from the other side.
     Every-game is the real dead-controls case and keeps its own branch: there
     the count cannot move whatever the style says. */
  assert.match(src, /if\(WSP\.everyGame\)\{[\s\S]{0,900}\}\s*else\s*\{[\s\S]{0,1400}wspStyleChips/,
    "the chip row must be drawn for every case except every-game");
  assert.ok(!/else if\(WSP\.odds!=null\)\{[\s\S]{0,900}wspStyleChips/.test(src),
    "the row must no longer wait for a payout");
});
