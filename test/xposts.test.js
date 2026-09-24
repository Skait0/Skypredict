"use strict";
/* The /x desk: posts drafted by the build, posted by hand. X refuses a post
 * over 280 characters and counts every link as 23 whatever its length, so a
 * result post trims its games rather than getting cut off by X mid-line. */
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

const leg = (i, hit) => ({ date: "2026-09-22", home: "Home Club " + i, away: "Away Side " + i,
  tip: "1X, home or draw", _hit: hit });
const resultOf = (l) => ({ hg: 2, ag: 1, hit: l._hit });

test("a link counts as 23 characters, as X counts it", () => {
  assert.equal(P.xLen("see https://www.soccerwizard.live/booking-codes/2026-09-22"), 4 + 23);
  assert.equal(P.xLen("✅ ×1.5"), 2 + 5, "an emoji weighs two, × and digits one");
});

test("a long result post is trimmed to fit, and says how many it left out", () => {
  const e = { date: "2026-09-22", legs: Array.from({ length: 12 }, (_, i) => leg(i, i !== 3)) };
  const t = P.xResultPost(e, resultOf);
  assert.ok(P.xLen(t) <= 280, P.xLen(t) + " characters");
  assert.match(t, /^❌ Tue 22 Sep's code: 11 of 12 landed\./);
  assert.match(t, /\+\d+ more/);
  assert.match(t, /booking-codes\/2026-09-22$/);
});

test("the code post names every book's code and fits", () => {
  const e = { date: "2026-09-25", odds: 3.33, legs: [leg(1), leg(2)],
    codes: { sporty: "RQWKNC", bet9ja: "5SNDKD5", betking: "XG1VP5", betpawa: "XP8GCRZ" } };
  const t = P.xCodePost(e);
  for (const c of ["RQWKNC", "5SNDKD5", "XG1VP5", "XP8GCRZ", "×3.33", "Fri 25 Sep", "18+"]) {
    assert.ok(t.includes(c), c);
  }
  assert.ok(P.xLen(t) <= 280);
});
