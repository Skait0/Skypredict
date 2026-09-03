"use strict";

/**
 * How many tips each day published, carried across the day boundary.
 *
 * "How we did yesterday" could only say "and N more are still being graded" for
 * a reader whose browser kept yesterday's board, or from pendingByDate - which
 * counts rows the record HOLDS and cannot confirm, and a tip is only filed
 * while its fixture is still on the board. A late game with no build before
 * midnight is never filed and never counted. On 2 Sep the board carried 40
 * fixtures, 31 were graded, pendingByDate was empty, and a first-time reader
 * saw "18 of 31 tips landed, 58%" as though the day were finished.
 *
 * So the count is recorded rather than recomputed, and carried forward, because
 * the board holds today and onward and a day's fixtures vanish when it rolls.
 *
 * THE BUG THIS FUNCTION EXISTS TO NOT HAVE: carrying forward and then adding
 * doubles every date still on the board. Every deploy would add a whole card,
 * and there are dozens a day, so by evening a forty-game card would claim
 * hundreds of tips outstanding. Half of these tests are that one mistake.
 */

const test = require("node:test");
const assert = require("node:assert");
const { mergePublished, PUBLISHED_KEEP_DAYS } = require("../lib/build.js");

const NOW = Date.parse("2026-09-03T02:00:00Z");
const fx = (date, n) => Array.from({ length: n }, (_, i) => ({
  date, tip: "1X, home or draw", home: "H" + i, away: "A" + i,
}));

/* --------------------------------------------- counting what is on the board */

test("counts the tips on the board, by date", () => {
  const got = mergePublished(null, [...fx("2026-09-03", 19), ...fx("2026-09-04", 28)], NOW);
  assert.deepStrictEqual(got, { "2026-09-03": 19, "2026-09-04": 28 });
});

test("a fixture with no tip is not a published tip", () => {
  const board = [...fx("2026-09-03", 3), { date: "2026-09-03", home: "X", away: "Y" }];
  assert.strictEqual(mergePublished(null, board, NOW)["2026-09-03"], 3);
});

/* ------------------------------------------- the double-count this prevents */

test("rebuilding the same board does not double the day", () => {
  /* The one that matters. Every deploy rebuilds the board and re-runs this. */
  const board = fx("2026-09-03", 19);
  let carried = mergePublished(null, board, NOW);
  for (let deploy = 0; deploy < 40; deploy++) {
    carried = mergePublished(carried, board, NOW);
  }
  assert.strictEqual(carried["2026-09-03"], 19,
    "forty deploys must still report nineteen, got " + carried["2026-09-03"]);
});

test("a day still on the board is recounted, not added to", () => {
  /* Even when the previous figure disagrees - a shortened card must shrink. */
  const got = mergePublished({ "2026-09-03": 19 }, fx("2026-09-03", 12), NOW);
  assert.strictEqual(got["2026-09-03"], 12, "the board is the authority while it holds the day");
});

/* ------------------------------------------------------ across the rollover */

test("a day that has left the board keeps its count", () => {
  /* Yesterday is gone from the fixtures; its figure is the only record of how
     many tips it carried. */
  const got = mergePublished({ "2026-09-02": 40 }, fx("2026-09-03", 19), NOW);
  assert.strictEqual(got["2026-09-02"], 40, "yesterday must survive the rollover");
  assert.strictEqual(got["2026-09-03"], 19);
});

test("it survives repeated rollovers rather than decaying", () => {
  let carried = mergePublished(null, fx("2026-09-01", 22), NOW);
  carried = mergePublished(carried, fx("2026-09-02", 40), NOW);
  carried = mergePublished(carried, fx("2026-09-03", 19), NOW);
  assert.deepStrictEqual(carried,
    { "2026-09-01": 22, "2026-09-02": 40, "2026-09-03": 19 });
});

/* ------------------------------------------------------------------ hygiene */

test("old days are pruned so the map cannot grow forever", () => {
  const old = new Date(NOW - (PUBLISHED_KEEP_DAYS + 3) * 86400000)
    .toISOString().slice(0, 10);
  const got = mergePublished({ [old]: 30, "2026-09-02": 40 }, fx("2026-09-03", 19), NOW);
  assert.ok(!(old in got), old + " is past the keep window and must be dropped");
  assert.strictEqual(got["2026-09-02"], 40, "recent days stay");
});

test("junk in the carried map is dropped, not republished", () => {
  /* It ends up on the page as a claim about how many games were on. */
  const got = mergePublished({
    "2026-09-02": 40, "not-a-date": 5, "2026-09-01": "many",
    "2026-08-31": -4, "2026-08-30": null, "2026-08-29": 0,
  }, fx("2026-09-03", 19), NOW);
  assert.deepStrictEqual(Object.keys(got).sort(), ["2026-09-02", "2026-09-03"]);
});

test("a missing or malformed previous map is survivable", () => {
  for (const prev of [null, undefined, "", 7, [], ["2026-09-02"]]) {
    const got = mergePublished(prev, fx("2026-09-03", 19), NOW);
    assert.deepStrictEqual(got, { "2026-09-03": 19 },
      "prev=" + JSON.stringify(prev) + " must degrade to just the board");
  }
});

test("an empty board still keeps what came before", () => {
  /* A build that refuses to produce fixtures must not erase the history that
     "how we did yesterday" reads. */
  assert.deepStrictEqual(mergePublished({ "2026-09-02": 40 }, [], NOW),
    { "2026-09-02": 40 });
});
