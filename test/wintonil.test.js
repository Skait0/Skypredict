"use strict";

/**
 * Win to nil - No, home and away: a pick readers can add, never a board tip
 * (owner, 17 Oct 2026). Held out over 4,962 matches (fit before the last 60
 * days of data/results): home predicted 76.0%, landed 76.1%; away 83.7%,
 * landed 84.9%. The 60-70% band ran about ten points hot, so the builders take
 * it only at 80%+. Owner's price rule: x1.02 to x1.15 in every style, the
 * same floor as Bankers (17 Oct 2026).
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../lib/model.js");
const legrade = require("../lib/legrade.js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.indexOf("\nfunction " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

test("wtnh and wtna are the win-to-nil cells of the model's own scoreline matrix", () => {
  const m = M.scoreMatrix(1.7, 0.9, 8);
  const k = M.markets({ matrix: m, lh: 1.7, la: 0.9, total: 2.6 }, { drawBoost: 0 });
  let h = 0, a = 0;
  m.forEach((row, i) => row.forEach((p, j) => { if (i > 0 && j === 0) h += p; if (j > 0 && i === 0) a += p; }));
  assert.ok(Math.abs(k.wtnh - h) < 1e-9 && Math.abs(k.wtna - a) < 1e-9);
  assert.ok(k.wtnh > k.wtna, "the stronger side wins to nil more often");
  assert.ok(k.wtnh < k.home, "winning to nil is a subset of winning");
});

test("graded the same on the page and on the server: No loses only to a win without conceding", () => {
  const gradeLeg = new Function(grab("gradeLeg") + "\nreturn gradeLeg;")();
  const cases = [[2, 0, false, true], [1, 0, false, true], [2, 1, true, true], [0, 0, true, true],
    [0, 2, true, false], [1, 1, true, true], [0, 1, true, false]];
  for (const [hg, ag, home, away] of cases) {
    assert.strictEqual(gradeLeg({}, "WTN_H_N", hg, ag), home, `page home ${hg}-${ag}`);
    assert.strictEqual(gradeLeg({}, "WTN_A_N", hg, ag), away, `page away ${hg}-${ag}`);
    assert.strictEqual(legrade.gradeLeg("WTN_H_N", { hg, ag }), home, `server home ${hg}-${ag}`);
    assert.strictEqual(legrade.gradeLeg("WTN_A_N", { hg, ag }), away, `server away ${hg}-${ag}`);
  }
});

test("the builders take it only on a real price x1.02-1.15, and at 80%+", () => {
  const consts = /var WTN_MIN=[^\n]*/.exec(src)[0];
  const BOOKS = { sporty: { odds: "sportyOdds" }, bet9ja: { odds: "bet9jaOdds" } };
  /* The gate with what it reads since 19 Oct 2026: the day's fixtures (wtnLevel). A busy day here,
     so the strict 80% applies; the thin-day test below drops it. */
  const D = "2026-10-24";
  const busy = Array.from({ length: 10 }, () => ({ date: D, sportyOdds: { WTN_H_N: 1.12 }, p: 0.85 }));
  const make = (bankers, book = "sporty", day = busy) => new Function("bookQuotes", "legOdd", "curBook", "bankersOn", "BOOKS", "mProb", "DATA",
    consts + "\n" + grab("wtnPriced") + "\n" + grab("wtnOk") + "\nvar WTN_LV={};\n" + grab("wtnLevel") + "\nreturn wtnOk;")(
    (f, c, B) => !!(f[B.odds] && f[B.odds][c] > 1.01),
    (f, c, p, B) => (f[B.odds] && f[B.odds][c] > 1.01 ? f[B.odds][c] : f.sportyOdds && f.sportyOdds[c]),
    () => Object.assign({ key: book }, BOOKS[book]),
    () => bankers, BOOKS, (f, c) => (c === "WTN_H_N" ? f.p : null), { fixtures: day });
  const ok = make(false), bk = make(true);
  const f = (o) => ({ date: D, sportyOdds: { WTN_H_N: o } });
  assert.strictEqual(ok(f(1.12), "WTN_H_N", 0.85), true);
  assert.strictEqual(ok(f(1.15), "WTN_H_N", 0.85), true, "x1.15 is the top");
  assert.strictEqual(ok(f(1.16), "WTN_H_N", 0.9), false, "never above x1.15");
  assert.strictEqual(ok(f(1.30), "WTN_H_N", 0.9), false, "x1.30 was the old top");
  assert.strictEqual(ok(f(1.05), "WTN_H_N", 0.95), true, "x1.02 up in every style, like Bankers");
  assert.strictEqual(bk(f(1.05), "WTN_H_N", 0.95), true, "Bankers takes x1.02 up");
  assert.strictEqual(bk(f(1.01), "WTN_H_N", 0.99), false, "a collapsed price is not a price");
  assert.strictEqual(ok(f(1.12), "WTN_H_N", 0.79), false, "under 80% is refused");
  assert.strictEqual(ok({ sportyOdds: {} }, "WTN_H_N", 0.95), false, "no price anywhere, no leg");
  /* Bet9ja, BetKing and betPawa sell it but their feeds do not carry it (17 Oct 2026):
     SportyBet's price stands in, or the chip builds nothing on those books. */
  const b9 = make(false, "bet9ja");
  assert.strictEqual(b9(f(1.12), "WTN_H_N", 0.85), true, "SportyBet's price stands in for a book whose feed lacks it");
  assert.strictEqual(b9({ sportyOdds: { WTN_H_N: 1.12 }, bet9jaOdds: { WTN_H_N: 1.25 } }, "WTN_H_N", 0.85), false, "the book's own price wins when it has one");
  assert.strictEqual(b9(f(1.2), "WTN_H_N", 0.85), false, "the cap holds on the stand-in price too");
  assert.match(grab("judgedP"), /if\(\/\^WTN_\[HA\]_N\$\/\.test\(code\)&&!wtnOk\(f,code,p\)\) return -1;/, "every builder goes through judgedP");
  /* ONLY ON A THIN DAY (owner, 19 Oct 2026: "only on thin days! dont forget that rule"): with
     too few games at 80% the day steps to 77%, then 75% - never lower, and the cap never moves. */
  const thin = make(false, "sporty", busy.slice(0, 3));
  assert.strictEqual(thin(f(1.12), "WTN_H_N", 0.76), true, "a thin day takes 75%+");
  assert.strictEqual(thin(f(1.12), "WTN_H_N", 0.74), false, "never under 75%");
  assert.strictEqual(thin(f(1.2), "WTN_H_N", 0.9), false, "the x1.15 cap holds on a thin day too");
  assert.strictEqual(ok(f(1.12), "WTN_H_N", 0.76), false, "a busy day keeps 80%");
});

test("it is a pick and a chip, off by default, never the board's tip, and 1xBet is never asked", () => {
  assert.ok(src.includes('opt(esc(f.home)+" won\'t win to nil",mProb(f,"WTN_H_N"),false,"WTN_H_N",id)'));
  assert.match(src, /\{k:"wtn", label:"Win to nil: No", tier:0,/);
  assert.strictEqual((src.match(/nr3:false,wtn:false,/g) || []).length, 2, "off in the Slider and the Wizard");
  assert.match(src, /"WTN_H_N":\["sporty","bet9ja","betking","betpawa","betway"\]/, "1xBet does not sell it");
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.doesNotMatch(build, /WTN_/, "the build never makes it a tip");
});
