"use strict";
/**
 * ONE NAVIGATION ON A PHONE, NOT TWO.
 *
 * Measured on the live build page at 390x778 on 7 Sep 2026:
 *
 *   .top    sticky  60px   Predictions | Live scores | Build me a slip
 *   .btabs  fixed   77px   Home | Build | Live
 *
 * The same three destinations twice, 136px of the viewport - 17.5% - gone
 * before any football appears, on the page whose whole job is comparing legs
 * of a slip. With the slip sheet open the chrome passed half the screen.
 *
 * The tie-break is not taste. The top row's buttons measure 34px tall, under
 * the 44x44 minimum every touch guideline asks for, and they sit in the
 * hardest corner of a phone to reach one-handed. The bottom bar is 77px and
 * sits under the thumb. So the small, hard-to-hit, duplicated copy goes.
 *
 * WHICH MEANS THE BOTTOM BAR CAN NEVER HIDE ITSELF ON A PHONE. It used to
 * disappear while the slip CTA was on screen - reasonable when it was a second
 * way into the builder, wrong once it is the only way anywhere. That observer
 * is gone with it; see the note where it used to live.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The body of one CSS rule, matched from the start of a line so a selector
   that also appears as the tail of a longer one cannot be picked up. */
function rule(selector) {
  const i = src.indexOf("\n" + selector);
  if (i < 0) return null;
  const open = src.indexOf("{", i);
  const close = src.indexOf("}", open);
  if (open < 0 || close < 0) return null;
  return src.slice(open + 1, close).replace(/\s+/g, " ").trim();
}

test("both navigations still exist - this is a phone rule, not a deletion", () => {
  assert.ok(/<nav class="nav"/.test(src), "the top nav must survive for desktop");
  assert.ok(/<nav class="btabs"/.test(src), "the bottom bar must survive");
  for (const id of ["tab-pred", "tab-live", "tab-build", "bt-pred", "bt-build", "bt-live"]) {
    assert.ok(src.includes('id="' + id + '"'), id + " has gone missing");
  }
});

test("the top nav is hidden on a phone", () => {
  /* Matched with the brace attached: ".nav" is also the start of ".navt",
     and a looser search finds a tab-padding rule hundreds of lines earlier. */
  const r = rule("  .nav{");
  assert.ok(r, "no phone rule for the top nav");
  assert.match(r, /display:\s*none/, "got: " + r);
});

