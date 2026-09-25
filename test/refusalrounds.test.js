"use strict";

/**
 * A refused slip keeps narrowing until it books, not just once.
 *
 * Reported 24 Sep: a 23-leg slider slip. SportyBet refused it and named
 * nothing, the page offered to drop the two legs without a real SportyBet
 * price ("SportyBet can't take 2 of these"), the reader agreed - and the
 * retry was refused too, showing "invalid event data, no market there". Both
 * booking functions narrowed exactly once (`!retried`), so the second answer,
 * which the server can now name, had nowhere to go.
 *
 * These run the real doBook and dropUnbookable against a scripted bookmaker,
 * so they test the path a reader takes, not strings in the source.
 */

const test = require("node:test");
const assert = require("node:assert");
const BOOKS = require("./books.js");
const { src, fn } = BOOKS;

const ROUNDS = +src.match(/var REFUSAL_ROUNDS=(\d+);/)[1];
/* What dropUnbookable and the name lists call to say why a leg was refused. */
const WHY = () => "var REFUSAL_WHY={};\n" + fn("refusalWhy") + "\n" + fn("whyOf") + "\n";

/* `answer(sel)` plays the bookmaker: return a response body for the legs sent. */
function harness(answer) {
  const els = {};
  const $ = (id) => (els[id] = els[id] || {
    innerHTML: "", hidden: false, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    querySelector() { return { addEventListener() {} }; }, querySelectorAll() { return []; },
    setAttribute() {}, removeAttribute() {}, style: {} });
  const log = { sent: [], prompts: [], code: null, error: null };
  let finish;
  const done = new Promise((r) => { finish = r; });
  const stubs = {
    $, BUILD: {}, renderBuilder() {}, totalOdds: () => 2, rememberSlip() {},
    bookFetch(sel) { log.sent.push(sel.map((s) => s.eventId)); return Promise.resolve(answer(sel)); },
    showCode(code) { log.code = code; finish(); },
    bookErrHTML(d) { log.error = (d && d.detail) || "error"; finish(); return "err"; },
    confirmAfterRefusal(target, names, keep, B, go) {
      log.prompts.push(names.slice()); setImmediate(go);           // the reader taps "Book the other"
    },
  };
  const names = Object.keys(stubs);
  const body =
    "function fixtureById(){return null;}\n" + BOOKS.prelude("sporty") +
    "\nvar REFUSAL_ROUNDS=" + ROUNDS + ";\n" + WHY() + fn("dropUnbookable") + "\n" + fn("doBook") +
    "\nreturn doBook;";
  const doBook = new Function(...names, body)(...names.map((k) => stubs[k]));
  return { doBook, log, done };
}

/* Leg i on event "e<i>". `real` false means our copy of SportyBet's card has
   no price for that market - the legs the fallback offers to drop. */
function leg(i, real) {
  return { id: "id" + i, code: "1X", p: 0.8, eventId: "e" + i,
           f: { home: "H" + i, away: "A" + i, sportyEventId: "e" + i,
                sportyOdds: real ? { "1X": 1.3 } : {} } };
}
const refuse = (extra) => Object.assign(
  { success: false, message: "SportyBet rejected the slip",
    detail: "invalid event data, no market there" }, extra || {});

test("the 24 Sep slip: a nameless refusal, then a named one, then a code", async () => {
  const picks = [];
  for (let i = 0; i < 10; i++) picks.push(leg(i, i !== 3 && i !== 7));
  const dead = new Set(["e3", "e7", "e5"]);                      // e5 carries a real price and is still refused
  let round = 0;
  const h = harness((sel) => {
    round++;
    const ids = sel.map((s) => s.eventId);
    if (!ids.some((e) => dead.has(e))) return { success: true, booking_code: "GOOD1" };
    if (round === 1) return refuse();                            // probe ran out: names nothing
    return refuse({ unbookable: ids.filter((e) => dead.has(e))
      .map((e) => ({ eventId: e, prediction: "1X", reason: "refused_alone" })) });
  });
  h.doBook(picks);
  await h.done;
  assert.strictEqual(h.log.error, null, "it must not end on the raw refusal");
  assert.strictEqual(h.log.code, "GOOD1");
  assert.strictEqual(h.log.prompts.length, 2, "asked once per narrowing, never silently");
  assert.deepStrictEqual(h.log.sent[h.log.sent.length - 1].sort(),
    ["e0", "e1", "e2", "e4", "e6", "e8", "e9"]);
});

test("every round drops at least one leg, and the rounds are bounded", async () => {
  /* A bookmaker that names one more leg every time and never takes the slip.
     The page must stop after REFUSAL_ROUNDS narrowings with a plain error,
     not ask forever. */
  const picks = [];
  for (let i = 0; i < 12; i++) picks.push(leg(i, true));
  const h = harness((sel) => refuse({ unbookable: [
    { eventId: sel[0].eventId, prediction: "1X", reason: "refused_alone" }] }));
  h.doBook(picks);
  await h.done;
  assert.ok(h.log.error, "ends on an error");
  assert.strictEqual(h.log.prompts.length, ROUNDS);
  for (let k = 1; k < h.log.sent.length; k++)
    assert.ok(h.log.sent[k].length < h.log.sent[k - 1].length, "each round is shorter");
});

