"use strict";

/**
 * A fixture belongs to the reader's day, not UTC's.
 *
 * f.date is the kickoff's UTC date; the readers are in Lagos (UTC+1). An MLS
 * game at 23:30Z is 00:30 tomorrow on the reader's clock, and the page shows
 * it as 00:30 - but filed it under today (reported 25 Sep 2026). The same
 * mismatch was fixed for the pick of the day on 9 Sep; the board's own day
 * filing kept it. fDay is lifted from the page and run on Lagos's clock.
 */
process.env.TZ = "Africa/Lagos";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const i = src.indexOf("function fDay(f){");
const body = src.slice(i, src.indexOf("\nfunction dayOff(", i));
const fDay = new Function(body + "\nreturn fDay;")();

test("a 23:30Z kickoff is tomorrow in Lagos, as its 00:30 says", () => {
  assert.strictEqual(fDay({ date: "2026-09-26", kickoff: "2026-09-26T23:30:00.000Z" }), "2026-09-27");
});

test("anything before 23:00Z stays on its UTC date", () => {
  assert.strictEqual(fDay({ date: "2026-09-26", kickoff: "2026-09-26T22:59:00.000Z" }), "2026-09-26");
  assert.strictEqual(fDay({ date: "2026-09-26", kickoff: "2026-09-26T00:30:00.000Z" }), "2026-09-26");
});

test("no kickoff, or one the clock cannot read, falls back to f.date", () => {
  assert.strictEqual(fDay({ date: "2026-09-26" }), "2026-09-26");
  assert.strictEqual(fDay({ date: "2026-09-26", kickoff: "not a time" }), "2026-09-26");
});
