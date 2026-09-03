"use strict";

/**
 * The two slip engines, pinned.
 *
 * `buildPicks` (the slider) and `wspBuild` (the wizard) decide what goes on
 * every slip the site produces, and until now neither had a single test. They
 * are also the two functions most likely to be merged: they are one builder
 * with two ways of stating the goal - "how risky" against "what payout" - and
 * everything underneath, the fixture pool, the league filter, the home/away
 * sanity rules, the hash jitter, the goals lean, is written twice.
 *
 * These are characterisation tests, not specifications. They do not argue that
 * the current behaviour is right; they record what it *is*, so that a refactor
 * has something to be checked against. If one fails after a change, the
 * question to ask is "did I mean to change this?" - not "what should it be?".
 *
 * What this suite actually catches, checked by mutating index.html and
 * re-running rather than assumed:
 *
 *   dropping `if(WSP.mk.any)m.push("12")`      3 failures
 *   pinning the risk dial to a constant        3 failures
 *   deleting the home/away `sane()` guard      0 failures - see the note on
 *                                              that test; the guard is inert
 *                                              on a realistic board
 *
 * The board below is eleven real fixtures lifted from a published payload,
 * chosen to spread across the cases the engines actually branch on: home
 * favourites, away favourites, goal-heavy games, near coin-flips, and one
 * second-tier league for the top-flight filter. Real numbers rather than
 * invented ones, because invented probabilities do not sit where a model puts
 * them and the goals lean is sensitive to exactly that.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* Both engines live inline in index.html, so they are lifted out by name and
   evaluated with a stubbed board. The alternative - loading the whole page -
   needs a DOM, and a DOM needs a dependency this project does not have. */
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("function not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
/* Tuning values are read out of the page rather than restated here. Restating
   them would let a change to one pass these tests by default, which is the
   opposite of what a characterisation test is for. */
function konst(name) {
  const m = new RegExp("(?:^|\\n)(?:const|var|let)\\s+" + name + "\\s*=\\s*([^;]+);").exec(src);
  if (!m) throw new Error("constant not found in index.html: " + name);
  return "const " + name + "=" + m[1].trim() + ";";
}

const FNS = ["countryOf", "isSAleague", "isAsianLeague", "isAsian", "isSouthAmerican",
  "saWeight", "isLowerLeague", "isLowerFixture", "fid", "oddOf", "legOdd",
  "hasRealOdd", "pricedFixture", "mProb", "riskParams",
  "allowedMarkets", "preferGoalsOverDouble", "isJackpotOdds", "wspMarkets",
  /* The wizard now asks which markets have a published record before it
     reaches for one, so its harness needs them too. */
  "codeMarket", "provenMarkets", "isProven",
  /* Both builders now restrict themselves to markets SportyBet always lists
     when a fixture has no prices at all, so the harness needs that too. */
  "safeUnpriced",
  "buildPicks",
  /* wspBuild now consults the Slider before doing its own work, so the
     handover functions have to come with it or it throws. */
  "sliderRunAt", "sliderCeiling", "sliderCeilingNow", "sliderCanReach",
  "sliderDrives", "sliderReach",
  /* Which chip is lit, derived from the same predicate wspBuild uses. */
  "wspStyleOn",
  "wspBuild"];

const api = new Function([
  "var TOP_ONLY=false;",
  "var FIXTURES=[];",
  "function scopeFixtures(){return FIXTURES;}",
  /* No saved slips in this harness, so nothing is already exposed; the
     spread penalty is exercised on its own in spread.test.js. */
  "function slipUse(){return {};}",
  konst("SAFE_UNPRICED"),
  konst("JACKPOT_ODDS"), konst("JACKPOT_LEG_CAP"),
  konst("HIGH_SCORING_O25"), konst("SA_MIN_EURO"), konst("ASIA_MIN_EURO"),
  konst("SA_COUNTRIES"), konst("ASIA_PREFIXES"),
  konst("SPREAD_PEN"), konst("SPREAD_MULT"),
  (/^var BUILD=\{[\s\S]*?\};/m.exec(src) || [""])[0],
  (/^var WSP=\{[\s\S]*?\};/m.exec(src) || [""])[0],
].concat(FNS.map(grab)).join("\n") + `
  return { BUILD, WSP, buildPicks, wspBuild, wspMarkets, legOdd, fid,
           sliderCanReach, sliderDrives, sliderCeilingNow, wspStyleOn,
           JACKPOT_ODDS, JACKPOT_LEG_CAP,
           setFixtures(f){ FIXTURES = f; },
           setTopOnly(v){ TOP_ONLY = v; } };
`)();

const BOARD = [
  {"date":"2026-08-30","league":"Belgium Pro League","home":"St. Gilloise","away":"Anderlecht","home_p":0.5378,"draw_p":0.2491,"away_p":0.2132,"dc1x":0.7868,"dcx2":0.4622,"dc12":0.7509,"anybody":0.7509,"o15":0.7578,"o25":0.5132,"o35":0.2968,"btts":0.5258,"fh_o05":0.7199,"h_o05":0.8224,"h_o15":0.5152,"a_o05":0.6349,"a_o15":0.2662},
  {"date":"2026-08-28","league":"Germany Bundesliga 1","home":"Bayern Munich","away":"Stuttgart","home_p":0.6228,"draw_p":0.1891,"away_p":0.1881,"dc1x":0.8119,"dcx2":0.3772,"dc12":0.8109,"anybody":0.8109,"o15":0.9016,"o25":0.7472,"o35":0.5525,"btts":0.6909,"fh_o05":0.8333,"h_o05":0.9213,"h_o15":0.7209,"a_o05":0.7483,"a_o15":0.4011},
  {"date":"2026-08-29","league":"Germany Bundesliga 1","home":"RB Leipzig","away":"M'gladbach","home_p":0.5211,"draw_p":0.2366,"away_p":0.2423,"dc1x":0.7577,"dcx2":0.4789,"dc12":0.7634,"anybody":0.7634,"o15":0.8189,"o25":0.5978,"o35":0.3702,"btts":0.6003,"fh_o05":0.7669,"h_o05":0.8534,"h_o15":0.5773,"a_o05":0.7113,"a_o15":0.3403},
  {"date":"2026-08-30","league":"Belgium Pro League","home":"Gent","away":"Club Brugge","home_p":0.2858,"draw_p":0.2498,"away_p":0.4644,"dc1x":0.5356,"dcx2":0.7142,"dc12":0.7502,"anybody":0.7502,"o15":0.8054,"o25":0.5746,"o35":0.3446,"btts":0.5836,"fh_o05":0.7534,"h_o05":0.6836,"h_o15":0.3095,"a_o05":0.8537,"a_o15":0.5781},
  {"date":"2026-08-29","league":"Italy Serie A","home":"Cagliari","away":"Inter","home_p":0.2843,"draw_p":0.2684,"away_p":0.4473,"dc1x":0.5527,"dcx2":0.7157,"dc12":0.7316,"anybody":0.7316,"o15":0.7461,"o25":0.4952,"o35":0.2793,"btts":0.5169,"fh_o05":0.7093,"h_o05":0.6408,"h_o15":0.2711,"a_o05":0.8146,"a_o15":0.5089},
  {"date":"2026-08-30","league":"Portugal Primeira Liga","home":"Rio Ave","away":"Sp Lisbon","home_p":0.2386,"draw_p":0.2467,"away_p":0.5147,"dc1x":0.4853,"dcx2":0.7614,"dc12":0.7533,"anybody":0.7533,"o15":0.7856,"o25":0.5504,"o35":0.3219,"btts":0.5476,"fh_o05":0.7345,"h_o05":0.6404,"h_o15":0.2708,"a_o05":0.8763,"a_o15":0.6218},
  {"date":"2026-08-30","league":"Netherlands Eredivisie","home":"Zwolle","away":"Nijmegen","home_p":0.3384,"draw_p":0.2434,"away_p":0.4182,"dc1x":0.5818,"dcx2":0.6616,"dc12":0.7566,"anybody":0.7566,"o15":0.8394,"o25":0.6278,"o35":0.3993,"btts":0.6303,"fh_o05":0.7876,"h_o05":0.7659,"h_o15":0.4223,"a_o05":0.8228,"a_o15":0.5154},
  {"date":"2026-08-30","league":"Netherlands Eredivisie","home":"Utrecht","away":"PSV Eindhoven","home_p":0.3554,"draw_p":0.2378,"away_p":0.4068,"dc1x":0.5932,"dcx2":0.6446,"dc12":0.7622,"anybody":0.7622,"o15":0.8567,"o25":0.6585,"o35":0.4315,"btts":0.6552,"fh_o05":0.8014,"h_o05":0.7854,"h_o15":0.4497,"a_o05":0.8342,"a_o15":0.5352},
  {"date":"2026-08-31","league":"England Premier League","home":"Aston Villa","away":"Arsenal","home_p":0.3535,"draw_p":0.2743,"away_p":0.3722,"dc1x":0.6278,"dcx2":0.6465,"dc12":0.7257,"anybody":0.7257,"o15":0.7419,"o25":0.4915,"o35":0.2766,"btts":0.5147,"fh_o05":0.7062,"h_o05":0.7159,"h_o15":0.3554,"a_o05":0.7268,"a_o15":0.3671},
  {"date":"2026-08-31","league":"France Ligue 1","home":"Lille","away":"Paris SG","home_p":0.3601,"draw_p":0.2688,"away_p":0.3711,"dc1x":0.6289,"dcx2":0.6399,"dc12":0.7312,"anybody":0.7312,"o15":0.7607,"o25":0.5152,"o35":0.2972,"btts":0.5372,"fh_o05":0.7224,"h_o05":0.7311,"h_o15":0.3733,"a_o05":0.7375,"a_o15":0.3808},
  {"date":"2026-08-29","league":"France Ligue 2","home":"Nancy","away":"Dunkerque","home_p":0.3793,"draw_p":0.2759,"away_p":0.3448,"dc1x":0.6552,"dcx2":0.6207,"dc12":0.7241,"anybody":0.7241,"o15":0.7357,"o25":0.4838,"o35":0.2705,"btts":0.5062,"fh_o05":0.7002,"h_o05":0.7259,"h_o15":0.3653,"a_o05":0.7043,"a_o15":0.3438}
];

/* Every test starts from the same board and the same seeds. The engines jitter
   their scores with a hash of the seed, so an unfixed seed makes every
   assertion below a coin toss. */
/* Real SportyBet prices, so the board behaves like the live one.
   Without them every fixture counts as UNPRICED, and both builders now restrict
   an unpriced fixture to the markets SportyBet always lists (1X2 and double
   chance) - which meant the whole suite was silently exercising the guess path
   and no test could ever see an Over 2.5 or a GG leg. Derived from each
   fixture's own probability so the prices stay coherent with the model. */
function priced(f) {
  const o = (p) => Math.round((1 / Math.max(0.02, p)) * 100) / 100;
  return Object.assign({}, f, { sportyOdds: {
    "1": o(f.home_p), "2": o(f.away_p), "X": o(f.draw_p),
    "1X": o(f.dc1x), "X2": o(f.dcx2), "12": o(f.dc12),
    "OVER_1.5": o(f.o15), "OVER_2.5": o(f.o25), "OVER_3.5": o(f.o35),
    "GG": o(f.btts), "FH_OVER_0.5": o(f.fh_o05),
    "HOME_OVER_0.5": o(f.h_o05), "AWAY_OVER_0.5": o(f.a_o05),
    "HOME_OVER_1.5": o(f.h_o15), "AWAY_OVER_1.5": o(f.a_o15),
  } });
}

function reset() {
  api.setFixtures(BOARD.map(priced));
  api.setTopOnly(false);
  Object.assign(api.BUILD, { risk: 50, seed: 12345, shuffles: 0, removed: {}, touched: true });
  api.BUILD.mk = { wd: true, any: false, out: true, o15: true, o25: true,
                   o35: false, fh: false, tts: false, tts2: false, both: true };
  /* slider:true reproduces the behaviour every test below was written against:
     wspBuild consulted the Slider whenever it could reach the payout. The tests
     that care about the Wizard's own method set it false themselves. */
  Object.assign(api.WSP, { odds: null, legodd: 1.35, slider: true, everyGame: false,
                           seed: 4242, shuffles: 0, conjured: false, removed: {} });
  api.WSP.mk = { wd: true, any: false, out: true, o15: true, o25: true,
                 o35: false, fh: false, tts: false, tts2: false, both: true };
}
const codes = (picks) => picks.map(c => c.code).sort().join(",");
const shape = (picks) => picks.map(c => c.id + ":" + c.code).join("|");
const product = (picks) => picks.reduce((a, c) => a * api.legOdd(c.f, c.code, c.p), 1);
const avgP = (picks) => picks.reduce((a, c) => a + c.p, 0) / (picks.length || 1);

/* ------------------------------------------------------------- the slider */

test("the slider is deterministic: one seed, one slip", () => {
  reset();
  const a = api.buildPicks(), b = api.buildPicks();
  assert.ok(a.length > 0, "the board should produce a slip at all");
  assert.strictEqual(shape(a), shape(b));
});

test("shuffling really does change the slip", () => {
  reset();
  const a = shape(api.buildPicks());
  api.BUILD.seed = 999;
  assert.notStrictEqual(shape(api.buildPicks()), a);
});

/* The whole contract of the dial. Anything that breaks this has broken the
   slider even if every leg still looks reasonable on its own. */
test("the dial trades confidence for odds, in both directions", () => {
  reset();
  const runs = [5, 25, 50, 75, 95].map(risk => {
    api.BUILD.risk = risk;
    const p = api.buildPicks();
    return { risk, odds: product(p), conf: avgP(p) };
  });
  for (let i = 1; i < runs.length; i++) {
    assert.ok(runs[i].odds > runs[i - 1].odds,
      `odds should rise with risk: x${runs[i - 1].odds.toFixed(2)} at ${runs[i - 1].risk}` +
      ` then x${runs[i].odds.toFixed(2)} at ${runs[i].risk}`);
    assert.ok(runs[i].conf <= runs[i - 1].conf,
      `confidence should not rise with risk: ${runs[i - 1].conf.toFixed(3)} then ${runs[i].conf.toFixed(3)}`);
  }
});

/* An invariant, not coverage - and the difference matters to whoever merges
   these engines.
   Both carry four lines of `sane()` refusing `1`/`1X` when the away side is
   favourite and `2`/`X2` when the home side is. Deleting all four and
   re-running this file changes nothing: on a realistic board the scoring never
   wants the wrong side anyway, because `minConf` (0.72 down to 0.42 across the
   dial) filters the underdog outright before it is scored, and for double
   chance `dc1x > dcx2` exactly when the home side is favourite. Verified by
   mutation: with the guard removed the slider still returns 11 clean picks at
   every risk from 50 to 99, on double chance alone.
   So the guard is defensive rather than load-bearing today, and this test
   passes without exercising it. It earns its place by catching a *future*
   change that reaches the same bad output by another route - but nobody should
   read a green run here as proof those four lines are still doing work. */
test("the slider never backs a side against the model's own favourite", () => {
  reset();
  for (const risk of [5, 20, 40, 60, 80, 95]) {
    api.BUILD.risk = risk;
    for (const c of api.buildPicks()) {
      const homeFav = c.f.home_p > c.f.away_p;
      assert.ok(!((c.code === "1" || c.code === "1X") && !homeFav),
        `${c.code} on ${c.f.home} v ${c.f.away} at risk ${risk}`);
      assert.ok(!((c.code === "2" || c.code === "X2") && homeFav),
        `${c.code} on ${c.f.home} v ${c.f.away} at risk ${risk}`);
    }
  }
});

test("a market switched off never appears on the slip", () => {
  reset();
  assert.ok(codes(api.buildPicks()).includes("OVER_2.5"), "precondition: o25 is on and used");
  api.BUILD.mk.o25 = false;
  assert.ok(!codes(api.buildPicks()).includes("OVER_2.5"));
  reset();
  api.BUILD.mk.both = false;
  assert.ok(!codes(api.buildPicks()).includes("GG"));
});

test("top flight only drops the second-tier game", () => {
  reset();
  const all = api.buildPicks();
  assert.ok(all.some(c => /Ligue 2/.test(c.f.league)), "precondition: Ligue 2 is on the board");
  api.setTopOnly(true);
  assert.ok(!api.buildPicks().some(c => /Ligue 2/.test(c.f.league)));
});

/* The two engines both honour `removed`, but not the same way - the slider
   also shrinks its own cap by the number removed, the wizard simply skips
   them. Recorded because a merge has to choose one. */
test("a removed fixture stays off, and also costs the slider a slot", () => {
  reset();
  const before = api.buildPicks();
  const victim = before[0];
  api.BUILD.removed[victim.id] = 1;
  const after = api.buildPicks();
  assert.ok(!after.some(c => c.id === victim.id), "the removed game came back");
  assert.ok(after.length < before.length,
    "the slider shrinks its cap by the removed count, so the slip gets shorter");
});

/* --------------------------------------------------------------- the wizard */

test("the wizard is deterministic: one seed, one slip", () => {
  reset();
  api.WSP.odds = 100;
  assert.strictEqual(shape(api.wspBuild().picks), shape(api.wspBuild().picks));
});

test("the wizard reaches a target it can reach", () => {
  reset();
  api.WSP.odds = 12;
  const r = api.wspBuild();
  assert.ok(r.picks.length > 0);
  assert.ok(r.odds >= 12, `wanted at least x12, got x${r.odds.toFixed(2)}`);
});

/* Eleven games cannot multiply to twenty thousand. The behaviour that matters
   is that it returns the best it can rather than an empty slip or a hang. */
test("a board too small for the target gives its best, not nothing", () => {
  reset();
  api.WSP.odds = 50000;
  const r = api.wspBuild();
  assert.strictEqual(r.picks.length, BOARD.length, "it should use every game it has");
  assert.ok(r.odds > 1 && r.odds < 50000);
});

test("a bigger target buys more legs", () => {
  const big = [];
  for (let i = 0; i < 60; i++) {
    const b = BOARD[i % BOARD.length];
    big.push(Object.assign({}, b, { home: b.home + " " + i, away: b.away + " " + i,
                                    date: "2026-09-0" + (1 + (i % 9)) }));
  }
  reset();
  api.setFixtures(big);
  let last = 0;
  for (const target of [50, 500, 5000, 20000]) {
    api.WSP.odds = target;
    const r = api.wspBuild();
    assert.ok(r.picks.length > last,
      `x${target} should need more than the ${last} legs the previous target used`);
    assert.ok(r.odds >= target * 0.9, `x${target} landed at x${r.odds.toFixed(0)}`);
    assert.ok(r.picks.length <= api.JACKPOT_LEG_CAP,
      `never past the cap of ${api.JACKPOT_LEG_CAP}`);
    last = r.picks.length;
  }
});

/* Any winner was drawn as a chip in wizard mode for months while doing nothing,
   because the market sync dropped it. This is the test that would have caught
   it, and the one that stops it regressing. */
test("Any winner reaches the wizard only when it is switched on", () => {
  reset();
  api.WSP.odds = 100;
  assert.ok(!api.wspMarkets().includes("12"), "off by default");
  api.WSP.mk.any = true;
  assert.ok(api.wspMarkets().includes("12"), "on when the chip is on");
  api.WSP.mk = { wd: false, any: true, out: false, o15: false, o25: false,
                 o35: false, fh: false, tts: false, tts2: false, both: false };
  const only = api.wspBuild().picks;
  assert.ok(only.length > 0);
  assert.deepStrictEqual([...new Set(only.map(c => c.code))], ["12"]);
});

test("the wizard never backs a side against the model's own favourite", () => {
  reset();
  for (const target of [10, 100, 1000]) {
    api.WSP.odds = target;
    for (const c of api.wspBuild().picks) {
      const homeFav = c.f.home_p > c.f.away_p;
      assert.ok(!((c.code === "1" || c.code === "1X") && !homeFav), c.code + " at x" + target);
      assert.ok(!((c.code === "2" || c.code === "X2") && homeFav), c.code + " at x" + target);
    }
  }
});

/* ---------------------------------------------------------------- the seam */

/* What a merge has to preserve. The two engines return leg objects that agree
   on four fields and then diverge - the slider carries `eventId` for booking,
   the wizard carries `od` and `_cost` from solving for the target. Anything
   unifying them has to keep both sets, and this records which is which. */
test("both engines agree on the fields the rest of the page reads", () => {
  reset();
  const s = api.buildPicks()[0];
  api.WSP.odds = 100;
  const w = api.wspBuild().picks[0];
  for (const k of ["f", "id", "code", "p"]) {
    assert.ok(k in s, "slider leg is missing " + k);
    assert.ok(k in w, "wizard leg is missing " + k);
  }
  assert.ok("eventId" in s, "the slider carries eventId, which booking needs");
  assert.ok("od" in w, "the wizard carries od, which its own solver needs");
});

test("both engines draw only from the shared fixture pool", () => {
  reset();
  api.WSP.odds = 100;
  const ids = new Set(BOARD.map(f => api.fid(f)));
  for (const c of api.buildPicks()) assert.ok(ids.has(c.id), "slider invented " + c.id);
  for (const c of api.wspBuild().picks) assert.ok(ids.has(c.id), "wizard invented " + c.id);
});


/* --------------------------------------------- nothing to style with no target

   The Wizard panel hides the Slip style chips while WSP.odds is null. This is
   the reason it is allowed to: with no target every style builds the same empty
   slip, so all three chips are dead controls. The custom payout box clears the
   payout on the first keystroke, which is how a user meets this state - and the
   chips used to flicker in for as long as it took to type a number. */

test("with no payout chosen, every slip style builds the same nothing", () => {
  reset();
  api.WSP.odds = null;
  const shapes = [1.25, 1.4, 1.8].map((lo) => {
    api.WSP.legodd = lo;
    const r = api.wspBuild();
    return { n: r.picks.length, odds: r.odds };
  });
  assert.deepStrictEqual(shapes[0], { n: 0, odds: 1 },
    "no target means no slip, whatever the style says");
  assert.deepStrictEqual(shapes[1], shapes[0]);
  assert.deepStrictEqual(shapes[2], shapes[0],
    "three chips that all produce the same empty slip are dead controls");
});

test("the empty slip is caused by the missing target, not by the harness", () => {
  /* The control for the case above. Leg count is deliberately NOT compared
     across styles here: inside the Slider's range the Slider does the picking
     and one risk gives one answer, so style is *meant* to change nothing - and
     on a board this size the leg count is capped by the number of fixtures
     anyway. What must hold is that the same styles build a real slip the moment
     there is a number to reach. */
  reset();
  for (const lo of [1.25, 1.4, 1.8]) {
    api.WSP.legodd = lo;

    api.WSP.odds = null;
    assert.strictEqual(api.wspBuild().picks.length, 0,
      `style ${lo} should build nothing with no target`);

    api.WSP.odds = 12;
    assert.ok(api.wspBuild().picks.length > 0,
      `style ${lo} should build a real slip once a target is set`);
  }
});

/* ------------------------------------------- the Slider as a slip style */

/* The Slider used to take over silently below a ceiling that moves by five
   orders of magnitude between boards (93 on a thin day scope, 18,606,289 on
   All upcoming), which is why "fewer games, bigger odds" appeared to stop
   working: on a big card the Slider was answering every rung and the chips
   were never drawn. It is a chip now, so these assert the reader's choice is
   the thing that decides, not the board. */


test("choosing a style takes the payout back from the Slider", () => {
  reset();
  api.WSP.odds = 100; api.WSP.slider = false; api.WSP.legodd = 1.7;
  const r = api.wspBuild();
  assert.notStrictEqual(r.via, "slider", "a chosen style must build the Wizard's way");
  assert.ok(r.picks.length, "and must actually return a slip");
});

test("the styles give different slips at a payout the Slider could have taken", () => {
  /* The whole point of the change. At x100 on this board the Slider can reach
     the target, so before this every one of these was the same slip. */
  reset();
  api.WSP.odds = 100;
  assert.strictEqual(api.sliderCanReach(), true,
    "x100 must be inside the Slider's reach or this proves nothing");
  const legs = [1.25, 1.4, 1.7].map(lo => {
    api.WSP.slider = false; api.WSP.legodd = lo; api.WSP._sig = null;
    return api.wspBuild().picks.length;
  });
  assert.ok(new Set(legs).size > 1,
    "More/Balanced/Fewer must not collapse onto one slip, got " + legs.join(","));
  assert.ok(legs[0] > legs[2],
    "More games must build more legs than Fewer games, got " + legs.join(","));
});

test("reachability is a fact about the board, the method is a choice", () => {
  reset();
  api.WSP.odds = 100;
  api.WSP.slider = true;
  assert.strictEqual(api.sliderCanReach(), true);
  assert.strictEqual(api.sliderDrives(), true);
  api.WSP.slider = false;
  assert.strictEqual(api.sliderCanReach(), true, "the board has not changed");
  assert.strictEqual(api.sliderDrives(), false, "but the reader has chosen otherwise");
});

test("a payout past the Slider's reach cannot be driven by it", () => {
  reset();
  api.WSP.odds = 50000; api.WSP.slider = true;
  assert.strictEqual(api.sliderCanReach(), false, "this board cannot reach x50000");
  assert.strictEqual(api.sliderDrives(), false,
    "so Auto must not answer it even while selected - the panel clears the chip");
});



test("style cannot move the leg count in 'every game that qualifies'", () => {
  /* The reason the chips are not drawn in that mode. If this ever starts
     failing, the chips should come back. */
  reset();
  api.WSP.slider = false; api.WSP.everyGame = true; api.WSP.odds = 100;
  const legs = [1.25, 1.4, 1.7].map(lo => {
    api.WSP.legodd = lo; api.WSP._sig = null;
    return api.wspBuild().picks.length;
  });
  assert.strictEqual(new Set(legs).size, 1,
    "every-game ignores legodd, so all styles must agree: " + legs.join(","));
});

test("the chip row is not drawn in 'every game that qualifies'", () => {
  assert.match(src, /if\(WSP\.everyGame\)\{[\s\S]{0,700}Every qualifying game goes in/,
    "every-game must explain itself rather than draw chips that do nothing");
  assert.match(src, /\}\s*else if\(WSP\.odds!=null\)\{[\s\S]{0,900}wspStyleChips/,
    "and the chip row must sit behind that check");
});

test("exactly one style is ever selected", () => {
  /* wspStyleOn returns a single value by construction, so the invariant is
     that it is always one of the four the row draws - never undefined, never
     a legodd the row has no chip for. */
  reset();
  const CHIPS = ["slider", 1.25, 1.4, 1.7];
  for (const odds of [10, 100, 2000, 50000]) {
    for (const slider of [true, false]) {
      for (const lo of [1.25, 1.4, 1.7]) {
        api.WSP.odds = odds; api.WSP.slider = slider; api.WSP.legodd = lo;
        const on = api.wspStyleOn();
        assert.ok(CHIPS.indexOf(on) >= 0,
          "lit chip must be one the row draws, got " + String(on) +
          " at odds=" + odds + " slider=" + slider + " legodd=" + lo);
      }
    }
  }
});

/* --------------------------------- the panel and the slip must never differ */

/* One invariant covers every way a reader can reach this panel: whatever chip
   is lit is the method that actually builds. Everything below drives real
   option changes - payout, style, markets, every-game, removals, top-flight -
   and asserts it after each one. */
function assertAgrees(where) {
  const on = api.wspStyleOn();
  const r = api.wspBuild();
  const builtBySlider = r.via === "slider";
  assert.strictEqual(on === "slider", builtBySlider,
    where + ": chip says " + String(on) + " but via=" + String(r.via));
  return r;
}

test("the lit chip matches the builder through every option change", () => {
  reset();
  for (const odds of [10, 100, 1000, 50000]) {
    for (const slider of [true, false]) {
      for (const lo of [1.25, 1.4, 1.7]) {
        for (const top of [false, true]) {
          api.setTopOnly(top);
          api.WSP.odds = odds; api.WSP.slider = slider; api.WSP.legodd = lo;
          api.WSP._sig = null;
          assertAgrees("odds=" + odds + " slider=" + slider +
                       " legodd=" + lo + " top=" + top);
        }
      }
    }
  }
  api.setTopOnly(false);
});

test("turning markets off cannot leave Auto lit but not building", () => {
  /* Markets change the pool, which changes the ceiling. If that drops below the
     target, Auto has to stop being the answer AND stop being lit. */
  reset();
  api.WSP.odds = 500; api.WSP.slider = true;
  assertAgrees("all markets on");
  api.WSP.mk = { wd: true, any: false, out: false, o15: false, o25: false,
                 o35: false, fh: false, tts: false, tts2: false, both: false };
  api.WSP._sig = null;
  assertAgrees("double chance only");
});

test("removing games cannot leave Auto lit but not building", () => {
  /* The case the cache key was getting wrong: a removal can drop the ceiling
     under the target without any other input changing. */
  reset();
  api.WSP.odds = 100; api.WSP.slider = true;
  assertAgrees("nothing removed");
  const all = api.wspBuild().picks.map(c => c.id);
  const rm = {};
  for (const id of all.slice(0, Math.max(1, all.length - 1))) rm[id] = 1;
  api.WSP.removed = rm; api.WSP._sig = null;
  assertAgrees("most of the board removed");
  api.WSP.removed = {};
});

test("toggling every-game and back leaves the reader where they were", () => {
  reset();
  api.WSP.odds = 100; api.WSP.slider = true;
  const before = api.wspStyleOn();
  api.WSP.everyGame = true; api.WSP._sig = null;
  const r = api.wspBuild();
  assert.notStrictEqual(r.via, "slider", "every-game is always the Wizard's");
  assert.ok(r.picks.length, "and still builds a slip");
  api.WSP.everyGame = false; api.WSP._sig = null;
  assert.strictEqual(api.wspStyleOn(), before,
    "coming back must restore the method, not silently change it");
  assertAgrees("after every-game round trip");
});

test("the cache key follows the method that will build, not the raw flag", () => {
  /* Removals are deliberately absent from the key so a delete filters rather
     than rebuilds. That is only safe while the key carries the DERIVED method,
     because a removal can change it. */
  assert.match(src, /var _sig=\[WSP\.odds,WSP\.legodd,wspStyleOn\(\),/,
    "the preview cache must key on wspStyleOn(), not WSP.slider");
});

test("a reader lands on Balanced", () => {
  /* 1.4 is the Balanced chip. A default matching no chip means a first visit
     builds to a style none of the buttons shows as chosen, and tapping
     Balanced then changes the slip while appearing to change nothing. */
  const m = /var WSP=\{[^;]*?legodd:([0-9.]+)/.exec(src);
  assert.ok(m, "WSP must declare a legodd default");
  assert.strictEqual(m[1], "1.4", "the default must be the Balanced chip");
  assert.ok(!/\bslider:/.test(m.input.slice(m.index, m.index + 200)),
    "and there is no Auto flag any more - the Slider is a link, not a style");
});

test("the Wizard always builds its own way now", () => {
  reset();
  for (const odds of [10, 100, 2000]) {
    api.WSP.odds = odds; api.WSP._sig = null;
    const r = api.wspBuild();
    assert.notStrictEqual(r.via, "slider",
      "x" + odds + " must be the Wizard's own method");
    assert.ok(r.picks.length, "x" + odds + " must still return a slip");
  }
});
