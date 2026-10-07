"use strict";

/* EVERY PLACE A BOOK IS NAMED, NAMES EVERY BOOK.
 *
 * Owner, 29 Sep 2026, after 1xBet shipped: "look everywhere on the website
 * where a bookie is and make sure 1xbet is there ... the share slip, the cards
 * for it". The sweep found surfaces the per-book checklist never listed, and
 * two of them were wrong for EARLIER books too:
 *   - the shared-slip page (lib/sliplink.js) knew SportyBet and Bet9ja only,
 *     so a BetKing, betPawa or 1xBet slip was labelled "SportyBet booking code"
 *     with an Open-in-SportyBet link that could not load it;
 *   - the push notification (public/sw.js) named three books of four;
 *   - the share-card image said "SportyBet code" whatever book booked it.
 * Each is pinned against the page's own BOOKS table, so the NEXT book fails
 * here until it is added rather than until a reader notices.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { src, decl } = require("./books.js");
const S = require("../lib/sliplink.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const KEYS = Object.keys(new Function(
  'var BOOK_URL="",SPORTY_URL="",B9_URL="",B9_BOOK_URL="",BK_URL=null,BK_BOOK_URL="",' +
  'BP_URL=null,BP_BOOK_URL="",XB_URL="",XB_BOOK_URL="";\n' + decl("BOOKS") + "\nreturn BOOKS;")());
const LABEL = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet" };

test("the book list these tests walk is the page's own", () => {
  assert.deepStrictEqual(KEYS.slice().sort(), Object.keys(LABEL).sort(),
    "a book was added to BOOKS - give it a label here and every test below will ask for it");
});

const LEGS = [{ id: "2026-09-04|arsenal|chelsea", code: "1X", p: 0.7, label: "Arsenal or draw", od: 1.4 }];

test("a shared slip names the book that booked it, every book", () => {
  for (const k of KEYS) {
    assert.strictEqual(S.bookOf(k), k, k + " is unknown to the shared-slip page");
    const h = S.renderBody(LEGS, null, { code: "ABC12", book: k });
    assert.match(h, new RegExp(LABEL[k] + " booking code"), k);
    if (k !== "sporty") assert.ok(!/Open in SportyBet/.test(h), k + " offered a SportyBet link for its own code");
  }
});

test("a book with a deep link gets the button; one without says to paste", () => {
  const xb = S.renderBody(LEGS, null, { code: "35ZRS", book: "onexbet" });
  assert.match(xb, /href="https:\/\/1xbet\.ng\/en\?coupon-code=35ZRS"/);
  for (const k of ["betking", "betpawa"]) {
    const h = S.renderBody(LEGS, null, { code: "ABC12", book: k });
    assert.ok(!/class="go"/.test(h), k + " has no deep link, so no Open button");
    assert.match(h, /[Pp]aste/, k + " must say what to do instead");
  }
});

test("the share API keeps the book it was told", () => {
  assert.match(read("api/share.js"), /SL\.bookOf\(body\.book\)/);
  for (const k of KEYS) assert.strictEqual(S.bookOf(k), k);
});

test("the push notification names every book in the day's code", () => {
  const sw = read("public/sw.js");
  const i = sw.indexOf("function pushBody");
  let d = 0, j = sw.indexOf("{", i);
  for (; j < sw.length; j++) { if (sw[j] === "{") d++; else if (sw[j] === "}" && !--d) break; }
  const pushBody = new Function(sw.slice(i, j + 1) + "\nreturn pushBody;")();
  const codes = {};
  for (const k of KEYS) codes[k] = "C" + k;
  const out = pushBody({ n: 5, codes });
  for (const k of KEYS) assert.match(out, new RegExp(LABEL[k]), k + " missing from the push text");
});

test("the share-card image says which book's code it carries", () => {
  const i = src.indexOf("function slipImage(");
  const body = src.slice(i, src.indexOf("\nfunction ", i + 10));
  assert.ok(!/"SportyBet code"/.test(body), "the card said SportyBet for every book");
  assert.match(body, /\.label\+" code"/);
  assert.ok(!/skypredict-theta/.test(body), "the card printed the old domain");
});

test("the link-preview image lists every book", () => {
  const og = read("scripts/mkogbase.js");
  assert.match(og, /\["1X", "#f2f1f0", NAME\], \["BET", "#14a0ff", NAME\]/);
});

test("the static pages name 1xBet where they list the books", () => {
  const P = read("lib/pages.js");
  assert.match(require("../lib/pages.js").renderCodesHub([], () => null),
    /<title>Free SportyBet, Bet9ja, BetKing, betPawa and 1xBet booking codes/);
  assert.match(P, /<li><b>1xBet<\/b>: <code>\$\{esc\(XB_SHARE\)\}YOURCODE<\/code><\/li>/);
  assert.match(P, /<h2>By hand, on 1xBet<\/h2>/);
  assert.match(P, /<h2>By hand, on BetKing or betPawa<\/h2>/);
  /* The <title>s stay short on purpose - 60 characters with the brand, pinned in
     convertpage/bookinglinks tests - so the five names live in h1, sub and body. */
  assert.match(P, /sub: "Or any of the five to any other\."/);
});

