"use strict";
/* THE PARSER IS THE PLACE THIS WORK CAN INVENT A RESULT.
 *
 * openfootball records a knockout tie as
 *     4-3 pen. 1-1 a.e.t. (1-1, 0-1)
 * which is a penalty shootout, then the score after extra time, then
 * (90 minutes, half time). A reader that takes the first pair it sees
 * records a 4-3 football match that was really 1-1, and the model would
 * fit on it without a murmur.
 *
 * The model is fitted on 90-minute scores, so the 90-minute score is the
 * only one allowed out of here. */
const test = require("node:test");
const assert = require("node:assert");
const OF = require("../lib/openfootball.js");

const line = (s) => OF.parse(s).rows[0];

test("an ordinary result is the bare score, with the parens as half time", () => {
  const r = line("    18:45  Athletic Club (ESP)     v Arsenal FC (ENG)         0-2 (0-0)");
  assert.equal(r.home, "Athletic Club");
  assert.equal(r.homeCC, "ESP");
  assert.equal(r.away, "Arsenal FC");
  assert.equal(r.awayCC, "ENG");
  assert.deepEqual([r.hg, r.ag], [0, 2]);
  assert.deepEqual([r.hth, r.hta], [0, 0]);
  assert.equal(r.aet, false);
});

test("extra time: the parens carry the 90-minute score FIRST, then half time", () => {
  const r = line("    21:00  Juventus FC (ITA)  v Galatasaray SK (TUR)  3-2 a.e.t. (3-0, 1-0)");
  assert.deepEqual([r.hg, r.ag], [3, 0], "3-2 is after extra time; 90 minutes was 3-0");
  assert.deepEqual([r.hth, r.hta], [1, 0]);
  assert.equal(r.aet, true);
});

test("a shootout is never returned as a football result", () => {
  const r = line("    18:00  Paris SG (FRA)  v Arsenal FC (ENG)  4-3 pen. 1-1 a.e.t. (1-1, 0-1)");
  assert.deepEqual([r.hg, r.ag], [1, 1],
    "4-3 is a penalty shootout and 1-1 the extra-time score; 90 minutes was 1-1");
  assert.deepEqual([r.hth, r.hta], [0, 1]);
  assert.equal(r.pen, true);
});

test("extra time with only one pair in the parens leaves half time unknown", () => {
  const r = line("    19:00  FK Partizani (ALB)  v JK Nomme Kalju (EST)  0-1 a.e.t. (0-0)");
  assert.deepEqual([r.hg, r.ag], [0, 0]);
  assert.equal(r.hth, null, "a half-time score we do not have must be null, never 0");
  assert.equal(r.hta, null);
});

test("an inconsistent line is dropped and reported, not repaired", () => {
  /* The extra-time score can never be BEHIND the 90-minute score. */
  const out = OF.parse("    18:45  A Club (ESP)  v B Club (ITA)  1-0 a.e.t. (3-0, 1-0)");
  assert.equal(out.rows.length, 0);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0].why, /extra time/i);
});

test("headers, blank lines and matchday markers are ignored silently", () => {
  const out = OF.parse([
    "= UEFA Champions League 2025/26",
    "# Matches    189",
    "",
    "> League, Matchday 1",
    "  Tue Sep 16 2025",
    "    18:45  A Club (ESP)  v B Club (ITA)  1-0 (0-0)",
  ].join("\n"));
  assert.equal(out.rows.length, 1);
  assert.equal(out.dropped.length, 0, "structure lines are not failures and must not be reported");
});

test("a club with no country tag is dropped rather than half-read", () => {
  const out = OF.parse("    18:45  A Club  v B Club (ITA)  1-0 (0-0)");
  assert.equal(out.rows.length, 0);
  assert.equal(out.dropped.length, 1);
});
