"use strict";

/**
 * The converter's edit tools recover from a refusal the way Book does.
 *
 * Reported 5 Oct 2026, reproduced on a fresh 8-leg SportyBet code: "Make it
 * safer" -> "Apply and get a code" ended on "SportyBet wouldn't take this
 * slip. invalid event data, no market there" with a lone OK. The API had
 * named the four refused legs (`unbookable`), and Book would have offered to
 * drop them - but Apply and Split called bookFetch directly and showed the raw
 * error. These run the shipped bookRounds, dropUnbookable, bookLegs and
 * splitAndBook against a scripted bookmaker.
 */

const test = require("node:test");
const assert = require("node:assert");
const BOOKS = require("./books.js");
const { src, fn } = BOOKS;

const ROUNDS = +src.match(/var REFUSAL_ROUNDS=(\d+);/)[1];
/* Lifted when it exists, so a missing helper fails an assertion below rather
   than the whole file at load. */
const opt = (name) => { try { return fn(name) + "\n"; } catch (e) { return ""; } };

const refuse = (extra) => Object.assign(
  { success: false, message: "SportyBet rejected the slip",
    detail: "invalid event data, no market there", _kind: "refused" }, extra || {});
const named = (ids) => refuse({ detail: "no market there for " + ids.length + " picks",
  unbookable: ids.map((e) => ({ eventId: e, prediction: "1X", reason: "not_mapped" })) });

/* A converter leg: what the code reader hands the editor. */
function cleg(i, extra) {
  return Object.assign({ eventId: "e" + i, prediction: "1X", home: "H" + i, away: "A" + i,
    odds: 1.5 }, extra || {});
}

/* `answer(ids)` plays the bookmaker. `ask` plays the reader at the refusal
   pop-up: "go" books the rest, "stop" keeps editing. */
function harness(answer, ask, matchFixture) {
  const log = { sent: [], asks: [], codes: [], errs: [], toasts: [], split: null };
  const els = { byoSaferOut: { innerHTML: "" }, ttOut: { innerHTML: "" } };
  const stubs = {
    $: (id) => els[id] || null,
    bookFetch(sel) {
      const ids = sel.map((s) => s.eventId); log.sent.push(ids);
      return Promise.resolve(answer(ids));
    },
    confirmAfterRefusal(target, names, keep, B, go, refused, h) {
      log.asks.push({ target, names: names.slice(), h });
      setImmediate(() => ((ask || "go") === "go" ? go([]) : h.stop()));
    },
    showCode(code, host, save, B, sent) { log.codes.push({ code, host, sent: sent.length }); },
    __sbe(target, html, label) { log.errs.push({ target, html, label }); },
    swToast(msg) { log.toasts.push(msg); },
    renderSplit(out, done) { log.split = done; },
    bookErrText: null,
    fixtureByLeg: (l) => (matchFixture ? matchFixture(l) : null), fid: () => "f", mProb: () => null,
    esc: (s) => String(s), mLabel: (f, c) => c, isUpcoming: () => true,
  };
  const names = Object.keys(stubs);
  const body =
    "function fixtureById(){return null;}\n" + BOOKS.prelude("sporty") +
    "showBookErr=__sbe;\n" +
    /* The split's one-line reason: the card's text, without the DOM. */
    "bookErrText=function(d,B){return (typeof editErrHTML==='function'?editErrHTML:bookErrHTML)(d,B)" +
    ".replace(/<[^>]+>/g,'');};\n" +
    "var REFUSAL_ROUNDS=" + ROUNDS + ";var REFUSAL_WHY={};\n" +
    "function lineCheck(){ return false; }\n" +
    fn("refusalWhy") + fn("whyOf") + fn("dropUnbookable") + fn("notStarted") + fn("legStarted") +
    opt("pickStarted") + opt("editErrHTML") + fn("bookReason") + fn("bookErrHTML") +
    fn("bookRounds") + fn("legPick") + fn("bookLegs") + fn("splitPicks") + fn("splitAndBook") +
    "\nreturn {bookLegs:bookLegs, splitAndBook:splitAndBook, legPick:legPick, bookRounds:bookRounds, B:BOOKS.sporty};";
  const api = new Function(...names, body)(...names.map((k) => stubs[k]));
  return { api, log };
}
const tick = () => new Promise((r) => setTimeout(r, 20));
const btn = () => ({ disabled: false, textContent: "Apply and get a code" });

