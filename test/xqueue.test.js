"use strict";
/* What goes to X, and when. A post that goes twice, or a code posted after its
 * first game kicked off, is a public mistake on the brand's own account. */
const test = require("node:test");
const assert = require("node:assert");
const { plan } = require("../scripts/xqueue.js");

const NOW = Date.parse("2026-09-24T12:00:00Z");           /* 13:00 in Lagos */
const leg = (date) => ({ date, home: "A", away: "B", tip: "1X, home or draw" });
const code = (date, first) => ({ date, firstKickoff: first, legs: [leg(date)],
  codes: { sporty: "ABC123" }, odds: 2.5 });
const graded = () => ({ hg: 1, ag: 0, hit: true });
const pending = () => null;

test("yesterday's graded result goes now, today's code 45 minutes later", () => {
  const out = plan([code("2026-09-23"), code("2026-09-24", "2026-09-24T18:00:00Z")], graded, {}, NOW);
  assert.deepEqual(out.map((j) => j.id), ["2026-09-23|result", "2026-09-24|code"]);
  assert.equal(out[0].at, NOW);
  assert.equal(out[1].at, NOW + 45 * 60 * 1000);
});

test("nothing goes twice", () => {
  const log = { "2026-09-23|result": {}, "2026-09-24|code": {} };
  assert.deepEqual(plan([code("2026-09-23"), code("2026-09-24", "2026-09-24T18:00:00Z")], graded, log, NOW), []);
});

test("a code is never posted once its first game has kicked off", () => {
  assert.deepEqual(plan([code("2026-09-24", "2026-09-24T12:10:00Z")], graded, {}, NOW), []);
});

test("a result waits until every leg is graded, and an old one is never dug up", () => {
  assert.deepEqual(plan([code("2026-09-23")], pending, {}, NOW), []);
  assert.deepEqual(plan([code("2026-09-18")], graded, {}, NOW), []);
});

test("a code minted for a later day is posted, alone and now", () => {
  const out = plan([code("2026-09-25", "2026-09-25T18:30:00Z")], pending, {}, NOW);
  assert.deepEqual(out.map((j) => [j.id, j.at]), [["2026-09-25|code", NOW]]);
});
