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

test("a day still on the board keeps its highest count, and is not added to", () => {
  /* THIS TEST USED TO ASSERT THE OPPOSITE, and the old rule was the bug.
     It read "a shortened card must shrink - the board is the authority while
     it holds the day". The board is not the authority: it holds today and
     onward and drops each game as it KICKS OFF, so its count for today falls
     all day. Whatever it read at the last build before midnight was frozen
     and carried forward as the day's total.
     Live evidence, 4 Sep: 2026-09-03 recorded 11 published while the results
     feed had graded 19 of that same day. Fewer published than graded is not
     possible, and it left "how we did yesterday" unable to say that anything
     was missing.
     Still not ADDED to - forty deploys of the same board stay put - which is
     the property the test below this one guards. */
  const got = mergePublished({ "2026-09-03": 19 }, fx("2026-09-03", 12), NOW);
  assert.strictEqual(got["2026-09-03"], 19,
    "the day's peak is the count; the shrinking board is games kicking off");
});

test("a day cannot end up reporting fewer published than were graded", () => {
  /* The reported failure, as the sequence that produced it: a card of 43 that
     empties through the day as games kick off, rebuilt each time. */
  let carried = null;
  for (const remaining of [43, 40, 31, 22, 14, 11, 4, 0]) {
    carried = mergePublished(carried, fx("2026-09-03", remaining), NOW);
  }
  assert.strictEqual(carried["2026-09-03"], 43,
    "should hold the day's peak of 43, got " + carried["2026-09-03"]);
  /* And it must survive the rollover to the next day, which is when the
     panel actually reads it. */
  const after = mergePublished(carried, fx("2026-09-04", 37), NOW);
  assert.strictEqual(after["2026-09-03"], 43, "lost the peak at the rollover");
  assert.strictEqual(after["2026-09-04"], 37);
});

test("a genuinely bigger card still raises the day", () => {
  /* Max must not freeze a day that is legitimately growing - fixtures get
     added to a card during the morning. */
  const got = mergePublished({ "2026-09-03": 12 }, fx("2026-09-03", 30), NOW);
  assert.strictEqual(got["2026-09-03"], 30);
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
