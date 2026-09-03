"use strict";

/**
 * The wizard may not reach for a bet the slip did not ask for.
 *
 * Reported: "no matter how many times i shuffle, Estoril to score keeps coming
 * up. and this supposed to be in a relatively 'more games lesser odds' slip
 * style... the slider would never pick vallecano over 0.5 and Estoril over 0.5.
 * so tell me why the slider feels safer than the wizard."
 *
 * It was right, and the cause was one missing half of a rule.
 *
 * The slider filters every candidate through minConf - 75% down to 60% as risk
 * rises - so a 64% leg is unreachable for it at ordinary settings. The wizard
 * has no confidence floor at all; it ranks fixtures by edge and then, per
 * fixture, took "the highest-probability market whose odds clear the per-leg
 * need". That said long ENOUGH and never said not longer than asked.
 *
 * On Benfica v Estoril the real prices were 1X 1.03, Over 1.5 1.09, Benfica
 * 1.14 - and Estoril to score 1.91. Needing 1.25 a leg, every safe market was
 * too cheap to qualify and the only survivor was the underdog side. The wizard
 * was not choosing risk; safety had been filtered out beneath it. That is a
 * systematic bias, because cheap safe markets are exactly what a lopsided match
 * has.
 *
 * So the floor became a band. Below it is fine - a short leg just carries less
 * toward the payout. Far above it is the fixture offering something else
 * entirely, and that is declined.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* bestOf closes over `g` - the per-game odds needed to reach the payout - and
   over `edge`, so both are taken from the file rather than transcribed. A
   re-implemented edge here would let the two drift apart and this whole file
   would go on passing against a formula the site no longer uses. */
