"use strict";

/**
 * A window several days wide.
 *
 * Asked for: "we should be able to choose certain amount of days for the games
 * to span. Not just 1 day or all upcoming."
 *
 * The window used to be a two-way switch - one day, or everything published -
 * and the predicate that decided it existed twice, once for the board and once
 * for the league picker. Two copies of a rule agree until a third case arrives,
 * which is exactly what a span is, so the copies were collapsed into inScope
 * first and the span added to the one that was left.
 *
 * These drive the real helpers out of index.html rather than a transcription of
 * them: a test that re-implements the predicate agrees with itself forever.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  assert.ok(i >= 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* The real inScope, with the window it reads handed in. */
function windowed(scope, sday, span) {
  return new Function("SCOPE", "SDAY", "SPAN",
    "function dayOff(d){return d;}" + grab("inScope") +
    "\nreturn inScope;")(scope, sday, span);
}

const BOARD = [0, 1, 2, 3, 6, 7, 9].map((d) => ({ date: d }));
function kept(fn) { return BOARD.filter(fn).map((f) => f.date); }

test('"day" is still exactly one day', () => {
  assert.deepStrictEqual(kept(windowed("day", 1, 3)), [1]);
});

test('"all" still takes everything published', () => {
  assert.deepStrictEqual(kept(windowed("all", 0, 3)), [0, 1, 2, 3, 6, 7, 9]);
});

test("a span takes SPAN days from the day it starts on, and no more", () => {
  assert.deepStrictEqual(kept(windowed("span", 0, 3)), [0, 1, 2],
    "next 3 days means today, tomorrow and the day after - not day 3");
  assert.deepStrictEqual(kept(windowed("span", 0, 7)), [0, 1, 2, 3, 6],
    "a seven-day span holds every day inside it, including the empty ones");
});

test("a span that starts later counts from there, not from today", () => {
  assert.deepStrictEqual(kept(windowed("span", 6, 3)), [6, 7]);
});

test("the board and the league picker ask the same question", () => {
  /* The chip-count bug came from two copies of one predicate. Both callers
     must route through inScope, or a third window shape breaks one of them. */
  assert.match(grab("scopeFixtures"), /return inScope\(f\);/,
    "the board is filtering with its own copy again");
  assert.match(grab("leaguesOnBoard"), /return inScope\(f\);/,
    "the league picker is filtering with its own copy again");
});

/* ---------------------------------------------------------- the counts --- */

test("the span's count is the filtered day count, summed", () => {
  /* Not a third copy of notStarted/leagueAllowed/TOP_ONLY - buildableOn already
     applies all three, and a count that skips one starts lying about what a tap
     hands you. */
  const fn = new Function("SDAY", "SPAN", "DAYS",
    "function buildableOn(o){return DAYS[o]||[];}" + grab("buildableSpan") +
    "\nreturn buildableSpan;");
  const days = { 0: ["a", "b"], 1: ["c"], 2: [], 3: ["d"] };
  assert.deepStrictEqual(fn(0, 3, days)(), ["a", "b", "c"]);
  assert.deepStrictEqual(fn(1, 3, days)(), ["c", "d"]);
  assert.ok(!/DATA\.fixtures/.test(grab("buildableSpan")),
    "buildableSpan reads the raw payload, so the filters no longer reach it");
});

test("the pill counts the span when it is showing one", () => {
  assert.match(grab("paintScope"), /SCOPE==="span"\?buildableSpan\(\)\.length/,
    "the pill would show one day's count over a several-day window");
});

/* ------------------------------------------------------------ the state --- */

test("an unknown stored window still falls back to a single day", () => {
  /* "span" is accepted now; anything else must not be, or a stale or hand-edited
     key puts the board in a window no control can express. */
  const i = src.indexOf('localStorage.getItem("sw.scope")');
  const line = src.slice(i, src.indexOf("\n", i));
  assert.match(line, /sc0==="day"\|\|sc0==="all"\|\|sc0==="span"/);
  assert.match(src, /var SCOPE="day";/, "the fallback is still a single day");
});

test("a stored span width outside what we offer falls back", () => {
  const fn = new Function("STORE",
    "var localStorage={getItem:function(k){return STORE[k]===undefined?null:STORE[k];}};" +
    /* The real list, read out of the page, so adding a width here cannot
       leave the test asserting against a list nobody ships. */
    /SPAN_CHOICES=\[[0-9,]+\];/.exec(src)[0] + "var SPAN=3;" +
    'try{var sp0=parseInt(localStorage.getItem("sw.span"),10);' +
    "  if(SPAN_CHOICES.indexOf(sp0)>=0) SPAN=sp0;}catch(e){}" +
    "return SPAN;");
  assert.strictEqual(fn({ "sw.span": "7" }), 7);
  assert.strictEqual(fn({ "sw.span": "2" }), 2);
  assert.strictEqual(fn({ "sw.span": "5" }), 3, "5 is not offered");
  assert.strictEqual(fn({}), 3);
});

test("choosing a span retires the time bucket with it", () => {
  /* Early / mid / late slice ONE day. Left lit over a span they would claim a
     filter todFixtures does not apply - the same lie "All upcoming" told before
     it was fixed. */
  const fn = grab("setSpan");
  assert.match(fn, /TOD="all"/, "the bucket must not survive the widening");
  assert.match(fn, /SCOPE="span"/);
  assert.match(fn, /SPAN_CHOICES\.indexOf\(n\)<0/,
    "a width nobody offers must be refused, not stored");
});

test("a span starts at the first day that still has games", () => {
  /* Otherwise "Next 3 days" picked on Saturday evening means Saturday plus two,
     with the first of the three already played out. */
  assert.match(grab("setSpan"), /dayPickList\(\)/,
    "setSpan is not anchoring the span to a day that still has fixtures");
});

test("the wizard's slip is redrawn when the width changes", () => {
  /* WSP caches its slip against a signature of everything that decides the
     pool. A span left out of it would leave yesterday's slip on screen. */
  const i = src.indexOf("var _sig=[WSP.odds");
  assert.ok(i > 0, "the wizard signature moved");
  assert.match(src.slice(i, src.indexOf("\n", i)), /SCOPE,SDAY,SPAN,TOD/,
    "the span is not part of the signature, so the slip would go stale");
});