/* ------------------------------------------------------------- Apply */

test("Apply books through the shared refusal loop, not a bare bookFetch", () => {
  const w = fn("wireSafer");
  assert.doesNotMatch(w, /bookFetch\(/, "a bare bookFetch is the dead end that was reported");
  assert.match(w, /bookLegs\(sent,B,"editor","byoSaferOut",go,"Apply and get a code",/,
    "the same path Trim and Change use");
  assert.match(w, /BYO\._booking=true;/, "the panel stays busy for the whole flight");
  assert.match(w, /BYO\._booking=false;/);
});

test("Apply: named refusals are asked about, then the survivors book", async () => {
  /* The reported shape: 8 legs, 4 named. */
  const dead = new Set(["e1", "e3", "e5", "e7"]);
  const h = harness((ids) => (ids.some((e) => dead.has(e))
    ? named(ids.filter((e) => dead.has(e))) : { success: true, booking_code: "SAFE1" }));
  const legs = []; for (let i = 0; i < 8; i++) legs.push(cleg(i));
  let ended = 0;
  h.api.bookLegs(legs, BOOKS_SPORTY(h), "editor", "byoSaferOut", btn(), "Apply and get a code",
    () => { ended++; });
  await tick();
  assert.strictEqual(h.log.asks.length, 1, "asked once, never silently shortened");
  assert.strictEqual(h.log.asks[0].names.length, 4, "the four refused games are named");
  assert.strictEqual(h.log.asks[0].h.stopLabel, "Keep editing");
  assert.deepStrictEqual(h.log.sent[1], ["e0", "e2", "e4", "e6"], "the retry sends the survivors");
  assert.deepStrictEqual(h.log.codes, [{ code: "SAFE1", host: "byoSaferOut", sent: 4 }]);
  assert.strictEqual(ended, 1, "the busy flag is cleared once");
});

test("Apply: Keep editing closes the question and leaves the editor as it was", async () => {
  const h = harness((ids) => named([ids[0]]), "stop");
  const b = btn(); let ended = 0;
  h.api.bookLegs([cleg(0), cleg(1), cleg(2)], BOOKS_SPORTY(h), "editor", "byoSaferOut", b,
    "Apply and get a code", () => { ended++; });
  await tick();
  assert.strictEqual(h.log.sent.length, 1, "nothing booked after Keep editing");
  assert.strictEqual(h.log.errs.length, 0, "and no error card over the editor");
  assert.strictEqual(ended, 1, "busy flag cleared");
  assert.strictEqual(b.disabled, false);
  assert.strictEqual(b.textContent, "Apply and get a code");
});

/* ------------------------------------------- nothing bookable: no lone OK */

test("an all-refused or nameless refusal ends on Keep editing, not a bare OK", async () => {
  for (const answer of [(ids) => named(ids), () => refuse()]) {
    const h = harness(answer);
    h.api.bookLegs([cleg(0), cleg(1)], BOOKS_SPORTY(h), "trim", "ttOut", btn(), "Book 2");
    await tick();
    assert.strictEqual(h.log.asks.length, 0, "nothing left to offer, so nothing is asked");
    assert.strictEqual(h.log.errs.length, 1);
    assert.strictEqual(h.log.errs[0].label, "Keep editing");
    assert.match(h.log.errs[0].html, /won't take this slip as it is - usually a market they don't offer on one of these games/);
    assert.match(h.log.errs[0].html, /class='code-err'/);
  }
  /* And showBookErr draws the label it is given, OK only by default. */
  const s = fn("showBookErr");
  assert.match(s, /\(label\|\|"OK"\)/);
});

test("the refusal pop-up's cancel can say Keep editing and hand control back", () => {
  const c = fn("confirmAfterRefusal");
  assert.match(c, /\(h&&h\.stopLabel\)\|\|"Cancel"/);
  assert.match(c, /if\(h&&h\.stop\) h\.stop\(\);/);
  assert.match(fn("bookRounds"), /\},gone,h\);/, "bookRounds hands its hooks to the pop-up");
});

/* ------------------------------------------------------------- Split */

