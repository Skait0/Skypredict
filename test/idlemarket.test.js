"use strict";

/**
 * A market you switched on that changed nothing must say so.
 *
 * Reported: "the team to score over 1.5 toggle, check if its effective as i
 * dont see the options picked in the slips."
 *
 * It IS effective. With Team over 1.5 as the only market on, the builder
 * produces a full 40-leg slip entirely of HOME_OVER_1.5 / AWAY_OVER_1.5, and
 * every one of the eleven toggles behaves the same way. What it does not do is
 * appear ALONGSIDE the defaults at Balanced - measured on a 394-fixture board,
 * turning it on there produces a slip byte-identical to leaving it off.
 *
 * That is not a fault. A team scoring twice is genuinely unlikely: only 101 of
 * 790 candidates clear the 50% floor, and the survivors are priced 1.9 to 3.0
 * while the Balanced band is 1.28 to 1.95. At Fewer games the band moves to
 * 1.53-2.34 and four of nine legs become team-over-1.5 immediately.
 *
 * But the panel said none of that, and a control that visibly does nothing is
 * indistinguishable from one that is broken. This site has the rule already,
 * from the league picker that showed five leagues of twenty-eight correctly
 * and explained nothing: a list that is right while explaining nothing looks
 * broken, so name the window.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ");

function lift(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  assert.ok(i >= 0, "not found: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const codesDecl = /var MKT_CODES=\{[\s\S]*?\};/.exec(src);
assert.ok(codesDecl, "MKT_CODES must exist");
const idleMarkets = new Function("WSP",
  codesDecl[0] + lift("idleMarkets") + "\nreturn idleMarkets;");

const MK = (on) => {
  const m = { wd: false, any: false, out: false, o15: false, o25: false, o35: false,
    fh: false, tts: false, tts2: false, both: false, draw: false };
  on.forEach((k) => { m[k] = true; });
  return { mk: m };
};
const pick = (c) => ({ code: c });

/* ------------------------------------------------------- when to speak */

test("silent when every market on contributed", () => {
  /* The common case, and it must cost nothing - a note that appears on a
     healthy slip is noise on every build. */
  const f = idleMarkets(MK(["wd", "o15"]));
  assert.deepStrictEqual(f([pick("1X"), pick("OVER_1.5")]), []);
});

test("names a market that produced no legs", () => {
  const f = idleMarkets(MK(["wd", "tts2"]));
  assert.deepStrictEqual(f([pick("1X"), pick("X2")]), ["tts2"]);
});

test("either side of a two-code market counts", () => {
  /* Team-to-score is two codes and one chip. One leg from either is the chip
     doing its job. */
  const f = idleMarkets(MK(["tts"]));
  assert.deepStrictEqual(f([pick("AWAY_OVER_0.5")]), [],
    "the away side alone is still the chip working");
});

test("a market that is OFF is never reported", () => {
  /* Only a switch somebody actually flipped can disappoint them. */
  const f = idleMarkets(MK(["wd"]));
  assert.deepStrictEqual(f([pick("1X")]), []);
});

test("several idle markets are all collected", () => {
  const f = idleMarkets(MK(["wd", "tts2", "o35"]));
  assert.deepStrictEqual(f([pick("1X")]).sort(), ["o35", "tts2"]);
});

/* --------------------------------------------------------- what it says */

test("three reasons, and the actionable one wins", () => {
  /* "floor" - nothing on the card clears its confidence bar
     "range" - it would appear at a longer slip style, so say so
     "outranked" - it is in range, another market was simply safer
     Only "range" tells the reader something they can do, so when several
     markets sit out for different reasons that is the sentence shown. */
  assert.match(code, /var reason = reasons\.indexOf\("range"\)>=0 \? "range"/,
    "range must take priority when present");
  assert.match(code, /"no game clears its confidence bar today\."/);
  assert.match(code, /"priced above this slip style - try <b>Fewer games<\/b>\."/);
  assert.match(code, /"a safer market won on every game\."/);
});

test("the reason is tested, not modelled", () => {
  /* Whether a market is merely priced out of THIS style is decided by
     rebuilding at the longest style and looking. Reconstructing the per-leg
     band out here would be a second copy of that arithmetic, and a second
     copy drifts and then gives confident wrong advice. */
  assert.match(code, /function longStyleCodes\(\)\{/,
    "the long-style probe must exist");
  assert.match(code, /WSP\.legodd=1\.7;/, "it must actually use the longest style");
  assert.match(code, /WSP\.legodd=was;/,
    "and it must put the user's own style back, or the probe changes the slip");
});

test("the label comes from the chip, not a second list", () => {
  /* MKT_CFG is local to renderShared. Copying its labels here would give the
     same market two names that drift apart the first time one is reworded -
     and the note should say exactly what the button the reader is looking at
     says. */
  assert.match(code, /document\.querySelector\('\.mkt-chip\[data-m="'\+k\+'"\] span/,
    "the label must be read off the rendered chip");
  assert.ok(!/MKT_CODES=\{[^}]*label/.test(code),
    "MKT_CODES must map codes only - labels live on the chips");
});

/* ------------------------------------------------- how it behaves on a phone */

test("it takes no space when there is nothing to say", () => {
  /* :not(:empty) rather than a class, so an empty string is genuinely empty
     and cannot leave a gap under the chip row on a phone. */
  assert.match(code, /#mkIdle:not\(:empty\)\{margin:8px 0 0\}/,
    "the margin must be conditional on having content");
  assert.match(code, /host\.innerHTML=""; return;/,
    "and the empty case must clear the node outright");
});

test("it is one line, not one per market", () => {
  /* A list of reasons is longer than the chip row it explains, and at 560px
     that row is already three rows tall. Measured at 426px: two lines, 33px,
     against a 141px chip row. */
  assert.match(code, /host\.innerHTML="<p class='mk-idle'>/,
    "a single paragraph");
  assert.match(code, /esc\(names\.join\(", "\)\)/,
    "with the idle markets named together");
  assert.match(code, /@media\(max-width:560px\)\{ \.mk-idle\{font-size:11\.5px\} \}/,
    "and a smaller size on a phone");
});

test("it never stands in front of the slip", () => {
  /* Working out WHY costs a second build of the whole board - up to 260ms
     measured, and a phone is slower. The slip is what was asked for. */
  assert.match(code, /setTimeout\(function\(\)\{ try\{ renderIdleMarkets\(r\.picks\); \}catch\(e\)\{\} \},0\);/,
    "the note must be deferred off the build path");
});

test("it is cleared when the markets change", () => {
  /* The note describes the slip that was built, so it stops being true the
     moment a chip is tapped. Leaving it would explain a market that is now
     off. */
  assert.match(code, /var _idle=\$\("mkIdle"\); if\(_idle\) _idle\.innerHTML="";/,
    "tapping a market chip must clear the note");
});
