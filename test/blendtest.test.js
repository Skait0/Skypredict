"use strict";
/* The model test (owner, 18 Oct 2026): the same board games replayed as the model alone, the
   pre-30 Sep mix and today's 90% book, graded on the final score. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const BT = require("../lib/blendtest.js");
const { mainRow } = require("../scripts/pricelog.js");

/* The model likes the away side; the book makes the home side a clear favourite. */
const row = (over) => Object.assign({ kind: "main", at: "2026-10-19T09:00:00Z", kickoff: "2026-10-19T15:00:00Z", date: "2026-10-19",
  home: "Alpha", away: "Beta", m: { home: 0.30, draw: 0.28, away: 0.42, o15: 0.70 },
  odds: { "1": 1.45, X: 4.4, "2": 7.0, "OVER_1.5": 1.3, "UNDER_1.5": 3.4 } }, over || {});

test("the three mixes: the model alone, 30-75% over a 20-point gap, and a flat 90%", () => {
  const r = row();
  assert.deepStrictEqual(BT.kOf(r, "model").home, 0.30);
  const now = BT.kOf(r, "now"), old = BT.kOf(r, "old");
  const mk = (1 / 1.45) / (1 / 1.45 + 1 / 4.4 + 1 / 7.0);
  assert.ok(Math.abs(now.home - (0.30 * 0.1 + mk * 0.9)) < 0.01, "90% book on the home side");
  /* gap > 20 points: the old ramp tops out at 75% */
  assert.ok(Math.abs(old.home - (0.30 * 0.25 + mk * 0.75)) < 0.01);
  assert.ok(Math.abs(now.home + now.draw + now.away - 1) < 1e-9);
  assert.strictEqual(now.dc1x, now.home + now.draw);
});

test("each mix picks its own tip and is graded on the score; the record is counted by day", () => {
  const snaps = [row(), row({ at: "2026-10-19T06:00:00Z", m: { home: 0.9, draw: 0.05, away: 0.05, o15: 0.5 } }),
    row({ at: "2026-10-19T16:00:00Z", m: { home: 0.05, draw: 0.05, away: 0.9, o15: 0.5 } })];
  assert.strictEqual(BT.lastSnapshots(snaps).length, 1, "one game: the last snapshot BEFORE kick-off");
  assert.strictEqual(BT.lastSnapshots(snaps)[0].at, "2026-10-19T09:00:00Z");
  const out = BT.compare(snaps, [{ match_date: "2026-10-19", home: "Alpha", away: "Beta", hg: 2, ag: 0 }]);
  assert.strictEqual(out.games, 1);
  assert.strictEqual(out.modes.model.hit, 0, "the model backed the away side and lost");
  assert.strictEqual(out.modes.now.hit, 1, "the book's favourite won");
  assert.strictEqual(out.differ.now, 1);
  assert.strictEqual(BT.compare(snaps, []).games, 0, "an unplayed game is not graded");
  const rec = BT.recordByDay([{ match_date: "2026-09-19", hit: true }, { match_date: "2026-09-20", hit: true }, { match_date: "2026-09-20", hit: false }, { match_date: "2026-09-21", hit: null }], "2026-09-20");
  assert.deepStrictEqual(rec, [{ date: "2026-09-20", n: 2, hit: 1 }]);
});

test("the price log writes a main row per board game with the model's numbers and the prices", () => {
  const f = { date: "2026-10-19", kickoff: "2026-10-19T15:00:00Z", home: "Alpha", away: "Beta", league: "L", home_p: 0.3, draw_p: 0.28, away_p: 0.42, o15: 0.7 };
  const r = mainRow(f, { eventId: "sr:1", odds: { "1": "1.45", X: "4.4", "2": "7", "OVER_1.5": "1.3", GG: "1.8" } }, Date.parse("2026-10-19T09:00:00Z"));
  assert.strictEqual(r.kind, "main");
  assert.deepStrictEqual(r.m, { home: 0.3, draw: 0.28, away: 0.42, o15: 0.7 });
  assert.deepStrictEqual(r.odds, { "1": 1.45, X: 4.4, "2": 7, "OVER_1.5": 1.3 });
  assert.strictEqual(mainRow(f, { eventId: "sr:1", odds: { "1": "1.45" } }, 0), null, "no full 1X2, no row");
});

test("wired: an admin-only endpoint and a Model test tab", () => {
  const acc = fs.readFileSync(path.join(__dirname, "..", "api", "account.js"), "utf8");
  assert.match(acc, /const ADMIN_GET = \[[^\]]*"blendtest"/);
  assert.match(acc, /raw\.githubusercontent\.com\/Skait0\/Skypredict\/pricelog\//);
  const UI = require("../public/account-ui.js");
  assert.match(UI.adminHtml([]), /data-tab='swaTModel'[^>]*>Model test/);
  const h = UI.modelHtml({ test: { games: 0 }, record: [{ date: "2026-09-20", n: 10, hit: 8 }] });
  assert.match(h, /No graded games yet/); assert.match(h, /8 of 10 tips landed \(80%\)/);
});

test("main rows only for games kicking off within 4 hours", () => {
  const { rows } = require("../scripts/pricelog.js");
  const now = Date.parse("2026-10-19T09:00:00Z");
  const fx = (h, ko) => ({ date: "2026-10-19", kickoff: ko, home: h, away: "Beta", home_p: 0.3, draw_p: 0.28, away_p: 0.42, o15: 0.7 });
  const board = { fixtures: [fx("Soon", "2026-10-19T12:00:00Z"), fx("Later", "2026-10-19T20:00:00Z")] };
  const ev = (h) => ({ eventId: h, homeTeam: h, awayTeam: "Beta", startTime: 0, odds: { "1": 2, X: 3.2, "2": 3.6 } });
  const got = rows(board, [ev("Soon"), ev("Later")], now).filter((r) => r.kind === "main");
  assert.deepStrictEqual(got.map((r) => r.home), ["Soon"]);
});