test("Split: a refused ticket gets the same recovery, the other tickets still show", async () => {
  const h = harness((ids) => (ids.includes("e2") ? named(["e2"])
    : { success: true, booking_code: "T" + ids.join("") }));
  const out = { innerHTML: "", querySelector: () => null };
  const host = { innerHTML: "", querySelector: () => out };
  const legs = []; for (let i = 0; i < 6; i++) legs.push(cleg(i));
  h.api.splitAndBook(legs, 2, host, BOOKS_SPORTY(h),
    { pickOf: (l, B) => legPickOf(h, l, B), oddsOf: () => 2 });
  await tick();
  assert.strictEqual(h.log.asks.length, 1, "the refused ticket asks");
  assert.deepStrictEqual(h.log.asks[0].names, ["One pick"]);
  assert.ok(h.log.split, "the split finished");
  assert.deepStrictEqual(h.log.split.map((t) => t.code), ["Te0e4", "Te1e3e5"]);
  assert.strictEqual(h.log.split[0].legs.length, 2, "the ticket is described by what booked");
});

test("Split: Keep editing on one ticket leaves it unbooked and books the rest", async () => {
  const h = harness((ids) => (ids.includes("e0") ? named(["e0"])
    : { success: true, booking_code: "OK" }), "stop");
  const out = { innerHTML: "", querySelector: () => null };
  const host = { innerHTML: "", querySelector: () => out };
  h.api.splitAndBook([cleg(0), cleg(1), cleg(2), cleg(3)], 2, host, BOOKS_SPORTY(h),
    { pickOf: (l, B) => legPickOf(h, l, B), oddsOf: () => 2 });
  await tick();
  assert.deepStrictEqual(h.log.split.map((t) => t.code), [null, "OK"]);
  assert.ok(h.log.split[0].why, "the unbooked ticket says why");
});

