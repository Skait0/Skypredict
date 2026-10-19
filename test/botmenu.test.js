"use strict";
/* The bot made easy (owner, 19 Oct 2026: "make the bot very easy to use"): a menu under the
   chat box, Build a slip by payout, today's codes, and the converter's tools as buttons under
   every code - with Edit for me asking before it books anything. */
const test = require("node:test");
const assert = require("node:assert");
const ASK = require("../lib/ask.js");

test("the menu carries the bookie in its labels, so the bot never has to remember it", () => {
  const kb = ASK.menuKeyboard("bet9ja");
  const labels = kb.keyboard.flat().map((b) => b.text);
  assert.ok(labels.includes("🎯 Build a slip · Bet9ja"));
  assert.ok(kb.is_persistent && kb.resize_keyboard);
  assert.deepStrictEqual(ASK.parseMenu("🎯 Build a slip · Bet9ja"), { kind: "menuBuild", book: "bet9ja" });
  assert.deepStrictEqual(ASK.parseMenu("📅 Daily odds · 1xBet"), { kind: "ladder", book: "onexbet" });
  assert.deepStrictEqual(ASK.parseMenu("📅 Ladder · 1xBet"), { kind: "ladder", book: "onexbet" }, "an old keyboard still works");
  assert.deepStrictEqual(ASK.parseMenu("🏦 Change bookie"), { kind: "bookie" });
  assert.strictEqual(ASK.parseMenu("HUW6YC"), null);
});

test("a payout on its own is a slip to build; a code with a number is still a trim", () => {
  assert.deepStrictEqual(ASK.parseAsk("50", null), { kind: "build", odds: 50, book: null });
  assert.deepStrictEqual(ASK.parseAsk("x100 on betking", null), { kind: "build", odds: 100, book: "betking" });
  assert.strictEqual(ASK.parseAsk("1", null), null, "x1 is not a slip");
  assert.strictEqual(ASK.parseAsk("5000", null), null, "past the builder's x1000");
  assert.strictEqual(ASK.parseAsk("HUW6YC x20", "HUW6YC").kind, "trim");
  assert.strictEqual(ASK.parseAsk("today's 5 safest", null).kind, "today", "the older request still works");
});

test("Edit for me only moves to a bet that wins on every score the old one wins on", () => {
  assert.strictEqual(ASK.wider("1X", "1"), true);
  assert.strictEqual(ASK.wider("OVER_1.5", "OVER_2.5"), true);
  assert.strictEqual(ASK.wider("1", "1X"), false, "never narrower");
  assert.strictEqual(ASK.wider("X2", "1"), false, "never a different bet");
  const f = { home: "Arsenal", away: "Chelsea", date: "2026-10-25", kickoff: "2026-10-25T15:00:00Z",
    home_p: 0.45, draw_p: 0.27, away_p: 0.28, dc1x: 0.72, dcx2: 0.55, dc12: 0.73, o15: 0.78, o25: 0.55 };
  const legs = [{ home: "Arsenal", away: "Chelsea", kickoff: Date.parse(f.kickoff), prediction: "1", odds: 2.1, eventId: "e1" }];
  const plan = ASK.planSafer(legs, [f], (l, c) => ({ "1X": 1.35, "12": 1.33 }[c] || null));
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].to, "1X", "the least safe bet that clears the bar, on a price the book has");
  assert.deepStrictEqual(ASK.planSafer(legs, [f], () => null), [], "no price at the bookie, no swap");
  const strong = [Object.assign({}, legs[0], { prediction: "OVER_1.5" })];
  assert.deepStrictEqual(ASK.planSafer(strong, [f], () => 1.1), [], "a leg we rate 65%+ is left alone");
});

function bot() {
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("api.telegram.org")) {
      sent.push({ method: u.split("/").pop(), body: JSON.parse(init.body) });
      return { json: async () => ({ ok: true, result: {} }) };
    }
    if (u.includes("/api/slip")) return { json: async () => ({ success: true, legs: [{ home: "A", away: "B", eventId: "e1", prediction: "1", odds: 2 }] }) };
    if (u.endsWith("/predictions.json")) return { json: async () => ({ fixtures: [] }) };
    return { json: async () => ({}) };
  };
  delete require.cache[require.resolve("../api/tg.js")];
  const tg = require("../api/tg.js");
  const res = { status() { return this; }, json() { return this; } };
  const hdr = { "x-telegram-bot-api-secret-token": tg.secretFor("123:abc") };
  const send = (text) => tg({ method: "POST", headers: hdr,
    body: { message: { message_id: 5, from: { id: 42 }, chat: { id: 42, type: "private" }, text } } }, res);
  const tap = (data) => tg({ method: "POST", headers: hdr,
    body: { callback_query: { id: "q", data, from: { id: 42 }, message: { message_id: 9, chat: { id: 42, type: "private" } } } } }, res);
  const done = () => { global.fetch = realFetch; delete process.env.TELEGRAM_BOT_TOKEN; };
  return { send, tap, sent, done };
}

test("/start shows the menu; a tap on Build a slip offers the payouts on that bookie", async () => {
  const b = bot();
  try {
    await b.send("/start");
    const m = b.sent.find((s) => s.method === "sendMessage");
    assert.ok(m.body.reply_markup.keyboard, "the menu under the chat box");
    await b.send("🎯 Build a slip · BetKing");
    const last = b.sent[b.sent.length - 1].body;
    const data = last.reply_markup.inline_keyboard.flat().map((k) => k.callback_data);
    assert.ok(data.includes("bd|betking|50|0"));
  } finally { b.done(); }
});

test("Trim opens its choices in place of the buttons, and Back puts them back", async () => {
  const b = bot();
  try {
    await b.tap("tr|sporty|HUW6YC");
    const e = b.sent.find((s) => s.method === "editMessageReplyMarkup");
    const data = e.body.reply_markup.inline_keyboard.flat().map((k) => k.callback_data);
    assert.ok(data.includes("tq|sporty|HUW6YC|50") && data.includes("bk0|sporty|HUW6YC"));
    await b.tap("bk0|sporty|HUW6YC");
    const back = b.sent.filter((s) => s.method === "editMessageReplyMarkup").pop();
    assert.ok(back.body.reply_markup.inline_keyboard.flat().some((k) => k.callback_data === "ed|sporty|HUW6YC"));
  } finally { b.done(); }
});

test("a bare number asks which bookie before it books anything", async () => {
  const b = bot();
  try {
    await b.send("30");
    const m = b.sent.filter((s) => s.method === "sendMessage").pop().body;
    assert.match(m.text, /x30/);
    assert.ok(m.reply_markup.inline_keyboard.flat().some((k) => k.callback_data === "bd|bet9ja|30|0"));
  } finally { b.done(); }
});
