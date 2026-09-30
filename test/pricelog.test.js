"use strict";
/* The corners/shots price log (owner, 30 Sep 2026): our number beside
 * SportyBet's, before kick-off, so "our view differs" only comes back where
 * it is proven. */
const test = require("node:test");
const assert = require("node:assert");
const C = require("../lib/corners.js");
const { ourP, marketP, rows } = require("../scripts/pricelog.js");

const board = { cornersK: 51, shotsK: 44 };
const f = { ch: 5.5, ca: 4.2, sh: 13, sa: 10 };

test("our chance is the site's arithmetic, half lines only, shots overs only", () => {
  assert.strictEqual(ourP(f, "CORNERS_OV_9.5", board), C.overProb(9.7, 51, 9.5));
  assert.strictEqual(ourP(f, "CORNERS_H_UN_4.5", board), 1 - C.overProb(5.5, 51, 4.5));
  assert.strictEqual(ourP(f, "SHOTS_A_OV_9.5", board), C.overProb(10, 44, 9.5));
  assert.strictEqual(ourP(f, "SHOTS_UN_22.5", board), null, "shot unders are not trusted");
  assert.strictEqual(ourP(f, "CORNERS_OV_10", board), null, "a whole line pushes");
  assert.strictEqual(ourP({}, "CORNERS_OV_9.5", board), null, "no rate, no number");
});

test("the market's chance is de-vigged across the line", () => {
  assert.strictEqual(marketP({ CORNERS_OV_9_5: 0 , "CORNERS_OV_9.5": 1.8, "CORNERS_UN_9.5": 2.0 }, "CORNERS_OV_9.5"),
    (1 / 1.8) / (1 / 1.8 + 1 / 2));
  assert.strictEqual(marketP({ "SHOTS_OV_22.5": 1.8 }, "SHOTS_OV_22.5"), null);
});

test("only games that have not kicked off are logged", () => {
  const now = Date.parse("2026-09-30T10:00:00Z");
  const fx = (ko) => Object.assign({ home: "A", away: "B", league: "L", kickoff: ko }, f);
  const ev = { eventId: "sr:match:1", homeTeam: "A", awayTeam: "B", startTime: Date.parse("2026-09-30T12:00:00Z"),
    odds: { "CORNERS_OV_9.5": 1.8, "CORNERS_UN_9.5": 2.0 } };
  const b = Object.assign({ fixtures: [fx("2026-09-30T12:00:00.000Z")] }, board);
  assert.strictEqual(rows(b, [ev], now).length, 2);
  assert.strictEqual(rows(b, [ev], Date.parse("2026-09-30T12:30:00Z")).length, 0);
});