function chunkOf(startsWith, name) {
  const i = src.indexOf(startsWith);
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", src.indexOf("function ", i));
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* The record the page would be holding. bestOf now asks which markets have a
   published history before it reaches for one, so the harness has to supply a
   real one - an empty record would make every market unproven, the new branch
   would never run, and these tests would pass while measuring nothing.
   These are the live figures as of 31 Aug 2026: team-to-score is absent, which
   is the whole point. */
const RECORD = { byMarket: [
  { market: "Double chance", total: 249, correct: 173 },
  { market: "Over 1.5", total: 79, correct: 67 },
  { market: "Match result", total: 10, correct: 6 },
]};

function bestOfWith(g, record) {
  /* bestOf also filters its pool through overpriced() now - the value cap -
     so the harness has to carry it, and the constant it reads. Without them
     every test in this file throws rather than failing, which reads like the
     extraction broke rather than like a missing dependency. The fixtures here
     carry no sportyOdds, so the cap sees no book price and refuses nothing:
     these tests measure the band and the edge ranking exactly as before. */
  const cap = /var VALUE_CAP=[\d.]+;/.exec(src);
  assert.ok(cap, "VALUE_CAP is gone from index.html");
  const deps = [cap[0]].concat(
    ["    function overpriced(c){", "    function edge(c){", "function codeMarket(c){",
     "function provenMarkets(){", "function isProven(c,prov){"]
      .map((h) => chunkOf(h, h))).join("\n");
  const best = chunkOf("    var OVERSHOOT=", "bestOf");
  return new Function("g", "DATA", "MIN_GRADED",
    deps + "\n" + best + "\nreturn bestOf;")(g, { record: record || RECORD }, 10);
}

test("the helper is running the file's own edge formula", () => {
  /* Guards the extraction above: if the slice ever misses, every test here
     would silently be exercising something else. */
  const edgeFn = chunkOf("    function edge(c){", "edge");
  assert.match(edgeFn, /Math\.log\(pr\)\/Math\.log\(od\)/,
    "edge is not the log-ratio the wizard ranks on");
});

const OVERSHOOT = (() => {
  const m = /var OVERSHOOT=([\d.]+);/.exec(src);
  assert.ok(m, "OVERSHOOT not found");
  return parseFloat(m[1]);
})();

/* The real board that produced the report. */
const BENFICA_ESTORIL = [
  { k: "1X", code: "1X", od: 1.03, p: 0.8171 },
  { k: "OVER_1.5", code: "OVER_1.5", od: 1.09, p: 0.8106 },
  { k: "1", code: "1", od: 1.14, p: 0.5963 },
  { k: "AWAY_OVER_0.5", code: "AWAY_OVER_0.5", od: 1.91, p: 0.6477 },
  { k: "X2", code: "X2", od: 4.9, p: 0.4037 },
  { k: "2", code: "2", od: 18.07, p: 0.1829 },
];

test("the reported leg is no longer chosen", () => {
  /* g=1.25 is the "More games" style on a modest payout - the setting the
     report was made against, labelled "More games / lesser odds" at the time
     and "More games / smaller odds each" since. */
  const pick = bestOfWith(1.25)(BENFICA_ESTORIL);
  assert.ok(pick, "the fixture was dropped entirely; it still has usable short markets");
  assert.notStrictEqual(pick.k, "AWAY_OVER_0.5",
    "Estoril to score at 1.91 is still being taken against a 1.25 need");
  assert.ok(pick.od < 1.25 * OVERSHOOT,
    "the pick at " + pick.od + " is still above the ceiling of " +
    (1.25 * OVERSHOOT).toFixed(2));
});

test("and the fixture still contributes what it safely can", () => {
  /* Dropping the whole match would be an over-correction: its short markets are
     perfectly good, they just carry less.
     Which one matters. Reported: "benfica still has usable markets in my
     opinion." The first version of this took the LONGEST short market, which is
     Benfica at 1.14 and 60% - the least confident of the three - for four pence
     of payout over Over 1.5 at 81%. Ranking by edge takes the right one. */
  const pick = bestOfWith(1.25)(BENFICA_ESTORIL);
  assert.strictEqual(pick.k, "OVER_1.5",
    "expected the best-edge short market, got " + pick.k);
  assert.ok(pick.p > 0.8, "the chosen fallback should be a confident leg, not a cheap one");
});

test("the short fallback is not just the longest price", () => {
  /* The distinguishing case: a longer market that is markedly less likely than
     a slightly shorter one. Longest-wins takes "long"; edge takes "solid". */
  const pool = [
    { k: "solid", code: "1X", od: 1.20, p: 0.86 },
    { k: "long", code: "X2", od: 1.30, p: 0.62 },
  ];
  const pick = bestOfWith(2.0)(pool);
  assert.strictEqual(pick.k, "solid",
    "a 62% leg was taken over an 86% one for 10 pence of payout");
});

test("when the payout really does need a long leg, it is allowed", () => {
  /* The ceiling scales with the need. Asking for a big payout means long legs
     are what the slip is for, and 1.91 stops being an overshoot. */
  const pick = bestOfWith(1.6)(BENFICA_ESTORIL);
  assert.strictEqual(pick.k, "AWAY_OVER_0.5",
    "at a 1.6 per-leg need this is in band and is the safest thing in it");
});

/**
 * A market we have never graded does not get to lead.
 *
 * Reported: "you shouldnt pick a less favoured game because you want to hit the
 * target, thats not how our gambling works... its about the likelyhood of the
 * games coming."
 *
 * The instinct was right and the diagnosis was sharper than a confidence floor.
 * Ipswich to score was 74% and Levante to score 73% - more likely than most
 * double chances we publish - so no sane floor would have caught them. What was
 * actually wrong is that team-to-score had 0 graded results out of 216. It was
 * switched on by default on 31 Aug, became the model's strongest call on 27 of
 * 34 fixtures, and the wizard led with it on every lopsided game. We did not
 * know the likelihood, because we had never checked it.
 */
test("an untested market loses to a proven one that also fits", () => {
  const pool = [
    { k: "proven", code: "1X", od: 1.30, p: 0.70 },
    { k: "untested", code: "AWAY_OVER_0.5", od: 1.35, p: 0.74 },
  ];
  const pick = bestOfWith(1.4)(pool);
  assert.strictEqual(pick.k, "proven",
    "took the untested market even though a graded one fitted the same band");
  /* Note it wins DESPITE being less likely. That is the point: a published
     record beats four points of a number we have never verified. */
});

test("but it is used when nothing proven fits", () => {
  /* A ban would be an over-correction. The market is on the board because the
     user put it there; it just does not get to go first. */
  const pool = [
    { k: "tooShort", code: "1X", od: 1.02, p: 0.95 },
    { k: "untested", code: "AWAY_OVER_0.5", od: 1.38, p: 0.74 },
  ];
  assert.strictEqual(bestOfWith(1.4)(pool).k, "untested",
    "the fixture was passed over even though this was its only usable market");
});

test("and it earns its place as soon as it has a record", () => {
  /* The whole design: the restriction reads the published record, so it lifts
     itself once results accumulate. Nobody has to remember to remove it.
     Same pool as the first test, with team-to-score now graded. */
  const graded = { byMarket: RECORD.byMarket.concat(
    [{ market: "Team over 0.5", total: 120, correct: 92 }]) };
  const pool = [
    { k: "proven", code: "1X", od: 1.30, p: 0.70 },
    { k: "untested", code: "AWAY_OVER_0.5", od: 1.35, p: 0.74 },
  ];
  assert.strictEqual(bestOfWith(1.4, graded)(pool).k, "untested",
    "a market with 120 graded results is still being held back");
});

test("a thin record does not count as a record", () => {
  /* Two results is not evidence. MIN_GRADED is the bar. */
  const thin = { byMarket: RECORD.byMarket.concat(
    [{ market: "Team over 0.5", total: 2, correct: 2 }]) };
  const pool = [
    { k: "proven", code: "1X", od: 1.30, p: 0.70 },
    { k: "untested", code: "AWAY_OVER_0.5", od: 1.35, p: 0.74 },
  ];
  assert.strictEqual(bestOfWith(1.4, thin)(pool).k, "proven",
    "two graded results was treated as a track record");
});

test("the short fallback prefers a proven market too", () => {
  /* Both branches of bestOf can pick, so both have to honour it. */
  const pool = [
    { k: "proven", code: "OVER_1.5", od: 1.20, p: 0.80 },
    { k: "untested", code: "HOME_OVER_0.5", od: 1.25, p: 0.86 },
  ];
  assert.strictEqual(bestOfWith(2.0)(pool).k, "proven",
    "the too-short branch reached for an untested market");
});

test("phase 3 will not stretch a leg into an untested market", () => {
  /* The loop that lengthens legs to reach a payout is exactly where "hit the
     number at any cost" used to live. */
  const i = src.indexOf("if(hasReal(leg)&&!hasReal(alt)) continue;");
  const fn = src.slice(i, i + 900);
  assert.match(fn, /if\(isProven\(leg\.code,PROVEN\)&&!isProven\(alt\.code,PROVEN\)\) continue;/,
    "phase 3 can still buy its payout with a market we have never graded");
});

test("the code-to-market map matches the one the record is grouped by", () => {
  /* codeMarket in index.html and marketOf in lib/grade.js must name families
     identically, or a market can never be found in the record and stays
     permanently untested. */
  const G = require("../lib/grade.js");
  const cm = new Function(chunkOf("function codeMarket(c){", "codeMarket") +
                          "\nreturn codeMarket;")();
  [["1X, home or draw", "1X"], ["X2, draw or away", "X2"], ["Home win", "1"],
   ["Over 1.5 goals", "OVER_1.5"], ["Over 2.5", "OVER_2.5"],
   ["Both teams score", "GG"], ["Levante over 0.5 goals", "AWAY_OVER_0.5"],
   ["Levante over 1.5 goals", "HOME_OVER_1.5"]].forEach(([label, code]) => {
    assert.strictEqual(cm(code), G.marketOf(label),
      "code " + code + " and label \"" + label + "\" disagree about the market family");
  });
});

test("inside the band, the safest market still wins", () => {
  /* The original behaviour, unchanged - this was never the broken half. */
  const pool = [
    { k: "a", code: "1X", od: 1.30, p: 0.71 },
    { k: "b", code: "X2", od: 1.45, p: 0.66 },
    { k: "c", code: "1", od: 1.60, p: 0.61 },
  ];
  assert.strictEqual(bestOfWith(1.4)(pool).k, "a");
});

test("a market far longer than asked for is declined outright", () => {
  /* Nothing short to fall back on, so there is no honest way to use this
     fixture in this slip. */
  const pool = [{ k: "long", code: "1", od: 6.0, p: 0.2 }, { k: "longer", code: "2", od: 12.0, p: 0.1 }];
  assert.strictEqual(bestOfWith(1.25)(pool), null,
    "a 6.0 leg was accepted against a 1.25 need");
});

test("an all-short fixture takes the best value, not the safest", () => {
  /* It cannot reach the need whatever we pick, so the question is which of the
     short markets is worth the chance of being wrong. A near-certainty priced
     at 1.02 is not: it adds a way to lose and two pence of payout. */
  const pool = [
    { k: "tiny", code: "1X", od: 1.02, p: 0.95 },
    { k: "small", code: "X2", od: 1.10, p: 0.88 },
  ];
  assert.strictEqual(bestOfWith(1.5)(pool).k, "small",
    "a 1.02 leg is not worth the chance of being wrong");
});

test("the ceiling sits inside the measured plateau", () => {
  /* On the board that produced the report, ceilings of 1.25 through 1.50 were
     indistinguishable - same 12 fixtures, same 75% average confidence - and
     1.75 let the offending legs back in. A value in the middle of that range is
     a decision; one at either end is a coincidence waiting to break. */
  assert.ok(OVERSHOOT >= 1.3 && OVERSHOOT <= 1.5,
    "OVERSHOOT is " + OVERSHOOT + ", outside the range that was measured as flat");
});

test("the band has both edges", () => {
  const i = src.indexOf("function bestOf(pool){");
  const fn = src.slice(i, i + 900);
  assert.match(fn, /c\.od>=lo&&c\.od<=hi/,
    "the band must be bounded at both ends; a floor alone is the original bug");
  assert.match(fn, /var lo=g\*0\.92, hi=g\*OVERSHOOT;/);
});

/* ------------------------------------------------------------- the caller */

test("a declined fixture is skipped, not crashed on", () => {
  /* bestOf can now return null where it never used to, and two callers read it.
     If either stopped checking, a null pick would throw inside the build and
     the wizard would silently produce nothing. */
  const i = src.indexOf("function pickFrom(cs){");
  const fn = src.slice(i, i + 900);
  assert.match(fn, /return guessable\.length\?bestOf\(guessable\):null;/,
    "pickFrom must be able to pass a null through");
  /* With no prices for a fixture we are guessing, so the guess is confined to
     markets SportyBet always lists. Sentry: "picks with no market at
     SportyBet", both failing legs AWAY_OVER_0.5, a market carried on only 76%
     of events. */
  assert.match(fn, /cs\.filter\(function\(c\)\{ return safeUnpriced\(c\.code\); \}\)/,
    "an unpriced fixture can still be guessed into a market SportyBet may not carry");
  assert.match(src, /var pick=pickFrom\(cs\);\r?\n\s*if\(!pick\) return;/,
    "the fixture loop no longer guards against a null pick");
});

test("the slider is untouched", () => {
  /* This was only ever the wizard's bug. The slider's own floor is what made it
     feel safer, and it must keep it. */
  assert.match(src, /minConf:Math\.min\(0\.75,\(0\.72\+floorBoost\)-span\*f\)/,
    "the slider's confidence floor has moved");
  const i = src.indexOf("function bestOf(pool){");
  assert.ok(src.indexOf("var OVERSHOOT=", 0) > src.indexOf("function riskParams("),
    "OVERSHOOT should live in the wizard's build, not beside the slider's params");
  assert.ok(i > 0);
});
