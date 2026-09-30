"use strict";

/* THE DAILY CODE PAIRS BOOKS BY SPORTRADAR ID BEFORE NAMES (30 Sep 2026).
 *
 * Owner: "why didnt betking show for daily booking code?" BetKing sat out 24,
 * 25, 27 and 29 Sep with "4 of 5 legs on its feed - publishing without it":
 * one game each day failed a NAME match ("Club Villa Dalmine", national sides
 * spelled differently) although BetKing listed it. Every BetKing row carries
 * Sportradar's match id (1097 of 1097 that day), and SportyBet's event id IS
 * that id (sr:match:NNN) - so the id pairs them whatever the spelling. The
 * same rule the converter already follows (prediction-site skill, §10).
 */

const test = require("node:test");
const assert = require("node:assert");
const { findEvent, srOf } = require("../scripts/mkcode.js");

const f = { home: "Villa Dalmine", away: "UAI Urquiza", date: "2026-09-27",
            kickoff: "2026-09-27T18:00:00.000Z" };
const sporty = { eventId: "sr:match:61234567", homeTeam: "Villa Dalmine", awayTeam: "UAI Urquiza",
                 startTime: Date.parse("2026-09-27T18:00:00Z") };
const bkRow = { eventId: "9001", srId: "61234567", homeTeam: "Club Villa Dalmine",
                awayTeam: "Urquiza Club Atletico", startTime: Date.parse("2026-09-27T18:00:00Z") };

test("the SportyBet leg's Sportradar id is read off its event id", () => {
  assert.strictEqual(srOf(sporty), "61234567");
  assert.strictEqual(srOf({ eventId: "12345" }), null, "a bare number is not an sr id");
  assert.strictEqual(srOf(null), null);
});

test("a book spelling the clubs differently still pairs on the id", () => {
  assert.strictEqual(findEvent(f, [bkRow]), null, "names alone miss it - the old failure");
  assert.strictEqual(findEvent(f, [bkRow], srOf(sporty)), bkRow);
});

test("the id is still fenced by the kick-off", () => {
  const moved = Object.assign({}, bkRow, { startTime: Date.parse("2026-10-04T18:00:00Z") });
  assert.strictEqual(findEvent(f, [moved], "61234567"), null,
    "a book can hand back another provider's number; a week out is not this game");
});

test("with no id, names still decide as before", () => {
  const exact = { eventId: "7", homeTeam: "Villa Dalmine", awayTeam: "UAI Urquiza",
                  startTime: Date.parse("2026-09-27T18:00:00Z") };
  assert.strictEqual(findEvent(f, [exact]), exact);
  assert.strictEqual(findEvent(f, [exact], null), exact);
});
