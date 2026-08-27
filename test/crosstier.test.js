"use strict";

/* Cup ties between divisions.
 *
 * These rest on the one assumption in the model: how much weaker each
 * division is than its country's top flight. Nothing in the data can measure
 * it - no cup results in the training feeds, and no club appears in two
 * leagues - so the tests here pin down the shape of the assumption and, more
 * importantly, what happens when it cannot be applied at all.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
const a = src.indexOf("const TIER_HANDICAP");
const b = src.indexOf("/* The league a club actually plays in");
const { tierEdge, TIER_HANDICAP } =
  new Function(src.slice(a, b) + "return {tierEdge, TIER_HANDICAP};")();

const M = require("../lib/model.js");

test("the divisions are not evenly spaced", () => {
  /* The whole reason this table exists rather than a flat step per division.
     The Premier League to Championship gap is the widest in English football;
     League One to League Two is much narrower. */
  const H = TIER_HANDICAP;
  const top = H["England Championship"] - H["England Premier League"];
  const mid = H["England League 1"] - H["England Championship"];
  const low = H["England League 2"] - H["England League 1"];
  assert.ok(top > mid, `top step ${top} should exceed mid ${mid}`);
  assert.ok(mid > low, `mid step ${mid} should exceed low ${low}`);
  assert.ok(top >= low * 1.8, "the top gap should be roughly twice the bottom one");
});

test("the edge points at the stronger side, and reverses", () => {
  const down = tierEdge("England Premier League", "England Championship");
  const up = tierEdge("England Championship", "England Premier League");
  assert.ok(down > 0, "home in the higher division gets a positive edge");
  assert.equal(down, -up, "the same tie the other way round is the mirror");
});

test("same division is no edge at all", () => {
  assert.equal(tierEdge("England League 1", "England League 1"), 0);
});

test("divisions that cannot be compared return null, never zero", () => {
  /* This is the one that matters. Zero would quietly declare a top-flight
     side and a third-tier side evenly matched, and the fixture would go out
     unmarked and eligible to headline the site. Null means "do not predict". */
  assert.equal(tierEdge("England Premier League", "Spain La Liga 1"), null,
    "different countries are not on one ladder");
  assert.equal(tierEdge("England Premier League", "Russia Premier League"), null);
  assert.equal(tierEdge("England Premier League", "Japan J1 League"), null);
  assert.equal(tierEdge("Nowhere Division 1", "Nowhere Division 2"), null);
});

test("every ladder starts its country at zero", () => {
  /* Top flights are the reference point for their own country only. Nothing
     here claims the Scottish Premiership equals the Premier League - the two
     are never compared, because tierEdge refuses to cross a border. */
  const tops = ["England Premier League", "Scotland Premiership",
    "Germany Bundesliga 1", "Spain La Liga 1", "Italy Serie A", "France Ligue 1"];
  for (const t of tops) assert.equal(TIER_HANDICAP[t], 0, t);
});

test("a lower division is never rated above a higher one", () => {
  const ladders = {
    England: ["England Premier League", "England Championship",
      "England League 1", "England League 2", "England Conference National"],
    Scotland: ["Scotland Premiership", "Scotland Championship",
      "Scotland League 1", "Scotland League 2"],
  };
  for (const [country, tiers] of Object.entries(ladders)) {
    for (let i = 1; i < tiers.length; i++) {
      assert.ok(TIER_HANDICAP[tiers[i]] > TIER_HANDICAP[tiers[i - 1]],
        `${country}: ${tiers[i]} should sit below ${tiers[i - 1]}`);
    }
  }
});

/* ---------------------------------------------------------------- the tip */

/* markets() output is all bestTip reads, so a plain object is enough. */
const mk = (o) => Object.assign(
  { home: 0.4, draw: 0.28, away: 0.32, dc1x: 0.68, dcx2: 0.60, o15: 0.6 }, o);

test("an ordinary fixture keeps the 80% bar on Over 1.5", () => {
  /* 78% is a strong goals call but not a headline one in a league game. */
  const tip = M.bestTip(mk({ home: 0.52, draw: 0.25, away: 0.23, o15: 0.78 }));
  assert.notEqual(tip.label, "Over 1.5");
});

test("a cup tie across divisions relaxes that bar", () => {
  /* Same numbers, cup tie: the goals market is the part least disturbed by
     the division assumption, so it is allowed to headline sooner. */
  const tip = M.bestTip(mk({ home: 0.52, draw: 0.25, away: 0.23, o15: 0.78 }),
                        { crossTier: true });
  assert.equal(tip.label, "Over 1.5");
});

test("a narrow winner does not headline a cup tie ahead of the goals", () => {
  /* "A big club can find it hard to beat a lower-league side" is the normal
     shape of cup football. Backing the winner has to be clearly better, not
     better by a rounding error. */
  const tip = M.bestTip(mk({ home: 0.74, draw: 0.16, away: 0.10, o15: 0.72 }),
                        { crossTier: true });
  assert.equal(tip.label, "Over 1.5", "74% home against 72% goals is not a clear margin");
});

test("a genuinely dominant side still headlines as the winner", () => {
  const tip = M.bestTip(mk({ home: 0.86, draw: 0.09, away: 0.05, o15: 0.72 }),
                        { crossTier: true });
  assert.equal(tip.label, "Home win", "86% against 72% is a clear margin");
});

test("the goals lean never fires without the goals to back it", () => {
  /* A cagey tie between divisions: no goals call, so the winner stands. */
  const tip = M.bestTip(mk({ home: 0.70, draw: 0.18, away: 0.12, o15: 0.55 }),
                        { crossTier: true });
  assert.equal(tip.label, "Home win");
});

test("passing no options behaves exactly as before", () => {
  const withNothing = M.bestTip(mk({ home: 0.52, draw: 0.25, away: 0.23, o15: 0.78 }));
  const withEmpty = M.bestTip(mk({ home: 0.52, draw: 0.25, away: 0.23, o15: 0.78 }), {});
  assert.deepEqual(withNothing, withEmpty);
});

/* -------------------------------------------------------------- the model */

test("the edge moves the two sides in opposite directions", () => {
  /* predictTotals applies +edge to home and -edge to away, so a positive edge
     must lift the home rate and cut the away one. Without that the ratings,
     centred inside their own leagues, would call the two sides equals. */
  const model = {
    k: 200, hadv: 0.25, lgI: [0.1], att: [0, 0], def: [0, 0],
    index: { tIdx: { H: 0, A: 1 }, lIdx: { L: 0 } },
  };
  const flat = M.predictTotals(model, "H", "A", "L", 0);
  const edged = M.predictTotals(model, "H", "A", "L", 0.28);
  assert.ok(edged.lh > flat.lh, "home rate rises");
  assert.ok(edged.la < flat.la, "away rate falls");
  /* And symmetrically, in log terms. */
  assert.ok(Math.abs(Math.log(edged.lh / flat.lh) - 0.28) < 1e-9);
  assert.ok(Math.abs(Math.log(flat.la / edged.la) - 0.28) < 1e-9);
});

test("no edge given leaves every ordinary fixture untouched", () => {
  const model = {
    k: 200, hadv: 0.25, lgI: [0.1], att: [0.2, -0.1], def: [0.05, 0.1],
    index: { tIdx: { H: 0, A: 1 }, lIdx: { L: 0 } },
  };
  const withArg = M.predictTotals(model, "H", "A", "L", 0);
  const without = M.predictTotals(model, "H", "A", "L");
  assert.equal(withArg.lh, without.lh);
  assert.equal(withArg.la, without.la);
});
