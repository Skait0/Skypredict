"use strict";
/**
 * A warming league lives in four tables, and forgetting one fails silently.
 *
 *   HARVEST_EXTRA   lib/liveresults.js    may be harvested, and may mint clubs
 *   LEAGUE_ALIAS    lib/liveresults.js    SoccerVista's label for it
 *   LEAGUE_TIER     lib/build.js          which rung of its country it sits on
 *   TIER_HANDICAP   lib/build.js          how far below the top flight (tier 2+)
 *   LEAGUES         scripts/apifbackfill  API-Football's ids for its history
 *
 * Each omission costs something different and none of them throws. A league
 * missing from HARVEST_EXTRA has every backfilled row dropped as "league". One
 * missing its tier cannot be compared with the rest of its country, so every
 * cup tie it plays is dropped as "tiers not comparable". A SoccerVista label
 * with no alias is dropped from the harvest, and the league quietly stops
 * getting current-season form while its history ages.
 *
 * Written when the second wave went in (23 Sep 2026: the 3. Liga, Serie C,
 * the Primera Federacion and fourteen more), which touched all five at once.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const B = require("../lib/build.js");
const L = require("../lib/liveresults.js");

const apif = (() => {
  const all = fs.readFileSync(path.join(__dirname, "..", "scripts", "apifbackfill.js"), "utf8");
  /* LEAGUES only: OVERLAY_LEAGUES are rated leagues whose statistics are
     overlaid, not harvested, and are not meant to be in HARVEST_EXTRA. */
  const at = all.indexOf("const LEAGUES = {");
  const src = all.slice(at, all.indexOf("};", at));
  const out = {};
  for (const m of src.matchAll(/^\s*(\d+):\s*"([^"]+)",\r?$/gm)) out[m[1]] = m[2];
  return out;
})();

test("every backfilled league is one the harvest will accept", () => {
  const harvest = new Set(L.HARVEST_EXTRA);
  for (const [id, league] of Object.entries(apif)) {
    assert.ok(harvest.has(league),
      `API-Football ${id} fills "${league}", which is not in HARVEST_EXTRA - every row would drop`);
  }
});

test("every warming league has a rung in its country", () => {
  for (const league of L.HARVEST_EXTRA) {
    assert.ok(B.LEAGUE_TIER[league] >= 1,
      `"${league}" has no LEAGUE_TIER - its cup ties would drop as "tiers not comparable"`);
    assert.notEqual(B.rungOf(league), null,
      `"${league}" has a tier but no rung - a tier 2+ league needs a TIER_HANDICAP`);
  }
});

test("a lower tier sits below its own top flight, never above it", () => {
  for (const league of L.HARVEST_EXTRA) {
    const tier = B.LEAGUE_TIER[league];
    if (!(tier >= 2)) continue;
    const r = B.rungOf(league);
    assert.ok(r > 0 && r < 1, `"${league}" rung ${r} is outside the ladder's range`);
  }
});

test("every SoccerVista alias lands on a league we collect", () => {
  const harvest = new Set(L.HARVEST_EXTRA);
  const rated = new Set([].concat(
    Object.values(B.MAIN), Object.keys(B.EXTRA).map((c) => c + " " + B.EXTRA[c])));
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "liveresults.js"), "utf8");
  const body = src.slice(src.indexOf("const LEAGUE_ALIAS"), src.indexOf("};", src.indexOf("const LEAGUE_ALIAS")));
  for (const m of body.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
    assert.ok(harvest.has(m[2]) || rated.has(m[2]),
      `"${m[1]}" aliases to "${m[2]}", which nothing collects or rates`);
  }
});

test("simulated and virtual matches are refused by rule, not by accident", () => {
  /* Eight of these were on the card of 23 Sep 2026, named after real
     national teams. */
  for (const comp of [
    "Simulated Reality League UEFA Nations League SRL",
    "Esoccer Battle", "eFootball GT League", "Virtual Premier League",
  ]) {
    assert.equal(B.isUnratedCompetition(comp, null), true, `"${comp}" could be priced`);
  }
  /* And the guard must not reach a real competition. */
  for (const real of ["Germany 3. Liga", "Italy Serie C, Group A", "USA USL Championship"]) {
    assert.equal(B.isUnratedCompetition(real, null), false, `"${real}" is refused`);
  }
});
