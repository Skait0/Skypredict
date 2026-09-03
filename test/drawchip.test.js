"use strict";

/**
 * The draw chip's stripes must not reach a single child element.
 *
 * Reported from a phone: "when i click on the draw button it shows two big
 * circles", then "it gets big along with both score. flashes briefly". That
 * second line is what identified it - Both score is the draw chip's row-mate in
 * the three-column mobile grid, and a whole GRID ROW stretching is a very
 * different fault from one chip misbehaving.
 *
 * Cause, and it is a trap worth a permanent test: the page installs a global
 * ripple handler that APPENDS `<span class="rip-ink">` into whatever was
 * clicked, sized to the element's longest side and positioned absolutely. The
 * first version of the stripe styling lifted the chip's content above the
 * pseudo-element with `.mkt-chip.is-draw>*{position:relative;z-index:1}`. That
 * selector outranks `.rip-ink`'s own class rule, so the ink was forced back
 * into flow: a 159x159 square inside a 31px-tall flex chip, the chip grew to
 * fit, the grid row grew with it, and at border-radius:99px both chips in the
 * row rendered as circles for the 560ms the ripple lives.
 *
 * Measured at a real 536px viewport, before and after: the last two chips went
 * 159x31 -> 159x173 on click, and now hold 159x31 throughout.
 *
 * The lesson generalises past this chip: a `>*` or descendant rule is a rule
 * about elements you have not written yet. Anything that injects a child - a
 * ripple, a tooltip, a focus ring - inherits it.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* CSS comments, gone before anything tries to read braces.
   The comment above the stripe layer quotes the broken selector verbatim -
   `>*{position:relative;z-index:1}` - so a parser that trusts braces finds the
   bug inside the note explaining the bug, and fails on a file that is correct.
   Documenting the trap is worth more than a shorter comment; parsing properly
   is cheaper than pruning the prose. */
const css = src.replace(/\/\*[\s\S]*?\*\//g, " ");

/* Every selector in the stylesheet that targets children of the draw chip. */
function childSelectorsOfDrawChip() {
  const out = [];
  const re = /(^|[},])\s*([^{}]*\.mkt-chip\.is-draw[^{}]*)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[2].trim(), body = m[3];
    /* A selector that reaches past the chip itself: a combinator after
       .is-draw, but not a pseudo-element, which is ours and cannot be
       injected by anything. */
    if (/\.is-draw\s*(>|\s+)[^:{]/.test(sel.replace(/::[a-z-]+/g, "")))
      out.push({ sel, body });
  }
  return out;
}

test("no rule reaches an arbitrary child of the draw chip", () => {
  const bad = childSelectorsOfDrawChip().filter((r) => /\>\s*\*/.test(r.sel));
  assert.deepStrictEqual(bad.map((r) => r.sel), [],
    "a `>*` rule on this chip also applies to the ripple ink the global click " +
    "handler injects into it, which is exactly how the chip became a circle");
});

test("and nothing scoped to the chip repositions a child", () => {
  /* Narrower than the rule above and the one that actually bit: it is
     `position` being overridden that broke the ripple, whatever selector
     shape gets there. A rule aimed at our own .mkt-icon is fine - that
     element is ours and is never injected. */
  const risky = childSelectorsOfDrawChip().filter((r) =>
    /(^|[;{\s])position\s*:/.test(r.body) && !/\.mkt-icon/.test(r.sel));
  assert.deepStrictEqual(risky.map((r) => r.sel), [],
    "setting position on a child of this chip overrides .rip-ink's own " +
    "position:absolute and drops a chip-sized square into the flex flow");
});

test("the stripes sit behind the label without any child rule", () => {
  /* isolation:isolate makes the chip a stacking context, and inside one a
     negative z-index paints above the element's own background but below its
     in-flow content. Both halves are required: without the isolation, z-index
     -1 escapes the chip and hides behind its background instead. */
  const chip = /\.mkt-chip\.is-draw\{([^}]*)\}/.exec(css);
  assert.ok(chip, "the draw chip rule must exist");
  assert.match(chip[1], /isolation:\s*isolate/,
    "without a stacking context the negative z-index paints behind the chip's " +
    "own background and the stripes vanish");
  const before = /\.mkt-chip\.is-draw::before\{([^}]*)\}/.exec(css);
  assert.ok(before, "the stripe layer must exist");
  assert.match(before[1], /z-index:\s*-1/,
    "the stripe layer must sit below the label, not above it");
});

test("the ripple ink is still absolutely positioned", () => {
  /* The thing every one of the rules above is protecting. */
  const ink = /\.rip-ink\{([^}]*)\}/.exec(css);
  assert.ok(ink, ".rip-ink must still be styled");
  assert.match(ink[1], /position:\s*absolute/,
    "in flow, the ink is a square the size of the element it was clicked in");
});

test("the ripple handler still injects into the clicked element", () => {
  /* If this ever stops being a child append, the rules above are guarding
     nothing and should be revisited rather than left as cargo. */
  assert.match(src, /ink\.className\s*=\s*'rip-ink'/,
    "the ripple still builds a .rip-ink span");
  assert.match(src, /el\.appendChild\(ink\)/,
    "and still appends it INTO the clicked element - which is why any rule " +
    "this page writes about that element's children applies to it");
});
