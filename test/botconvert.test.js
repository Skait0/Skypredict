"use strict";
/* The converter in the Telegram bot (lib/convert.js, api/tg.js). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const C = require("../lib/convert.js");

const KO = Date.parse("2026-09-25T18:45:00Z");
const leg = (home, away, prediction, kickoff) => ({ home, away, prediction, kickoff: kickoff == null ? KO : kickoff });

test("the bot's matcher is the site's matcher, byte for byte", () => {
  /* lib/teammatch.js is generated from index.html; this fails the moment the
     page's matcher changes and `node scripts/mkteammatch.js` was not re-run. */
  const { build } = require("../scripts/mkteammatch.js");
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.strictEqual(fs.readFileSync(path.join(__dirname, "..", "lib", "teammatch.js"), "utf8"), build(src),
    "lib/teammatch.js is stale - run: node scripts/mkteammatch.js");
});

test("four feeds read into one shape", () => {
  const sporty = C.events("sporty", { matches: [{ eventId: "sr:1", homeTeam: "Arsenal", awayTeam: "Leeds United", startTime: KO }] });
  assert.deepStrictEqual(sporty[0], { id: "sr:1", home: "Arsenal", away: "Leeds United", ko: KO });
  const b9 = C.events("bet9ja", { matches: { 7: { eventId: 7, teams: "Italy - Belgium", kickoff: "2026-09-25T18:45:00Z" } } });
  assert.deepStrictEqual(b9[0], { id: 7, home: "Italy", away: "Belgium", ko: KO });
});

test("a long bookmaker name pairs with the target book's short one, at the same kickoff only", () => {
  const evs = [{ id: 1, home: "Inverness CT", away: "Greenock Morton", ko: KO },
               { id: 2, home: "Raith Rovers", away: "Livingston", ko: KO }];
  assert.strictEqual(C.pair(evs, leg("Inverness Caledonian Thistle FC", "Greenock Morton FC", "1X")).id, 1);
  assert.strictEqual(C.pair(evs, leg("Raith Rovers FC", "Livingston FC", "1X")).id, 2);
  assert.strictEqual(C.pair(evs, leg("Raith Rovers FC", "Livingston FC", "1X", KO + 3 * 864e5)), null,
    "same clubs three days later is another game");
});

test("the plan: started games and unknown games stay behind, whole lines move in the punter's favour", () => {
  const evs = [{ id: 1, home: "Arsenal", away: "Leeds", ko: KO }, { id: 2, home: "Italy", away: "Belgium", ko: KO }];
  const p = C.plan([
    leg("Arsenal", "Leeds", "OVER_2"),                  // whole line -> 1.5 at a book without whole lines
    leg("Italy", "Belgium", "1X"),
    leg("Nowhere", "Town", "1"),
    leg("Italy", "Belgium", "1", KO - 1000),            // already started
  ], "bet9ja", evs, KO - 500);
  assert.deepStrictEqual(p.picks.map((x) => [x.eventId, x.code]), [[1, "OVER_1.5"], [2, "1X"]]);
  assert.deepStrictEqual(p.changed.map((c) => c.from + ">" + c.to), ["OVER_2>OVER_1.5"]);
  assert.deepStrictEqual(p.stuck.map((s) => s.why).sort(), ["Bet9ja doesn't list this game", "already started"]);
  /* SportyBet sells whole lines, so nothing moves there. */
  assert.strictEqual(C.plan([leg("Arsenal", "Leeds", "OVER_2")], "sporty", evs, KO - 60000).picks[0].code, "OVER_2");
  assert.strictEqual(C.ahReline("AH_2_-1"), "AH_2_-1.5");
  assert.strictEqual(C.ahReline("AH_1_-1"), "AH_1_-0.5");
});

/* ------------------------------------------------------------ the button */

function botWith(stubs) {
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  const sent = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) {
      sent.push({ method: String(url).split("/").pop(), body: JSON.parse(init.body) });
      return { json: async () => ({ ok: true, result: {} }) };
    }
    return stubs.fetch(url, init);
  };
  const SB = require("../lib/supabase.js");
  const saved = { count: SB.countBookings, record: SB.recordBooking };
  SB.countBookings = stubs.count; SB.recordBooking = stubs.record || (async () => ({ ok: true }));
  delete require.cache[require.resolve("../api/tg.js")];
  const tg = require("../api/tg.js");
  const done = () => { global.fetch = realFetch; SB.countBookings = saved.count; SB.recordBooking = saved.record;
    delete process.env.TELEGRAM_BOT_TOKEN; };
  const tap = (data) => tg({ method: "POST", headers: { "x-telegram-bot-api-secret-token": tg.secretFor("123:abc") },
    body: { callback_query: { id: "q1", data, from: { id: 42 }, message: { message_id: 9, chat: { id: 42, type: "private" } } } } },
    { status() { return this; }, json() { return this; } });
  return { sent, tap, done };
}

test("past five conversions a day the bot sends people to the site, and books nothing", async () => {
  let booked = false;
  const b = botWith({ count: async () => ({ ok: true, n: 5 }),
    fetch: async () => { booked = true; return { json: async () => ({}) }; } });
  try {
    await b.tap("cv|bet9ja|sporty|RQWKNC");
    const msg = b.sent.find((s) => s.method === "sendMessage");
    assert.match(msg.body.text, /your 5 conversions for today/);
    assert.match(msg.body.text, /soccerwizard\.live/);
    assert.strictEqual(booked, false, "no read, no booking once the cap is reached");
  } finally { b.done(); }
});

test("a tap that is not a conversion is ignored", async () => {
  const b = botWith({ count: async () => { throw new Error("must not count"); }, fetch: async () => ({ json: async () => ({}) }) });
  try {
    await b.tap("cv|nowhere|sporty|RQWKNC");
    await b.tap("cv|bet9ja|sporty|<script>");
    assert.deepStrictEqual(b.sent.filter((s) => s.method === "sendMessage"), []);
  } finally { b.done(); }
});
