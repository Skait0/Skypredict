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
  assert.ok(labels.includes("🧙 Build me a slip · Bet9ja"));
  assert.ok(kb.is_persistent && kb.resize_keyboard);
  assert.deepStrictEqual(ASK.parseMenu("🧙 Build me a slip · Bet9ja"), { kind: "menuBuild", book: "bet9ja" });
  assert.deepStrictEqual(ASK.parseMenu("🎯 Build a slip · Bet9ja"), { kind: "menuBuild", book: "bet9ja" }, "a keyboard from before 20 Oct still works");
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
  const raw = (body) => tg({ method: "POST", headers: hdr, body }, res);
  return { send, tap, sent, done, tg: raw };
}

test("/start asks for the bookie first; the answer sets the menu; Build a slip offers payouts there", async () => {
  const b = bot();
  try {
    await b.send("/start");
    const m = b.sent.find((s) => s.method === "sendMessage");
    assert.match(m.body.text, /which bookie do you use/i);
    const picks = m.body.reply_markup.inline_keyboard.flat();
    assert.ok(picks.some((k) => k.callback_data === "bk|betking"), "a button per bookie");
    assert.ok(picks.some((k) => k.web_app && /\/bot$/.test(k.web_app.url)), "and the guide");
    await b.tap("bk|betking");
    const set = b.sent.filter((s) => s.method === "sendMessage");
    assert.ok(set.some((s) => s.body.reply_markup && s.body.reply_markup.keyboard &&
      s.body.reply_markup.keyboard.flat().some((k) => k.text === "🧙 Build me a slip · BetKing")), "the menu, on that bookie");
    await b.send("🧙 Build me a slip · BetKing");
    const last = b.sent[b.sent.length - 1].body;
    const data = last.reply_markup.inline_keyboard.flat().map((k) => k.callback_data);
    /* Pick for me's payouts, the site's eight, x2 to x200 (20 Oct 2026). */
    for (const x of [2, 5, 10, 20, 50, 100, 150, 200]) assert.ok(data.includes("bd|betking|" + x + "|0"), "x" + x);
    assert.match(last.text, /Pick for me/);
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

test("Change markets lists only the swaps this slip has, and a choice books it", async () => {
  /* SportyClaw review, 20 Oct 2026: the site's "Change markets" in the bot. */
  const b = bot();
  try {
    await b.tap("cm|sporty|HUW6YC");
    const e = b.sent.filter((s) => s.method === "editMessageReplyMarkup").pop();
    const keys = e.body.reply_markup.inline_keyboard.flat();
    const data = keys.map((k) => k.callback_data);
    assert.ok(data.includes("cq|sporty|HUW6YC|home|dc"), "the slip's home win can go to win or draw");
    assert.ok(!data.some((d) => /\|draw\|/.test(d || "")), "no draws on the slip, so no draw swap");
    assert.ok(data.includes("bk0|sporty|HUW6YC"), "and Back");
    assert.ok(data.every((d) => !d || d.length <= 64));
    await b.tap("cq|sporty|HUW6YC|home|dc");
    assert.ok(b.sent.filter((s) => s.method === "sendMessage").length, "the choice answers");
  } finally { b.done(); }
});

test("Results grades the ticket leg by leg and offers a new slip", async () => {
  /* SportyClaw review, 20 Oct 2026: check my ticket. With no score banked a leg waits. */
  const b = bot();
  try {
    await b.tap("rs|sporty|HUW6YC");
    const m = b.sent.filter((s) => s.method === "sendMessage").pop().body;
    assert.match(m.text, /Results for HUW6YC/);
    assert.match(m.text, /⏳/);
    const data = m.reply_markup.inline_keyboard.flat().map((k) => k.callback_data);
    assert.ok(data.includes("rs|sporty|HUW6YC") && data.includes("nb|sporty") && data.includes("fb|u|results"));
  } finally { b.done(); }
});

test("the menu has How we did yesterday and the penalty game", () => {
  /* SportyClaw review, 20 Oct 2026. The number is the site hero's (windowRecord(1)), from the payload. */
  const kb = ASK.menuKeyboard("sporty").keyboard.flat();
  assert.ok(kb.some((k) => k.text === ASK.MENU.yday));
  const pen = kb.find((k) => k.web_app);
  assert.ok(pen && /\/penalty$/.test(pen.web_app.url), "the game opens inside Telegram");
  assert.deepStrictEqual(ASK.parseMenu(ASK.MENU.yday), { kind: "yday" });
  const now = Date.parse("2026-10-21T09:00:00Z");
  const pay = { results: [{ date: "2026-10-20", hit: true }, { date: "2026-10-20", hit: false }, { date: "2026-10-20", hit: true },
    { date: "2026-10-19", hit: false }] };
  assert.deepStrictEqual(ASK.yesterday(pay, now), { day: "2026-10-20", hit: 2, n: 3 });
  assert.strictEqual(ASK.yesterday({ results: [] }, now).n, 0);
});

test("menu screens close on ✖, and a code never carries Close", async () => {
  /* SportyClaw review, 20 Oct 2026: navigation edits in place; Close takes a menu away. */
  const b = bot();
  try {
    await b.send("🧙 Build me a slip · BetKing");
    const menu = b.sent.filter((s) => s.method === "sendMessage").pop().body;
    assert.ok(menu.reply_markup.inline_keyboard.flat().some((k) => k.callback_data === "x"));
    await b.send("30");
    assert.ok(b.sent.filter((s) => s.method === "sendMessage").pop().body.reply_markup.inline_keyboard.flat().some((k) => k.callback_data === "x"));
    await b.tap("x");
    assert.ok(b.sent.some((s) => s.method === "deleteMessage" && s.body.message_id === 9));
    await b.tap("rs|sporty|HUW6YC");
    const res = b.sent.filter((s) => s.method === "sendMessage").pop().body;
    assert.ok(!res.reply_markup.inline_keyboard.flat().some((k) => k.callback_data === "x"), "results stay");
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

test("Convert has its own button, command and link, and the answer goes to the bookie asked for", async () => {
  /* Owner, 19 Oct 2026: "its the most used, it should have its own link". */
  const kb = ASK.menuKeyboard("bet9ja");
  assert.strictEqual(kb.keyboard[0][0].text, "🔁 Convert a code to Bet9ja", "first in the menu");
  assert.deepStrictEqual(ASK.parseMenu("🔁 Convert a code to Bet9ja"), { kind: "menuConvert", book: "bet9ja" });
  assert.strictEqual(ASK.convertTarget(ASK.CONVERT_ASK + "Bet9ja. Any bookie, any size."), "bet9ja");
  const b = bot();
  try {
    await b.send("🔁 Convert a code to Bet9ja");
    const ask = b.sent.filter((s) => s.method === "sendMessage").pop().body;
    assert.ok(ask.reply_markup.force_reply, "asks for the code");
    await b.send("/start convert");
    const pick = b.sent.filter((s) => s.method === "sendMessage").pop().body;
    assert.ok(pick.reply_markup.inline_keyboard.flat().some((k) => k.callback_data === "ct|betking"), "the link asks which bookie");
  } finally { b.done(); }
});

test("every tool is one tap from the menu and goes straight to its job", async () => {
  /* Owner, 19 Oct 2026: "all the tools should be easy to access ... less clicks and brainwork". */
  const labels = ASK.menuKeyboard("sporty").keyboard.flat().map((k) => k.text);
  for (const t of Object.values(ASK.TOOL)) assert.ok(labels.includes(t), t);
  assert.strictEqual(ASK.toolAsked(ASK.TOOL_ASK.trim + " Any bookie."), "trim");
  const b = bot();
  try {
    await b.send("✂️ Trim a code");
    assert.ok(b.sent.filter((s) => s.method === "sendMessage").pop().body.reply_markup.force_reply);
    await b.tg({ message: { message_id: 7, from: { id: 42 }, chat: { id: 42, type: "private" }, text: "HUW6YC",
      reply_to_message: { text: ASK.TOOL_ASK.trim + " Any bookie." } } });
    const last = b.sent.filter((s) => s.method === "sendMessage").pop().body;
    assert.match(last.text, /To what odds/);
    assert.ok(last.reply_markup.inline_keyboard.flat().some((k) => /^tq\|/.test(k.callback_data)), "the trim choices, at once");
  } finally { b.done(); }
});
