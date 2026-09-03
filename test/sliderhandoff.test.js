"use strict";

/**
 * Where the Slider ends and the Wizard begins.
 *
 * The two builders answer different questions. The Slider is given a risk and
 * returns games; the Wizard is given a payout and works backwards to games.
 * Inside the range the Slider can reach, its picks are the safer ones - it
 * selects on model confidence against a floor, while the Wizard is pulled
 * toward longer legs by the arithmetic of hitting a number.
 *
 * So the payout decides which method runs. A target inside the Slider's
 * envelope is handed over wholesale and the Slider's selection is returned
 * exactly; only a payout beyond its reach gets the Wizard's own method.
 *
 * THE ENVELOPE IS NOT A CONSTANT, and it is far wider than one day's card
 * suggests. Measured 2 September:
 *
 *     day scope, default markets     28 legs      2,198
 *     all scope, default markets     35 legs     11,476
 *     all scope, every market on     35 legs    123,616
 *
 * and a full Saturday card reaches 229,863. The midweek `day` figure is the
 * least representative number available; reading the ceiling off it would put
 * the handover in the wrong place for most of the week. Which limit binds -
 * the 35-leg cap, or the board running out of fixtures above the confidence
 * floor - is not knowable in advance, so nothing is hardcoded and the range is
 * measured at build time.
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
  "hasRealOdd", "pricedFixture", "mProb", "riskParams", "safeUnpriced",
  "allowedMarkets", "preferGoalsOverDouble", "buildPicks",
  "sliderRunAt", "sliderCeiling", "sliderDrives", "sliderReach"];

function engine(fixtures) {
  return new Function("FX", [
    "var TOP_ONLY=false;",
    "var FIXTURES=FX;",
    "function scopeFixtures(){return FIXTURES;}",
    "function slipUse(){return {};}",
    /* The panel-facing helpers read the fixture window and the league filter,
       so the harness has to supply them. */
    'var SCOPE="all", SDAY=null, TOD=null;',
    konst("SAFE_UNPRICED"), konst("HIGH_SCORING_O25"),
    konst("SA_MIN_EURO"), konst("ASIA_MIN_EURO"),
    konst("SA_COUNTRIES"), konst("ASIA_PREFIXES"),
    konst("SPREAD_PEN"), konst("SPREAD_MULT"),
    (/^var BUILD=\{[\s\S]*?\};/m.exec(src) || [""])[0],
    (/^var WSP=\{[\s\S]*?\};/m.exec(src) || [""])[0],
  ].concat(FNS.map(grab)).join("\n") +
    "\nBUILD.risk=45; BUILD.seed=1; BUILD.removed={}; BUILD.shuffles=0;" +
    "\nreturn {buildPicks:buildPicks, sliderRunAt:sliderRunAt, sliderReach:sliderReach," +
    "\n        sliderCeiling:sliderCeiling, sliderDrives:sliderDrives," +
    "\n        BUILD:BUILD, WSP:WSP," +
    "\n        setCeilCache:function(v){sliderCeiling.memo=v;}," +
    "\n        getCeilCache:function(){return sliderCeiling.memo;}};")(fixtures);
}

/* A board wide enough that the risk dial has somewhere to go. */
function board(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const hp = 0.40 + (i % 9) * 0.035;          /* 0.40 .. 0.68 */
    const dp = 0.24, ap = Math.max(0.05, 1 - hp - dp);
    out.push({
      id: "m" + i, date: "2026-09-05", league: "England Premier League",
      home: "H" + i, away: "A" + i,
      home_p: hp, draw_p: dp, away_p: ap,
      dc1x: Math.min(0.97, hp + dp), dcx2: Math.min(0.97, dp + ap),
      dc12: Math.min(0.97, hp + ap), anybody: Math.min(0.97, hp + ap),
      o15: 0.74 + (i % 5) * 0.03, o25: 0.52 + (i % 5) * 0.03, o35: 0.30,
      btts: 0.55, fh_o05: 0.70,
      h_o05: 0.80, h_o15: 0.55, a_o05: 0.72, a_o15: 0.45,
    });
  }
  return out;
}

