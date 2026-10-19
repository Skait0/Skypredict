"use strict";

/**
 * The half-time legs: picks readers can add, never board tips (owner, 17 Oct
 * 2026: "add the top four"). 1st half under 2.5, half-time home or draw, 2nd
 * half over 0.5 and 2nd half under 2.5. Held out over 5,518 matches with
 * half-time scores, every one was calibrated within about two points, so the
 * builders take them like Win to nil: 80%+ and x1.02 to x1.15 ("same window
 * x1.02 to x1.15 for all four"). Settled from the half-time score, so only the
 * server can grade them.
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

test("the four come off the two half matrices the backtest used", () => {
  const lh = 1.8, la = 1.0, share = 0.447;
  const k = M.markets({ matrix: M.scoreMatrix(lh, la, 8), lh, la, total: lh + la }, { drawBoost: 0, fhShare: share, k: 8 });
  const F = M.scoreMatrix(lh * share, la * share, 8), S = M.scoreMatrix(lh * (1 - share), la * (1 - share), 8);
  const sum = (m, fn) => m.reduce((s, row, i) => s + row.reduce((t, p, j) => t + (fn(i, j) ? p : 0), 0), 0);
  assert.ok(Math.abs(k.fhU25 - sum(F, (i, j) => i + j <= 2)) < 1e-9);
  assert.ok(Math.abs(k.ht1x - sum(F, (i, j) => i >= j)) < 1e-9);
  assert.ok(Math.abs(k.shO05 - (1 - S[0][0])) < 1e-9);
  assert.ok(Math.abs(k.shU25 - sum(S, (i, j) => i + j <= 2)) < 1e-9);
  assert.ok(k.shO05 > k.fhO05, "more goals come after the break");
  assert.ok(k.fhU25 > k.shU25, "so the first half stays under more often");
});

test("graded on the server from the half-time score, never guessed without one", () => {
  const g = (c, hg, ag, hth, hta) => legrade.gradeLeg(c, { hg, ag, hth, hta });
  assert.strictEqual(g("FH_UNDER_2.5", 3, 1, 2, 0), true);
  assert.strictEqual(g("FH_UNDER_2.5", 3, 1, 2, 1), false);
  assert.strictEqual(g("FH_DC_1X", 0, 2, 0, 0), true, "level at the break is home or draw");
  assert.strictEqual(g("FH_DC_1X", 2, 1, 0, 1), false, "behind at the break loses, whatever happens after");
  assert.strictEqual(g("SH_OVER_0.5", 1, 0, 1, 0), false, "the only goal came before the break");
  assert.strictEqual(g("SH_OVER_0.5", 1, 1, 1, 0), true);
  assert.strictEqual(g("SH_UNDER_2.5", 4, 0, 1, 0), false, "three after the break");
  assert.strictEqual(g("SH_UNDER_2.5", 4, 0, 2, 0), true);
  for (const c of ["FH_UNDER_2.5", "FH_DC_1X", "SH_OVER_0.5", "SH_UNDER_2.5"]) {
    assert.strictEqual(legrade.gradeLeg(c, { hg: 2, ag: 1 }), null, c + " with no half-time score waits");
    assert.strictEqual(g(c, 1, 0, 2, 0), null, c + " with a half-time score that cannot be this match's waits");
  }
});

test("up to x1.20 (owner, 19 Oct 2026), Win to nil still stops at x1.15", () => {
  const consts = /var WTN_MIN=[^\n]*/.exec(src)[0];
  const BOOKS = { sporty: { odds: "sportyOdds" } };
  const ok = new Function("bookQuotes", "legOdd", "curBook", "bankersOn", "BOOKS", consts + "\n" + grab("wtnOk") + "\nreturn wtnOk;")(
    (f, c, B) => !!(f[B.odds] && f[B.odds][c] > 1.01), (f, c) => f.sportyOdds[c], () => BOOKS.sporty, () => false, BOOKS);
  const f = (c, o) => ({ sportyOdds: { [c]: o } });
  assert.strictEqual(ok(f("FH_DC_1X", 1.18), "FH_DC_1X", 0.85), true);
  assert.strictEqual(ok(f("FH_DC_1X", 1.20), "FH_DC_1X", 0.85), true, "x1.20 is the top");
  assert.strictEqual(ok(f("FH_DC_1X", 1.21), "FH_DC_1X", 0.9), false);
  assert.strictEqual(ok(f("FH_DC_1X", 1.18), "FH_DC_1X", 0.79), false, "under 80% is refused");
  assert.strictEqual(ok(f("WTN_H_N", 1.18), "WTN_H_N", 0.9), false, "Win to nil keeps x1.15");
});

