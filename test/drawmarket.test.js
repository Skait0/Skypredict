"use strict";

/**
 * The draw, available only to somebody who asks for it.
 *
 * Requested as "a draw option selectable for users that want to place draws -
 * it can only be triggered by users, not by the slider". Both halves matter,
 * and the second is the one a test has to hold: the Slider picks on model
 * confidence against a floor, and a draw never clears a floor worth having.
 * Three-way probability puts a draw near 0.28 on a typical fixture and it tops
 * out around 0.33, so a Slider that could reach one would be quietly filling
 * slips with the least likely outcome on the card.
 *
 * Nothing extra is asked of the bookmakers for this. "X" is already mapped by
 * both - SportyBet marketId 1 / outcomeId 2, Bet9ja S_1X2_X - and it rides in
 * the 1X2 block already present in the bulk fixtures feed, so no additional
 * requests and no API change.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const mkObj = (name) => {
  const m = new RegExp("var " + name + "=\\{[\\s\\S]*?mk:(\\{[^}]*\\})").exec(src);
  assert.ok(m, name + " must declare mk");
  return eval("(" + m[1] + ")");
};

/* ------------------------------------------------------- off until asked */

test("the draw is off by default, and only the wizard has one", () => {
  /* A market that turns itself on is not a market somebody chose. */
  assert.strictEqual(mkObj("WSP").draw, false, "wizard default must be off");
  /* And the Slider has NO KEY FOR IT. It was briefly mirrored into BUILD.mk
     like every other toggle, which was inert - "X" is in neither
     allowedMarkets nor mkOn - but inert is not safe: the flag sat there set to
     true, one list change away from the Slider building draws nobody asked
     for. A key that does not exist cannot be read by accident. */
  assert.ok(!("draw" in mkObj("BUILD")),
    "BUILD.mk must not carry a draw key at all");
});

test("the chip reads the state that actually governs it", () => {
  /* A wizard-only market is absent from BUILD.mk, so asking BUILD whether it
     is on answers "undefined !== false" - true - and the chip renders LIT
     while the builder treats it as off. */
  assert.match(src, /var enabled=m\.wizardOnly \? \(WSP\.mk\[m\.k\]===true\) : \(BUILD\.mk\[m\.k\]!==false\);/,
    "a wizard-only chip must read WSP.mk, not BUILD.mk");
});

/* --------------------------------------------- the Slider cannot reach it */

test("the Slider's market list has no draw at any tier", () => {
  /* The load-bearing one. allowedMarkets is the whole of what the Slider may
     pick from, and the risk dial only widens it. */
  const fn = grab("allowedMarkets");
  assert.ok(!/"X"/.test(fn),
    "allowedMarkets offers a draw; the Slider would pick the least likely " +
    "outcome on the card as the dial goes up");
});

test("and the Slider's toggle map has no draw either", () => {
  /* Belt and braces: even were "X" to appear in allowedMarkets, mkOn is the
     second gate. Both would have to fail for a draw to reach a Slider slip. */
  const m = /var mkOn=\{[\s\S]*?\};/.exec(src);
  assert.ok(m, "the Slider's market gate must still exist");
  assert.ok(!/"X":/.test(m[0]), "mkOn must not carry a draw");
});

