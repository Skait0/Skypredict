const test = require("node:test");
const assert = require("node:assert");
const S = require("../lib/social.js");
const L = require("../lib/ladder.js");
const SAFE = require("../lib/safer20.js");

const ladder = L.drop([{ rung: 5, legs: Array(6), codes: { sporty: { code: "AB12CD" } } },
  { rung: 10, legs: Array(9) }, { rung: 20, legs: Array(11) }, { rung: 30, legs: Array(13) }]);
const codes = {};
["sporty", "bet9ja", "betking", "msport", "betway", "1xbet"].forEach((k) => { codes[k] = { code: "Y5NEDC", n: 12 }; });
const safer = SAFE.post({ legs: Array(12), odds: 20.55, codes });

test("the byline goes in just above 18+", () => {
  const t = S.signed(safer, "fb");
  assert.ok(t.endsWith("\n" + S.SIG + "\n18+"));
});

test("X gets the byline only when the post still fits 280", () => {
  assert.ok(S.signed(safer, "x").includes(S.SIG));
  const x = S.signed(ladder, "x");
  assert.ok(S.xLen(x) <= 280);
  assert.ok(S.signed(ladder, "tg").includes(S.SIG));
});