test("the cheaper legs come first: over x1.15 ranks lower in judgedP", () => {
  const consts = /var WTN_MIN=[^\n]*/.exec(src)[0];
  const judged = new Function("wtnOk", "legOdd", "curBook", "dogHcap", "HCAP_DOG_BAR", consts + "\n" + grab("judgedP") + "\nreturn judgedP;")(
    () => true, (f, c) => f.o, () => ({}), () => false, 0.02);
  assert.strictEqual(judged({ o: 1.12 }, "FH_UNDER_2.5", 0.86), 0.86);
  assert.ok(judged({ o: 1.18 }, "FH_UNDER_2.5", 0.86) < 0.86, "x1.18 is pushed behind");
  assert.strictEqual(judged({ o: 1.18 }, "1X", 0.86), 0.86, "nothing else moves");
});

test("Win to nil is reset before each re-blend like every other blended field", () => {
  const list = /var BLEND_FIELDS=\[([^\]]*)\]/.exec(src)[1];
  for (const k of ["wtnh", "wtna", "fh_u25", "ht_1x", "sh_o05", "sh_u25"]) assert.ok(list.includes('"' + k + '"'), k);
});

test("every builder gates them through judgedP like Win to nil, and they are never a tip", () => {
  assert.match(grab("judgedP"), /if\(\/\^\(FH_UNDER_2\\\.5\|FH_DC_1X\|SH_OVER_0\\\.5\|SH_UNDER_2\\\.5\)\$\/\.test\(code\)\)\{\n    if\(!wtnOk\(f,code,p\)\) return -1;/);
  assert.match(src, /\{k:"half", label:"Half-time", tier:0, sub:"x1\.02-1\.20"/);
  assert.match(src, /var BUILD=\{[^\n]*wtn:false,half:false,gg2:false,fh:false/, "the chip is off by default in the Slider");
  assert.match(src, /var WSP=\{[^\n]*wtn:false,half:false,gg2:false,o15:true/, "and in the Wizard");
  assert.doesNotMatch(grab("codeMarket"), /FH_UNDER_2\.5|FH_DC_1X|SH_OVER_0\.5|SH_UNDER_2\.5/, "not named before it has graded results");
  /* Betway sells no 2nd-half match total (API NOT_CARRIED). */
  assert.match(src, /"SH_OVER_0\.5":\["sporty","bet9ja","betking","betpawa","onexbet"\]/);
});

test("My slips settles half-time legs exactly as the server does, and waits without a half-time score", () => {
  /* Until 19 Oct 2026 the page had no half-time score and voided these legs at full time,
     so a lost first-half leg read as a refund and its slip could read as won. */
  const gradeLeg = new Function("nr3Grade", grab("gradeLeg") + "\nreturn gradeLeg;")(() => null);
  const codes = ["FH_OVER_0.5", "FH_UNDER_2.5", "FH_DC_1X", "SH_OVER_0.5", "SH_UNDER_2.5",
    "WINHALF_H_Y", "WINHALF_H_N", "WINHALF_A_Y", "WINHALF_A_N"];
  let n = 0;
  for (let hg = 0; hg <= 4; hg++) for (let ag = 0; ag <= 4; ag++)
    for (let h1 = 0; h1 <= hg; h1++) for (let a1 = 0; a1 <= ag; a1++)
      for (const c of codes) {
        assert.strictEqual(gradeLeg(null, c, hg, ag, { hth: h1, hta: a1 }), legrade.gradeLeg(c, { hg, ag, hth: h1, hta: a1 }), `${c} ${hg}-${ag} (${h1}-${a1})`);
        n++;
      }
  assert.ok(n > 1000);
  for (const c of codes) {
    assert.strictEqual(gradeLeg(null, c, 2, 1, {}), null, c + " waits for the half-time score");
    assert.ok(new Function(grab("awaitsStats") + "\nreturn awaitsStats;")()(c), c + " is kept waiting, not voided");
  }
  assert.match(fs.readFileSync(path.join(__dirname, "..", "api", "results.js"), "utf8"), /o\.hth = r\.hth; o\.hta = r\.hta;/, "the results feed carries it");
});
