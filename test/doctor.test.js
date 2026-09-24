"use strict";
/* The Telegram code doctor (lib/doctor.js, api/tg.js). */
const test = require("node:test");
const assert = require("node:assert");
const D = require("../lib/doctor.js");

const KO = "2026-09-25T19:00:00.000Z";
const fx = [
  { home: "Morocco", away: "Gabon", kickoff: KO, h_o15: 0.81, o15: 0.86, dc1x: 0.97 },
  { home: "Turkiye", away: "France", kickoff: KO, a_o15: 0.64, draw_p: 0.21 },
  { home: "England", away: "Spain", kickoff: KO, a_o15: 0.37, o25: 0.5 },
];
const leg = (home, away, prediction, odds) => ({ home, away, prediction, odds, kickoff: Date.parse(KO) });

test("a code is found in the ways people actually send one", () => {
  assert.deepStrictEqual(D.parse("HUW6YC"), { code: "HUW6YC", book: null });
  assert.deepStrictEqual(D.parse("check this sportybet code RQWKNC please"), { code: "RQWKNC", book: "sporty" });
  assert.deepStrictEqual(D.parse("https://www.sportybet.com/ng/?shareCode=8NCBXD"), { code: "8NCBXD", book: "sporty" });
  assert.deepStrictEqual(D.parse("bet9ja 5SR2WN3"), { code: "5SR2WN3", book: "bet9ja" });
  assert.strictEqual(D.parse("hello there").code, null, "ordinary words are not codes");
});

test("each leg gets our number for its own market, strongest first", () => {
  const ex = D.examine([leg("England", "Spain", "AWAY_OVER_1.5", 2.2),
    leg("Morocco", "Gabon", "HOME_OVER_1.5", 1.35), leg("Turkiye", "France", "X", 3.4)], fx);
  assert.deepStrictEqual(ex.rows.map((r) => Math.round(r.p * 100)), [81, 37, 21]);
  assert.strictEqual(ex.rows[0].name, "Morocco over 1.5");
  assert.match(ex.rows[2].name, /^Draw \(Turkiye v France\)$/, "a bare market says which game");
  assert.ok(ex.allPriced);
  assert.ok(Math.abs(ex.all - 0.81 * 0.37 * 0.21) < 1e-9);
});

test("unders and no-goal markets are the complement, and unknowns are not guessed", () => {
  assert.ok(Math.abs(D.probOf({ o25: 0.6 }, "UNDER_2.5") - 0.4) < 1e-9);
  assert.strictEqual(D.probOf({ o25: 0.6 }, "UP1_1"), null);
  const ex = D.examine([leg("Morocco", "Gabon", "UP1_1", 1.2), leg("Nowhere", "FC", "1", 1.5)], fx);
  assert.strictEqual(ex.rows.length, 0);
  assert.strictEqual(ex.unpriced.length, 2);
  assert.strictEqual(ex.all, null);
});

test("the whole-slip chance is only claimed when every leg is priced", () => {
  const text = D.reply("sporty", "ABC123", [leg("Morocco", "Gabon", "HOME_OVER_1.5", 1.35),
    leg("Nowhere", "FC", "1", 1.5)], fx, "https://x.test");
  assert.doesNotMatch(text, /Chance all/, "one unread leg makes that number a lie");
  assert.match(text, /1 we can't read/);
  assert.match(text, /go=convert/);
  assert.match(text, /18\+/);
});

test("the reply flags a leg the odds rate well above our model", () => {
  const text = D.reply("sporty", "ABC123", [leg("England", "Spain", "AWAY_OVER_1.5", 1.6),
    leg("Morocco", "Gabon", "HOME_OVER_1.5", 1.35), leg("Morocco", "Gabon", "1X", 1.05),
    leg("Turkiye", "France", "AWAY_OVER_1.5", 1.4)], fx, "https://x.test");
  assert.match(text, /Spain over 1\.5 · <b>37%<\/b> - the odds price it at 63%/);
});

test("the webhook refuses anyone who is not Telegram", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  const tg = require("../api/tg.js");
  const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; } };
  await tg({ method: "POST", headers: {}, body: { message: { chat: { id: 1, type: "private" }, text: "HUW6YC" } } }, res);
  assert.strictEqual(res.code, 401);
  await tg({ method: "POST", headers: { "x-telegram-bot-api-secret-token": "guess" }, body: {} }, res);
  assert.strictEqual(res.code, 401);
  /* Genuine but from the channel or a group: acknowledged, never answered. */
  await tg({ method: "POST", headers: { "x-telegram-bot-api-secret-token": tg.secretFor("123:abc") },
    body: { message: { chat: { id: -100, type: "channel" }, text: "HUW6YC" } } }, res);
  assert.strictEqual(res.code, 200);
  delete process.env.TELEGRAM_BOT_TOKEN;
});
