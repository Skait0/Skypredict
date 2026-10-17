"use strict";

/**
 * Win to nil - No, home and away: a pick readers can add, never a board tip
 * (owner, 17 Oct 2026). Held out over 4,962 matches (fit before the last 60
 * days of data/results): home predicted 76.0%, landed 76.1%; away 83.7%,
 * landed 84.9%. The 60-70% band ran about ten points hot, so the builders take
 * it only at 80%+. Owner's price rule: never above x1.15 in any style, from
 * x1.10, and Bankers from x1.02 (under its own x1.25 cap).
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

test("the builders take it only on a real price x1.10-1.15, Bankers from x1.02, and at 80%+", () => {
  const consts = /var WTN_MIN=[^\n]*/.exec(src)[0];
  const make = (bankers) => new Function("bookQuotes", "legOdd", "curBook", "bankersOn",
    consts + "\n" + grab("wtnOk") + "\nreturn wtnOk;")(
    (f, c) => !!(f.sportyOdds && f.sportyOdds[c] > 1.01),
    (f, c) => f.sportyOdds[c],
    () => ({ odds: "sportyOdds" }),
    () => bankers);
  const ok = make(false), bk = make(true);
  const f = (o) => ({ sportyOdds: { WTN_H_N: o } });
  assert.strictEqual(ok(f(1.12), "WTN_H_N", 0.85), true);
  assert.strictEqual(ok(f(1.15), "WTN_H_N", 0.85), true, "x1.15 is the top");
  assert.strictEqual(ok(f(1.16), "WTN_H_N", 0.9), false, "never above x1.15");
  assert.strictEqual(ok(f(1.30), "WTN_H_N", 0.9), false, "x1.30 was the old top");
  assert.strictEqual(ok(f(1.05), "WTN_H_N", 0.95), false, "under x1.10 outside Bankers");
  assert.strictEqual(bk(f(1.05), "WTN_H_N", 0.95), true, "Bankers takes x1.02 up");
  assert.strictEqual(bk(f(1.01), "WTN_H_N", 0.99), false, "a collapsed price is not a price");
  assert.strictEqual(ok(f(1.12), "WTN_H_N", 0.79), false, "under 80% is refused");
  assert.strictEqual(ok({ sportyOdds: {} }, "WTN_H_N", 0.95), false, "no price at the book, no leg");
  assert.match(grab("judgedP"), /if\(\/\^WTN_\[HA\]_N\$\/\.test\(code\)&&!wtnOk\(f,code,p\)\) return -1;/, "every builder goes through judgedP");
});

test("it is a pick and a chip, off by default, never the board's tip, and 1xBet is never asked", () => {
  assert.ok(src.includes('opt(esc(f.home)+" won\'t win to nil",mProb(f,"WTN_H_N"),false,"WTN_H_N",id)'));
  assert.match(src, /\{k:"wtn", label:"Win to nil: No", tier:0,/);
  assert.strictEqual((src.match(/nr3:false,wtn:false,/g) || []).length, 2, "off in the Slider and the Wizard");
  assert.match(src, /"WTN_H_N":\["sporty","bet9ja","betking","betpawa","betway"\]/, "1xBet does not sell it");
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.doesNotMatch(build, /WTN_/, "the build never makes it a tip");
});