test("the chip is not drawn in the Slider at all", () => {
  /* Not greyed - absent. There is no risk setting that would unlock it, and a
     control that can never turn on is the dead-control failure this panel has
     had repeatedly. */
  assert.match(src, /\{k:"draw",[^}]*wizardOnly:true/,
    "the draw chip must be marked wizard-only");
  assert.match(src, /MKT_CFG\.filter\(function\(m\)\{\s*\n?\s*return !m\.wizardOnly \|\| BUILD\.mode==="wizard";/,
    "and the chip row must actually filter on it");
});

/* ------------------------------------------- and the Wizard can, when asked */

test("the Wizard offers the draw only when the toggle is on", () => {
  const fn = grab("wspMarkets");
  assert.match(fn, /if\(WSP\.mk\.draw\)m\.push\("X"\)/,
    "the wizard must add X, and only behind the toggle");
});

test("a draw is not held to a floor no draw can clear", () => {
  /* Without this the toggle would turn on and change nothing: the flat 0.5
     minimum rejects every draw on the card, since three-way probability tops
     out near 0.33.
     0.26 rather than 0.30, and the difference is the whole point. Measured
     over 863 held-out matches, the model's draw probability reached 0.30 on
     TWO - so a floor there is a market that switches on and returns an empty
     slip, which is the failure this builder keeps having. At 0.26 it covers
     about a third of the card at a 29.7% actual draw rate, against a 24.2%
     base. */
  const fn = grab("wspBuild");
  assert.match(fn, /var floor=\(c==="X"\)\?0\.26:\(c==="GG"\)\?0\.42:0\.5;/,
    "the draw needs a floor it can actually clear");
  assert.match(fn, /if\(v<floor\)return;/, "and the floor must be applied");
  assert.ok(!/0\.30/.test(/var floor=[^;]*/.exec(fn)[0]),
    "0.30 was measured to admit 2 fixtures in 863 - it must not come back");
});

test("a draw is still gradeable and still a proven market", () => {
  /* It has to be settleable, or every draw leg comes back ungraded and the
     record quietly stops describing what people actually backed. */
  const grade = fs.readFileSync(path.join(__dirname, "..", "lib", "grade.js"), "utf8");
  assert.match(grade, /t === "Draw"\) return diff === 0/, "grade.js settles a draw");
  const fn = grab("codeMarket");
  assert.match(fn, /case"X":return"Match result"/,
    "X must resolve to a market the record already grades, or isProven " +
    "holds every draw leg back as unproven");
});

/* ------------------------------------------- it asks before it turns on */

test("the draw chip does not look like the other markets", () => {
  /* Every other chip in that row is a shade of the same bet. This one backs
     the outcome the model ranks third on most fixtures, and it should not be
     one indistinguishable pill among nine. */
  assert.match(src, /\{k:"draw",[^}]*warn:true/, "the chip must be flagged");
  assert.match(src, /\(m\.warn\?" is-draw":""\)/,
    "and the flag must reach the class list");
  assert.match(src, /\.mkt-chip\.is-draw\{/, "it needs its own rule");
});

test("turning the draw ON asks first", () => {
  /* Somebody tapping a chip in a row of nine has not necessarily read what
     this one does. */
  assert.match(src, /if\(cfg&&cfg\.wizardOnly\)\{/,
    "a wizard-only market must take its own path");
  assert.match(src, /if\(cfg\.warn&&!WSP\.mk\[k\]\)\{ askDrawOn\(k\); return; \}/,
    "the on-tap must be intercepted before the toggle flips");
  const ask = src.slice(src.indexOf("window.askDrawOn="),
                        src.indexOf("window.askDrawOn=") + 1600);
  assert.match(ask, /least likely result/i, "the warning must say what it is");
  assert.match(ask, /confirm-cancel/, "and be refusable");
  /* THE COPY MUST QUOTE THE FLOOR THE BUILDER ACTUALLY USES. It said "reaches
     30%" for a while after the floor moved to 26% - a warning describing a
     rule that no longer existed, which is worse than no number at all. */
  const floor = /var floor=\(c==="X"\)\?([0-9.]+):/.exec(grab("wspBuild"));
  assert.ok(floor, "the draw floor must be findable");
  const pct = Math.round(parseFloat(floor[1]) * 100);
  assert.ok(ask.indexOf(pct + "%") >= 0,
    "the warning quotes a threshold the builder does not use - floor is " +
    pct + "% and the copy does not say so");
});

test("only confirming actually enables it", () => {
  /* The failure worth guarding: a prompt that appears while the market has
     already been switched on behind it. */
  const ask = src.slice(src.indexOf("window.askDrawOn="),
                        src.indexOf("window.askDrawOn=") + 1600);
  /* INSIDE THE HANDLER, not merely after the word "confirm-go" somewhere.
     Mutation-tested: the first comparison found "confirm-go" in the markup
     STRING, which comes before everything, so hoisting the assignment out of
     the handler - making the prompt pure decoration and the market switch on
     regardless - passed cleanly. The handler body is what has to be read. */
  const at = ask.indexOf('.confirm-go").addEventListener("click",function(){');
  assert.ok(at >= 0, "the confirm button must be wired");
  const body = ask.slice(at, ask.indexOf("});", at));
  assert.match(body, /WSP\.mk\[k\]=true/,
    "the market must be enabled INSIDE the confirm handler, not before it");
  assert.ok(!/BUILD\.mk\[k\]/.test(ask),
    "the confirm must never write the Slider's market state");
  const before = ask.slice(0, at);
  assert.ok(!/WSP\.mk\[k\]=true/.test(before),
    "the market is switched on before the reader answers - the prompt is decoration");
});

test("turning it OFF needs no ceremony", () => {
  /* Off is the safe direction. Asking there would be a nag. */
  assert.match(src, /cfg\.warn&&!WSP\.mk\[k\]/,
    "the guard must be conditional on it currently being off");
});

/* --------------------------------- where the board says a draw is live */

test("draw_watch keys on evenness, and on a league key that resolves", () => {
  /* It used to require k.draw >= 0.30, which fired on TWO of 863 held-out
     matches - 0.2% of the card against the "one game in thirty" its comment
     claimed. A flag that never fires looks exactly like one switched off.
     What predicts a draw is the sides being evenly matched, and it is a cliff:
     inside 0.10 expected goals the rate is 33.3% against a 24.2% base, past
     0.15 it flattens to about 21%. */
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.ok(!/draw_watch:\s*k\.draw >= 0\.30/.test(build),
    "the probability threshold fired on 0.2% of fixtures - it must not return");
  assert.match(build, /const gap = Math\.abs\(k\.lh - k\.la\);/,
    "draw_watch must key on how evenly matched the sides are");
  assert.match(build, /gap < \(lift >= 1\.10 \? 0\.18 : 0\.12\)/,
    "inside the cliff, widened for a league that actually draws");
  /* THE KEY HAS TO RESOLVE. drawLift is keyed on the league names carried by
     `matches`; the model is queried with idx.leagues[...]. Look it up with
     anything else and every fixture gets the default 1, the league term
     quietly does nothing, and nothing anywhere fails. */
  assert.match(build, /drawLift\.get\(idx\.leagues\[li\]\)/,
    "the lift must be looked up in the namespace matches actually use");
  assert.match(build, /acc\.get\(m\.league\)/,
    "and built in that same namespace");
});

test("the league lift is derived, not a list of names", () => {
  /* The same rule "high scoring" follows. A hardcoded league list needs
     maintaining and goes stale the season a division changes character;
     Argentina qualifies on its record (30.2% over 6,340 matches, the
     lowest-scoring league of the 36) and drops out if it stops drawing. */
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  const blk = build.slice(build.indexOf("const drawLift"), build.indexOf("const heldByDate"));
  assert.ok(blk.length > 0, "the lift table must exist");
  assert.ok(!/Argentina|Liga Profesional/.test(blk),
    "no league may be named here - the rate is the qualification");
  /* On the line that ADMITS a league, not just anywhere in the block: the
     same condition also guards the base-rate loop, so a looser match stayed
     green while every three-match league went into the table. */
  assert.match(blk, /if \(v\.n >= DRAW_MIN_N\) out\.set\(name,/,
    "a league needs a real sample before its rate is trusted");
});
