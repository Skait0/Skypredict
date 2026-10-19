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

test("the builders take it only on a real price and at 18%+, never on betPawa or Betway", () => {
  const consts = /var WTN_MIN=[^\n]*/.exec(src)[0];
  const BOOKS = { sporty: { odds: "sportyOdds" } };
  const judged = new Function("wtnOk", "legOdd", "curBook", "dogHcap", "HCAP_DOG_BAR", "bookQuotes", "BOOKS",
    consts + "\n" + grab("judgedP") + "\nreturn judgedP;")(
    () => true, () => 1, () => BOOKS.sporty, () => false, 0.02, (f, c, B) => !!(f[B.odds] && f[B.odds][c] > 1.01), BOOKS);
  const hot = { lh: 1.7, la: 1.4, sc_h: 5, sc_a: 4 };
  const priced = Object.assign({ sportyOdds: { GG2_Y: 4.75 } }, hot);
  assert.strictEqual(judged(priced, "GG2_Y", 0.2), 0.2);
  assert.strictEqual(judged(priced, "GG2_Y", 0.17), -1, "under 18% is refused");
  assert.strictEqual(judged(Object.assign({ sportyOdds: {} }, hot), "GG2_Y", 0.3), -1, "no price, no leg");
  /* Only high-scoring games (owner, 19 Oct 2026). */
  const w = (o) => judged(Object.assign({}, priced, o), "GG2_Y", 0.25);
  /* Loosened 19 Oct 2026 (owner: "yes do all"): 1.2 for the weaker side, 3 of the last 5. */
  assert.strictEqual(w({ la: 1.2 }), 0.25, "the weaker side expected to score 1.2 is enough");
  assert.strictEqual(w({ lh: 1.8, la: 1.15 }), -1, "below 1.2 is not, even with goals enough in all");
  assert.strictEqual(w({ lh: 1.6, la: 1.25 }), -1, "2.9+ goals expected in all");
  assert.strictEqual(w({ sc_a: 3 }), 0.25, "scored in 3 of its last 5 is enough");
  assert.strictEqual(w({ sc_a: 2 }), -1, "2 of 5 is not");
  assert.strictEqual(w({ sc_h: null }), -1, "no recent games, no leg");
  assert.strictEqual(w({}), 0.25);
  assert.match(src, /"GG2_Y":\["sporty","bet9ja","betking","onexbet"\]/);
  assert.match(src, /var BUILD=\{[^\n]*gg2:false/, "off by default");
  assert.doesNotMatch(grab("codeMarket"), /GG2/, "not named before it has graded results");
});

test("the builders let GG+ through their own confidence floors, or the chip builds nothing", () => {
  /* 19 Oct 2026, owner: "i still dont see the gg+ populating games". The gate passed 143 priced
     games while the Wizard's flat 0.5 floor and the Slider's minConf dropped every ~20% leg. */
  assert.match(grab("wspBuild"), /\(c==="GG2_Y"\)\?GG2_P:0\.5;/);
  assert.match(grab("buildPicks"), /if\(v<\(c==="GG2_Y"\?GG2_P:p\.minConf\)\) return;/);
});
