"use strict";

/**
 * Which seasons the build downloads.
 *
 * The list was the literal ["2425", "2526"]. On 2 September 2026 the build was
 * still asking for exactly those and being served them perfectly, so it
 * reported `downloaded 60/60 sources` while every European league's CURRENT
 * season was missing - nobody ever requested /mmz4281/2627/.
 *
 * The cost was not two held-back results, though that is how it surfaced. The
 * model was being fitted on results ending in May 2026 with a 200-day
 * half-life: every prediction on the board was made without a single match of
 * the season being played. football-data could also only ever confirm scores
 * from the per-country files (ARG, BRA, USA...), which are calendar-year and
 * not season-coded - which is exactly why they kept working and hid the size
 * of the gap.
 *
 * A hardcoded season list is a bug with a delayed fuse: correct until July,
 * then silently wrong, with a green build either way.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const B = require("../lib/build.js");

const at = (iso) => Date.parse(iso + "T12:00:00Z");

test("a season is named for the July it starts in", () => {
  assert.deepStrictEqual(B.seasonCodes(at("2026-09-02"), 1), ["2627"]);
  assert.deepStrictEqual(B.seasonCodes(at("2026-08-28"), 1), ["2627"],
    "the day the two held-back games were played");
});

test("before July we are still in the season that began last year", () => {
  assert.deepStrictEqual(B.seasonCodes(at("2026-06-30"), 1), ["2526"],
    "June is the tail of 2025-26, not the start of 2026-27");
  assert.deepStrictEqual(B.seasonCodes(at("2027-05-31"), 1), ["2627"],
    "and May, when the season is finishing");
});

test("the turn is 1 July, before any league kicks off", () => {
  /* Early rather than late on purpose. Turning over in August would miss the
     opening rounds - the exact failure this replaces. A file that is not
     published yet 404s, which is non-fatal and now printed. */
  assert.deepStrictEqual(B.seasonCodes(at("2026-07-01"), 1), ["2627"]);
});

test("it returns history oldest first, as many as asked for", () => {
  assert.deepStrictEqual(B.seasonCodes(at("2026-09-02"), 3), ["2425", "2526", "2627"]);
  assert.deepStrictEqual(B.seasonCodes(at("2026-09-02"), 2), ["2526", "2627"]);
});

test("the century does not break the two-digit code", () => {
  assert.deepStrictEqual(B.seasonCodes(at("2099-08-01"), 2), ["9899", "9900"],
    "1999-2000 was '9900' and 2099-2100 is the same shape");
  assert.deepStrictEqual(B.seasonCodes(at("2100-08-01"), 1), ["0001"]);
});

/* ------------------------------------------------------------ the config */

test("the build's own season list includes the season being played", () => {
  /* The assertion that would have caught it. Every test above can pass while
     DEFAULTS still holds a literal, so this compares the config the build
     actually uses against today's real date. It fails the moment the list
     stops moving with the calendar - which is the only way this bug appears. */
  const now = B.seasonCodes(Date.now(), 1)[0];
  assert.ok(B.DEFAULTS.seasons.includes(now),
    `the current season ${now} must be downloaded, got ${B.DEFAULTS.seasons}`);
});

test("and keeps history rather than trading it away", () => {
  assert.strictEqual(B.DEFAULTS.seasons.length, 3,
    "current plus two: adding the missing season must not cost the model any");
  assert.deepStrictEqual(B.DEFAULTS.seasons, B.seasonCodes(Date.now(), 3));
});

test("the list is computed, not written down", () => {
  /* Source-level, and worth it here. A literal that happens to be right today
     passes every test above and rots on 1 July, in silence, exactly as before.
     What makes it undetectable is that the wrong request SUCCEEDS. */
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  const cfg = src.slice(src.indexOf("const DEFAULTS = {"));
  const line = cfg.slice(0, cfg.indexOf("halfLife"));
  assert.doesNotMatch(line, /seasons:\s*\[\s*"/,
    "a hardcoded season list works until July and then silently stops");
  assert.match(line, /seasons:\s*seasonCodes\(/);
});
