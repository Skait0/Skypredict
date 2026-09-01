"use strict";

/**
 * A match being played must not fall off the board.
 *
 * The two fixture feeds behave differently once a game starts. football-data
 * publishes a league schedule in advance and keeps it, so a league match is
 * found again by every rebuild. SportyBet's fixtures endpoint lists what you
 * can still bet on and drops a match at kick-off - and it is the ONLY source
 * of cup ties, because football-data is league-only.
 *
 * So every rebuild during a cup tie deleted that tie from the board. Measured
 * on 1 Sep 2026: the SportyBet feed held 1,385 fixtures and not one of that
 * day's games, while football-data still listed Portsmouth v Derby for the
 * same evening. FK Rostov v CSKA Moscow, Russia Russian Cup, kicked off about
 * 17:55; a deploy about 19:10 rebuilt the board and the match was gone while
 * it was still being played. Torino v Monza survived that build only because
 * it had kicked off eleven minutes earlier.
 *
 * The second harm is the one that hurt: the client resolves a slip leg through
 * fixtureById, so with the fixture gone the leg cannot be re-graded, and the
 * wrong "lost" it had already been given was frozen for good. That is the same
 * incident as test/inferredft.test.js, from the other end.
 */

const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");

const MIN = 60 * 1000;
const NOW = Date.UTC(2026, 8, 1, 19, 10);          // the deploy that did it
const KO_ROSTOV = new Date(Date.UTC(2026, 8, 1, 17, 55)).toISOString();

function published(over) {
  return Object.assign({
    date: "2026-09-01",
    home: "FK Rostov", away: "CSKA Moscow",
    league: "Russia Russian Cup",
    kickoff: KO_ROSTOV,
    tip: "1X, home or draw",
  }, over || {});
}

/* The shape the feeds produce: a real Date, not an ISO string. */
function feedFixture(over) {
  return Object.assign({
    date: new Date(Date.UTC(2026, 8, 1, 19, 45)),
    time: "19:45", league: "England Championship",
    home: "Portsmouth", away: "Derby", tz: "UTC",
  }, over || {});
}

test("the reported case: an in-play cup tie is put back", () => {
  const fixtures = [feedFixture()];
  const n = B.carryInPlay(fixtures, [published()], NOW);
  assert.strictEqual(n, 1);
  const back = fixtures.find((f) => f.home === "FK Rostov");
  assert.ok(back, "the match must be on the board again");
  assert.strictEqual(back.league, "Russia Russian Cup", "and keep its real competition");
  assert.strictEqual(back.date.toISOString(), KO_ROSTOV, "and its kick-off");
  assert.strictEqual(back.tz, "UTC");
});

test("a match already in the new list is not added twice", () => {
  /* Once SportyBet lists it again, or football-data covers it, carrying it
     forward would put the same tie on the board twice. */
  const fixtures = [feedFixture({
    date: new Date(KO_ROSTOV), home: "FK Rostov", away: "CSKA Moscow",
    league: "Russia Russian Cup",
  })];
  assert.strictEqual(B.carryInPlay(fixtures, [published()], NOW), 0);
  assert.strictEqual(fixtures.length, 1);
});

test("the duplicate check ignores punctuation and case", () => {
  const fixtures = [feedFixture({
    date: new Date(KO_ROSTOV), home: "fk  rostov", away: "CSKA-Moscow!",
  })];
  assert.strictEqual(B.carryInPlay(fixtures, [published()], NOW), 0,
    "'FK Rostov' and 'fk  rostov' are the same fixture");
});

test("a match that has not kicked off is left to the feeds", () => {
  /* It is not missing, it is simply upcoming - and if the feeds have dropped
     it, that is a real removal we should respect. */
  const fixtures = [];
  const later = published({ kickoff: new Date(NOW + 30 * MIN).toISOString() });
  assert.strictEqual(B.carryInPlay(fixtures, [later], NOW), 0);
});

