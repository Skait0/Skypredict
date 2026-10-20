"use strict";
/* COMBINE CODES IN THE BOT (SportyClaw review, 20 Oct 2026): two or more codes in one message,
   any bookies, become one slip on one bookie - the site's merge (skill section 12): each code
   read on its own book, foreign legs moved with the converter's own pairing, a game on two
   codes kept once, every leg that cannot cross named. */
const test = require("node:test");
const assert = require("node:assert");
const D = require("../lib/doctor.js");
const C = require("../lib/convert.js");

test("a message with two codes gives both; one code stays a single read", () => {
  assert.deepStrictEqual(D.parseAll("HUW6YC and BCK29Q"), ["HUW6YC", "BCK29Q"]);
  assert.deepStrictEqual(D.parseAll("HUW6YC\nHUW6YC"), ["HUW6YC"], "the same code twice is one");
  assert.deepStrictEqual(D.parseAll("HUW6YC trim to 150"), ["HUW6YC"]);
  assert.deepStrictEqual(D.parseAll("convert 3RTY7Z 9KLM2P to bet9ja"), ["3RTY7Z", "9KLM2P"]);
  assert.strictEqual(D.parseAll("BW79B45CD9 X7Y8Z9 A1B2C3 D4E5F6 G7H8I9 J1K2L3").length, 5, "at most five codes");
});

test("merge keeps the target book's legs, moves the others, and keeps a shared game once", () => {
  const now = Date.parse("2026-10-21T08:00:00Z"), ko = Date.parse("2026-10-21T15:00:00Z");
  const evs = [{ id: "sr:match:1", home: "Arsenal", away: "Chelsea", ko, odds: {} },
    { id: "sr:match:2", home: "Lyon", away: "Nice", ko, odds: {} }];
  const reads = [
    { book: "sporty", legs: [{ home: "Arsenal", away: "Chelsea", kickoff: ko, eventId: "sr:match:1", prediction: "1" }] },
    { book: "bet9ja", legs: [
      { home: "Arsenal", away: "Chelsea", kickoff: ko, eventId: "9001", srId: "1", prediction: "1" },
      { home: "Lyon", away: "Nice", kickoff: ko, eventId: "9002", prediction: "OVER_1.5" },
      { home: "Nowhere FC", away: "Ghost United", kickoff: ko, eventId: "9003", prediction: "1" }] }];
  const m = C.merge(reads, "sporty", evs, now);
  assert.deepStrictEqual(m.picks.map((p) => p.eventId + "|" + p.code), ["sr:match:1|1", "sr:match:2|OVER_1.5"]);
  assert.strictEqual(m.stuck.length, 1);
  assert.match(m.stuck[0].why, /doesn't list this game/);
  assert.strictEqual(m.dupes, 1);
});

test("the webhook books one merged code and counts it as one", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../api/tg.js"), "utf8");
  assert.ok(/D\.parseAll\(/.test(src) && /CONVERT\.merge\(/.test(src), "the webhook merges");
  assert.ok(/onMerge[\s\S]{0,400}quota\([^)]*, 1\)/.test(src), "a merge costs one code");
});
