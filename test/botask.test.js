"use strict";
/* THE BOT TAKES INSTRUCTIONS (owner, 28 Sep 2026, after SportyClaw): "trim to
 * 150 odds", "keep the best 10", "split into 2", "change all draws to under
 * 2.5", "convert to Bet9ja", "book me today's 5 safest". lib/ask.js reads the
 * words, lib/slipedit.js (generated from index.html) does the edit, api/tg.js
 * books it. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const D = require("../lib/doctor.js");
const A = require("../lib/ask.js");
const S = require("../lib/slipedit.js");

test("lib/slipedit.js is the converter's own code, byte for byte", () => {
  const { build } = require("../scripts/mkslipedit.js");
  const lf = (s) => s.replace(/\r\n/g, "\n");
  const src = lf(fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8"));
  assert.strictEqual(lf(fs.readFileSync(path.join(__dirname, "..", "lib", "slipedit.js"), "utf8")), build(src),
    "lib/slipedit.js is stale - run: node scripts/mkslipedit.js");
});

test("what people type is read as what they mean", () => {
  const cases = [
    ["HZ6RL7\nGive me best 150odds from this code", "HZ6RL7", { kind: "trim", odds: 150 }],
    ["split HUW6YC into 3", "HUW6YC", { kind: "split", n: 3 }],     // not the 6 inside the code
    ["WJWX4Z x20", "WJWX4Z", { kind: "trim", odds: 20 }],           // not the x4 inside the code
    ["2 tickets 4DXED2", "4DXED2", { kind: "split", n: 2 }],
    ["change all draws to under 2.5 4DXED2", "4DXED2", { kind: "change", from: "draw", to: "u25" }],
    ["change the wins in RQWKNC to win or draw", "RQWKNC", { kind: "change", from: "win", to: "dc" }],
    ["change over 1.5 to over 2.5 in RQWKNC", "RQWKNC", { kind: "change", from: "o15", to: "o25" }],
    ["convert 881WZC to bet9ja", "881WZC", { kind: "convert", to: "bet9ja" }],
    ["XG3ZV5 keep 10 games", "XG3ZV5", { kind: "keep", games: 10 }],
    ["VLG7AK make it safer", "VLG7AK", { kind: "safer" }],
    ["RQWKNC", "RQWKNC", null],
    ["book me today's safest 5 games", null, { kind: "today", games: 5, odds: null, when: "today", book: null }],
    ["tomorrow 10 odds on betpawa", null, { kind: "today", games: null, odds: 10, when: "tomorrow", book: "betpawa" }],
    ["tomorrow 10 odds on 1xbet", null, { kind: "today", games: null, odds: 10, when: "tomorrow", book: "onexbet" }],
    ["convert 881WZC to 1xbet", "881WZC", { kind: "convert", to: "onexbet" }],
  ];
  for (const [text, code, want] of cases) {
    const p = D.parse(text);
    assert.strictEqual(p.code, code, "code in: " + text);
    assert.deepStrictEqual(A.parseAsk(text, p.code), want, text);
  }
});

test("an instruction's words are never taken for a booking code", () => {
  for (const t of ["trim this to around 150", "give me 150odds", "x150 please", "split into three", "tonight"])
    assert.strictEqual(D.parse(t).code, null, t);
  assert.strictEqual(D.parse("hz6rl7").code, "HZ6RL7", "a lone code in lower case is still a code");
});

test("trim keeps the likeliest legs until the target, and crosses it only when that is nearer", () => {
  const rows = [{ p: 0.9, odds: 1.2 }, { p: 0.8, odds: 1.5 }, { p: 0.7, odds: 2 }, { p: 0.5, odds: 3 }, { p: null, odds: null }];
  const r = S.trimToOdds(rows, 3.5);
  assert.deepStrictEqual(r.keep.map((x) => x.odds), [1.2, 1.5, 2], "x3.60 is nearer x3.5 than x1.80");
  assert.strictEqual(r.short, false);
  assert.ok(r.cut.some((x) => x.odds == null), "a leg with no price is never kept");
  const s = S.trimToOdds(rows, 1000);
  assert.strictEqual(s.short, true, "the whole slip does not reach x1000");
  assert.strictEqual(S.trimToOdds(rows, 1.9).keep.length, 2, "x1.80 is nearer x1.9 than x3.60");
});

test("a change moves only its own group, and follows the side", () => {
  const legs = [{ prediction: "1" }, { prediction: "2" }, { prediction: "X" }, { prediction: "OVER_2.5", odds: 1.8 }];
  const w = S.changeAllPlan(legs, "win", "dc");
  assert.deepStrictEqual(w.legs.map((l) => l.prediction), ["1X", "X2", "X", "OVER_2.5"]);
  assert.strictEqual(w.changed.length, 2);
  const o = S.changeAllPlan(legs, "o25", "u25");
  assert.strictEqual(o.legs[3].prediction, "UNDER_2.5");
  assert.strictEqual(o.legs[3].odds, null, "the old price does not travel to the new market");
  assert.strictEqual(legs[3].prediction, "OVER_2.5", "the original slip is not edited");
  assert.ok(!S.changeOptions(legs).some((x) => x.from === "gg"), "no option for a market the slip lacks");
});

test("today's safest: our highest tips still to come in the reader's day", () => {
  const now = Date.parse("2026-09-28T12:00:00Z");     // 13:00 in Lagos
  const fx = [
    { home: "A", away: "B", kickoff: "2026-09-28T15:00:00Z", tip: "1X, home or draw", tip_p: 0.9 },
    { home: "C", away: "D", kickoff: "2026-09-28T11:00:00Z", tip: "1X, home or draw", tip_p: 0.95 },   // started
    { home: "E", away: "F", kickoff: "2026-09-28T23:30:00Z", tip: "Over 1.5, goals", tip_p: 0.88 },   // 00:30 Lagos: tomorrow
    { home: "G", away: "H", kickoff: "2026-09-28T19:00:00Z", tip: "Away win, G", tip_p: 0.7 },
  ];
  const rows = A.planToday(fx, { when: "today", games: 5 }, now);
  assert.deepStrictEqual(rows.map((r) => r.leg.home), ["A", "G"]);
  assert.strictEqual(rows[1].leg.prediction, "2");
  assert.deepStrictEqual(A.planToday(fx, { when: "tomorrow", games: 5 }, now).map((r) => r.leg.home), ["E"]);
});

/* ---------------------------------------------------------- the webhook */
const KO = new Date(Date.now() + 864e5).toISOString();
const legsOf = (n) => Array.from({ length: n }, (_, i) => ({
  eventId: "sr:match:" + (100 + i), home: "H" + i, away: "A" + i, kickoff: KO,
  prediction: i % 4 === 0 ? "X" : "1X", odds: i % 4 === 0 ? 3.2 : 1.3 }));

