"use strict";

/**
 * Nothing may leave here that the bookmaker's betslip will refuse.
 *
 * SportyBet, in as many words: "There cannot be over 50 selections within a
 * betslip." The limit is on the BETSLIP, not on making the code. Their share
 * endpoint takes as many selections as you send and returns a perfectly good
 * code - which is how a previous session booked 199 legs, called it a success,
 * and recorded in lib comments that there is no practical ceiling.
 *
 * There is. It appears when a person opens the code, and nothing on our side
 * hears about it: the API sees success, Sentry sees nothing, and the reader
 * gets a dialog they cannot get past. That is the "upstream answers success
 * with something unusable" failure, and the only place it can be caught is
 * before the code is made.
 *
 * "Add all" already capped what it books. The hole was its OTHER branch:
 * "confirm and trim" loads every pick into the slip and hands the reader to the
 * slip sheet, and booking from there counted nothing. On a full Saturday card
 * that is well over fifty.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function konstNum(name) {
  const m = new RegExp(String.raw`(?:^|\n)const\s+` + name + String.raw`\s*=\s*([0-9]+)\s*;`).exec(src);
  assert.ok(m, name + " must be declared as a number");
  return Number(m[1]);
}
/* The body of a named function, brace-matched rather than sliced to a fixed
   length - growing a comment must not move what a test can see. */
