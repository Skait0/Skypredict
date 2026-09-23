"use strict";

/**
 * A day with no card of its own must say so.
 *
 * Reported: "the slip of the day changed from the slip of that day to that of
 * upcoming games! also the pick of the day also changed".
 *
 * Nothing had changed in the choosing. Tuesday 23 September carried cup ties
 * only - Copa Chile, the Czech Cup, the KNVB beker - in competitions the model
 * has no ratings for, so the board held zero fixtures for the day and both
 * cards fell forward to the next day that had one. That fall-forward is the
 * behaviour we want; showing tomorrow's games under the word "today" is not.
 *
 * So the headings carry the day whenever it is not today. These tests take the
 * shipped expressions out of index.html and evaluate them, rather than
 * asserting that a phrase appears somewhere in the file - a source-string
 * match passes just as happily when the branch is never reached.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  assert.ok(i >= 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* dayName is the thing both headings lean on, so it comes from the file too. */
const dayName = new Function(grab("dayName") + "; return dayName;")();

/** Pull one shipped expression out and evaluate it at a given day offset. */
function evalAt(expr, off) {
  return new Function("dayName", "_sdOff", "_potdOff", "return (" + expr + ");")(dayName, off, off);
}

const slipHeading = (() => {
  const m = src.match(/"<h2>The safest slip "\+\(([^\n]*?)\)\+"<\/h2>"/);
  assert.ok(m, "the slip heading no longer carries a day");
  return '"The safest slip "+(' + m[1] + ")";
})();

const slipSub = (() => {
  const m = src.match(/"<p class='sub'>"\+\(([^\n]*?)\)\+\n?/);
  assert.ok(m, "the slip subtitle no longer branches on the day");
  return "(" + m[1] + ")";
})();

const potdChip = (() => {
  const m = src.match(/var potdDayChip=(.*?);\r?\n/);
  assert.ok(m, "the pick card no longer computes a day chip");
  return m[1];
})();

test("today's card is still called today's", () => {
  assert.equal(evalAt(slipHeading, 0), "The safest slip today");
  assert.equal(evalAt(slipSub, 0), "", "nothing is explained away on a normal day");
  assert.equal(evalAt(potdChip, 0), "", "no day chip when the pick is today's");
});

test("a slip that belongs to tomorrow says tomorrow", () => {
  assert.equal(evalAt(slipHeading, 1), "The safest slip tomorrow");
  assert.match(evalAt(slipSub, 1), /No games we can price today/);
});

test("further out than tomorrow names the weekday", () => {
  const heading = evalAt(slipHeading, 3);
  assert.match(heading, /^The safest slip on [A-Z][a-z]+$/,
    "a weekday, and it reads as a sentence: 'on Saturday', not 'saturday'");
  assert.ok(!/today|tomorrow/.test(heading), "not today and not tomorrow");
});

test("the pick card chips the day whenever it is not today's", () => {
  const chip = evalAt(potdChip, 1);
  assert.match(chip, /Tomorrow/);
  assert.match(chip, /class='k'/, "the chip reuses the card's own key style");
});

/* The slip's day is taken from its own candidates: today while today can fill
   a slip, otherwise the earliest day that can. The legs then come from that
   day alone - a heading dated today over legs spread across the week is the
   bug this replaced. */
const slipDayRule = (() => {
  const a = src.indexOf("var _byDay={};");
  const b = src.indexOf("if(_sdDate) cand=_byDay[_sdDate];");
  assert.ok(a > 0 && b > a, "the slip no longer groups its candidates by day");
  return src.slice(a, b + "if(_sdDate) cand=_byDay[_sdDate];".length);
})();

function slipDay(cand) {
  const run = new Function("cand", slipDayRule + "; return {date:_sdDate, cand:cand};");
  return run(cand);
}
const leg = (date) => ({ f: { date: date } });

test("today keeps the slip while today can fill one", () => {
  const got = slipDay([leg("2026-09-23"), leg("2026-09-23"), leg("2026-09-26")]);
  assert.equal(got.date, "2026-09-23");
  assert.equal(got.cand.length, 2, "and the legs are that day's only");
});

test("a day that cannot fill a slip hands it to the next that can", () => {
  const got = slipDay([leg("2026-09-23"), leg("2026-09-25"), leg("2026-09-25")]);
  assert.equal(got.date, "2026-09-25");
  assert.equal(got.cand.length, 2);
});

test("the legs never span more than one day", () => {
  const got = slipDay([leg("2026-09-25"), leg("2026-09-25"), leg("2026-09-26"),
                       leg("2026-09-26"), leg("2026-09-27")]);
  assert.ok(got.cand.every((c) => c.f.date === got.date),
    "a slip of the day is one day's slip");
});

test("one game left today is the same as none", () => {
  /* The fall-back used to need an entirely empty day, so 23 September - one
     fixture on the board - rendered an empty slip card instead of falling
     forward. A slip takes two legs; one is not a slip. */
  const m = src.match(/var games=onDay\(\)\.filter\(notStarted\); if\(games\.length(<2|!)/);
  assert.ok(m && m[1] === "<2",
    "the slip falls back only on a completely empty day again");
});