/* ONE LIST OF LIVE BOOKS, AND EVERY COUNT OR LIST READS IT (7 Oct 2026).
   The critique found the number of bookmakers given as two, three, four or
   five depending on the surface: "on both bookmakers" under a page drawing
   five tickets. lib/books.js is the list; the app's BOOKS table, the app's
   meta copy, the static pages and the social copy are held to it here. */
const B = require("../lib/books.js");

test("lib/books.js is the app's own book list", () => {
  assert.deepStrictEqual(B.KEYS.slice().sort(), KEYS.slice().sort());
  assert.deepStrictEqual(B.NAMES, LABEL);
  assert.strictEqual(require("../lib/doctor.js").BOOK_NAMES, B.NAMES, "the bot keeps its own copy again");
});

test("the app's title, description and card text list exactly the live books", () => {
  const index = read("public/index.html");
  const head = index.slice(0, index.indexOf("</head>"));
  const or = B.list("or");
  for (const m of head.match(/<meta (?:name|property)="(?:description|og:description|twitter:description|og:image:alt|twitter:image:alt)" content="[^"]*"/g)) {
    assert.ok(m.includes(or), "app meta does not list the live books: " + m);
  }
});

test("the static pages and the social copy count and list the same books", () => {
  const P = require("../lib/pages.js");
  const hub = P.renderCodesHub([], () => null);
  assert.ok(hub.includes(B.list()), "the hub's title/description");
  assert.match(hub, new RegExp("on all " + B.COUNT_WORD + " books"), "the hub's sub-line");
  const day = P.renderCodesDay({ date: "2026-10-01", codes: { sporty: "A1", bet9ja: "B2", onexbet: "C3" },
    legs: [{ home: "A", away: "B", tip: "Home win" }] }, () => null);
  assert.match(day, /booked as one slip on SportyBet, Bet9ja and 1xBet\./, "a day names the books that day had");
  /* Any surface that says how many: a count word must be the live count. */
  const WORDS = ["two", "three", "four", "five", "six", "seven"];
  const counted = /\b(both|two|three|four|five|six|seven) (?:bookmakers|bookies|books)\b/g;
  const surfaces = { hub, day, social: read("lib/social.js").replace(/BOOKS\.COUNT_WORD/g, B.COUNT_WORD) };
  for (const [name, text] of Object.entries(surfaces)) {
    for (const m of text.match(counted) || []) {
      const w = m.split(" ")[0];
      assert.ok(w === B.COUNT_WORD || !WORDS.includes(w) && w !== "both", name + " says \"" + m + "\"");
    }
  }
  const S = require("../lib/social.js");
  const seen = new Set();
  for (let i = 0; i < 8; i++) seen.add(S.promo({}, 0, i).x);
  assert.ok([...seen].some((t) => t.includes("all " + B.COUNT_WORD + " bookies")));
  assert.ok([...seen].some((t) => t.includes(B.list("or"))));
});
