"use strict";

/* HANDICAPS (30 Sep 2026). Owner: "my dad loves the options, he doesnt care
 * how small they are, just a high possibility that they will come through"
 * - the 3-way handicap, (0:1) and (0:2).
 *
 * Every line either family sells at one and two goals is a tail of the
 * scoreline grid the model already builds, so the build ships four numbers
 * per fixture - `mg` = [home by 2+, home by 3+, away by 2+, away by 3+] -
 * and the page reads every price off them. On the safe side the two families
 * are the SAME bet: "Leeds (0:2)" wins unless Leeds lose by 2+, which is
 * "Leeds +1.5". So a reader on SportyBet or Bet9ja, who sell no 3-way
 * handicap, gets the pick as the Asian half line every book sells.
 */

const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");
const { src, fn, decl } = require("./books.js");

function marketsFor(lh, la) {
  const p = M.predictTotalsFrom ? M.predictTotalsFrom(lh, la)
    : { lh, la, total: lh + la, matrix: M.scoreMatrix(lh, la, 200), k: 200 };
  return M.markets(p, { k: 200 });
}

test("the model reads margin tails off the same grid as the result", () => {
  const k = marketsFor(2.2, 0.8);
  assert.ok(k.hBy2 > k.hBy3 && k.hBy3 > 0, "home by 3+ is inside home by 2+");
  assert.ok(k.hBy2 < k.home, "winning by 2+ is inside winning");
  assert.ok(k.aBy2 < k.away && k.aBy3 < k.aBy2);
  assert.ok(k.hBy2 > k.aBy2, "the stronger side wins big more often");
});

