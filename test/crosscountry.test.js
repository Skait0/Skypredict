"use strict";
/* WHAT WE ARE WILLING TO SAY ABOUT A EUROPEAN TIE.
 *
 * The board refused every cross-border fixture until 6 Sep 2026 - 28 in one
 * round, including Real Madrid v Inter and Napoli v Arsenal. Refusing was
 * correct: our ratings carry a per-league intercept, and with no match and no
 * club spanning two countries in 66,965 training rows, the offset between
 * Spain's scale and Italy's is not unknown so much as unidentifiable. It had
 * to be anchored from outside, and it is - on the UEFA association
 * coefficient, converted in build.js.
 *
 * An imported number is a weaker thing than a fitted one, so the deal is:
 * these ties get a GOALS market or they get nothing at all.
 *
 * The reasoning is the same one the domestic cup ties already use, only
 * stronger. What is assumed here is the gap between two whole countries,
 * applied to every club in them at once. It cannot know that Celtic are better
 * than Scotland's coefficient, or Bodoe/Glimt better than Norway's. That
 * assumption moves WHO WINS enormously and moves HOW MANY GOALS much less - a
 * mismatch produces chances whichever way the tie turns. So the goals call is
 * the part of the picture least disturbed by the one number we imported, and
 * a winner is the part most disturbed by it.
 *
 * If these ever start carrying a match-result tip again, this file is the
 * argument for why they should not.
 */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");
const { tierEdge, CROSS_TIER_SHRINK, CROSS_COUNTRY_SHRINK } = require("../lib/build.js");

/* A fixture with a clear favourite AND plenty of goals about it - exactly the
   shape where an unrestricted bestTip would reach for the winner. */
const LOPSIDED = { home: 0.62, draw: 0.22, away: 0.16, o15: 0.84, dc1x: 0.84, dcx2: 0.38 };
/* The same tie with the goals dried up. */
const CAGEY   = { home: 0.62, draw: 0.22, away: 0.16, o15: 0.55, dc1x: 0.84, dcx2: 0.38 };

test("a cross-border tie is never given a match result", () => {
  const t = M.bestTip(LOPSIDED, { crossTier: true, crossCountry: true });
  assert.ok(t, "a goal-heavy tie should still get a tip");
  assert.equal(t.label, "Over 1.5",
    "cross-border ties carry goals markets only; got " + t.label);
});

test("without the goals to back it, we say nothing at all", () => {
  assert.equal(M.bestTip(CAGEY, { crossTier: true, crossCountry: true }), null,
    "a cagey European tie must be dropped, not downgraded to a winner");
});

test("the same fixture domestically still gets the full choice of markets", () => {
  /* Proof the restriction is scoped to the border and has not quietly
     narrowed the rest of the board. */
  const dom = M.bestTip(LOPSIDED);
  assert.ok(dom && dom.label, "an ordinary fixture must still get a tip");
  const cagey = M.bestTip(CAGEY);
  assert.ok(cagey && cagey.label !== "Over 1.5",
    "a domestic cagey fixture should fall to a result market, not be dropped");
  assert.notEqual(M.bestTip(CAGEY, { crossTier: true }), null,
    "a DOMESTIC cup tie is not subject to the cross-border rule");
});

test("confidence is pulled harder across a border than across a division", () => {
  assert.ok(CROSS_COUNTRY_SHRINK < CROSS_TIER_SHRINK,
    "a coefficient bridging two league systems is a weaker basis than a ladder " +
    "inside one, and the shrink should say so");
  assert.ok(CROSS_COUNTRY_SHRINK > 0 && CROSS_COUNTRY_SHRINK < 1);
});

test("the ties this was built for are actually priced now", () => {
  const REAL = [
    ["Spain La Liga 1", "Italy Serie A"],            /* Real Madrid v Inter */
    ["Italy Serie A", "England Premier League"],     /* Napoli v Arsenal */
    ["Germany Bundesliga 1", "Norway Eliteserien"],  /* Bayern v Bodoe/Glimt */
    ["Portugal Primeira Liga", "England Premier League"],
    ["Greece Super League", "Austria Bundesliga"],
    ["Turkey Super Lig", "Italy Serie A"],
    ["Netherlands Eredivisie", "Spain La Liga 1"],
    ["Belgium Pro League", "England Premier League"],
    ["Scotland Premiership", "France Ligue 1"],
    ["Denmark Superliga", "Germany Bundesliga 1"],
  ];
  for (const [h, a] of REAL) {
    assert.notEqual(tierEdge(h, a), null, h + " v " + a + " is still refused");
  }
});

test("South American ties are still refused, and deliberately", () => {
  /* The feed carries Libertadores and Sudamericana and our ratings cover both
     countries, so this is a decision rather than an oversight: CONMEBOL
     publishes no coefficient comparable to UEFA's, and bridging the two
     confederations would be exactly the invented number the anchor exists to
     avoid. */
  assert.equal(tierEdge("Brazil Serie A", "Argentina Liga Profesional"), null);
  assert.equal(tierEdge("Argentina Liga Profesional", "Brazil Serie A"), null);
  assert.equal(tierEdge("England Premier League", "Brazil Serie A"), null);
});
