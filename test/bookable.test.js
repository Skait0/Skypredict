"use strict";

/**
 * The slider must prefer legs SportyBet will actually take.
 *
 * The wizard has done this for a while. The slider never did - 5,834
 * characters of buildPicks with no mention of sportyOdds - so it chose purely
 * on model merit and discovered unbookability at booking time. That asymmetry
 * is why "SportyBet wouldn't take this slip" felt random: it depended on which
 * builder you used, and the first report in this series was about the slider.
 *
 * Why it matters more than the per-leg numbers suggest. Measured on the live
 * board: 1X2 and double chance are priced on 100% of our fixtures, goals and
 * GG on 93-94%, team totals on 88-90%. Fine per leg; across an eight-leg slip
 * on team totals it is a 62% chance of at least one unplaceable leg, and one
 * unplaceable leg among forty loses all forty.
 *
 * The rule has three cases and the third is the one that matters most:
 *
 *   1. Some allowed market carries a real odd  -> choose only among those.
 *   2. None does, but the fixture IS priced    -> SportyBet lists this game and
 *                                                 not our market on it, so the
 *                                                 leg cannot be placed: drop it.
 *   3. The fixture has no prices at all        -> we know nothing. Estimate, as
 *                                                 before.
 *
 * Conflating 2 and 3 would empty the whole builder whenever the odds feed is
 * slow or down, which is a far worse failure than the one being fixed. That is
 * what the last test here guards.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
function konst(name) {
  const m = new RegExp("(?:^|\\n)(?:const|var|let)\\s+" + name + "\\s*=\\s*([^;]+);").exec(src);
  if (!m) throw new Error("constant not found: " + name);
  return "const " + name + "=" + m[1].trim() + ";";
}

const FNS = ["countryOf", "isSAleague", "isAsianLeague", "isAsian", "isSouthAmerican",
  "saWeight", "isLowerLeague", "isLowerFixture", "fid", "oddOf", "legOdd",
  "hasRealOdd", "pricedFixture", "mProb", "riskParams",
  /* The slider now restricts an unpriced fixture to markets SportyBet always
     lists, so the harness needs that helper and its table. */
  "safeUnpriced",
  "allowedMarkets", "preferGoalsOverDouble", "buildPicks"];

function engine(fixtures) {
  return new Function("FX", [
    "var TOP_ONLY=false;",
    "var FIXTURES=FX;",
    "function scopeFixtures(){return FIXTURES;}",
    /* No saved slips in these harnesses, so nothing is already exposed;
       the spread penalty is exercised on its own in spread.test.js. */
    "function slipUse(){return {};}",
    konst("SAFE_UNPRICED"),
    konst("HIGH_SCORING_O25"), konst("SA_MIN_EURO"), konst("ASIA_MIN_EURO"),
    konst("SA_COUNTRIES"), konst("ASIA_PREFIXES"),
  konst("SPREAD_PEN"), konst("SPREAD_MULT"),
    (/^var BUILD=\{[\s\S]*?\};/m.exec(src) || [""])[0],
  ].concat(FNS.map(grab)).join("\n") +
    "\nBUILD.risk=45; BUILD.seed=1; BUILD.removed={}; BUILD.shuffles=0;" +
    "\nreturn {buildPicks:buildPicks, BUILD:BUILD};")(fixtures);
}

/* A believable European fixture: strong-ish home side, goals expected. */
function fx(home, away, odds) {
  return { date: "2026-09-05", time: "19:00", league: "England Premier League",
    home: home, away: away, tier: 1, eventId: "ev-" + home,
    home_p: 0.55, draw_p: 0.25, away_p: 0.20,
    dc1x: 0.80, dcx2: 0.45, dc12: 0.75,
    o15: 0.82, o25: 0.58, o35: 0.32, btts: 0.55, fh_o05: 0.70,
    sportyOdds: odds };
}

test("with everything priced, the slider still builds a slip", () => {
  const E = engine([
    fx("Arsenal", "Everton", { "1X": 1.30, "OVER_1.5": 1.22, "OVER_2.5": 1.75 }),
    fx("Chelsea", "Fulham", { "1X": 1.28, "OVER_1.5": 1.24, "OVER_2.5": 1.80 }),
    fx("Spurs", "Brentford", { "1X": 1.35, "OVER_1.5": 1.20, "OVER_2.5": 1.72 }),
  ]);
  const picks = E.buildPicks();
  assert.ok(picks.length > 0, "a fully priced board must still produce a slip");
});

test("every leg chosen carries a real SportyBet odd when one exists", () => {
  const E = engine([
    fx("Arsenal", "Everton", { "1X": 1.30, "OVER_1.5": 1.22 }),
    fx("Chelsea", "Fulham", { "X2": 2.10, "OVER_2.5": 1.80 }),
    fx("Spurs", "Brentford", { "1X": 1.35, "GG": 1.70 }),
  ]);
  for (const c of E.buildPicks()) {
    const o = c.f.sportyOdds[c.code];
    assert.ok(o && o > 1.01,
      `${c.f.home} v ${c.f.away}: chose "${c.code}", which SportyBet does not price`);
  }
});

test("a fixture priced WITHOUT any market we offer is dropped", () => {
  /* The exact failure: SportyBet lists the game, carries only markets we do
     not offer, and booking it returns "no market" and kills the whole slip. */
  const good = fx("Arsenal", "Everton", { "1X": 1.30, "OVER_1.5": 1.22 });
  const bad = fx("Burnley", "Luton", { "CORNERS_OVER_9.5": 1.90, "PLAYER_X": 3.10 });
  const picks = engine([good, bad]).buildPicks();
  assert.ok(picks.length >= 1, "the good fixture must survive");
  assert.ok(!picks.some(c => c.f.home === "Burnley"),
    "a fixture SportyBet prices but not for anything we offer cannot be a leg");
});

test("an UNPRICED fixture is still usable - we know nothing, not nothing doing", () => {
  /* This is the guard that keeps a slow or failed odds feed from emptying the
     builder. Absence of prices is absence of information. */
  const unpriced = fx("Arsenal", "Everton", undefined);
  delete unpriced.sportyOdds;
  const picks = engine([unpriced]).buildPicks();
  assert.strictEqual(picks.length, 1,
    "with no price data at all the slider must still build, as it always did");
});

test("a whole board with no odds feed still builds", () => {
  const board = ["Arsenal", "Chelsea", "Spurs", "Leeds", "Wolves"].map((h, i) => {
    const f = fx(h, "Opp" + i, undefined); delete f.sportyOdds; return f;
  });
  assert.ok(engine(board).buildPicks().length >= 3,
    "the odds feed being down must not empty the builder");
});

test("the preference does not override the market switches", () => {
  /* A market the user turned off must stay off even if it is the only one
     SportyBet prices - a priced leg they did not ask for is still wrong. */
  const E = engine([fx("Arsenal", "Everton", { "GG": 1.70 })]);
  E.BUILD.mk = { wd: true, any: false, out: false, o15: false, o25: false,
                 o35: false, fh: false, tts: false, tts2: false, both: false };
  for (const c of E.buildPicks()) {
    assert.notStrictEqual(c.code, "GG", "GG is switched off and must not be picked");
  }
});