test("and nothing exempts a page from that", () => {
  /* The rule that undid it: Home and Build each put tabs back, which is how
     the builder ended up with two navigations. Anything matching .nav with a
     display in a phone block is a new exemption in disguise. */
  assert.ok(!/html\.mode-\w+ \.nav(,[^{]*)?\{display:flex\}/.test(src),
    "a per-page rule is putting the header tabs back on phones");
});

test("and only inside the phone breakpoint", () => {
  /* If this escapes its media query the desktop loses its navigation
     entirely, which is the one way this change could be badly wrong.
     The index is asserted before it is used: indexOf returning -1 turns every
     check below into a tautology, which is how the first draft of this test
     passed while proving nothing. */
  const i = src.indexOf("\n  .nav{display:none}");
  assert.ok(i > 0, "the phone rule for .nav was not found at all");
  const before = src.slice(0, i);
  const openedQuery = before.lastIndexOf("@media(max-width:720px)");
  assert.ok(openedQuery > 0, "the rule is not inside a max-width:720px block");
  /* Nothing may close that block between its opening and this rule. */
  const closer = before.indexOf("\n}", openedQuery);
  assert.equal(closer, -1,
    "the media query closed before .top .nav - the rule is global and the " +
    "desktop has just lost its navigation");
});

test("the bottom bar is never hidden by scrolling any more", () => {
  /* The old rule tied the bar to .slip-cta, which is display:none on the
     builder - so it was pinned open there and could vanish elsewhere. Now it
     is the only navigation on a phone and it stays. */
  assert.ok(!/bt\.classList\.toggle\("hide"/.test(src),
    "the observer that hid the bottom bar must be gone");
  assert.ok(!/querySelector\("\.slip-cta"\)\s*\|\|\s*document\.querySelector\("\.top"\)/.test(src),
    "the .slip-cta || .top lookup was the bug - it must not come back");
});

test("the top bar keeps the things that are not navigation", () => {
  /* It stays as orientation: brand, the date, the theme toggle. Hiding the
     whole masthead would take the theme control with it. */
  for (const sel of [".logo", ".tgl"]) {
    const r = rule(sel);
    if (r) assert.doesNotMatch(r, /display:\s*none/, sel + " must not be hidden");
  }
  assert.ok(src.includes('id="tgl"'), "the theme toggle must stay reachable");
  assert.ok(src.includes('id="logo"'), "the logo must stay");
});

test("the bottom bar still clears the safe area and stays under five items", () => {
  const r = rule("  .btabs");
  assert.ok(r, "the phone rule for .btabs has gone");
  assert.match(r, /env\(safe-area-inset-bottom\)/,
    "a fixed bottom bar has to clear the home indicator: " + r);
  const items = (src.match(/class="btab[ "]/g) || []).length;
  assert.ok(items > 0 && items <= 5, "bottom navigation holds " + items + " items");
});

/* ------------------------------ and the filters that stood in front of it */

/* MEASURED ON THE SAME PHONE, 390x844, after the rail was reordered:
 *
 *   offer card     246      chips + Filters   615
 *   board heading  486      "tap a match"     682
 *   view + date    549      #list             725
 *
 * The search box and the two league selects sat between the chips and the
 * board and cost about 110px - the difference between the first fixture table
 * landing at 816 and landing below the fold entirely. They are folded behind a
 * button now, and the button rides the chip row rather than taking a row of
 * its own, so the disclosure itself costs nothing.
 *
 * The chips stay put: they answer "what kind of bet" faster than a search box
 * and hiding them would trade one hunt for another.
 */
const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("the filters fold away on a phone and never on a desktop", () => {
  /* THE FIRST CUT HID THEM AT EVERY WIDTH. The stylesheet section this lives
     in reads like a phone block and is not inside a media query, so an
     unscoped `display:none` took the search and both selects off a 1920px
     desktop, where there is no button to bring them back. Caught by asking the
     browser. Scope is the whole test: the rule must sit inside max-width:720. */
  const mob = idx.slice(idx.indexOf("@media(max-width:720px){", idx.indexOf("--- filters + finder ---")));
  const block = mob.slice(0, mob.indexOf("\n}"));
  assert.match(block, /\.bar>\.tools\{display:none\}/,
    "the collapse is not inside the phone media query");
  assert.match(block, /\.bar\.f-open>\.tools\{display:flex\}/,
    "there is no open state");
  assert.match(block, /\.fbtn\{display:inline-flex/,
    "the button is not shown on phones");
  /* And the base rule keeps it off every wider screen. */
  assert.match(idx, /\n\.fbtn\{display:none\}/,
    "the button must be hidden by default, or it appears on desktop too");
});

test("the button says what it controls, and admits when a filter is on", () => {
  assert.match(idx, /<button class="fbtn" id="fbtn" type="button" aria-expanded="false" aria-controls="tools">/,
    "the disclosure is not wired to what it opens");
  assert.match(idx, /<div class="tools" id="tools">/, "the panel has no id to point at");
  assert.match(idx, /b\.setAttribute\("aria-expanded",open\?"true":"false"\)/,
    "the state is never announced");
  /* A filter left on behind a shut panel is the one state this has to confess
     to - the control that did it is no longer on screen. */
  assert.match(idx, /function syncFilterBtn\(\)\{[\s\S]{0,200}dot\.hidden=!\(V\.q&&V\.q\.trim\(\)\)&&!V\.country&&!V\.league/,
    "a closed panel no longer shows that a filter is active");
  assert.match(idx, /renderControls\(\); renderCats\(\); syncFilterBtn\(\);/,
    "the dot is not refreshed with the rest of the board");
  /* Opening it should land the reader in the box they came for. */
  assert.match(idx, /if\(open\)\{ var q=\$\("q"\); if\(q\)/,
    "opening the panel does not focus the search");
});

test("the chips keep their row and the button rides it", () => {
  /* Zero added height is the whole point: a disclosure that costs a row of its
     own gives back only half of what it hides. */
  assert.match(idx, /<div class="cats-row">\s*<div class="cats" id="cats"><\/div>/,
    "the chips and the button are no longer on one row");
  assert.match(idx, /\.cats-row\{display:flex;align-items:center;gap:8px;min-width:0\}/);
  assert.match(idx, /\.cats-row>\.cats\{flex:1 1 auto;min-width:0\}/,
    "the scroller must be allowed to shrink or it pushes the button off the row");
  /* #cats is rebuilt from the payload on every render; a button inside it
     would be wiped by the first repaint. */
  const cats = idx.slice(idx.indexOf('<div class="cats-row">'), idx.indexOf('<div class="tools" id="tools">'));
  assert.ok(cats.indexOf('id="fbtn"') > cats.indexOf('id="cats"'),
    "the button must be a sibling of #cats, never a child");
});
