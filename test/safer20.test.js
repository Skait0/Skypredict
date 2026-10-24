"use strict";
/* The safer x20 of the day (lib/safer20.js, owner 22 Oct 2026): posted in the reply layout,
   graded the next morning, the result posted win or loss. */
const test = require("node:test");
const assert = require("node:assert");
const SAFE = require("../lib/safer20.js");
const row = { day: "2026-10-22", odds: 20.55,
  codes: { sporty: { code: "Y5NEDC", n: 2 }, bet9ja: { code: "5WTMX32", n: 2 }, betpawa: { code: "2Q0WQDV", n: 1 } },
  legs: [{ home: "Celtic", away: "Celta", code: "GG" }, { home: "Thun", away: "Hajduk Split", code: "OVER_1.5" }] };

test("the post: one bookie and code per line, partial bookies say how much, 18+", () => {
  const t = SAFE.post(row);
  assert.match(t, /\nSportyBet: Y5NEDC\nBet9ja: 5WTMX32\n/);
  assert.match(t, /\nbetPawa: 2Q0WQDV \(1 of 2\)\n/, "every bookie that took it is listed (owner, 24 Oct 2026)");
  assert.match(t, /every pick 72% or more/); assert.match(t, /18\+$/);
  assert.doesNotMatch(t, /\bfree\b|—/i);
});

test("graded on final scores: landed posts, a loss posts nothing, nothing while a game is open", () => {
  const res = (h1, a1, h2, a2) => [{ match_date: "2026-10-22", home: "Celtic", away: "Celta", hg: h1, ag: a1 },
    { match_date: "2026-10-22", home: "Thun", away: "Hajduk Split", hg: h2, ag: a2 }];
  assert.match(SAFE.result(row, res(1, 1, 2, 0)), /^🔥 Yesterday's safer x20 landed: 2 of 2 games, ×20\.55 on SportyBet \(Y5NEDC\)/);
  assert.strictEqual(SAFE.result(row, res(1, 0, 2, 0)), null, "a loss is never posted");
  assert.strictEqual(SAFE.result(row, res(1, 1, null, null).slice(0, 1)), null, "Thun v Hajduk has no score yet");
});

test("the hand-booked first one is seeded for 23 Oct; the home page gets no tile", () => {
  assert.strictEqual(SAFE.seed("2026-10-22").codes.sporty.code, "Y5NEDC");
  assert.strictEqual(SAFE.seed("2026-10-23"), null);
  const fs = require("fs"), path = require("path");
  assert.match(fs.readFileSync(path.join(__dirname, "..", "api", "bigodds.js"), "utf8"), /big: null \}\);\s*\};/);
});

test("a Big odds of the day row (before 22 Oct 2026) is never posted as a safer x20 result", () => {
  assert.strictEqual(SAFE.FIRST_DAY, "2026-10-22");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "api", "social.js"), "utf8");
  assert.match(src, /if \(yday >= SAFE\.FIRST_DAY && S\.hourOf\(now\) >= 10/);
});

test("all seven bookies fit X's 280: a long slip gets the short form, every code kept", () => {
  const S = require("../lib/social.js");
  const big = { day: "2026-10-24", odds: 22.11, legs: Array.from({ length: 12 }, () => ({ home: "A", away: "B", code: "1X" })),
    codes: { sporty: { code: "ABCDEF", n: 12 }, bet9ja: { code: "5WTMX32", n: 11 }, betking: { code: "ABCDEF", n: 11 }, betpawa: { code: "2Q0WQDV", n: 11 },
      onexbet: { code: "ABCDE", n: 11 }, betway: { code: "BW7C61B3D5", n: 11 }, msport: { code: "B2B4RQY", n: 11 } } };
  const t = SAFE.post(big);
  assert.ok(S.xLen(t) <= 280, "X length " + S.xLen(t));
  for (const c of ["ABCDEF", "5WTMX32", "2Q0WQDV", "ABCDE", "BW7C61B3D5", "B2B4RQY"]) assert.ok(t.includes(c), c);
  assert.match(t, /\n1xBet: ABCDE \(11\)\n/);
  assert.match(t, /18\+$/);
});
