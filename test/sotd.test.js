"use strict";

/**
 * The slip of the day is one slip, for every reader, decided once.
 *
 * Until 8 Oct 2026 each browser composed its own and kept it in localStorage,
 * priced on whatever SportyBet odds it had loaded, so two readers could hold
 * different "slips of the day" - and like the pick, it had no slip dated the
 * new day between Lagos midnight and the morning build. The build now chooses
 * it (chooseSotds in lib/build.js), on our own price estimate because the
 * build holds no SportyBet odds, and records tomorrow's the evening before.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const build = require("../lib/build.js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

/* A fixture whose safest allowed market is Over 1.5 at `p`. */
function fx(home, date, kickoff, p, extra) {
  return Object.assign({ home, away: home + " B", date, kickoff, league: "Eliteserien", tier: 1,
    o15: p, dc1x: 0.5, dcx2: 0.5, home_p: 0.3, away_p: 0.3 }, extra || {});
}
const day7 = (h, p, hour) => fx(h, "2026-10-07", `2026-10-07T${hour || "18"}:00:00.000Z`, p);
const day8 = (h, p, hour) => fx(h, "2026-10-08", `2026-10-08T${hour || "15"}:00:00.000Z`, p);
const AFTERNOON = Date.parse("2026-10-07T12:00:00Z");
const EVENING = Date.parse("2026-10-07T22:44:00Z");
const MORNING = Date.parse("2026-10-08T06:30:00Z");
const names = (s) => s.legs.map((l) => l.id);

test("the build fills toward double the stake, safest first, from one day", () => {
  const s = build.chooseSotd([day7("A", 0.92), day7("B", 0.90), day7("C", 0.88), day7("D", 0.75),
                              day8("E", 0.99)], [], AFTERNOON);
  assert.strictEqual(s.date, "2026-10-07", "today while today can fill a slip");
  assert.deepStrictEqual(names(s).slice(0, 2), ["m20261007AAB", "m20261007BBB"], "safest first");
  assert.ok(!names(s).includes("m20261008EEB"), "never mixes days");
  const odds = s.legs.reduce((t, l) => t * Math.pow(1 / l.p, 0.85), 1);
  assert.ok(odds > 1.3 && odds <= 2.4, "near two, never past the hard limit (" + odds.toFixed(2) + ")");
});

test("cup ties across divisions and national teams stay out", () => {
  const s = build.chooseSotd([day7("A", 0.95, "18"), Object.assign(day7("X", 0.99), { cross_tier: true }),
                              Object.assign(day7("Y", 0.99), { intl: true }), day7("B", 0.90)], [], AFTERNOON);
  assert.deepStrictEqual(names(s).sort(), ["m20261007AAB", "m20261007BBB"]);
});

function evening() {
  const board = [day7("A", 0.92, "23"), day7("B", 0.90, "23"), day8("E", 0.93), day8("F", 0.91), day8("G", 0.80)];
  const first = build.chooseSotds(board, null, null, AFTERNOON);
  return { board, night: build.chooseSotds(board, first.sotd, first.sotdNext, EVENING) };
}

test("the evening build records tomorrow's slip", () => {
  const { night } = evening();
  assert.strictEqual(night.sotd.date, "2026-10-07", "today's slip still stands at 22:44Z");
  assert.strictEqual(night.sotdNext.date, "2026-10-08");
  assert.deepStrictEqual(names(night.sotdNext).slice(0, 2), ["m20261008EEB", "m20261008FFB"]);
});

test("the morning build keeps it, even when the refit reorders the card", () => {
  const { night } = evening();
  const refit = [day8("E", 0.80), day8("F", 0.81), day8("G", 0.97), day8("H", 0.96)];
  const morning = build.chooseSotds(refit, night.sotd, night.sotdNext, MORNING);
  assert.deepStrictEqual(morning.sotd, night.sotdNext, "the slip readers saw after midnight is the day's slip");
});

test("evening rebakes do not re-roll a slip already published", () => {
  const board = [day7("A", 0.92), day7("B", 0.90), day7("C", 0.85)];
  const first = build.chooseSotds(board, null, null, AFTERNOON);
  const again = build.chooseSotds([day7("A", 0.80), day7("B", 0.81), day7("C", 0.97)],
    first.sotd, first.sotdNext, Date.parse("2026-10-07T15:00:00Z"));
  assert.deepStrictEqual(again.sotd, first.sotd);
});

test("a slip whose games have left the board is replaced", () => {
  const { night } = evening();
  const morning = build.chooseSotds([day8("G", 0.80), day8("H", 0.90)], night.sotd, night.sotdNext, MORNING);
  assert.deepStrictEqual(names(morning.sotd).sort(), ["m20261008GGB", "m20261008HHB"]);
});

test("the build's rule is the page's rule", () => {
  /* Two copies, because index.html is standalone. Drift fails here. */
  assert.match(src, /const SOTD_TARGET_ODDS=2\.0;/);
  assert.match(src, /const SOTD_HARD_MAX=2\.4;/);
  assert.match(src, /const SOTD_MAX_LEGS=8;/);
  assert.match(src, /var allowed=\["1X","X2","OVER_1\.5","1","2"\]/);
  assert.match(src, /v<0\.70\)return;/);
  assert.match(src, /function oddOf\(p\)\{var q=Math\.max\(0\.06,Math\.min\(0\.97,p\)\);return Math\.pow\(1\/q,0\.85\);\}/);
  assert.match(src, /return !f\.cross_tier && !f\.intl;/);
});

test("the page shows the build's slip before its own lock or choice", () => {
  assert.match(src, /var _baked=\[DATA\.sotd,DATA\.sotdNext\]/);
  assert.match(src, /var lock=_sdDate\?\(_baked\|\|loadSotdLock\(_sdDate\)\):null;/);
});
