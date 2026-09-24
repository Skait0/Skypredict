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

test("big odds only on a good day, and only legs with a real SportyBet price", () => {
  const now = at("2026-09-25T11:05:00");
  const many = { fixtures: Array.from({ length: 7 }, (_, i) =>
    fx("H" + i, "A" + i, "1X, home or draw", 0.8 - i * 0.01, "2026-09-25T19:00:00Z")) };
  const feed = many.fixtures.map((f, i) => ({ id: i, home: f.home, away: f.away, ko: Date.parse(f.kickoff), odds: { "1X": 1.5 } }));
  const p = B.pick(many, now, feed);
  assert.ok(p && p.odds >= 8, "stacks to at least x8");
  assert.ok(p.legs.length <= 8);
  assert.strictEqual(B.pick({ fixtures: many.fixtures.slice(0, 3) }, now, feed), null, "three is not a good day");
  const unpriced = feed.map((e) => Object.assign({}, e, { odds: {} }));
  assert.strictEqual(B.pick(many, now, unpriced), null, "no price, no leg");
  const t = B.texts(p, { sporty: { code: "ABC123", n: p.legs.length }, bet9ja: { code: "5XY", n: p.legs.length - 1 } });
  assert.match(t.x, /Big odds of the day[\s\S]*SportyBet: ABC123[\s\S]*Bet9ja: 5XY \(\d of \d\)/);
  assert.ok(S.xLen(t.x) <= 280);
});