test("the trim's drop buttons and the editor's split book the pasted legs as picks", () => {
  assert.match(fn("wireTrim"), /pickOf:legPick/);
  assert.match(src, /wireSplit\(st,usable,B,\{sel:"#byoSplit",pickOf:legPick,oddsOf:byoOdds\}\)/);
  assert.doesNotMatch(fn("splitAndBook"), /bookFetch\(/, "never a bare bookFetch");
});

/* ------------------------------------------------------- started games */

const PAST = Date.now() - 3600e3, SOON = Date.now() + 3600e3;

test("games that have kicked off are left out before booking, and the reader is told", async () => {
  const h = harness(() => ({ success: true, booking_code: "LIVE1" }));
  h.api.bookLegs([cleg(0, { kickoff: PAST }), cleg(1, { kickoff: SOON }),
    cleg(2, { status: "H1" }), cleg(3, { kickoff: SOON })],
    BOOKS_SPORTY(h), "change", "ttOut", btn(), "Book");
  await tick();
  assert.deepStrictEqual(h.log.sent, [["e1", "e3"]]);
  assert.deepStrictEqual(h.log.toasts, ["2 games already started - left out."]);
  assert.strictEqual(h.log.codes[0].sent, 2);
});

test("an all-started slip never calls the bookmaker", async () => {
  const h = harness(() => { throw new Error("must not be asked"); });
  h.api.bookLegs([cleg(0, { kickoff: PAST }), cleg(1, { status: "ENDED" })],
    BOOKS_SPORTY(h), "editor", "byoSaferOut", btn(), "Apply and get a code");
  await tick();
  assert.strictEqual(h.log.sent.length, 0);
  assert.strictEqual(h.log.errs.length, 1);
  assert.match(h.log.errs[0].html, /Every game on this code has started - nothing left to book\./);
  assert.strictEqual(h.log.errs[0].label, "Keep editing");
});

test("a split of started games books nothing either", async () => {
  const h = harness(() => { throw new Error("must not be asked"); });
  const out = { innerHTML: "", querySelector: () => null };
  const host = { innerHTML: "", querySelector: () => out };
  h.api.splitAndBook([cleg(0, { kickoff: PAST }), cleg(1, { kickoff: PAST }),
    cleg(2, { kickoff: PAST }), cleg(3, { kickoff: PAST })], 2, host, BOOKS_SPORTY(h),
    { pickOf: (l, B) => legPickOf(h, l, B), oddsOf: () => 2 });
  await tick();
  assert.strictEqual(h.log.sent.length, 0);
  assert.deepStrictEqual(h.log.split.map((t) => t.code), [null, null]);
  assert.match(h.log.split[0].why, /has started/);
});

/* The harness's own BOOKS.sporty and legPick, lifted from the page. */
function BOOKS_SPORTY(h) { return h.api.B; }
function legPickOf(h, l, B) { return h.api.legPick(l, B); }

/* ------------------------------------------------------- review fixes */

test("Apply ignores a second tap while the first is still booking", () => {
  /* lineCheck can hold ~9 s before busy() greys the button; a second tap
     in that window booked twice. */
  const w = fn("wireSafer");
  const i = w.indexOf('go.addEventListener("click",function(){');
  assert.ok(i > 0);
  assert.match(w.slice(i, i + 80), /\{\s*if\(BYO\._booking\) return;/, "first thing the handler does");
  assert.match(w, /BYO\._booking=true; go\.disabled=true;\s*bookLegs\(sent,/, "greyed before bookLegs");
});

test("a wrongly matched fixture neither changes the id sent nor marks a future leg started", async () => {
  const h = harness(() => ({ success: true, booking_code: "OK" }), "go",
    /* Our name match landed on a different game, one that kicked off an hour ago. */
    () => ({ home: "H0", away: "A0", eventId: "other", kickoff: new Date(PAST).toISOString() }));
  h.api.bookLegs([cleg(0, { kickoff: SOON }), cleg(1, { kickoff: SOON })],
    BOOKS_SPORTY(h), "change", "ttOut", btn(), "Book");
  await tick();
  assert.deepStrictEqual(h.log.sent, [["e0", "e1"]], "kept, under the pasted eventId");
  assert.deepStrictEqual(h.log.toasts, []);
});

test("the leg's own kickoff wins over a matching fixture's clock", async () => {
  const h = harness(() => ({ success: true, booking_code: "OK" }), "go",
    (l) => ({ home: l.home, away: l.away, eventId: l.eventId, kickoff: new Date(PAST).toISOString() }));
  h.api.bookLegs([cleg(0, { kickoff: SOON })], BOOKS_SPORTY(h), "change", "ttOut", btn(), "Book");
  await tick();
  assert.deepStrictEqual(h.log.sent, [["e0"]]);
});

test("a kickoff of 0, false or empty is unknown, and the leg is kept", async () => {
  const h = harness(() => ({ success: true, booking_code: "OK" }));
  h.api.bookLegs([cleg(0, { kickoff: 0 }), cleg(1, { kickoff: false }), cleg(2, { kickoff: "" })],
    BOOKS_SPORTY(h), "change", "ttOut", btn(), "Book");
  await tick();
  assert.deepStrictEqual(h.log.sent, [["e0", "e1", "e2"]]);
});

test("an all-started slip puts the button back", async () => {
  const h = harness(() => { throw new Error("must not be asked"); });
  const b = btn(); let idle = 0;
  const pick = h.api.legPick(cleg(0, { kickoff: PAST }), BOOKS_SPORTY(h));
  h.api.bookRounds([pick], BOOKS_SPORTY(h), "editor", "byoSaferOut", {
    dropStarted: true, busy() {}, idle() { idle++; }, code() {}, fail() {} });
  await tick();
  assert.strictEqual(idle, 1, "idle() runs, so nothing is left on Working…");
  assert.strictEqual(h.log.sent.length, 0);
});

test("paths that did not ask for it book started legs exactly as before", async () => {
  /* Scope ruling: the board's Book, Book all, Slip of the day, conversion and
     the code dialog's Make it safer are unchanged. */
  const h = harness(() => ({ success: true, booking_code: "OK" }));
  const picks = [cleg(0, { kickoff: PAST }), cleg(1, { kickoff: SOON })]
    .map((l) => h.api.legPick(l, BOOKS_SPORTY(h)));
  let code = null;
  h.api.bookRounds(picks, BOOKS_SPORTY(h), "board", "bookResult", {
    busy() {}, idle() {}, code(c) { code = c; }, fail() {} });
  await tick();
  assert.deepStrictEqual(h.log.sent, [["e0", "e1"]]);
  assert.strictEqual(code, "OK");
  assert.deepStrictEqual(h.log.toasts, []);
  for (const caller of ["bookLegs", "splitAndBook"])
    assert.match(fn(caller), /dropStarted:true/, caller + " asks for the filter");
  assert.strictEqual((src.match(/dropStarted:true/g) || []).length, 2, "and nobody else does");
});
