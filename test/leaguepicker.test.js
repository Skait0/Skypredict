"use strict";

/**
 * "Any league" has to look like any league.
 *
 * Asked: "if 'any league' means it can take from all available leagues, does it
 * make sense to have it all checked by default? and remove the checks as you
 * unselect the pool?"
 *
 * The logic stays opt-in, and the numbers are why. On a 14-league board,
 * narrowing to three leagues costs 3 taps opt-in against 11 opt-out, and
 * narrowing is far and away the common intent on a football site. Opt-in also
 * keeps meaning "any league" as new leagues join the model, where opt-out would
 * silently enrol each one into an old selection.
 *
 * What was genuinely wrong is that the rows showed EMPTY tick boxes while the
 * summary said "Any league". The picture contradicted the label, which is what
 * prompted the question. The empty state now reads as included.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const picker = src.slice(src.indexOf("function renderLeaguePicker("),
                         src.indexOf("function renderLeaguePicker(") + 4200);

test("an empty selection still means every league", () => {
  /* The rule the whole picker rests on. Inverting it would turn three taps into
     eleven for the thing people actually do. */
  assert.match(src, /function leagueAllowed\(l\)\{return !leaguesChosen\(\)\|\|!!BLD_LEAGUES\[l\];\}/,
    "empty must mean all; opt-out would cost 11 taps to do what 3 does now");
});

test("the list is marked as all-in when nothing is picked", () => {
  assert.match(picker, /list\.classList\.toggle\("all-in", !n\)/,
    "nothing marks the empty state, so the rows go on looking unselected");
});

test("that state gives every row a muted tick, not a red one", () => {
  /* Muted says "included by default". Red is reserved for a choice somebody
     made, which is what keeps the first tap reading as "narrow to this one"
     instead of "untick this one". */
  assert.match(src, /\.lgp-list\.all-in \.lgp-tick\{[^}]*color:var\(--faint\)/,
    "the all-in tick should be muted");
  assert.ok(!/\.lgp-list\.all-in \.lgp-tick\{[^}]*var\(--red\)/.test(src),
    "a red tick on every row makes the first tap look like it unticks that row");
  assert.match(src, /\.lgp-row\.on \.lgp-tick\{background:var\(--red\)/,
    "a deliberately chosen league must keep the red tick");
});

test("and says so in words, where the doubt is", () => {
  assert.match(picker, /All " \+ avail\.length \+\s*\n?\s*" leagues are in\./,
    "the panel should state it, not leave it to the summary button above");
  assert.match(picker, /Tap any to build from that one only/,
    "it must also say what a tap will do, since that is the non-obvious half");
});

test("the note disappears once a league is chosen", () => {
  assert.match(picker, /var allIn = n \? "" :/,
    "the all-in note must not linger once the pool is narrowed");
});

test("choosing a league still narrows rather than excludes", () => {
  /* The behaviour the note promises. */
  assert.match(picker, /setLeaguePicked\(l,!BLD_LEAGUES\[l\]\)/);
  assert.match(src, /function setLeaguePicked\(l,on\)\{\s*\r?\n?\s*if\(on\) BLD_LEAGUES\[l\]=1; else delete BLD_LEAGUES\[l\];/,
    "a tap toggles membership of the chosen set, it does not mark an exclusion");
});

test("the summary and the Clear control still describe the state", () => {
  assert.match(picker, /sum\.textContent = !n \? "Any league"/);
  assert.match(picker, /clr\.hidden=!n/,
    "Clear should only appear when there is something to clear");
});

test("only leagues actually playing are offered", () => {
  /* 49 leagues exist; 14 were on today's board. Listing all 49 would make the
     tap maths for opt-out even worse and the panel useless either way. */
  assert.match(picker, /var avail=leaguesOnBoard\(\);/);
  assert.match(src, /function leaguesOnBoard\(\)/);
});
