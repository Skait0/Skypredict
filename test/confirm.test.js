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

/* ---------------------------------------------------- recording the tip */

/**
 * A tip only reaches the record if a row exists saying we made it, and until
 * now the only thing writing those rows was the sweep - which notices a match
 * by seeing it live. GitHub throttles that to about five runs a day, so on
 * 31 Aug 2026 it recorded 21 of roughly 30 tips and the other nine never
 * happened as far as the record was concerned.
 *
 * The build knows every tip, because it is the thing that decides them. What
 * these pin is WHEN it is allowed to write one down.
 */

const DB = require("../lib/supabase.js");
const src = require("fs").readFileSync(
  require("path").join(__dirname, "..", "lib", "build.js"), "utf8");

test("the tip written to the record is the one that was published", () => {
  /* The whole integrity of the record rests on this. The model refits on every
     build, so re-deciding a tip after the final whistle would file whichever
     call happened to look better. The tips come from the board the site was
     already showing - prebuild fetches it for the pick of the day - not from
     the build doing the writing. */
  const fn = src.slice(src.indexOf("async function recordPublishedTips"),
                       src.indexOf("async function buildPayload"));
  assert.match(fn, /recordPublishedTips\(prevFixtures, log\)/,
    "it must take the previously published board as its input");
  assert.match(fn, /tip: f\.tip/, "and write that board's tip verbatim");
  assert.doesNotMatch(fn, /bestTip|chooseTip|scoreForTip/,
    "it must never decide a tip of its own");
  assert.match(src, /await recordPublishedTips\(cfg\.prevFixtures, log\)/,
    "wired to the previous board, not to the fixtures this build just made");
});

test("only matches that have finished are written", () => {
  const fn = src.slice(src.indexOf("async function recordPublishedTips"),
                       src.indexOf("async function buildPayload"));
  assert.match(fn, /if \(!isFinite\(ko\) \|\| ko > now\) continue;/,
    "kicked off - a source only returns finished matches, so that is enough");
  assert.match(fn, /!isFinite\(ko\)/,
    "and a fixture with no kick-off time is skipped rather than assumed over");
  assert.match(fn, /GRADE\.gradeLabel\(f\.tip, m\.hg, m\.ag\)/,
    "the verdict is graded from the published tip and the observed score");
  assert.match(fn, /if \(hit === null\) continue;/,
    "a tip no final score can settle is not filed with a guessed verdict");
});

test("recording is non-fatal and never rewrites a row already on file", () => {
  const fn = src.slice(src.indexOf("async function recordPublishedTips"),
                       src.indexOf("async function buildPayload"));
  assert.match(fn, /if \(!DB\.configured\(\)\) return;/);
  assert.match(fn, /failed \(non-fatal\)/, "a store outage must not fail a build");
  const store = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "supabase.js"), "utf8");
  assert.match(store, /resolution=ignore-duplicates/,
    "this runs on every build; without ignore-duplicates it would rewrite history");
});

