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

test("the verdict and the payout, and no win-chance line (owner's call, 24 Sep)", () => {
  const text = D.reply("sporty", "ABC123", [leg("Morocco", "Gabon", "HOME_OVER_1.5", 1.35),
    leg("Nowhere", "FC", "1", 1.5)], fx, "https://x.test");
  assert.doesNotMatch(text, /Chance all/);
  assert.match(text, /Wizard's verdict: a banker 🔥/);
  assert.match(text, /Pays <b>×2\.03<\/b> · ₦1,000 → <b>₦2,025<\/b>/, "every leg's odds, read or not");
  assert.match(text, /1 we can't read/);
  assert.match(text, /go=convert/);
  assert.match(text, /18\+/);
  const noPrice = D.reply("sporty", "ABC123", [leg("Morocco", "Gabon", "HOME_OVER_1.5", null)], fx, "https://x.test");
  assert.doesNotMatch(noPrice, /Pays/, "a leg without a price means no total");
});

test("the reply flags a leg the odds rate well above our model", () => {
  const text = D.reply("sporty", "ABC123", [leg("England", "Spain", "AWAY_OVER_1.5", 1.6),
    leg("Morocco", "Gabon", "HOME_OVER_1.5", 1.35), leg("Morocco", "Gabon", "1X", 1.05),
    leg("Turkiye", "France", "AWAY_OVER_1.5", 1.4)], fx, "https://x.test");
  assert.match(text, /Spain over 1\.5 · <b>37%<\/b> \(odds say 63%\)/);
  assert.match(text, /Wizard's verdict: 2 bankers, 2 to tighten/);
  /* Never more verdict legs than slip legs, and "Bankers" only over bankers. */
  const weak = D.reply("sporty", "ABC123", [leg("England", "Spain", "AWAY_OVER_1.5", 1.6),
    leg("Turkiye", "France", "AWAY_OVER_1.5", 1.4)], fx, "https://x.test");
  assert.match(weak, /Wizard's verdict: 0 bankers, 2 to tighten/);
  assert.match(weak, /💪 <b>Strongest<\/b>/);
  assert.doesNotMatch(weak, /🔥 <b>Bankers<\/b>/);
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

test("a book's long club names still find our short ones, inside the kickoff window", () => {
  /* 24 Sep: our own daily code, RQWKNC, read as "0 we can read" - SportyBet
     spells Scottish clubs the long way. */
  const board = [
    { home: "Inverness C", away: "Morton", kickoff: KO, dc1x: 0.81 },
    { home: "Raith Rvs", away: "Livingston", kickoff: KO, dc1x: 0.76 },
    { home: "Stuttgart", away: "Mainz", kickoff: KO, dc1x: 0.7 },
  ];
  const f1 = D.findFixture(board, leg("Inverness Caledonian Thistle FC", "Greenock Morton FC", "1X", 1.2));
  assert.strictEqual(f1 && f1.home, "Inverness C");
  const f2 = D.findFixture(board, leg("Raith Rovers FC", "Livingston FC", "1X", 1.3));
  assert.strictEqual(f2 && f2.home, "Raith Rvs");
  assert.strictEqual(D.findFixture(board, leg("Stuttgart II", "Mainz II", "1X", 1.3)), null,
    "a reserve side never takes the first team's number");
  const late = Object.assign(leg("Inverness Caledonian Thistle FC", "Greenock Morton FC", "1X", 1.2),
    { kickoff: Date.parse(KO) + 2 * 864e5 });
  assert.strictEqual(D.findFixture(board, late), null, "a different day is a different game");
  assert.match(D.examine([leg("Inverness Caledonian Thistle FC", "Greenock Morton FC", "1X", 1.2)], board).rows[0].name,
    /^Inverness C or draw$/, "and the reply uses our names");
});

test("no leg is both strongest and weakest", () => {
  const board = ["A", "B", "C", "D", "E"].map((t, i) => ({ home: t, away: t + "2", kickoff: KO, dc1x: 0.9 - i * 0.05 }));
  const text = D.reply("sporty", "ABC123", board.map((f) => leg(f.home, f.away, "1X", 1.1)), board, "https://x.test");
  for (const t of ["A", "B", "C", "D", "E"]) {
    assert.strictEqual(text.split("\n").filter((l) => l.startsWith(t + " or draw")).length, 1, t + " listed twice");
  }
});

test("the site's start link opens the bot on the reader's code", async () => {
  /* ?start=sporty_RQWKNC arrives as "/start sporty_RQWKNC": the bot must read
     that code on that book, not answer with the welcome. */
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  const asked = [];
  const real = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/api/slip?")) { asked.push(u); return { json: async () => ({ success: false }) }; }
    return { json: async () => ({ ok: true, result: {} }) };
  };
  try {
    delete require.cache[require.resolve("../api/tg.js")];
    const tg = require("../api/tg.js");
    await tg({ method: "POST", headers: { "x-telegram-bot-api-secret-token": tg.secretFor("123:abc") },
      body: { message: { message_id: 1, chat: { id: 5, type: "private" }, text: "/start sporty_RQWKNC" } } },
      { status() { return this; }, json() { return this; } });
    assert.deepStrictEqual(asked.map((u) => /book=(\w+)&code=(\w+)/.exec(u).slice(1).join(":")), ["sporty:RQWKNC"]);
  } finally { global.fetch = real; delete process.env.TELEGRAM_BOT_TOKEN; }
});
