"use strict";
/* The social engine (lib/social.js, lib/bigodds.js). */
const test = require("node:test");
const assert = require("node:assert");
const S = require("../lib/social.js");
const B = require("../lib/bigodds.js");

const at = (lagosIso) => Date.parse(lagosIso + "+01:00");
const fx = (home, away, tip, tip_p, kickoff) => ({ date: "2026-09-25", home, away, tip, tip_p, kickoff });
const pay = {
  potd: { home: "Caen", away: "Rouen", date: "2026-09-25" },
  record: { total: 1562, correct: 1183, days: 21 },
  fixtures: [
    fx("Caen", "Rouen", "1X, home or draw", 0.8, "2026-09-25T18:45:00Z"),
    fx("A", "B", "Over 1.5", 0.86, "2026-09-25T18:45:00Z"),
    fx("C", "D", "X2, draw or away", 0.81, "2026-09-25T19:00:00Z"),
    fx("E", "F", "Home win", 0.6, "2026-09-25T19:00:00Z"),
  ],
};

test("each slot fires in its own Lagos hour, once per channel", () => {
  const nine = S.due(pay, at("2026-09-25T09:05:00"), new Set(), { x: Date.now(), tg: Date.now() });
  assert.deepStrictEqual(nine.map((i) => i.key).sort(), ["potd|2026-09-25|tg", "potd|2026-09-25|x"]);
  assert.match(nine[0].text, /Pick of the day[\s\S]*Caen v Rouen[\s\S]*80%[\s\S]*18\+/);
  const again = S.due(pay, at("2026-09-25T09:35:00"), new Set(nine.map((i) => i.key)), { x: Date.now(), tg: Date.now() });
  assert.deepStrictEqual(again, [], "a slot already posted is never posted again");
  const five = S.due(pay, at("2026-09-25T17:05:00"), new Set(), { x: Date.now(), tg: Date.now() });
  assert.ok(five.some((i) => i.kind === "bankers" && /Tonight's bankers[\s\S]*A v B · Over 1\.5 · 86%/.test(i.text)));
});

test("a quiet channel gets a keepalive in the day, never at night", () => {
  const quiet = { x: at("2026-09-24T09:00:00"), tg: at("2026-09-25T09:00:00") };
  const day = S.due(pay, at("2026-09-25T14:05:00"), new Set(), quiet);
  assert.deepStrictEqual(day.map((i) => i.key), ["keepalive|2026-09-25|x"], "only the channel quiet 20h+");
  assert.deepStrictEqual(S.due(pay, at("2026-09-25T23:05:00"), new Set(), quiet), [], "not at 23:00");
});

test("every post fits X, carries 18+, and has no em dash", () => {
  const posts = [S.potd(pay, at("2026-09-25T09:05:00")), S.bankers(pay, at("2026-09-25T17:05:00"))]
    .concat([0, 1, 2, 3].map((n) => S.promo(pay, 0, n)));
  for (const p of posts) {
    assert.ok(S.xLen(p.x) <= 280, S.xLen(p.x) + ": " + p.x);
    assert.match(p.x, /18\+/); assert.match(p.tg, /18\+/);
    assert.doesNotMatch(p.x + p.tg, /—|load am/i);
  }
});

/* BALANCED, 75%+, ANY MARKET (owner, 14 Oct 2026: "let it pick using the
   balanced or more game less odds style. no picks less than 75 percent. also,
   all the games always seem to double chance"). The chance is the BOARD's
   (D.blend, 90% the book's de-vigged price) - what a reader sees. */
test("big odds only on a good day, and only legs with a real SportyBet price", () => {
  const now = at("2026-09-25T11:05:00");
  const g = (i) => Object.assign(fx("H" + i, "A" + i, "1X, home or draw", 0.8, "2026-09-25T19:00:00Z"),
    { dc1x: 0.9, o15: 0.9, h_o05: 0.9 });
  const many = { fixtures: Array.from({ length: 24 }, (_, i) => g(i)) };
  const price = { "1X": 1.15, "OVER_1.5": 1.15, "HOME_OVER_0.5": 1.15 };
  const feed = many.fixtures.map((f, i) => ({ id: i, home: f.home, away: f.away, ko: Date.parse(f.kickoff), odds: price }));
  const p = B.pick(many, now, feed);
  assert.ok(p && p.odds >= 4, "stacks to at least x4");
  assert.ok(p.legs.length <= 12, "twelve legs at most (owner, 14 Oct 2026: 20 was too many)");
  assert.strictEqual(new Set(p.legs.map((l) => l.home)).size, p.legs.length, "one leg per game");
  /* Never one market family on more than 40% of the slip - "all double chance"
     was 1X/X2/12 every time. */
  const fam = {}; p.legs.forEach((l) => { const f = B.family(l.prediction); fam[f] = (fam[f] || 0) + 1; });
  for (const [f, n] of Object.entries(fam)) assert.ok(n <= Math.ceil(0.4 * p.legs.length), f + " on " + n + " of " + p.legs.length);
  assert.ok(Object.keys(fam).length >= 3, "the slip mixes markets: " + JSON.stringify(fam));
  assert.ok(p.legs.every((l) => l.p >= 0.75 && l.odds >= 1.10));
  assert.strictEqual(B.pick({ fixtures: many.fixtures.slice(0, 3) }, now, feed), null, "three is not a good day");
  /* A leg the board puts under 75% never goes on, whatever the model says:
     priced 1.40 the board reads it at ~68%. */
  /* Three families, so the 40% rule cannot be what stops it - only the floor. */
  const dear = feed.map((e) => Object.assign({}, e, { odds: { "1X": 1.40, "OVER_1.5": 1.40, "HOME_OVER_0.5": 1.40 } }));
  assert.strictEqual(B.pick(many, now, dear), null, "no leg under 75% on the board");
  /* TOWARDS x10 (owner, 14 Oct 2026). Each game offers a 1X at 1.20 and
     richer legs at 1.25 that the board still reads at ~78%: the twelve start
     on the safe ones and are upgraded until the slip reaches x10. */
  const rich = { "1X": 1.20, "OVER_1.5": 1.20, "HOME_OVER_0.5": 1.20, "AWAY_OVER_0.5": 1.28 };
  // three markets read ~80% (twelve of them make x8.9), the away one ~76%: only upgrades reach x10
  const richFeed = feed.map((e) => Object.assign({}, e, { odds: rich }));
  const up = B.pick({ fixtures: many.fixtures.map((f) => Object.assign({}, f, { a_o05: 0.9 })) }, now, richFeed);
  assert.ok(up && up.odds >= 10, "stacks to x10 when the board allows it: x" + (up && up.odds));
  assert.ok(up.legs.length <= 12 && up.legs.every((l) => l.p >= 0.75), "and never under 75%");
  /* And a 1.04 leg adds risk and no payout. */
  const cheap = feed.map((e) => Object.assign({}, e, { odds: { "1X": 1.04, "OVER_1.5": 1.04, "HOME_OVER_0.5": 1.04 } }));
  assert.strictEqual(B.pick(many, now, cheap), null, "nothing under 1.10");
  const unpriced = feed.map((e) => Object.assign({}, e, { odds: {} }));
  assert.strictEqual(B.pick(many, now, unpriced), null, "no price, no leg");
  const t = B.texts(p, { sporty: { code: "ABC123", n: p.legs.length }, bet9ja: { code: "5XY", n: p.legs.length - 1 } });
  assert.match(t.x, /Big odds of the day[\s\S]*SportyBet: ABC123[\s\S]*Bet9ja: 5XY \(\d+ of \d+\)/);
  assert.ok(S.xLen(t.x) <= 280);
});