function bot(opts) {
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  const sent = [], booked = [], recorded = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("api.telegram.org")) {
      sent.push({ method: u.split("/").pop(), body: JSON.parse(init.body) });
      return { json: async () => ({ ok: true, result: {} }) };
    }
    if (u.includes("/api/slip")) return { json: async () => ({ success: true, legs: opts.legs }) };
    if (u.endsWith("/predictions.json")) return { json: async () => ({ fixtures: [] }) };
    if (init && init.method === "POST") {
      const sel = JSON.parse(init.body).selections;
      booked.push(sel);
      return { json: async () => ({ success: true, booking_code: "NEW" + booked.length, odds: 42.5 }) };
    }
    return { json: async () => ({}) };
  };
  const SB = require("../lib/supabase.js");
  const saved = { count: SB.countBookings, record: SB.recordBooking };
  SB.countBookings = opts.count || (async () => ({ ok: true, n: 0 }));
  SB.recordBooking = async (s, d, src) => { recorded.push(src); return { ok: true }; };
  delete require.cache[require.resolve("../api/tg.js")];
  const tg = require("../api/tg.js");
  const send = (text, reply) => tg({ method: "POST", headers: { "x-telegram-bot-api-secret-token": tg.secretFor("123:abc") },
    body: { message: { message_id: 5, from: { id: 42 }, chat: { id: 42, type: "private" }, text,
      reply_to_message: reply ? { text: reply } : undefined } } },
    { status() { return this; }, json() { return this; } });
  const done = () => { global.fetch = realFetch; SB.countBookings = saved.count; SB.recordBooking = saved.record;
    delete process.env.TELEGRAM_BOT_TOKEN; };
  const texts = () => sent.filter((s) => s.method === "sendMessage").map((s) => s.body.text);
  return { send, done, booked, recorded, texts };
}

test("'HZ6RL7 give me best 150odds' books the likeliest games that reach it, at the same bookie", async () => {
  const b = bot({ legs: legsOf(40) });
  try {
    await b.send("HZ6RL7\nGive me best 150odds from this code");
    assert.strictEqual(b.booked.length, 1, "one code");
    const sel = b.booked[0];
    assert.ok(sel.length > 1 && sel.length < 40, "trimmed: " + sel.length);
    const orig = new Map(legsOf(40).map((l) => [l.eventId, l.prediction]));
    assert.ok(sel.every((s) => orig.get(s.eventId) === s.prediction), "same games, same markets, their own ids");
    const t = b.texts().join("\n");
    assert.match(t, /NEW1/);
    assert.match(t, /×42\.50/, "the book's own total");
    assert.match(t, /Dropped:/);
    assert.deepStrictEqual(b.recorded, ["tgbot"], "counted against the daily codes");
  } finally { b.done(); }
});

test("a reply to the bot's read acts on the code in it", async () => {
  const b = bot({ legs: legsOf(8) });
  try {
    await b.send("split into 2", "🔮 Wizard's Eye · SportyBet HUW6YC\n8 games · 8 we can read");
    assert.strictEqual(b.booked.length, 2, "two tickets");
    assert.deepStrictEqual(b.booked.map((s) => s.length), [4, 4]);
    assert.strictEqual(b.recorded.length, 2, "a split into two costs two");
  } finally { b.done(); }
});

test("'change all draws to under 2.5' changes the draws and nothing else", async () => {
  const b = bot({ legs: legsOf(8) });
  try {
    await b.send("change all draws to under 2.5 4DXED2");
    const sel = b.booked[0];
    assert.strictEqual(sel.filter((s) => s.prediction === "UNDER_2.5").length, 2);
    assert.strictEqual(sel.filter((s) => s.prediction === "1X").length, 6);
    assert.match(b.texts().join("\n"), /2 draws → under 2\.5/);
  } finally { b.done(); }
});

test("past the daily codes the bot sends people to the site and books nothing", async () => {
  const b = bot({ legs: legsOf(8), count: async () => ({ ok: true, n: 4 }) });
  try {
    await b.send("split HUW6YC into 3");
    assert.strictEqual(b.booked.length, 0, "three codes with one left");
    assert.match(b.texts().join("\n"), /soccerwizard\.live/);
  } finally { b.done(); }
});

test("a code with no instruction still gets the read", async () => {
  const b = bot({ legs: legsOf(4) });
  try {
    await b.send("RQWKNC");
    assert.strictEqual(b.booked.length, 0);
    assert.match(b.texts().join("\n"), /Wizard's Eye/);
  } finally { b.done(); }
});
