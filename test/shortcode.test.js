"use strict";
/* A book that booked fewer legs than the slip says so everywhere the code
   goes (owner, 13 Oct 2026: betPawa and 1xBet each refused one unpriced leg). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const P = require("../lib/pages.js");

const legs = [1, 2, 3, 4, 5].map((i) => ({ home: "H" + i, away: "A" + i, market: "OVER_1.5", date: "2026-10-13" }));
const entry = { date: "2026-10-13", legs, codes: { sporty: "P1X2ZY", bet9ja: "5VNNJZP", betpawa: "ZHBHPVR" }, short: { betpawa: 4 } };

test("the X post marks the short code and only that one", () => {
  const t = P.xCodePost(entry);
  assert.match(t, /betPawa: ZHBHPVR \(4 of 5 games\)/);
  assert.match(t, /SportyBet: P1X2ZY\n/);
});

test("mkcode books what an additive book accepts and records short", () => {
  const src = fs.readFileSync(require.resolve("../scripts/mkcode.js"), "utf8");
  assert.match(src, /for \(const bk of \["betking", "betpawa", "onexbet", "betway"\]\)/);
  assert.match(src, /sel\.length >= working\.length - 1/, "never fewer than legs-1");
  assert.match(src, /short\[bk\] = sel\.length/);
});
