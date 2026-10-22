"use strict";
/* Merlin's Pick on the server (lib/merlin.js), the daily ladder's picker since 22 Oct 2026. */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/merlin.js");

const now = Date.parse("2026-10-22T10:30:00+01:00");
const games = Array.from({ length: 30 }, (_, i) => ({ date: "2026-10-22", home: "H" + i, away: "A" + i,
  kickoff: "2026-10-22T17:00:00Z", home_p: 0.7, away_p: 0.1, dc1x: 0.9, o15: 0.8, o35: 0.3, h_o05: 0.88, a_o05: 0.6 }));
const pay = { fixtures: games };
const feed = games.map((f, i) => ({ id: i, home: f.home, away: f.away, ko: Date.parse(f.kickoff),
  odds: { "1": 1.35, "2": 6.5, "1X": 1.15, "OVER_1.5": 1.25, "UNDER_3.5": 1.2, "HOME_OVER_0.5": 1.16, "AWAY_OVER_0.5": 1.5 } }));

test("reaches the payout inside the leg budget, the likeliest way, on the rules", () => {
  const p = M.pick(pay, now, feed, 30, 20);
  assert.ok(p && p.odds >= 30, "x30 reached");
  assert.ok(p.legs.length <= 20);
  assert.ok(p.legs.every((l) => !/UNDER/.test(l.prediction)), "no Unders (owner, 21 Oct 2026)");
  assert.ok(p.legs.every((l) => l.prediction !== "2"), "never the underdog to win");
  assert.ok(p.legs.every((l) => l.p >= M.MIN_P && l.odds >= M.MIN_ODD));
  const fam = {};
  p.legs.forEach((l) => { fam[M.family(l.prediction)] = (fam[M.family(l.prediction)] || 0) + 1; });
  assert.ok(Object.values(fam).every((n) => n <= Math.max(2, Math.ceil(0.4 * p.legs.length))), "40% family cap");
  assert.strictEqual(new Set(p.legs.map((l) => l.home)).size, p.legs.length, "one leg per game");
});

test("skipped games stay out, games without a SportyBet price stay out, and short is null", () => {
  const skip = new Set(games.slice(0, 25).map((f) => f.home + "|" + f.away));
  const p = M.pick(pay, now, feed, 5, 8, skip);
  assert.ok(p.legs.every((l) => !skip.has(l.home + "|" + l.away)));
  assert.strictEqual(M.pick(pay, now, feed.slice(0, 2), 30, 20), null, "two priced games cannot make x30");
  assert.strictEqual(M.pick(pay, now, feed, 1000, 4), null, "x1000 in four legs cannot be done");
});

test("volatile leagues stay out, as on the site for a reader who never said yes", () => {
  const lg = (f, i) => Object.assign({}, f, { league: i < 10 ? "Nigeria Premier League" : i < 20 ? "Lower League" : "Top League", tier: i < 20 && i >= 10 ? 4 : 1 });
  const p = M.pick({ fixtures: games.map(lg) }, now, feed, 5, 8);
  const ids = new Set(p.legs.map((l) => Number(l.home.slice(1))));
  assert.ok([...ids].every((i) => i >= 20), "the NPFL (listed) and an all tier-4 league are left out");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  const site = /var VOL_NEW=\{([\s\S]*?)\};/.exec(src)[1].match(/"[^"]+"/g).map((s) => JSON.parse(s)).sort();
  assert.deepStrictEqual([...M.VOL_NEW].sort(), site, "same list as the site's VOL_NEW");
});