/* ------------------------------------------------------- inside the range */

test("a target the Slider can reach is answered by the Slider", () => {
  const e = engine(board(40));
  const got = e.sliderReach(10, 1, {});
  assert.ok(got, "x10 is well inside any usable board");
  assert.ok(got.picks.length > 0);
  assert.ok(got.odds >= 10, "the payout promise is 'at least what you asked for', got " + got.odds);
});

test("and the answer is exactly what the Slider would have built", () => {
  /* Not an imitation of the Slider - buildPicks does the work and its result
     is handed back. Same games, same markets, same order. */
  const e = engine(board(40));
  const got = e.sliderReach(10, 1, {});
  e.BUILD.risk = got.risk != null ? got.risk : e.BUILD.risk;
  /* Rebuild at the risk the search settled on and compare selections. */
  let matchedAtSomeRisk = false;
  for (let r = 0; r <= 100; r++) {
    e.BUILD.risk = r; e.BUILD.seed = 1; e.BUILD.removed = {};
    const direct = e.buildPicks() || [];
    if (direct.length === got.picks.length &&
        direct.every((c, i) => c.id === got.picks[i].id && c.code === got.picks[i].code)) {
      matchedAtSomeRisk = true; break;
    }
  }
  assert.ok(matchedAtSomeRisk,
    "the handed-back slip must be a real Slider build, not a reconstruction");
});

test("it takes the smallest risk that reaches the target, not the closest", () => {
  /* Undershooting would land nearer the number and quietly break the promise
     the Wizard makes. Overshooting by the least is the correct trade. */
  const e = engine(board(40));
  const T = 25;
  const got = e.sliderReach(T, 1, {});
  assert.ok(got.odds >= T, "must reach the target");
  assert.strictEqual(typeof got.risk, "number", "the chosen risk must be reported");

  /* The risk one step below must fall SHORT, or the search stopped too late
     and the user is being handed more risk than their payout needed. */
  if (got.risk > 0) {
    const below = e.sliderRunAt(got.risk - 1, 1, {});
    e.BUILD.risk = 45; e.BUILD.seed = 1; e.BUILD.removed = {};
    assert.ok(below.odds < T,
      "risk " + (got.risk - 1) + " already reaches " + T +
      " (" + below.odds.toFixed(2) + "), so " + got.risk + " is too high");
  }
});

/* ------------------------------------------------------ beyond the range */

test("a payout past the Slider's reach is left to the Wizard", () => {
  /* The whole point of the split. A number the Slider cannot reach must fall
     through rather than being answered with its best effort. */
  const e = engine(board(40));
  assert.strictEqual(e.sliderReach(1e12, 1, {}), null);
});

test("a nonsensical target is refused rather than searched for", () => {
  const e = engine(board(40));
  for (const T of [null, undefined, 0, 1, -5, NaN]) {
    assert.strictEqual(e.sliderReach(T, 1, {}), null, "target " + T);
  }
});

test("an empty board hands nothing back", () => {
  const e = engine([]);
  assert.strictEqual(e.sliderReach(10, 1, {}), null);
});

/* ------------------------------------------- it must not corrupt the Slider */

test("the Slider's own state survives being borrowed", () => {
  /* sliderRunAt drives the real BUILD object, so the user's risk setting,
     shuffle seed and removed games have to come back untouched. Leaving the
     dial moved would change the Slider tab under the user after a Wizard
     build. */
  const e = engine(board(40));
  e.BUILD.risk = 37; e.BUILD.seed = 99; e.BUILD.removed = { "m3": 1 };
  e.sliderReach(50, 5, { "m7": 1 });
  assert.strictEqual(e.BUILD.risk, 37, "risk was left moved");
  assert.strictEqual(e.BUILD.seed, 99, "seed was left moved");
  assert.deepStrictEqual(e.BUILD.removed, { "m3": 1 }, "removals were left changed");
});

