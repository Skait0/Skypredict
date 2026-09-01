"use strict";

/**
 * What the build is allowed to publish as a result.
 *
 * The rule the user set after seeing five wrong results on the past-results
 * page: nothing goes out until the score is confirmed. A recorded row carries
 * two things of different standing - the tip and probabilities are ours and
 * are right, the score is a guess the sweep made by watching the match vanish
 * from the live feed. So the prediction is kept and the score has to be
 * re-sourced before anything reaches a page.
 *
 * These run with EVERY score source switched off, which is the honest default
 * for a checkout and also the case that matters most: when nothing can answer,
 * the build must fall silent rather than fall back on the guess.
 *
 * There are two sources now. Unsetting the API key alone stopped being enough
 * the moment SoccerVista arrived - it needs no key, so it is on by default and
 * these tests started confirming rows over the real network, which is both a
 * false pass and a test suite that phones a stranger.
 */

const test = require("node:test");
const assert = require("node:assert");

const B = require("../lib/build.js");

const KEY_ENV = "APISPORTS_KEY";
const OFF_ENV = "SOCCERVISTA_OFF";
let saved, savedOff;
test.before(() => {
  saved = process.env[KEY_ENV]; delete process.env[KEY_ENV];
  savedOff = process.env[OFF_ENV]; process.env[OFF_ENV] = "1";
});
test.after(() => {
  if (saved !== undefined) process.env[KEY_ENV] = saved;
  if (savedOff === undefined) delete process.env[OFF_ENV];
  else process.env[OFF_ENV] = savedOff;
});

const log = () => [];

test("an unconfirmed row is not published", async () => {
  const row = { match_date: "2026-08-28", home: "Bayern Munich", away: "Stuttgart",
                hg: 1, ag: 0, tip: "Over 1.5", hit: false, source: "sweep" };
  const out = await B.confirmScores([row], log());
  assert.strictEqual(out.has(row), false,
    "a sweep guess must not reach the page just because nothing could check it");
});

test("a row already confirmed on an earlier build stands", async () => {
  /* This is what makes a confirmation outlive the few days the free plan will
     answer for: once corrected, the row is marked and never re-asked. */
  const row = { match_date: "2026-08-28", home: "Bayern Munich", away: "Stuttgart",
                hg: 5, ag: 1, tip: "Over 1.5", hit: true, source: "oracle" };
  const out = await B.confirmScores([row], log());
  assert.ok(out.has(row));
  assert.deepStrictEqual(out.get(row), { hg: 5, ag: 1, hit: true });
});

test("a confirmed row is re-graded rather than trusted blindly", async () => {
  /* Same stored score, but the stored verdict is wrong. The grader decides, so
     a bad `hit` written by an older build cannot survive into a new payload. */
  const row = { match_date: "2026-08-28", home: "Lille", away: "Paris SG",
                hg: 2, ag: 2, tip: "X2, draw or away", hit: false, source: "oracle" };
  const out = await B.confirmScores([row], log());
  assert.strictEqual(out.get(row).hit, true,
    "2-2 settles X2 as a hit whatever the row happened to say");
});

test("a tip no final score can settle keeps whatever verdict it had", async () => {
  const row = { match_date: "2026-08-28", home: "A", away: "B",
                hg: 1, ag: 1, tip: "First half goal", hit: true, source: "oracle" };
  const out = await B.confirmScores([row], log());
  assert.strictEqual(out.get(row).hit, true);
});

test("mixed input keeps the confirmed and drops the rest", async () => {
  const good = { match_date: "2026-08-28", home: "Milan", away: "Venezia",
                 hg: 2, ag: 0, tip: "1X, home or draw", hit: true, source: "oracle" };
  const guess = { match_date: "2026-08-28", home: "Alaves", away: "Villarreal",
                  hg: 1, ag: 0, tip: "X2, draw or away", hit: false, source: "sweep" };
  const out = await B.confirmScores([good, guess], log());
  assert.strictEqual(out.size, 1);
  assert.ok(out.has(good));
  assert.strictEqual(out.has(guess), false);
});

test("nothing in, nothing out, and no request attempted", async () => {
  assert.strictEqual((await B.confirmScores([], log())).size, 0);
  assert.strictEqual((await B.confirmScores(null, log())).size, 0);
});

test("the build says out loud that it could not confirm", async () => {
  const lines = [];
  await B.confirmScores([{ match_date: "2026-08-28", home: "A", away: "B",
    hg: 0, ag: 0, tip: "Over 1.5", hit: false, source: "sweep" }], lines);
  assert.ok(lines.some(l => /no score source configured/i.test(l)),
    "a silent hold is indistinguishable from having no results; it must be logged");
  assert.ok(lines.some(l => /1 recorded result/.test(l)),
    "and it must say how many rows it is holding, or the line says nothing useful");
});
