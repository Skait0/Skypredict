"use strict";

/**
 * The Early / Mid day / Late filter.
 *
 * Reported: "i picked 'early' games but im seeing games at 14.30 and late
 * games." Both halves of that were true, for two different reasons.
 *
 *   1. "Early" was defined as any kickoff before 15:00, so 14:30 was early.
 *      It also swallowed most of the card - 132 of 357 fixtures on the day it
 *      was reported.
 *
 *   2. The late bucket was "19:00 or later", but getHours() wraps at midnight.
 *      Every overnight kickoff came back as hour 0-4, fell through the first
 *      test (h < 15) and was filed as *early*. That was 61 fixtures - the
 *      Americas card - which is where the "late games" under Early came from.
 *      This is the fault that mattered, and the one a boundary test written
 *      only around 15:00 would have missed entirely.
 *
 * The buckets are named after the part of the day a reader is in, so the test
 * is simply that the clock on the card agrees with the label on the button.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("function not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

const api = new Function(
  grab("kickMs") + "\n" + grab("todOf") + "\n" +
  "var TOD='all', SCOPE='day';\n" + grab("todFixtures") + "\n" +
  "return {todOf:todOf, todFixtures:todFixtures, setTOD:function(t){TOD=t;}," +
  "        setSCOPE:function(s){SCOPE=s;}};"
)();

/* todOf reads the *local* clock, because the bucket has to match the time
   printed on the card. So a fixture is built from a local wall time and handed
   over as the instant that time actually is - which keeps these tests true in
   any zone the suite happens to run in, rather than only in the author's.
   Node cannot be made to change zone reliably mid-process, so pinning TZ would
   have been a test that passes on one machine. */
function at(hour, min) {
  return { kickoff: new Date(2026, 7, 29, hour, min || 0, 0).toISOString() };
}

test("the reported case: a 14:30 kickoff is not early", () => {
  assert.notStrictEqual(api.todOf(at(14, 30)), "early", "14:30 was being filed as early");
  assert.strictEqual(api.todOf(at(14, 30)), "mid");
});

test("overnight kickoffs are late, not early", () => {
  /* The real fault. Hours 0-4 wrap past midnight and used to read as early. */
  for (const h of [0, 1, 2, 3, 4]) {
    assert.strictEqual(api.todOf(at(h, 30)), "late",
      String(h).padStart(2, "0") + ":30 should be late, it is the end of an evening");
  }
});

test("each bucket covers the hours its label claims", () => {
  const want = {
    early: [5, 6, 7, 8, 9, 10, 11, 12],
    mid:   [13, 14, 15, 16, 17],
    late:  [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4],
  };
  for (const bucket of Object.keys(want)) {
    for (const h of want[bucket]) {
      assert.strictEqual(api.todOf(at(h, 0)), bucket,
        String(h).padStart(2, "0") + ":00 should be " + bucket);
    }
  }
});

test("every hour of the day lands in exactly one bucket", () => {
  const seen = {};
  for (let h = 0; h < 24; h++) {
    const b = api.todOf(at(h, 0));
    assert.ok(b === "early" || b === "mid" || b === "late", h + " gave " + b);
    seen[b] = (seen[b] || 0) + 1;
  }
  assert.strictEqual(Object.values(seen).reduce((a, b) => a + b, 0), 24);
  assert.ok(seen.early && seen.mid && seen.late, "no bucket may be empty");
});

test("the boundaries themselves sit on the right side", () => {
  assert.strictEqual(api.todOf(at(4, 59)), "late");
  assert.strictEqual(api.todOf(at(5, 0)),  "early");
  assert.strictEqual(api.todOf(at(12, 59)), "early");
  assert.strictEqual(api.todOf(at(13, 0)), "mid");
  assert.strictEqual(api.todOf(at(17, 59)), "mid");
  assert.strictEqual(api.todOf(at(18, 0)), "late");
});

/* ------------------------------------------------------- the filter itself */

test("a narrowed view returns only that bucket", () => {
  const board = [at(9, 0), at(14, 30), at(15, 0), at(19, 0), at(1, 0)];
  api.setSCOPE("day");
  for (const bucket of ["early", "mid", "late"]) {
    api.setTOD(bucket);
    const got = api.todFixtures(board);
    assert.ok(got.length > 0, bucket + " matched nothing");
    got.forEach(f => assert.strictEqual(api.todOf(f), bucket,
      "a " + api.todOf(f) + " fixture came back under " + bucket));
  }
});

test("a fixture with no readable kickoff no longer appears in every bucket", () => {
  /* It used to return null from todOf and be admitted by `b===null||b===TOD`,
     so one unparseable fixture showed up under Early and Mid day and Late. */
  const ghost = { date: "2026-08-29", time: "" };
  assert.strictEqual(api.todOf(ghost), null, "precondition: its time is unreadable");
  api.setSCOPE("day");
  for (const bucket of ["early", "mid", "late"]) {
    api.setTOD(bucket);
    assert.deepStrictEqual(api.todFixtures([ghost]), [],
      "the unplaceable fixture still leaks into " + bucket);
  }
});

test("'all day' and a wide scope are untouched by any of this", () => {
  const board = [at(9, 0), at(14, 30), at(19, 0), { date: "2026-08-29", time: "" }];
  api.setSCOPE("day"); api.setTOD("all");
  assert.strictEqual(api.todFixtures(board).length, 4, "All day must keep everything");
  api.setTOD("early"); api.setSCOPE("all");
  assert.strictEqual(api.todFixtures(board).length, 4,
    "a bucket describes one day, so it must not bite on a wide window");
});
