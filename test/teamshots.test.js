"use strict";

/* TEAM SHOTS - one side's shots over a line (30 Sep 2026).
 *
 * The owner's SportyBet code SAJ9y6 (USA over 13.5 shots) showed SportyBet
 * sells it: market 900552 home, 900553 away, lines near each team's own
 * average (7.5 to 18.5 seen). Built on total shots' machinery: the same
 * per-side rates (`sh`/`sa`), the same spread (`shotsK`), the same line gate
 * (a line is offered only where SportyBet quotes it), overs only for the same
 * calibration reason, and settled from the per-team counts results carry.
 */

const test = require("node:test");
const assert = require("node:assert");
const { src, fn, decl } = require("./books.js");
const S = require("../lib/sliplink.js");

const price = (f, k) => new Function("f", "DATA",
  fn("cLgamma") + fn("cornersOver") + fn("cornersK") + fn("mProb") +
  "return function(c){return mProb(f,c);};")(f, { shotsK: k, cornersK: 18 });

test("a team's line is priced off that team's own rate", () => {
  const f = { sh: 14.2, sa: 8.1 };
  const p = price(f, 9);
  const over = new Function(fn("cLgamma") + fn("cornersOver") + "return cornersOver;")();
  assert.ok(Math.abs(p("SHOTS_H_OV_13.5") - over(14.2, 9, 13.5)) < 1e-12);
  assert.ok(Math.abs(p("SHOTS_A_OV_8.5") - over(8.1, 9, 8.5)) < 1e-12);
  // The home side shoots more here, so the same line is likelier for it.
  assert.ok(p("SHOTS_H_OV_10.5") > p("SHOTS_A_OV_10.5"));
});

test("unders, whole lines and missing rates are not priced", () => {
  const p = price({ sh: 14.2, sa: 8.1 }, 9);
  assert.strictEqual(p("SHOTS_H_UN_13.5"), null, "overs only, as for total shots");
  assert.strictEqual(p("SHOTS_H_OV_13"), null, "a whole line pushes");
  assert.strictEqual(price({ sa: 8.1 }, 9)("SHOTS_H_OV_13.5"), null);
  assert.strictEqual(price({ sh: 14.2, sa: 8.1 }, null)("SHOTS_H_OV_13.5"), null,
    "no fitted spread, no price");
});

test("a team-shots leg settles on that team's count", () => {
  const gradeLeg = new Function(fn("gradeLeg") + "\nreturn gradeLeg;")();
  const st = { hsh: 14, ash: 6 };
  assert.strictEqual(gradeLeg({}, "SHOTS_H_OV_13.5", 1, 0, st), true);
  assert.strictEqual(gradeLeg({}, "SHOTS_A_OV_8.5", 1, 0, st), false);
  assert.strictEqual(gradeLeg({}, "SHOTS_A_UN_8.5", 1, 0, st), true);
  assert.strictEqual(gradeLeg({}, "SHOTS_H_OV_13.5", 1, 0, { hsh: -1, ash: 6 }), null,
    "a count API-Football did not have is not known");
  assert.strictEqual(gradeLeg({}, "SHOTS_H_OV_13.5", 1, 0), null, "no stats yet means wait");
});

test("it reads as the team and the line", () => {
  const mLabel = new Function(fn("esc") + fn("mLabel") + "\nreturn mLabel;")();
  const f = { home: "USA", away: "Chile" };
  assert.strictEqual(mLabel(f, "SHOTS_H_OV_13.5"), "USA over 13.5 shots");
  assert.strictEqual(mLabel(f, "SHOTS_A_UN_8.5"), "Chile under 8.5 shots");
});

test("the Team shots chip is SportyBet's alone and off by default", () => {
  assert.match(src, /\{k:"tshots", label:"Team shots", tier:0, sub:"Home or away, over", only:\["sporty"\],/);
  assert.match(src, /var BUILD=\{[^\n]*tshots:false/);
  assert.match(src, /var WSP=\{[^\n]*tshots:false/);
  const codes = new Function(decl("TEAM_SHOTS_CODES") + "\nreturn TEAM_SHOTS_CODES;")();
  assert.ok(codes.length >= 20 && codes.every((c) => /^SHOTS_[HA]_OV_\d+\.5$/.test(c)), codes.join(" "));
  const ONLY = new Function("return " + src.match(/var BOOK_ONLY=(\{[\s\S]*?\});/)[1] + ";")();
  for (const c of codes) assert.deepStrictEqual(ONLY[c], ["sporty"], c);
  // Wired into both builders, like every chip.
  assert.match(src, /TEAM_SHOTS_CODES\.forEach\(function\(c\)\{ mkOn\[c\]=BUILD\.mk\.tshots===true; \}\);/);
  assert.match(src, /if\(WSP\.mk\.tshots\)m=m\.concat\(TEAM_SHOTS_CODES\);/);
  assert.strictEqual((src.match(/\n  tshots:\[/g) || []).length, 2, "both chip-to-codes maps");
});

test("a SportyBet line the feed does not quote is not a leg", () => {
  const cornersOpen = new Function('var BOOKS={sporty:{odds:"sportyOdds"}};' + fn("cornersOpen") + "\nreturn cornersOpen;")();
  const f = { sportyOdds: { "SHOTS_H_OV_13.5": 1.68, "SHOTS_A_OV_8.5": 1.69 } };
  assert.strictEqual(cornersOpen(f, "SHOTS_H_OV_13.5"), true);
  assert.strictEqual(cornersOpen(f, "SHOTS_H_OV_10.5"), false);
});

test("a slip holding one can be shared", () => {
  const codes = new Function(decl("TEAM_SHOTS_CODES") + "\nreturn TEAM_SHOTS_CODES;")();
  const LINK = new Function(decl("LINK_MARKETS") + "\nreturn LINK_MARKETS;")();
  for (const c of codes) {
    assert.ok(LINK[c], c + " missing from LINK_MARKETS");
    assert.ok(S.MARKETS && S.MARKETS[c], c + " missing from lib/sliplink.js MARKETS");
  }
});
