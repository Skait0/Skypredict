"use strict";

/* Cup ties between divisions, and ties between countries.
 *
 * These rest on the one assumption in the model: how much weaker each
 * division is than its country's top flight, and since 6 Sep 2026 how much
 * weaker each country is than England. Nothing in the data can measure either
 * - no cup results in the training feeds, no club appears in two leagues, and
 * no match crosses a border - so the tests here pin down the shape of the
 * assumption and, more importantly, what happens when it cannot be applied.
 *
 * This used to lift tierEdge out of build.js by slicing the source between two
 * landmarks and eval'ing it. That worked until the file grew a function
 * between them, which is a silent way to test nothing at all. It imports the
 * real module now.
 */

const test = require("node:test");
const assert = require("node:assert");

const { tierEdge, TIER_HANDICAP, countryHandicap, UEFA_COEFFICIENT, COUNTRY_CAP } =
  require("../lib/build.js");

const M = require("../lib/model.js");

/* Which countries the committed artefact actually fitted. Absent before the
   first harvest, and absent is a supported state - an empty set puts every
   country back under the monotonicity assertion, which is what this file said
   before the fit existed. */
let EUROFF_COUNTRIES = {};
try { EUROFF_COUNTRIES = require("../data/country-offsets.json").countries || {}; }
catch (e) { EUROFF_COUNTRIES = {}; }

/* Countries the fit could not place because it ran into COUNTRY_CAP. These
   are refused rather than priced, so they are the one legitimate null in a
   table that otherwise has a number for every UEFA country. */
const PINNED = Object.keys(EUROFF_COUNTRIES)
  .filter((c) => EUROFF_COUNTRIES[c].clamped && EUROFF_COUNTRIES[c].matches > 0);

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
  /* This is the one that matters, and it is unchanged in substance. Zero would
     quietly declare a top-flight side and a third-tier side evenly matched,
     and the fixture would go out unmarked and eligible to headline the site.
     Null means "do not predict".

     What DID change, 6 Sep 2026: two countries that both hold a UEFA
     association coefficient are now comparable, so England v Spain returns a
     number instead of null. That is the whole point of the change - the board
     used to refuse every European tie. The cases below are the ones still
     genuinely incomparable, and they are the ones the guard now protects. */
  assert.equal(tierEdge("England Premier League", "Japan J1 League"), null,
    "Japan is not a UEFA association - there is no published number bridging it");
  assert.equal(tierEdge("Brazil Serie A", "Argentina Liga Profesional"), null,
    "CONMEBOL has no coefficient comparable to UEFA's; Libertadores stays refused");
  assert.equal(tierEdge("England Premier League", "USA MLS"), null);
  assert.equal(tierEdge("Nowhere Division 1", "Nowhere Division 2"), null);
  assert.equal(tierEdge("England Premier League", "Nowhere Division 1"), null,
    "a league missing from the ladder is refused even against a known one");
});

test("two UEFA countries are now comparable, and in the right direction", () => {
  /* Sanity, not precision. The exact numbers come from the coefficient table
     and will move each season; what must not move is the ordering. */
  const eq = tierEdge("Spain La Liga 1", "Italy Serie A");
  assert.ok(eq !== null, "Real Madrid v Inter must not be refused any more");
  assert.ok(Math.abs(eq) < 0.10,
    "Spain and Italy are within a whisker of each other; got " + eq);

  /* Positive means the HOME side is favoured by the ladder. */
  assert.ok(tierEdge("Germany Bundesliga 1", "Norway Eliteserien") > 0.25,
    "Bayern at home to a Norwegian side should carry a real edge");
  assert.ok(tierEdge("Norway Eliteserien", "Germany Bundesliga 1") < -0.25,
    "and the same tie the other way round must flip sign");
  assert.ok(tierEdge("Portugal Primeira Liga", "England Premier League") < 0,
    "Porto at home to Man City should not be the favourite on the ladder");
});

test("the cross-country edge is bounded, however lopsided the coefficients", () => {
  /* Log scaling runs away in the tail - Wales would come out near four English
     divisions - so the cap exists. Nothing may exceed the widest step the
     domestic ladder carries. */
  const WIDEST_DOMESTIC = TIER_HANDICAP["England Conference National"];
  for (const a of Object.keys(UEFA_COEFFICIENT)) {
    const h = countryHandicap(a);
    /* Null is a real answer here since Sep 2026, and only for one reason: the
       fit pushed this country ONTO the cap, so what we hold is a bound rather
       than a placement and the board refuses the tie. Anything else returning
       null is a bug - see test/cappedrefusal.test.js. */
    if (h === null) {
      assert.ok(PINNED.includes(a),
        a + " has no handicap and is not pinned at the cap - it should be priced");
      continue;
    }
    assert.ok(h >= 0 && h <= COUNTRY_CAP,
      a + " has a handicap of " + h + ", outside [0, " + COUNTRY_CAP + "]");
    assert.ok(h < WIDEST_DOMESTIC,
      a + " is handicapped " + h + ", wider than Premier League to Conference");
  }
  assert.equal(countryHandicap("England"), 0, "England anchors the table at zero");
  assert.equal(countryHandicap("Brazil"), null, "non-UEFA countries have no handicap");
  assert.equal(countryHandicap(""), null);
});

/* ORDER IS A PROPERTY OF THE IMPORTED NUMBER, NOT OF THE FITTED ONE.
 *
 * Until Sep 2026 every handicap was 0.5 x (ln England - ln country), so the
 * table was monotone in the coefficient by construction and this test said so.
 * The fitted offsets (data/country-offsets.json) are measured from real
 * cross-border results, and measurement is allowed to disagree with the
 * five-season coefficient - France ahead of Germany, Sweden ahead of Scotland.
 * Suppressing that would be discarding the evidence the fit exists to use.
 *
 * So monotonicity is asserted where the arithmetic still runs on its own: the
 * countries the artefact does not cover. A fitted country only has to stay
 * inside the range every handicap must obey. */
test("a stronger coefficient never yields a bigger handicap, where the coefficient is all we have", () => {
  const fitted = new Set(Object.keys(EUROFF_COUNTRIES));
  const byCoef = Object.keys(UEFA_COEFFICIENT)
    .filter((c) => !fitted.has(c))
    .sort((a, b) => UEFA_COEFFICIENT[b] - UEFA_COEFFICIENT[a]);
  for (let i = 1; i < byCoef.length; i++) {
    const hi = countryHandicap(byCoef[i - 1]), lo = countryHandicap(byCoef[i]);
    assert.ok(lo >= hi,
      byCoef[i] + " (" + UEFA_COEFFICIENT[byCoef[i]] + ") is handicapped " + lo +
      " but " + byCoef[i - 1] + " (" + UEFA_COEFFICIENT[byCoef[i - 1]] + ") only " + hi);
  }
});

test("a fitted country is still bound by the range every handicap obeys", () => {
  for (const c of Object.keys(EUROFF_COUNTRIES)) {
    if (UEFA_COEFFICIENT[c] === undefined) continue;
    if (PINNED.includes(c)) continue;          /* refused outright, not priced */
    const h = countryHandicap(c);
    assert.ok(h !== null && h >= 0 && h <= COUNTRY_CAP,
      c + " is fitted to " + h + ", outside [0, " + COUNTRY_CAP + "]");
  }
  assert.equal(countryHandicap("England"), 0,
    "England anchors the table at zero, fitted or not");
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
