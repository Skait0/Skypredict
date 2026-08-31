"use strict";

/**
 * If we do not know what SportyBet offers, only pick what they always offer.
 *
 * Sentry, "booking: picks with no market at SportyBet", 52 events, regressed
 * today after four quiet hours:
 *
 *   bad_legs=2 events=sr:match:73888458, sr:match:73932818
 *   markets=AWAY_OVER_0.5 total_legs=22
 *
 * Both builders prefer markets with real SportyBet prices, drop a fixture that
 * IS priced when none of ours is listed, and otherwise fall back to our own
 * estimated odds. That fallback is right - not knowing their markets is not the
 * same as knowing they have none - but it was choosing from every market we
 * offer, including ones SportyBet frequently does not carry.
 *
 * Measured across 1,232 live events:
 *
 *   1 / 2 / 1X / X2 / 12   99-100%
 *   OVER_2.5                  89%
 *   OVER_1.5                  86%
 *   AWAY_OVER_0.5             76%
 *   HOME_OVER_0.5             70%
 *
 * A guessed team-goals leg therefore fails to book about one time in four, and
 * team goals became a default market that morning - which is why a three-day-old
 * issue regressed. The two failures were Shamrock Rovers v Shelbourne and
 * Chindia Targoviste v Voluntari: checked against the live feed, neither event
 * lists AWAY_OVER_0.5 at all.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function konst(name) {
  const m = new RegExp("(?:^|\\n)(?:const|var|let)\\s+" + name + "\\s*=\\s*([^;]+);").exec(src);
  assert.ok(m, "constant not found: " + name);
  return Function("return " + m[1].trim())();
}
const SAFE = konst("SAFE_UNPRICED");

test("the safe set is exactly the markets SportyBet always lists", () => {
  /* 99-100% on the live feed. Everything else was measured at 89% or below. */
  assert.deepStrictEqual(Object.keys(SAFE).sort(), ["1", "12", "1X", "2", "X", "X2"].sort());
});

test("the markets that were failing are not in it", () => {
  ["AWAY_OVER_0.5", "HOME_OVER_0.5", "AWAY_OVER_1.5", "HOME_OVER_1.5"]
    .forEach((c) => assert.ok(!SAFE[c],
      c + " is carried on 70-78% of events and must not be guessed at"));
  /* Goals lines are better but still miss one event in seven. */
  ["OVER_1.5", "OVER_2.5", "OVER_3.5", "GG", "FH_OVER_0.5"]
    .forEach((c) => assert.ok(!SAFE[c], c + " is not listed often enough to guess"));
});

test("both builders apply it, and only on the unpriced path", () => {
  /* The rule must not touch a fixture we DO have prices for - there the real
     odds already tell us exactly what is listed, and narrowing to 1X2 would
     throw away most of the board for no reason. */
  const wiz = src.slice(src.indexOf("function pickFrom(cs){"), src.indexOf("function pickFrom(cs){") + 900);
  assert.match(wiz, /var real=cs\.filter\(hasReal\);[\s\S]*if\(real\.length\) return bestOf\(real\);/,
    "the wizard must still prefer real prices before anything else");
  assert.match(wiz, /if\(cs\.length&&priced\(cs\[0\]\.f\)\) return null;[\s\S]*safeUnpriced/,
    "the safe set must be applied AFTER the priced-but-unlisted drop, not before");

  const i = src.indexOf("var realCodes=usable.filter(function(c){return hasRealOdd(f,c);});");
  const sl = src.slice(i, i + 700);
  assert.match(sl, /if\(realCodes\.length\) usable=realCodes;/,
    "the slider must still prefer real prices");
  assert.match(sl, /else if\(pricedFixture\(f\)\) return;/,
    "and still drop a priced fixture with none of our markets");
  assert.match(sl, /else \{ usable=usable\.filter\(function\(c\)\{ return safeUnpriced\(c\); \}\);/,
    "the slider does not narrow its guess to the safe set");
});

test("a fixture with nothing safe left is dropped, not forced", () => {
  /* If the only markets switched on are ones we cannot guess at, the honest
     answer is to skip the fixture. Forcing one through is what produced a
     booking code that would not load. */
  const i = src.indexOf("var realCodes=usable.filter(function(c){return hasRealOdd(f,c);});");
  assert.match(src.slice(i, i + 700), /if\(!usable\.length\) return; \}/,
    "the slider must skip a fixture left with no guessable market");
  const wiz = src.slice(src.indexOf("function pickFrom(cs){"), src.indexOf("function pickFrom(cs){") + 900);
  assert.match(wiz, /return guessable\.length\?bestOf\(guessable\):null;/,
    "the wizard must return null rather than pick something unlistable");
});

test("the safe set is a plain lookup, not a scan", () => {
  /* Called inside the per-fixture loop of both builders. */
  assert.match(src, /function safeUnpriced\(code\)\{ return !!SAFE_UNPRICED\[code\]; \}/);
});

/**
 * The reason this is a guess at all, recorded so nobody "simplifies" it later:
 * an unpriced fixture is one our name matcher did not pair with a SportyBet
 * event. Dropping those outright would silently shrink the board every time the
 * matcher misses, which it does on the smaller leagues - exactly where these
 * two failures came from.
 */
test("an unpriced fixture is still usable, just narrowed", () => {
  const wiz = src.slice(src.indexOf("function pickFrom(cs){"), src.indexOf("function pickFrom(cs){") + 900);
  assert.ok(!/if\(!priced\(cs\[0\]\.f\)\) return null;/.test(wiz),
    "an unpriced fixture must not be dropped outright - that shrinks the board " +
    "whenever the name matcher misses, which is most common on small leagues");
});