test("every handed-back leg carries the odd it will be booked at", () => {
  /* The Slider's own picks do not have `od`; the Wizard's consumers and the
     odds total both need it. */
  const e = engine(board(40));
  const got = e.sliderReach(10, 1, {});
  for (const c of got.picks) {
    assert.strictEqual(typeof c.od, "number", JSON.stringify(c));
    assert.ok(c.od > 1, "an odd of " + c.od + " cannot be right");
  }
});

/* ------------------------------------------------------------ the call site */

test("the Wizard actually hands over", () => {
  /* Call-site assertion. Everything above drives sliderReach directly and
     would pass unchanged while wspBuild ignored it, which is exactly the bug
     worth guarding. */
  const fn = src.slice(src.indexOf("function wspBuild()"),
                       src.indexOf("function wspBuild()") + 1800);
  assert.match(fn, /sliderReach\(WSP\.odds/,
    "wspBuild must consult the Slider before doing its own work");
  assert.match(fn, /if\(handed\) return \{picks:handed\.picks/,
    "and return the Slider's selection untouched");
  assert.match(fn, /!WSP\.everyGame/,
    '"every game that qualifies" asks a different question and keeps the Wizard');
});

test("the envelope is measured, never hardcoded", () => {
  /* It moves with the fixture window, the market toggles and the board. A
     constant here would put the handover in the wrong place on most days -
     the midweek figure is a quarter of what a Saturday reaches. */
  const fn = grab("sliderReach") + grab("sliderRunAt");
  assert.match(fn, /buildPicks\(\)/, "the range has to come from real builds");
  assert.doesNotMatch(fn, /\b(2198|6490|11476|123616|229863)\b/,
    "a measured ceiling must not be frozen into the code");
});

test("the Wizard's market toggles are obeyed, not overruled", () => {
  /* Caught by an existing engines.test case, not by anything written here.
     The first version of the handoff ran the Slider with the SLIDER's market
     settings, so turning a market off in the Wizard did nothing at all - the
     panel's toggles became decoration inside the whole range the Slider
     covers, which is most targets people ask for.
     Both panels ship identical defaults, so an untouched Wizard still gets
     exactly what the Slider would build. */
  const e = engine(board(40));
  const onlyDouble = { wd: true, any: false, out: false, o15: false, o25: false,
                       o35: false, fh: false, tts: false, tts2: false, both: false };
  const got = e.sliderReach(10, 1, {}, onlyDouble);
  assert.ok(got && got.picks.length, "should still find a slip");
  const codes = [...new Set(got.picks.map(c => c.code))].sort();
  assert.deepStrictEqual(codes.filter(c => c !== "1X" && c !== "X2"), [],
    "only double chance was left on, got " + codes.join(", "));
});

test("the Slider's own market settings survive being borrowed", () => {
  const e = engine(board(40));
  const before = JSON.stringify(e.BUILD.mk);
  e.sliderReach(10, 1, {}, { wd: true, any: false, out: false, o15: false, o25: false,
                             o35: false, fh: false, tts: false, tts2: false, both: false });
  assert.strictEqual(JSON.stringify(e.BUILD.mk), before, "BUILD.mk was left changed");
});

/* ------------------------------------------- what the panel needs to know */

test("the panel can tell which builder will answer", () => {
  /* renderBuilder draws its controls BEFORE the slip is built, so it needs a
     cheap answer to "is the Slider doing this one". */
  const e = engine(board(40));
  e.WSP.everyGame = false; e.WSP.removed = {};
  e.WSP.odds = 10;
  assert.strictEqual(e.sliderDrives(), true, "x10 is inside any usable board");
  e.WSP.odds = 1e12;
  assert.strictEqual(e.sliderDrives(), false, "a payout past the ceiling is the Wizard's");
});

test("'every game that qualifies' is always the Wizard's", () => {
  /* It asks a different question from a payout, so the Slider never takes it
     and the style control must stay. */
  const e = engine(board(40));
  e.WSP.odds = 10; e.WSP.everyGame = true; e.WSP.removed = {};
  assert.strictEqual(e.sliderDrives(), false);
});

test("with no payout chosen yet, nothing is handed over", () => {
  const e = engine(board(40));
  e.WSP.odds = null; e.WSP.everyGame = false; e.WSP.removed = {};
  assert.strictEqual(e.sliderDrives(), false);
});

test("the ceiling is remembered rather than rebuilt per call", () => {
  /* Seven builds on every keystroke would make the panel crawl. The cache is
     keyed on the things that actually move the ceiling. */
  const e = engine(board(40));
  const first = e.sliderCeiling(1, {}, e.WSP.mk);
  assert.ok(first > 1, "a usable board has a ceiling above 1");
  /* Poison the cache: if it is consulted, the poisoned value comes back. */
  /* Poisoned under the key the function itself wrote, so this tests the memo
     rather than a guess at how the key is spelled. */
  const memo = e.getCeilCache();
  assert.ok(memo && memo.sig, "the ceiling must be memoised at all");
  e.setCeilCache({ sig: memo.sig, odds: 12345 });
  assert.strictEqual(e.sliderCeiling(1, {}, e.WSP.mk), 12345,
    "the memo was not consulted, so every call rebuilds");
});

test("the style chips are only wired when they are drawn", () => {
  /* Source-level, and it earns its place: the listener used to call
     querySelectorAll on the container unconditionally, so hiding the chips
     threw a TypeError and blanked the entire Wizard panel - a far worse
     failure than the dead buttons it was fixing. */
  assert.match(src, /var _sty=\$\("wspStyleChips"\);\s*\n\s*if\(_sty\)/,
    "the style-chip listener must tolerate the chips being absent");
  assert.match(src, /if\(sliderDrives\(\)\)\{[\s\S]{0,400}Safest method/,
    "and the panel must explain the swap rather than show dead controls");
});

test("the memo notices when the inputs change", () => {
  /* A cache keyed on nothing is worse than no cache: turning markets off would
     leave the panel quoting a ceiling from the previous settings, and the
     handover would fire for payouts the Slider can no longer reach. */
  const e = engine(board(40));
  const wide = { wd: true, any: true, out: true, o15: true, o25: true,
                 o35: true, fh: true, tts: true, tts2: true, both: true };
  const narrow = { wd: true, any: false, out: false, o15: false, o25: false,
                   o35: false, fh: false, tts: false, tts2: false, both: false };
  const a = e.sliderCeiling(1, {}, wide);
  const b = e.sliderCeiling(1, {}, narrow);
  assert.ok(a > b,
    "fewer markets must give a lower ceiling, got " + a + " then " + b);
  /* And back again, so the first value was not simply overwritten. */
  assert.strictEqual(e.sliderCeiling(1, {}, wide), a);
});


/* ------------------------------------------- the ceiling must follow the board

   The memo key is [seed, markets, SCOPE, SDAY, TOD, TOP_ONLY, removed]. None of
   those name the BOARD, so a ceiling measured while the payload had not arrived
   yet - an empty card, ceiling 0 - is served forever afterwards under the same
   key. sliderDrives() then answers false for every payout, the Wizard never
   hands over, and the Slip style chips it is supposed to replace stay on screen
   and never go away again. */

test("a ceiling measured on an empty board is not served after the board fills", () => {
  const live = [];                 // scopeFixtures() hands back this very array
  const e = engine(live);
  e.WSP.odds = 10; e.WSP.seed = 1; e.WSP.mk = null;
  e.WSP.removed = {}; e.WSP.everyGame = false;

  assert.strictEqual(e.sliderCeiling(1, {}, null), 0, "an empty card reaches nothing");
  assert.strictEqual(e.sliderDrives(), false, "and so cannot answer x10");

  board(40).forEach((f) => live.push(f));   // the payload arrives

  assert.ok(e.sliderCeiling(1, {}, null) >= 10,
    "the ceiling must be re-measured once there are fixtures to measure");
  assert.strictEqual(e.sliderDrives(), true,
    "x10 is inside the Slider's range, so the Slider drives and Slip style is hidden");
});

test("a board that empties again lowers the ceiling rather than keeping the old one", () => {
  const live = board(40).slice();
  const e = engine(live);
  e.WSP.odds = 10; e.WSP.seed = 1; e.WSP.mk = null;
  e.WSP.removed = {}; e.WSP.everyGame = false;

  assert.ok(e.sliderCeiling(1, {}, null) >= 10);
  live.length = 0;
  assert.strictEqual(e.sliderCeiling(1, {}, null), 0,
    "a stale high ceiling would hand the Wizard's job to a Slider with nothing to pick");
});


test("the panel draws no style chips before a payout is chosen", () => {
  /* Source-level, like the wiring check above, because the branch lives in a
     string-building render with no DOM to drive here. The behaviour it protects
     is asserted properly in engines.test.js: with WSP.odds null every style
     builds the same empty slip, so the chips are dead controls. */
  assert.match(src, /if\(WSP\.odds==null\)\{[\s\S]{0,200}\}\s*else if\(sliderDrives\(\)\)\{/,
    "no-target must be handled before the Slider check, not after it");
});


test("a different board of the same size still re-measures the ceiling", () => {
  /* Keying the memo on fixture COUNT alone would pass the empty-to-full case
     above and still be wrong: switching leagues, or a rebuild that swaps the
     card for a different set of the same size, would keep quoting the old
     ceiling. */
  const live = board(40).slice();
  const e = engine(live);
  e.WSP.seed = 1; e.WSP.mk = null; e.WSP.removed = {}; e.WSP.everyGame = false;
  const wide = e.sliderCeiling(1, {}, null);

  /* Same count, different games: near-certainties, so the reachable payout is
     far lower even at maximum risk. */
  live.length = 0;
  for (let i = 0; i < 40; i++) {
    live.push({
      id: "z" + i, date: "2026-09-05", league: "England Premier League",
      home: "Z" + i, away: "Y" + i,
      home_p: 0.93, draw_p: 0.05, away_p: 0.02,
      dc1x: 0.98, dcx2: 0.07, dc12: 0.95, anybody: 0.95,
      o15: 0.97, o25: 0.95, o35: 0.93, btts: 0.94, fh_o05: 0.96,
      h_o05: 0.98, h_o15: 0.96, a_o05: 0.95, a_o15: 0.93,
    });
  }
  const safe = e.sliderCeiling(1, {}, null);
  assert.strictEqual(live.length, 40, "the count is deliberately unchanged");
  assert.notStrictEqual(safe, wide,
    `a board swap must move the ceiling (both measured ${wide})`);
});


test("dropping games from the middle re-measures the ceiling too", () => {
  /* Same first fixture, same last fixture, fewer games between them - which is
     what a league filter or a rebuild that drops kicked-off matches looks like.
     Keying on the two ends alone would keep quoting the old ceiling. */
  const live = board(40).slice();
  const e = engine(live);
  e.WSP.seed = 1; e.WSP.mk = null; e.WSP.removed = {}; e.WSP.everyGame = false;
  const before = e.sliderCeiling(1, {}, null);

  live.splice(1, 20);                       // ends untouched, 20 games gone
  assert.strictEqual(live.length, 20);
  const after = e.sliderCeiling(1, {}, null);
  assert.notStrictEqual(after, before,
    `half the card left, so the reachable payout must change (both ${before})`);
});
