"use strict";

/* Pick for me in the Telegram bot (lib/pickforme.js, 20 Oct 2026): the site's rule on the
   server's pieces. SportyBet's price for every leg, the board's number for every chance. */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

/* The live feed is stubbed: each game carries its own SportyBet prices. */
const convertPath = require.resolve(path.join(__dirname, "..", "lib", "convert.js"));
require(convertPath);
const C = require.cache[convertPath].exports;
const realPair = C.pair;
C.pair = (feed, leg) => feed.find((e) => e.home === leg.home && e.away === leg.away) || null;
const PFM = require("../lib/pickforme.js");
test.after(() => { C.pair = realPair; });

const now = Date.parse("2026-10-20T10:00:00Z");
const fixture = (i, o) => Object.assign({ home: "H" + i, away: "A" + i, date: "2026-10-20", kickoff: "2026-10-20T18:00:00Z",
  home_p: 0.6, away_p: 0.2, dc1x: 0.86, dcx2: 0.4, o15: 0.78 - i * 0.001, h_o05: 0.84 }, o);
const event = (i, odds) => ({ home: "H" + i, away: "A" + i, odds: Object.assign({ "1X": 1.2, "X2": 2.4, "OVER_1.5": 1.3, "HOME_OVER_0.5": 1.18, "1": 1.6 }, odds) });

test("the surest market each game, to the payout, on SportyBet's prices", () => {
  const pay = { fixtures: Array.from({ length: 30 }, (_, i) => fixture(i)) };
  const feed = Array.from({ length: 30 }, (_, i) => event(i));
  const r = PFM.pick(pay, now, feed, 5, "today", "u1");
  assert.ok(!r.short && r.odds >= 5);
  assert.ok(r.legs.every((l) => l.odds >= 1.15 && l.prediction && l.home), "a leg in convert's shape");
  assert.ok(r.legs.length <= 40);
});

test("no SportyBet price, no leg; a started game, no leg; tomorrow stays out of today", () => {
  const pay = { fixtures: [fixture(1), fixture(2, { kickoff: "2026-10-20T09:00:00Z" }), fixture(3, { date: "2026-10-21", kickoff: "2026-10-21T18:00:00Z" })] };
  const feed = [event(2), event(3)];
  assert.strictEqual(PFM.pick(pay, now, feed, 2, "today", "u").legs.length, 0);
  assert.ok(PFM.pick(pay, now, feed, 1.1, "all", "u").legs.every((l) => l.home === "H3"));
});

test("x1000 inside 40 legs asks every leg for payout^(1/40); readers get different slips", () => {
  const pay = { fixtures: Array.from({ length: 80 }, (_, i) => fixture(i)) };
  const feed = Array.from({ length: 80 }, (_, i) => event(i, { "1X": i % 2 ? 1.16 : 1.22 }));
  const r = PFM.pick(pay, now, feed, 1000, "today", "u");
  assert.ok(r.legs.length <= 40 && r.legs.every((l) => l.odds >= Math.pow(1000, 1 / 40)));
  const flat = { fixtures: Array.from({ length: 40 }, (_, i) => fixture(i, { o15: 0.78 })) };
  const ids = (s) => PFM.pick(flat, now, feed, 5, "today", s).legs.map((l) => l.home).join();
  assert.notStrictEqual(ids("ada"), ids("bola"));
  assert.strictEqual(ids("ada"), ids("ada"));
});

test("the bot's payouts and pass line match the site", () => {
  const fs = require("fs");
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(src, /PFM_PAYS=\[2,5,10,20,50,100,150,200\], PFM_FREE=10;/);
  assert.deepStrictEqual(PFM.PAYS, [2, 5, 10, 20, 50, 100, 150, 200]);
  assert.strictEqual(PFM.FREE_UP_TO, 10);
  const tg = fs.readFileSync(path.join(__dirname, "..", "api", "tg.js"), "utf8");
  assert.match(tg, /if \(target > PFM\.FREE_UP_TO && !\["plus", "ff", "admin"\]\.includes\(q\.plan\)\)/);
  assert.doesNotMatch(require("../lib/pickforme.js").MARKETS.join(), /AH_|CORNER|SHOT|GG2/);
});

/* Owner, 21 Oct 2026: no Unders of any kind in Pick for me, on the site or the bot. */
test("the bot's Pick for me never offers an Under", () => {
  const { MARKETS } = require("../lib/pickforme.js");
  assert.deepStrictEqual(MARKETS.filter((c) => /UNDER/.test(c)), [], "an Under is back in MARKETS");
});