test("the build ships them as mg on every board fixture", () => {
  const B = require("fs").readFileSync(require("path").join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(B, /mg: \[r\(k\.hBy2\), r\(k\.hBy3\), r\(k\.aBy2\), r\(k\.aBy3\)\]/);
});

const price = (f) => new Function("f", "DATA",
  fn("cLgamma") + fn("cornersOver") + fn("cornersK") + fn("mProb") +
  "return function(c){return mProb(f,c);};")(f, {});

// A strong home side: home 62%, draw 22%, away 16%; home by 2+ 34%, by 3+ 15%;
// away by 2+ 5%, by 3+ 1.5%.
const F = { home_p: 0.62, draw_p: 0.22, away_p: 0.16, dc1x: 0.84, dcx2: 0.38,
            mg: [0.34, 0.15, 0.05, 0.015] };

test("every 3-way handicap outcome at one and two goals is priced", () => {
  const p = price(F);
  const near = (a, b, c) => assert.ok(Math.abs(a - b) < 1e-9, c + ": " + a + " vs " + b);
  near(p("EH_0_1_1"), 0.34, "home win by 2+");
  near(p("EH_0_1_X"), 0.62 - 0.34, "home win by exactly 1");
  near(p("EH_0_1_2"), 1 - 0.62, "draw or away - double chance");
  near(p("EH_0_2_2"), 1 - 0.34, "away don't lose by 2+");
  near(p("EH_1_0_1"), 1 - 0.16, "home don't lose");
  near(p("EH_1_0_2"), 0.05, "away win by 2+");
  near(p("EH_2_0_X"), 0.05 - 0.015, "away win by exactly 2");
  for (const n of ["0_1", "0_2", "1_0", "2_0"]) {
    const s = p("EH_" + n + "_1") + p("EH_" + n + "_X") + p("EH_" + n + "_2");
    near(s, 1, "EH " + n + " sums to one");
  }
});

/* OUR AH CODES CARRY THE HOME TEAM'S LINE: AH_2_L is the away side at -L.
   So away +1.5 is AH_2_-1.5 - see mLabel and the 1xBet sign fix of 30 Sep. */
test("the Asian half lines at 1.5 and 2.5 are the same tails", () => {
  const p = price(F);
  assert.strictEqual(p("AH_2_-1.5"), p("EH_0_2_2"), "(0:2) on the away side IS away +1.5");
  assert.strictEqual(p("AH_1_-1.5"), p("EH_0_1_1"), "(0:1) on the home side IS home -1.5");
  assert.ok(Math.abs(p("AH_2_-2.5") - (1 - 0.15)) < 1e-9, "away +2.5");
  assert.ok(Math.abs(p("AH_1_1.5") - (1 - 0.05)) < 1e-9, "home +1.5");
  assert.ok(Math.abs(p("AH_2_1.5") - 0.05) < 1e-9, "away -1.5: away win by 2+");
  // Both ends of one line are complements.
  assert.ok(Math.abs(p("AH_1_-1.5") + p("AH_2_-1.5") - 1) < 1e-9);
});

test("no tails, no price - never a guess", () => {
  const p = price({ home_p: 0.6, draw_p: 0.25, away_p: 0.15 });
  for (const c of ["EH_0_2_2", "AH_2_-1.5", "AH_1_-2.5"]) assert.strictEqual(p(c), null, c);
});

test("the Handicap chip offers the safe side on every book", () => {
  assert.match(src, /\{k:"hcap", label:"Handicap", tier:0, sub:"\(0:1\) \/ \(0:2\), the safe side",/);
  assert.match(src, /var BUILD=\{[^\n]*hcap:false/);
  assert.match(src, /var WSP=\{[^\n]*hcap:false/);
  const codes = new Function(decl("HCAP_CODES") + "\nreturn HCAP_CODES;")();
  assert.deepStrictEqual(codes.slice().sort(),
    ["AH_1_-1", "AH_1_-1.5", "AH_1_1", "AH_1_1.5", "AH_1_2", "AH_1_2.5",
     "AH_2_-1", "AH_2_-1.5", "AH_2_-2", "AH_2_-2.5", "AH_2_1", "AH_2_1.5"]);
  assert.match(src, /HCAP_CODES\.forEach\(function\(c\)\{ mkOn\[c\]=BUILD\.mk\.hcap===true; \}\);/);
  assert.match(src, /if\(WSP\.mk\.hcap\)m=m\.concat\(HCAP_CODES\);/);
  assert.strictEqual((src.match(/\n  hcap:\[/g) || []).length, 2, "both chip-to-codes maps");
});

test("the leg says which handicap it is, in both families' words", () => {
  const mLabel = new Function(fn("esc") + fn("mLabel") + "\nreturn mLabel;")();
  const f = { home: "Arsenal", away: "Leeds" };
  assert.strictEqual(mLabel(f, "AH_2_-1.5"), "Leeds +1.5 (handicap 0:2)");
  assert.strictEqual(mLabel(f, "AH_1_-1.5"), "Arsenal -1.5 (handicap 0:1)");
  assert.strictEqual(mLabel(f, "AH_2_-2.5"), "Leeds +2.5 (handicap 0:3)");
  assert.strictEqual(mLabel(f, "AH_1_1.5"), "Arsenal +1.5 (handicap 2:0)");
  assert.strictEqual(mLabel(f, "AH_2_1.5"), "Leeds -1.5 (handicap 1:0)");
});

/* WHOLE LINES (30 Sep 2026): +1 / +2 either side, and -1 for either side.
   A whole line gives the stake back when the margin lands on it, which in an
   accumulator drops the leg and keeps the slip alive. So the number the
   builder ranks by is the chance the leg SURVIVES - wins or comes back - and
   +1 survives exactly when +1.5 wins, at a better price. That is why the
   owner's dad wanted them: same safety, more money. */
test("a whole line is priced as the chance it does not lose", () => {
  const p = price(F);
  const near = (a, b, c) => assert.ok(Math.abs(a - b) < 1e-9, c + ": " + a + " vs " + b);
  near(p("AH_1_1"), p("AH_1_1.5"), "home +1 survives exactly when home +1.5 wins");
  near(p("AH_2_-1"), p("AH_2_-1.5"), "away +1 likewise");
  near(p("AH_1_2"), p("AH_1_2.5"), "home +2");
  near(p("AH_2_-2"), p("AH_2_-2.5"), "away +2");
  near(p("AH_1_-1"), F.home_p, "home -1 survives when home wins (by 1: refund)");
  near(p("AH_2_1"), F.away_p, "away -1 survives when away wins");
});

test("whole lines are offered only where they are sold", () => {
  const ONLY = new Function("return " + src.match(/var BOOK_ONLY=(\{[\s\S]*?\});/)[1] + ";")();
  for (const c of ["AH_1_1", "AH_1_2", "AH_2_-1", "AH_2_-2", "AH_1_-1", "AH_2_1"]) {
    assert.deepStrictEqual(ONLY[c], ["sporty", "bet9ja", "onexbet"], c);
  }
  const codes = new Function(decl("HCAP_CODES") + "\nreturn HCAP_CODES;")();
  for (const c of ["AH_1_1", "AH_1_2", "AH_2_-1", "AH_2_-2", "AH_1_-1", "AH_2_1"]) {
    assert.ok(codes.includes(c), c + " not on the Handicap chip");
  }
});

test("a whole line says what happens on the exact margin", () => {
  const mLabel = new Function(fn("esc") + fn("mLabel") + "\nreturn mLabel;")();
  const f = { home: "Arsenal", away: "Leeds" };
  assert.strictEqual(mLabel(f, "AH_2_-1"), "Leeds +1 (stake back if they lose by 1)");
  assert.strictEqual(mLabel(f, "AH_1_-1"), "Arsenal -1 (stake back if they win by 1)");
  assert.strictEqual(mLabel(f, "AH_1_2"), "Arsenal +2 (stake back if they lose by 2)");
});
