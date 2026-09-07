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