test("a match long finished is not dragged along forever", () => {
  const fixtures = [];
  const old = published({ kickoff: new Date(NOW - 6 * 3600 * 1000).toISOString() });
  assert.strictEqual(B.carryInPlay(fixtures, [old], NOW), 0);
});

test("extra time and penalties still count as in play", () => {
  /* A cup tie is exactly the case that runs long, and a cup tie is the only
     kind that can go missing. Cutting this at ninety minutes would defeat the
     purpose. */
  const fixtures = [];
  const et = published({ kickoff: new Date(NOW - 150 * MIN).toISOString() });
  assert.strictEqual(B.carryInPlay(fixtures, [et], NOW), 1);
});

test("a fixture that already has a score is left alone", () => {
  /* Settled: the results path owns it now. */
  const fixtures = [];
  assert.strictEqual(B.carryInPlay(fixtures, [published({ hg: 1, ag: 0 })], NOW), 0);
});

test("junk on the previous board cannot break a build", () => {
  const fixtures = [];
  const junk = [null, {}, { home: "A" }, published({ kickoff: "not a date" }),
                published({ kickoff: null }), published({ date: null })];
  assert.doesNotThrow(() => B.carryInPlay(fixtures, junk, NOW));
  assert.strictEqual(fixtures.length, 0);
});

test("no previous board at all is fine", () => {
  const fixtures = [feedFixture()];
  assert.strictEqual(B.carryInPlay(fixtures, null, NOW), 0);
  assert.strictEqual(B.carryInPlay(fixtures, undefined, NOW), 0);
  assert.strictEqual(fixtures.length, 1, "and nothing already there is disturbed");
});

test("several in-play matches are all carried", () => {
  const fixtures = [];
  const n = B.carryInPlay(fixtures, [
    published(),
    published({ home: "Torino", away: "Monza", league: "Italy Coppa Italia",
                kickoff: new Date(NOW - 11 * MIN).toISOString() }),
  ], NOW);
  assert.strictEqual(n, 2);
  assert.deepStrictEqual(fixtures.map((f) => f.home).sort(), ["FK Rostov", "Torino"]);
});

test("the carried fixture is the shape the prediction loop reads", () => {
  /* buildPayload does f.date.getUTCFullYear() straight away. An ISO string
     here would throw mid-build rather than fail a test. */
  const fixtures = [];
  B.carryInPlay(fixtures, [published()], NOW);
  const f = fixtures[0];
  assert.ok(f.date instanceof Date, "date must be a Date, not a string");
  assert.doesNotThrow(() => Date.UTC(f.date.getUTCFullYear(), f.date.getUTCMonth(), f.date.getUTCDate()));
  assert.match(f.time, /^\d{2}:\d{2}$/);
  assert.strictEqual(typeof f.league, "string");
});

test("buildPayload actually calls it, with the previous board", () => {
  /* Every test above drives carryInPlay directly, so deleting the call from
     buildPayload would leave all of them green and the function unreachable -
     a perfect guard nobody runs. That mutation escaped the suite once already
     today, on ftInferable. Assert the call site as well as the callee. */
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /carryInPlay\(fixtures,\s*cfg\.prevFixtures,\s*Date\.now\(\)\)/,
    "buildPayload must call carryInPlay with the previous board");
  assert.ok(src.indexOf("carryInPlay(fixtures, cfg.prevFixtures") >
            src.indexOf("SportyBet fixtures failed"),
    "it has to run after both feeds have been merged, or it deduplicates against nothing");
});

test("the window is long enough for a cup tie and shorter than a day", () => {
  assert.ok(B.IN_PLAY_MAX_MS >= 3 * 3600 * 1000,
    "extra time plus penalties must still be in play");
  assert.ok(B.IN_PLAY_MAX_MS <= 6 * 3600 * 1000,
    "a finished match must fall off the same day");
});
