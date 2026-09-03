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
  const guard = fn.slice(at, at + 1400);
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
  const guard = fn.slice(at, at + 1400);
  assert.match(guard, /\+B\.mark\+/,
    "the prompt must name the book in play");
  assert.ok(!/SportyBet|Bet9ja/.test(guard),
    "and must not hardcode either book's name");
});