test("a refusal that cannot be narrowed ends at once", async () => {
  const picks = [leg(0, true), leg(1, true)];
  const h = harness(() => refuse());                             // names nothing, all legs real
  h.doBook(picks);
  await h.done;
  assert.ok(h.log.error);
  assert.strictEqual(h.log.prompts.length, 0, "nothing to offer, so nothing is asked");
  assert.strictEqual(h.log.sent.length, 1);
});

test("My slip narrows the same way, and the slip itself follows each round", async () => {
  const picks = [];
  for (let i = 0; i < 8; i++) picks.push(leg(i, i !== 2));
  const dead = new Set(["e2", "e6"]);
  let round = 0;
  const els = {};
  const $ = (id) => (els[id] = els[id] || { innerHTML: "", disabled: false, textContent: "",
    classList: { contains() { return false; } } });
  const log = { sent: [], prompts: 0, code: null, error: null, slip: null };
  let finish; const done = new Promise((r) => { finish = r; });
  const stubs = {
    $, saveMy() {}, renderFab() {}, renderMySheet() {}, resetMyBookBtn() {}, rememberSlip() {},
    legOdd: () => 1.3,
    bookFetch(sel) {
      round++; const ids = sel.map((s) => s.eventId); log.sent.push(ids);
      if (!ids.some((e) => dead.has(e))) return Promise.resolve({ success: true, booking_code: "MY1" });
      if (round === 1) return Promise.resolve(refuse());
      return Promise.resolve(refuse({ unbookable: ids.filter((e) => dead.has(e))
        .map((e) => ({ eventId: e, prediction: "1X", reason: "refused_alone" })) }));
    },
    showCode(code) { log.code = code; finish(); },
    bookErrHTML(d) { log.error = (d && d.detail) || "error"; finish(); return "err"; },
    confirmAfterRefusal(t, names, keep, B, go) { log.prompts++; setImmediate(go); },
  };
  const names = Object.keys(stubs);
  const body =
    "var PICKS=arguments[arguments.length-1];" +
    "function fixtureById(id){for(var i=0;i<PICKS.length;i++)if(PICKS[i].id===id)return PICKS[i].f;return null;}\n" +
    BOOKS.prelude("sporty") +
    "\nvar REFUSAL_ROUNDS=" + ROUNDS + ";var MYBOOK_GEN=0;" +
    "var MYSLIP=PICKS.map(function(c){return {id:c.id,code:c.code,via:'slider'};});\n" +
    WHY() + fn("dropUnbookable") + "\n" + fn("doBookMy") +
    "\nreturn {go:doBookMy, slip:function(){return MYSLIP;}};";
  const api = new Function(...names, body)(...names.map((k) => stubs[k]), picks);
  api.go(picks);
  await done;
  assert.strictEqual(log.error, null, "must not end on the raw refusal");
  assert.strictEqual(log.code, "MY1");
  assert.strictEqual(log.prompts, 2);
  assert.deepStrictEqual(api.slip().map((x) => x.id).sort(),
    ["id0", "id1", "id3", "id4", "id5", "id7"], "the refused legs leave the slip, the rest stay");
});

test("the converter and the board share the loop: betPawa refuses one of 16, the other 15 book", async () => {
  /* 24 Sep: converting HUW6YC to betPawa ended on "no market there for 1 of
     16 picks" with no way forward, and the button stuck on "Booking…". */
  const picks = [];
  for (let i = 0; i < 16; i++) picks.push(leg(i, true));
  const log = { sent: [], prompts: 0, code: null, sentPicks: null, fail: null, busy: 0, idle: 0 };
  let finish; const done = new Promise((r) => { finish = r; });
  const stubs = {
    $: () => ({ innerHTML: "" }),
    bookFetch(sel) {
      const ids = sel.map((s) => s.eventId); log.sent.push(ids);
      if (!ids.includes("e9")) return Promise.resolve({ success: true, booking_code: "PAWA1" });
      return Promise.resolve(refuse({ detail: "no market there for 1 of 16 picks",
        unbookable: [{ eventId: "e9", prediction: "1X", reason: "refused_alone" }] }));
    },
    confirmAfterRefusal(t, names, keep, B, go) { log.prompts++; log.names = names; setImmediate(go); },
  };
  const names = Object.keys(stubs);
  const body = "function fixtureById(){return null;}\n" + BOOKS.prelude("sporty") +
    "\nvar REFUSAL_ROUNDS=" + ROUNDS + ";\n" + WHY() + fn("dropUnbookable") + "\n" + fn("bookRounds") +
    "\nreturn function(p,src,t,h){ return bookRounds(p,BOOKS.sporty,src,t,h); };";
  const bookRounds = new Function(...names, body)(...names.map((k) => stubs[k]));
  bookRounds(picks, "convert", "byoConvOut", {
    busy() { log.busy++; }, idle() { log.idle++; },
    code(code, sent) { log.code = code; log.sentPicks = sent; finish(); },
    fail(d) { log.fail = d; finish(); },
  });
  await done;
  assert.strictEqual(log.fail, null, "must not end on the refusal");
  assert.strictEqual(log.code, "PAWA1");
  assert.strictEqual(log.prompts, 1);
  assert.deepStrictEqual(log.names, ["H9 v A9"], "the refused game is named");
  assert.strictEqual(log.sentPicks.length, 15, "the code is filed as what was booked");
  assert.strictEqual(log.busy, log.idle, "every Booking… is undone, success included");
});