function body(name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)(?:async )?function ` + name + String.raw`\s*\(`, "m"));
  assert.ok(i >= 0, "not found: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

test("the limit is written down once, as a number", () => {
  assert.strictEqual(konstNum("BETSLIP_MAX"), 50,
    "SportyBet's stated limit is 50 selections on one betslip");
});

test("every builder cap stays inside it", () => {
  /* A jackpot slip is capped at exactly 50, which is allowed - the limit is
     "cannot be OVER 50". If either cap ever rises above BETSLIP_MAX the
     builder starts producing slips no reader can place. */
  assert.ok(konstNum("JACKPOT_LEG_CAP") <= konstNum("BETSLIP_MAX"),
    "the jackpot cap must not exceed what a betslip accepts");
  const m = /cap=isJackpotOdds\(T\)\?JACKPOT_LEG_CAP:(\d+)/.exec(src);
  assert.ok(m, "the ordinary leg cap must still be declared here");
  assert.ok(Number(m[1]) <= konstNum("BETSLIP_MAX"),
    "the ordinary cap is " + m[1] + ", above the betslip limit");
});

test("booking from the slip sheet counts the selections", () => {
  /* The hole. This path is reached from "confirm and trim", from the FAB, and
     from any slip built by hand, none of which is bounded by the builder. */
  const fn = body("bookMy");
  assert.match(fn, /bookable\.length>BETSLIP_MAX/,
    "bookMy must refuse to send more selections than a betslip takes");
  assert.match(fn, /slice\(0,BETSLIP_MAX\)/,
    "and must offer the first BETSLIP_MAX rather than an arbitrary number");
});

test("it asks rather than trimming behind the reader's back", () => {
  /* They chose those games. Silently dropping eleven of them and booking the
     rest is how somebody ends up holding a bet they did not make - the same
     rule the duplicate-match and unpriced-leg guards on this path follow. */
  const fn = body("bookMy");
  const at = fn.indexOf("bookable.length>BETSLIP_MAX");
  assert.ok(at >= 0);
  const guard = fn.slice(at, at + 2600);
  assert.match(guard, /showPrompt\("myBookResult"/,
    "the reader must be asked");
  /* ASKED FIRST, not merely asked somewhere. Mutation-tested: inserting
     `doBookMy(_fit); return;` above the prompt leaves every "is the prompt
     there" assertion passing while the slip goes out unasked. So compare the
     positions - the question has to come before anything is sent. */
  const ask = guard.indexOf("showPrompt(");
  const send = guard.indexOf("doBookMy(");
  assert.ok(ask >= 0 && send >= 0, "both the prompt and the send must be here");
  assert.ok(ask < send,
    "the slip is booked at " + send + " before the reader is asked at " + ask);
  assert.match(guard, /confirm-cancel/,
    "and must be able to decline and trim it themselves");
  assert.match(guard, /doBookMy\(_fit\)/,
    "and the confirmed path books the trimmed list, not the original");
});

/* KEEPING ALL THE GAMES IS THE THIRD ANSWER. Book 50 throws the rest away and
   "let me trim" asks the reader to do it by hand; a reader with 170 picks
   wanted neither, and said so. The offer is only honest if every ticket it
   deals actually fits the betslip - which is arithmetic, not copy, so it is
   tested as arithmetic on the real splitPicks. */
test("the split offered at the cap deals tickets that all fit", () => {
  const MAX = konstNum("BETSLIP_MAX");
  const env = new Function("BETSLIP_MAX",
    body("splitPicks") + body("splitWays") + body("capWays") +
    "\nreturn {splitPicks:splitPicks, capWays:capWays};")(MAX);
  for (const n of [51, 100, 170, 249, 400]) {
    const picks = Array.from({ length: n }, (_, i) => i);
    const ways = env.capWays(n);
    assert.ok(ways.length, n + " picks are offered no way to split at all");
    for (const w of ways) {
      const parts = env.splitPicks(picks, w);
      assert.strictEqual(parts.length, w);
      for (const p of parts)
        assert.ok(p.length <= MAX,
          n + " picks over " + w + " tickets leaves one of " + p.length);
      assert.strictEqual(parts.reduce((t, p) => t + p.length, 0), n,
        "every pick must land on exactly one ticket");
    }
  }
  /* UP TO FOUR, like every other split on the site - a single forced number
     is a fact, not a choice. Only the ways that cannot be placed are dropped:
     170 in two tickets is 85 on a slip that takes 50. */
  assert.deepStrictEqual(env.capWays(60), [2, 3, 4]);
  assert.deepStrictEqual(env.capWays(170), [4]);
  assert.deepStrictEqual(env.capWays(400), [8],
    "when nothing up to four fits, the limit names the number");
});

test("the cap prompt offers the split through the quota-checked path", () => {
  /* splitAndBook direct would skip the check in wireSplit that stops four
     tickets being started with two codes left. Same reason the code modal
     goes through wireSplit and not around it. */
  const fn = body("bookMy");
  const at = fn.indexOf("bookable.length>BETSLIP_MAX");
  const guard = fn.slice(at, at + 2600);
  assert.match(guard, /capWaysHTML\(bookable\)/,
    "the ticket counts must come from the limit, not a guess");
  assert.match(body("capWays"), /BETSLIP_MAX/,
    "and capWays must be the thing that reads the limit");
  assert.match(guard, /wireSplit\(/, "the split must be wired, and wired here");
  assert.ok(!/splitAndBook\(/.test(guard),
    "never straight to splitAndBook - that is the path with no quota check");
});

test("the split row on a page card is drawn in page colours", () => {
  /* .sp-way was written for the booking-code modal, where every surface is a
     white alpha over a dark scrim. The cap prompt is a .confirm-card on
     --card-2, so the inherited rules print white text on cream in light mode
     and a grey slab in dark. Same fix .byo-res already carries. */
  const m = /\.confirm-card \.sp-way\{([^}]*)\}/.exec(src);
  assert.ok(m, "the prompt's own row must be styled");
  for (const tok of ["var(--card)", "var(--line)", "var(--text)"])
    assert.ok(m[1].includes(tok), "must use " + tok + ": " + m[1]);
  assert.ok(!/#fff|rgba\(255,255,255/.test(m[1]),
    "no modal alpha on a page card");
  assert.match(src, /@media \(hover:hover\)\{\.confirm-card \.sp-way:hover/,
    "and it must answer the pointer, behind the hover query");
});

test("the board's book-all prompt names the book in play and offers the split", () => {
  /* It hardcoded SportyBet in three sentences - "none of these games are on
     SportyBet", "not on SportyBet yet, skipped", "SportyBet only takes 50" -
     so a reader on BetKing was told about a bookmaker they are not using. And
     its only answer to a board over the cap was "open My slip and delete
     some", which is the one outcome the splitter exists to avoid. */
  const fn = body("confirmBookAll");
  /* Comments off first: the note explaining this fix names the book it took
     out, and a test that cannot tell copy from commentary fails on its own
     explanation. */
  assert.ok(!/SportyBet/.test(fn.replace(/\/\*[\s\S]*?\*\//g, " ")),
    "a book is still hardcoded in the prompt");
  assert.match(fn, /var B=curBook\(\)/, "it must read the selected book");
  assert.match(fn, /B\.mark/, "and name it");
  assert.match(fn, /capWaysHTML\(bookable\)/, "the split must be offered here too");
  assert.match(fn, /wireSplit\(host,bookable,B/,
    "and started through the quota-checked path");
  assert.ok(!/splitAndBook\(/.test(fn), "never straight to splitAndBook");
});

test("the board's book-all asks the selected book, and lets it be changed", () => {
  /* Naming the book was only half of it. `c.eventId` is SportyBet's id, so the
     count on the button and the list behind it were SportyBet's answer read
     out to a reader on BetKing - and the toggle that would fix it lives on the
     builder and in My slip, nowhere near the board. */
  for (const name of ["renderBookAll", "confirmBookAll"]) {
    const fn = body(name).replace(/\/\*[\s\S]*?\*\//g, " ");
    assert.ok(!/c\.eventId/.test(fn),
      name + " still filters on one book's id field");
    assert.match(fn, /bookTakes\(c,/,
      name + " must ask whether the book in play takes the game");
  }
  const fn = body("confirmBookAll");
  assert.match(fn, /paintBookPickerWith\(el,picks\)/,
    "the pills must be drawn from every pick on the board, so each book's " +
    "count is comparable");
  assert.match(fn, /setTimeout\(confirmBookAll,0\)/,
    "and changing book must redraw the prompt - its counts, odds and cap " +
    "wording are all about the old one");
  /* The empty case is the one that most needs the pills: "none of these are on
     X" is the moment a reader wants the other two. */
  const at = fn.indexOf("if(!bookable.length)");
  assert.ok(at > 0);
  assert.match(fn.slice(at, at + 400), /bookpick/,
    "the refusal must offer the books that do have them");
});

test("the add-all path uses the same constant, not its own copy", () => {
  /* It had a local CAP=50. Two copies of a bookmaker's limit drift, and the
     one that drifts is the one nobody is looking at. */
  const fn = body("confirmBookAll");
  assert.match(fn, /var CAP=BETSLIP_MAX/,
    "add-all must read the shared limit");
  assert.ok(!/CAP\s*=\s*50/.test(fn),
    "no second copy of the number");
});

test("both booking paths are guarded, so neither is the way round", () => {
  /* bookSlip sends the BUILDER's picks, which the leg cap already bounds;
     bookMy sends the reader's own slip, which nothing bounds. If the builder
     cap is ever removed this test is the thing that should start failing. */
  const build = /cap=isJackpotOdds\(T\)\?JACKPOT_LEG_CAP:(\d+)/.exec(src);
  assert.ok(build, "the builder must still cap its own leg count");
  assert.match(body("bookMy"), /BETSLIP_MAX/,
    "and the unbounded path must check explicitly");
});

test("the guard names whichever book is selected, not SportyBet", () => {
  /* Bet9ja has the same 50-selection limit, and the reader may be on either.
     A message hardcoding one book's name is wrong half the time, and the
     bookmaker toggle is exactly the kind of thing that gets added after the
     copy was written. */
  const fn = body("bookMy");
  const at = fn.indexOf("bookable.length>BETSLIP_MAX");
  const guard = fn.slice(at, at + 2600);
  assert.match(guard, /\+B\.mark\+/,
    "the prompt must name the book in play");
  assert.ok(!/SportyBet|Bet9ja/.test(guard),
    "and must not hardcode either book's name");
});
