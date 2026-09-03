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

test("the draw is off by default in both builders", () => {
  /* A market that turns itself on is not a market somebody chose. */
  assert.strictEqual(mkObj("BUILD").draw, false, "slider default");
  assert.strictEqual(mkObj("WSP").draw, false, "wizard default");
});

test("the key exists rather than being undefined", () => {
  /* The chip renders lit when BUILD.mk[k] !== false, so a missing key would
     draw it ON while the builder treated it as off. */
  assert.ok("draw" in mkObj("BUILD"), "BUILD.mk must declare it explicitly");
  assert.ok("draw" in mkObj("WSP"), "WSP.mk must declare it explicitly");
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
     out near 0.33. 0.30 is the site's own bar - draw_watch uses it to flag a
     fixture as draw-ish on the board - so the chip and the flag agree. */
  const fn = grab("wspBuild");
  assert.match(fn, /var floor=\(c==="X"\)\?0\.30:\(c==="GG"\)\?0\.42:0\.5;/,
    "the draw needs its own floor or it can never be picked");
  assert.match(fn, /if\(v<floor\)return;/, "and the floor must be applied");
  const watch = /draw_watch:\s*k\.draw >= ([0-9.]+)/.exec(
    fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8"));
  assert.ok(watch, "draw_watch must still declare its threshold");
  assert.strictEqual(watch[1], "0.30",
    "the builder's draw floor is pinned to this; if the board's idea of a " +
    "live draw moves, the two must move together");
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
