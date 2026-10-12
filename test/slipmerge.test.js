"use strict";
/* SEVERAL BOOKING CODES INTO ONE SLIP.
 *
 * The splitter deals one slip out into several tickets; this is the same road
 * travelled backwards, and it was asked for by the same kind of reader - three
 * codes from three friends, one ticket wanted. It is deliberately NOT a second
 * machine: the read appends to a list of legs, and everything after it (edit,
 * convert, split, book, the cap) is the code that already handles a slip.
 *
 * So what is worth pinning here is the part a merge alone can get wrong: which
 * codes are accepted, and what happens to two codes holding the same game.
 * A betslip takes one selection per match, so a merge that kept both would
 * hand somebody a ticket the bookmaker is certain to refuse.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(n) {
  const i = src.search(new RegExp("(?:^|\\n)function " + n + "\\s*\\(", "m"));
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const api = new Function(grab("byoCodes") + grab("byoMerge") +
  "return {codes:byoCodes,merge:byoMerge};")();

test("the box reads however many codes were pasted into it", () => {
  assert.deepEqual(api.codes("ABC123"), ["ABC123"]);
  /* However somebody separates them. They arrive out of a chat app, so commas,
     newlines and double spaces are all likelier than the tidy single space. */
  assert.deepEqual(api.codes("ABC123 DEF456"), ["ABC123", "DEF456"]);
  assert.deepEqual(api.codes("abc123,def456\nGHI789"), ["ABC123", "DEF456", "GHI789"]);
  assert.deepEqual(api.codes("  ABC123 ,, DEF456  "), ["ABC123", "DEF456"]);
  /* The same code twice is one read, not two - it would only clash with
     itself and cost a round trip to prove it. */
  assert.deepEqual(api.codes("ABC123 abc123"), ["ABC123"]);
  assert.deepEqual(api.codes("   "), []);
});

test("a game already on the slip is dropped rather than booked into a refusal", () => {
  const leg = (id, code) => ({ eventId: id, prediction: code, home: "A", away: "B" });
  const m = api.merge([
    [leg("sr:match:1", "1"), leg("sr:match:2", "OVER_1.5")],
    [leg("sr:match:2", "X2"), leg("sr:match:3", "GG")],
  ]);
  assert.deepEqual(m.legs.map((l) => l.eventId),
    ["sr:match:1", "sr:match:2", "sr:match:3"]);
  /* The FIRST code's version of that game survives, so the order the reader
     typed decides it rather than the order the reads happened to finish in. */
  assert.equal(m.legs[1].prediction, "OVER_1.5");
  /* And the one turned away is counted, because "24 games read, 23 on the
     slip" reads as a bug unless the page can say why. */
  assert.equal(m.clash, 1);
});

test("a leg with no event id is still placed by its teams", () => {
  /* Converted and pass-through legs do not all carry an id. Falling back to
     the two names keeps one-per-match true for them instead of letting a
     missing field wave two selections on one game through. */
  const m = api.merge([
    [{ home: "Arsenal", away: "Chelsea", prediction: "1" }],
    [{ home: "Arsenal", away: "Chelsea", prediction: "X2" }],
  ]);
  assert.equal(m.legs.length, 1);
  assert.equal(m.clash, 1);
});

test("the read is capped, and the cap is about the wait", () => {
  assert.match(src, /var BYO_MAX_CODES=6;/);
  /* One request at a time. A burst of reads is the shape of traffic that got
     this project block-paged once already, so the merge steps through them. */
  const many = grab("byoReadMany");
  assert.match(many, /step\(i\+1\);/, "the reads must be sequential");
  assert.doesNotMatch(many, /Promise\.all/, "a burst is exactly what this must not do");
  /* A code that will not read loses its own slip and nothing else. */
  assert.match(many, /if\(r\.ok\) lists\.push\(\{legs:r\.d\.legs\|\|\[\],book:r\.book\}\); else bad\.push/);
});

