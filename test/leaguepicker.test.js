"use strict";

/**
 * The picker reads as untick-to-remove.
 *
 * Every league row starts ticked and a tap takes that one out; volatile
 * leagues are listed unticked with a small "Volatile" tag. The summary chip
 * says "N leagues" (the ones in) until something is tapped, then "N of M
 * leagues" (behaviour pinned in volatile.test.js), and the
 * reset reads "All leagues" and goes through the same ask as the chip.
 * Behaviour is pinned in leaguepick.test.js and volatile.test.js; these pin
 * the markup that has to say it.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const picker = src.slice(src.indexOf("function renderLeaguePicker("),
                         src.indexOf("function renderSliderPanel("));

test("one predicate decides every row's tick", () => {
  assert.match(picker, /var on=leagueAllowed\(x\.league\);/);
  assert.match(picker, /"<button class='lgp-row"\+\(on\?" on":""\)/);
  assert.match(picker, /aria-pressed='"\+on\+"'/);
});

test("a tap flips just that league", () => {
  assert.match(picker, /setLeaguePicked\(l,!leagueAllowed\(l\)\)/);
});

test("volatile rows carry a small tag", () => {
  assert.match(picker, /isVolatile\(x\.league\)\?"<span class='lgp-vol'>Volatile<\/span>"/);
  assert.match(src, /\.lgp-row \.lgp-vol\{/);
});

test("the summary and the reset describe the new model", () => {
  assert.match(picker, /clr\.hidden=!touched/);
  assert.match(src, /id="lgpClear">All leagues<\/button>/);
  assert.match(picker, /clr\.addEventListener\("click",function\(e\)\{\s*e\.stopPropagation\(\);\s*resetLeagues\(\);/,
    "the picker's reset must go through the same ask as the chip");
});

test("the note says every league is in and what a tap does", () => {
  assert.match(picker, /leagues are in\.<\/b> /);
  assert.match(picker, /Tap any to leave it out\./);
  assert.match(picker, /wait on the bench until you tick them/);
});

test("the All leagues chip resets through the ask", () => {
  assert.match(src, /if\(c\.dataset\.btp==="true"\)\{ setTopOnly\(true\); renderBuilder\(\); \}\s*else resetLeagues\(\);/);
});

test("only leagues actually playing are offered", () => {
  assert.match(picker, /var avail=leaguesOnBoard\(\);/);
});

test("nothing is left on the old include-set", () => {
  assert.ok(!/BLD_LEAGUES|leagueChosenCount/.test(src));
  assert.ok(!/bldleagues:/.test(src), "sync must not carry the dropped key");
});
