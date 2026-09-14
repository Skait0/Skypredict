"use strict";
/* ONE FUNCTION ANSWERS "WILL THIS BOOK TAKE THIS LEG".
 *
 * The same mistake shipped three times, in three different places, because
 * three different bits of code each answered that question their own way by
 * peeking into the odds cache:
 *
 *   the slider          fixed 13 Sep with fetchedMarket
 *   the API's pre-flight fixed 13 Sep in _unbookable
 *   bookTakes            fixed 14 Sep, reported as Inter v Udinese - 28 priced
 *                        keys on the fixture and every new market refused
 *
 * The cache holds what the SWEEP fetches, which is 24 markets. Anything outside
 * that list is absent from it on every fixture, so a boolean built from the
 * cache says "this book has not got it" about markets the book sells all day.
 *
 * bookVerdict is now the only place allowed to read an odds cache to decide
 * bookability, and it answers priced / not-priced / unknown rather than yes or
 * no, because "we cannot tell from here" is the state that kept being lost.
 * This file fails if a fourth copy appears.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"), "utf8");

/* The whole file: the writers (attachEventIds, dropUnbookable) sit ABOVE the
   shared helper, and a scan that starts at the helper would miss any future
   copy written above it too - which is exactly the hiding place this test is
   for. The patterns below are JavaScript, so the markup and CSS match nothing. */
const code = src;

function grab(name) {
  /* `code` starts AT bookVerdict, so index 0 is a real hit, not a miss. */
  const i = code.startsWith("function " + name + "(")
    ? 0 : code.indexOf("\nfunction " + name + "(");
  assert.ok(i >= 0, "not found: " + name);
  let d = 0, k = code.indexOf("{", i);
  for (; k < code.length; k++) {
    if (code[k] === "{") d++;
    else if (code[k] === "}") { d--; if (!d) break; }
  }
  return code.slice(i, k + 1);
}

test("only bookVerdict reads an odds cache to judge a market", () => {
  /* Every way the codebase has spelled "look up this market's price":
     f.sportyOdds[code], f[B.odds][code], and the bet9ja twin. */
  const patterns = [
    /\.sportyOdds\s*&&\s*\w+\.sportyOdds\[/g,
    /\[B\.odds\]\s*&&/g,
    /\w+\[B\.odds\]\[/g,
  ];
  /* The functions that are allowed to do it, and why:
       bookVerdict     the one answer
       pricedFixture   "do we hold ANY prices for this fixture" - a different
                       question, and it never looks at a market
       legOdd/oddCell  pricing for display, not bookability */
  const allowed = ["bookVerdict", "pricedFixture", "legOdd", "oddCell",
                   "estimatedOdd", "hasRealOdd", "oddsAreReal", "convOdds",
                   /* These two WRITE the cache rather than judging by it:
                      attachEventIds fills it, and dropUnbookable forgets a
                      price the bookmaker has just refused. */
                   "attachEventIds", "dropUnbookable",
                   /* Display: how far our number is from the book's, drawn on
                      the card. Not a decision about booking anything. */
                   "edgeOf"];
  const bodies = allowed.map(grab).join("\n");

  for (const re of patterns) {
    const all = [...code.matchAll(re)].length;
    const mine = [...bodies.matchAll(re)].length;
    assert.equal(all - mine, 0,
      "something outside " + allowed.join("/") + " is reading the odds cache " +
      "directly (" + re + "): ask bookVerdict instead, or this bug gets a " +
      "fourth home");
  }
});

test("the verdict keeps its third state", () => {
  /* A boolean cannot say "we cannot tell from here", and that is precisely the
     state the three bugs collapsed. */
  const body = grab("bookVerdict");
  for (const state of ['"priced"', '"not-priced"', '"unknown"']) {
    assert.ok(body.includes(state), "bookVerdict no longer returns " + state);
  }
  /* The two reasons the cache cannot speak, both of which must stay. */
  assert.match(body, /if\(!B\.full\) return "unknown";/,
    "a book whose cache is not its whole book must answer unknown");
  assert.match(body, /if\(!fetchedMarket\(code\)\) return "unknown";/,
    "a market the sweep never fetches must answer unknown");
});

test("the game and the market are separate questions", () => {
  /* An event id arrives asynchronously - attachEventIds runs after boot - so a
     missing id means "not yet", never "no". Folding that into the market
     verdict emptied both builders whenever the id feed was slow, which is the
     failure the original comment warned about. */
  assert.doesNotMatch(grab("bookVerdict"), /bookIdOf/,
    "bookVerdict must not ask whether the book has the game");
  assert.match(grab("bookTakes"), /if\(!bookIdOf\(c,B\)\) return false;/,
    "booking must still require the book to list the game");
});

test("both builders ask it rather than answering it themselves", () => {
  const slider = code.slice(code.indexOf("function buildPicks("));
  const upTo = slider.slice(0, slider.indexOf("cand.sort("));
  assert.match(upTo, /bookVerdict\(f,c,B\)/,
    "the slider stopped asking the shared question");
  assert.match(upTo, /var B=curBook\(\);/,
    "the slider must build for the CHOSEN book - it used to read sportyOdds " +
    "whatever the reader had picked");
});
