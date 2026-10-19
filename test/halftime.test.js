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

test("no top price: the slip style picks the length; a real price x1.02+ and 70%+ (owner, 19 Oct 2026)", () => {
  const consts = /var WTN_MIN=[^\n]*/.exec(src)[0];
  const BOOKS = { sporty: { odds: "sportyOdds" }, bet9ja: { odds: "bet9jaOdds" } };
  const ok = new Function("bookQuotes", "legOdd", "curBook", "BOOKS", consts + "\n" + grab("halfOk") + "\nreturn halfOk;")(
    (f, c, B) => !!(f[B.odds] && f[B.odds][c] > 1.01), (f, c) => f.sportyOdds[c], () => BOOKS.bet9ja, BOOKS);
  const f = (c, o) => ({ sportyOdds: { [c]: o } });
  assert.strictEqual(ok(f("FH_DC_1X", 1.45), "FH_DC_1X", 0.72), true, "no top price any more");
  assert.strictEqual(ok(f("FH_DC_1X", 1.45), "FH_DC_1X", 0.69), false, "under 70% is refused");
  assert.strictEqual(ok({ sportyOdds: {} }, "FH_DC_1X", 0.9), false, "no price anywhere, no leg");
  assert.strictEqual(ok(f("SH_OVER_0.5", 1.1), "SH_OVER_0.5", 0.8), true, "SportyBet's price stands in for a book whose feed lacks it");
  const wtn = new Function("bookQuotes", "legOdd", "curBook", "bankersOn", "BOOKS", consts + "\n" + grab("wtnOk") + "\nreturn wtnOk;")(
    (f, c, B) => !!(f[B.odds] && f[B.odds][c] > 1.01), (f, c) => f.sportyOdds[c], () => BOOKS.sporty, () => false, BOOKS);
  assert.strictEqual(wtn(f("WTN_H_N", 1.18), "WTN_H_N", 0.9), false, "Win to nil keeps x1.15");
});

test("Win to nil is reset before each re-blend like every other blended field", () => {
  const list = /var BLEND_FIELDS=\[([^\]]*)\]/.exec(src)[1];
  for (const k of ["wtnh", "wtna", "fh_u25", "ht_1x", "sh_o05", "sh_u25"]) assert.ok(list.includes('"' + k + '"'), k);
});

test("every builder gates them through judgedP like Win to nil, and they are never a tip", () => {
  assert.match(grab("judgedP"), /\.test\(code\)&&!halfOk\(f,code,p\)\) return -1;/);
  /* One chip each (owner, 19 Oct 2026: "half time should be seperated"). */
  for (const [k, label] of [["fhu25", "1st half under 2.5"], ["ht1x", "Half-time 1X"], ["sho05", "2nd half over 0.5"], ["shu25", "2nd half under 2.5"]])
    assert.ok(src.includes('{k:"' + k + '", label:"' + label + '", tier:0'), k);
  /* ...and each chip switches its own market in the Slider, not a neighbour's. */
  for (const [code, k] of [["FH_UNDER_2.5", "fhu25"], ["FH_DC_1X", "ht1x"], ["SH_OVER_0.5", "sho05"], ["SH_UNDER_2.5", "shu25"]])
    assert.ok(src.includes('"' + code + '":BUILD.mk.' + k + '===true'), code + " follows " + k);
  assert.match(src, /var BUILD=\{[^\n]*wtn:false,fhu25:false,ht1x:false,sho05:false,shu25:false,gg2:false,fh:false/, "the chips are off by default in the Slider");
  assert.match(src, /var WSP=\{[^\n]*wtn:false,fhu25:false,ht1x:false,sho05:false,shu25:false,gg2:false,o15:true/, "and in the Wizard");
  assert.doesNotMatch(grab("codeMarket"), /FH_UNDER_2\.5|FH_DC_1X|SH_OVER_0\.5|SH_UNDER_2\.5/, "not named before it has graded results");
  /* Betway sells no 2nd-half match total (API NOT_CARRIED), and answered "not priced" for the
     1st half under 2.5 on Tottenham v Coventry, 19 Oct 2026, while it booked half-time 1X. */
  assert.ok(src.includes('"FH_UNDER_2.5":["sporty","bet9ja","betking","betpawa","onexbet"]'));
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

test("the converter keeps behind a leg whose market the target book does not sell", () => {
  /* 19 Oct 2026, a real convert of SportyBet YFE5TV: 2nd half over 0.5, 1st half under 2.5
     and GG+ "moved" to Betway, which sells none of them, and the booking's refusal rescue
     swapped in other bets (BW7B3F6C3A). BOOK_ONLY now stops them at the preview, named. */
  const conv = grab("byoConversion");
  assert.match(conv, /else if\(!bookAllows\(l\.prediction,to\)\) stuck\.push\(\{leg:l,why:to\.label\+" doesn't sell "/);
  const bookAllows = new Function("BOOK_ONLY", "curBook", grab("bookAllows") + "\nreturn bookAllows;")(
    new Function(/var BOOK_ONLY=\{[\s\S]*?\};/.exec(src)[0] + "\nreturn BOOK_ONLY;")(), () => ({ key: "sporty" }));
  assert.strictEqual(bookAllows("SH_OVER_0.5", { key: "betway" }), false);
  assert.strictEqual(bookAllows("GG2_Y", { key: "betpawa" }), false);
  assert.strictEqual(bookAllows("FH_DC_1X", { key: "betway" }), true, "Betway does sell half-time 1X");
  assert.strictEqual(bookAllows("GG2_Y", { key: "bet9ja" }), true);
});