test("the input can hold more than one code", () => {
  /* It was maxlength=16 - one code exactly - so a second one could not be
     typed in and the feature would have been invisible however well it
     worked. */
  const inp = src.slice(src.indexOf('<input id="byoCode"'), src.indexOf('id="byoGo"'));
  assert.match(inp, /maxlength="110"/);
  assert.match(inp, /placeholder="A code, or a few from any bookies"/);
});

/* CODES FROM DIFFERENT BOOKS. Each code is read on the picked book first and
   only "no slip behind that code" sends it on, so a code from the picked book
   costs exactly one read, as it always did. */
function anyBook(answers) {
  const calls = [];
  const env = new Function("BOOKS", "BYO", "byoSlipFetch",
    "var BYO_LAST_FOREIGN=null;" + grab("byoReadAnyBook") +
    "return byoReadAnyBook;");
  const BOOKS = { sporty: {}, bet9ja: {}, betking: {}, betpawa: {}, onexbet: {} };
  const read = env(BOOKS, { book: "sporty" }, (code, book) => {
    calls.push(book);
    const a = answers[book] || { status: 404 };
    return Promise.resolve({ ok: !!a.ok, d: a.ok ? { success: true, legs: [] } : {}, status: a.status || 200 });
  });
  return { read, calls };
}

test("a code from the picked book is read once, as before", async () => {
  const t = anyBook({ sporty: { ok: true } });
  const r = await t.read("ABC123");
  assert.equal(r.book, "sporty");
  assert.deepEqual(t.calls, ["sporty"]);
});

test("a code from another book is found by asking the others in turn", async () => {
  const t = anyBook({ betking: { ok: true } });
  const r = await t.read("ABC123");
  assert.equal(r.ok, true);
  assert.equal(r.book, "betking");
  assert.deepEqual(t.calls, ["sporty", "bet9ja", "betking"]);
});

test("only 'not this book' moves on - a rate limit stops the search", async () => {
  /* Reads are rationed at twenty a minute; spending the rest of them on a
     search that cannot succeed would lock the reader out of their next paste. */
  const t = anyBook({ sporty: { status: 429 } });
  const r = await t.read("ABC123");
  assert.equal(r.ok, false);
  assert.deepEqual(t.calls, ["sporty"]);
});

/* Another book's legs land on the picked book through the converter's own
   lookup, keep their own price, and say where they came from. */
const bring = new Function("eventOnBook", "legStarted", "nearestLine", "mixReline",
  grab("byoBringOver") + "return byoBringOver;");

test("another book's legs are brought onto the picked book, or set aside with the reason", () => {
  const from = { key: "bet9ja", label: "Bet9ja" }, to = { key: "sporty", label: "SportyBet", wholeLines: true };
  const ids = { "A": "sr:match:1" };
  const fn = bring((l) => ({ f: null, id: ids[l.home] == null ? null : ids[l.home] }),
    (l) => !!l.started, () => null, () => null);
  const b = fn([
    { home: "A", away: "B", prediction: "1", eventId: "9ja-1", odds: "1.5" },
    { home: "C", away: "D", prediction: "GG", eventId: "9ja-2" },
    { home: "A", away: "B", prediction: "1", started: true },
    { home: "A", away: "B" },
  ], from, to);
  assert.equal(b.legs.length, 1);
  assert.equal(b.legs[0].eventId, "sr:match:1", "the picked book's id, not the source's");
  assert.equal(b.legs[0].odds, "1.5", "the price its own book printed");
  assert.equal(b.legs[0].fromBook, "bet9ja");
  assert.deepEqual(b.lost.map((x) => x.why), [
    "SportyBet doesn't list this game", "this game has already started", "a market we don't carry"]);
});

test("the converter and the merge share one lookup", () => {
  assert.match(grab("byoConversion"), /eventOnBook\(l,from,to\)/);
  assert.match(grab("byoBringOver"), /eventOnBook\(l,from,to\)/);
});
