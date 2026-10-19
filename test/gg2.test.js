"use strict";

/**
 * Both teams score 2+, Yes: the crazy leg (owner, 19 Oct 2026: "its a crazy
 * bet", Yes only). Held out over 5,572 matches the model said 14.1% and it
 * landed 15.9%; its 15-20% calls landed 17.6%. The builders take it only on a
 * real price and where we rate it 18%+. Sold by SportyBet, Bet9ja, BetKing and
 * 1xBet; betPawa does not sell it.
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

test("gg2 is the both-scored-two-or-more corner of the model's scoreline matrix", () => {
  const m = M.scoreMatrix(1.6, 1.3, 8);
  const k = M.markets({ matrix: m, lh: 1.6, la: 1.3, total: 2.9 }, { drawBoost: 0 });
  let y = 0; m.forEach((row, i) => row.forEach((p, j) => { if (i >= 2 && j >= 2) y += p; }));
  assert.ok(Math.abs(k.gg2 - y) < 1e-9);
  assert.ok(k.gg2 < k.btts, "a subset of both teams scoring");
});

test("graded the same on the page and on the server", () => {
  const gradeLeg = new Function(grab("gradeLeg") + "\nreturn gradeLeg;")();
  for (const [hg, ag, yes] of [[2, 2, true], [3, 2, true], [2, 1, false], [4, 0, false], [0, 0, false]]) {
    assert.strictEqual(gradeLeg({}, "GG2_Y", hg, ag), yes, `page ${hg}-${ag}`);
    assert.strictEqual(legrade.gradeLeg("GG2_Y", { hg, ag }), yes, `server ${hg}-${ag}`);
    assert.strictEqual(legrade.gradeLeg("GG2_N", { hg, ag }), !yes, `server No ${hg}-${ag}`);
  }
});

/* The gate, lifted with what it reads: the day's fixtures in DATA, each priced or not. */
function gate(dayFixtures) {
  const consts = /var WTN_MIN=[^\n]*/.exec(src)[0];
  const BOOKS = { sporty: { odds: "sportyOdds" } };
  return new Function("wtnOk", "legOdd", "curBook", "dogHcap", "HCAP_DOG_BAR", "bookQuotes", "BOOKS", "mProb", "DATA",
    consts + "\n" + grab("gg2Pass") + "\nvar GG2_LV={};\n" + grab("gg2Level") + "\n" + grab("judgedP") + "\nreturn judgedP;")(
    () => true, (f, c) => f.sportyOdds[c], () => ({ key: "sporty", odds: "sportyOdds" }), () => false, 0.02,
    (f, c, B) => !!(f[B.odds] && f[B.odds][c] > 1.01), BOOKS, (f) => f.gg2, { fixtures: dayFixtures });
}
const game = (o) => Object.assign({ date: "2026-10-24", sportyOdds: { GG2_Y: 4.75 }, lh: 1.7, la: 1.4, sc_h: 5, sc_a: 4, gg2: 0.2 }, o);

test("a busy day keeps the strict bar: 18%+, 1.2+ for the weaker side, 2.9+ goals, 3 of the last 5", () => {
  const busy = Array.from({ length: 10 }, () => game());
  const judged = gate(busy);
  const w = (o) => judged(game(o), "GG2_Y", (o && o.gg2) || 0.2);
  assert.strictEqual(w({}), 0.2);
  assert.strictEqual(w({ gg2: 0.17, sportyOdds: { GG2_Y: 7.5 } }), -1, "under 18% and over x6 is refused on a busy day");
  /* Up to x6 (owner, 19 Oct 2026: "i want us to be able to get odds up to 6 also"). */
  assert.strictEqual(w({ gg2: 0.14, sportyOdds: { GG2_Y: 5.9 } }), 0.14, "priced x6 or less is in, under the day's chance");
  assert.strictEqual(w({ gg2: 0.11, sportyOdds: { GG2_Y: 5.9 } }), -1, "but never under our 12%");
  assert.strictEqual(w({ gg2: 0.14, sportyOdds: { GG2_Y: 5.9 }, sc_a: 2 }), -1, "and always a high-scoring game");
  assert.strictEqual(w({ sportyOdds: {} }), -1, "no price, no leg");
  assert.strictEqual(w({ lh: 1.8, la: 1.15 }), -1, "below 1.2 for the weaker side");
  assert.strictEqual(w({ lh: 1.6, la: 1.25 }), -1, "under 2.9 goals expected");
  assert.strictEqual(w({ sc_a: 2 }), -1, "2 of 5");
  assert.strictEqual(w({ sc_h: null }), -1, "no recent games, no leg");
});

test("a thin day lowers the bar until there are enough games (owner, 19 Oct 2026: \"like today\")", () => {
  /* Two games clear the strict bar; eight more clear only the loosest. */
  const thin = [game(), game()].concat(Array.from({ length: 8 }, () => game({ gg2: 0.13, lh: 1.5, la: 1.05, sc_h: 2, sc_a: 3 })));
  const busy25 = Array.from({ length: 10 }, () => game({ date: "2026-10-25" }));
  const judged = gate(thin.concat(busy25));
  assert.strictEqual(judged(game({ gg2: 0.13, lh: 1.5, la: 1.05, sc_h: 2, sc_a: 3 }), "GG2_Y", 0.13), 0.13, "taken at the loosest level");
  assert.strictEqual(judged(game({ gg2: 0.11 }), "GG2_Y", 0.11), -1, "never under 12%");
  assert.strictEqual(judged(game({ sportyOdds: {} }), "GG2_Y", 0.3), -1, "never without a price");
  /* A busy day beside it keeps its own, strict bar. */
  assert.strictEqual(judged(game({ date: "2026-10-25", gg2: 0.13, lh: 1.5, la: 1.05, sc_h: 2, sc_a: 3 }), "GG2_Y", 0.13), -1);
});

test("GG+ stays off betPawa and Betway, off by default, and never named before it is graded", () => {
  assert.match(src, /"GG2_Y":\["sporty","bet9ja","betking","onexbet"\]/);
  assert.match(src, /var BUILD=\{[^\n]*gg2:false/, "off by default");
  assert.doesNotMatch(grab("codeMarket"), /GG2/, "not named before it has graded results");
});

test("the builders let GG+ through their own confidence floors, or the chip builds nothing", () => {
  /* 19 Oct 2026, owner: "i still dont see the gg+ populating games". The gate passed 143 priced
     games while the Wizard's flat 0.5 floor and the Slider's minConf dropped every ~20% leg. */
  assert.match(grab("wspBuild"), /\(c==="GG2_Y"\)\?GG2_P:0\.5;/);
  /* Both places in the Slider: the first pick, and the alternatives the style spreads across. */
  assert.strictEqual((grab("buildPicks").match(/if\(v<\(c==="GG2_Y"\?GG2_P:p\.minConf\)\) return;/g) || []).length, 2);
});
