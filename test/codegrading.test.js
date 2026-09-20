"use strict";
/* TWELVE DAYS OF CODES, EVERY ONE OF THEM "PENDING".
 *
 * /booking-codes on 20 Sep 2026: today's slip printed, and under it eleven
 * earlier days, all of them reading "pending" - including 8 Sep, whose matches
 * finished a fortnight before. The page's entire claim is that everybody posts
 * codes and nobody says what happened next.
 *
 * Nothing was wrong with the grading. prebuild keyed each leg on
 * `K.fixtureKey(leg.date, home, away)` and mkcode never wrote a `date`: it
 * wrote home, away, league, kickoff, tip, tip_p and market. Every lookup asked
 * for the key "|home|away" and every lookup missed.
 *
 * test/dailycodes.test.js passed throughout, because its fixture legs carry a
 * date that the thing producing legs did not - see
 * [[skypredict-test-callers-not-just-logic]]. So this file tests the two ends
 * against each other and against the file on disk, and never against a leg it
 * built itself.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const mkcode = fs.readFileSync(path.join(root, "scripts", "mkcode.js"), "utf8");
const prebuild = fs.readFileSync(path.join(root, "scripts", "prebuild.js"), "utf8");
const K = require("../lib/key.js");

test("the minter writes the one field the grader looks a leg up by", () => {
  const legs = mkcode.slice(mkcode.indexOf("legs: working.map"),
                            mkcode.indexOf("codes: codes,"));
  assert.match(legs, /date: p\.f\.date \|\| date,/,
    "a leg with no date can never be graded, however well the grading works");
});

test("the days already on disk are gradable too", () => {
  /* The twelve minted before the fix have no date. They are graded by their
     kickoff, which is the same day by construction: a fixture's date is its
     kickoff in UTC. Assert the fallback exists AND that it produces a key the
     payload's own results actually match - a fallback that resolves nothing
     is the bug with an extra line. */
  assert.match(prebuild, /const legDay = \(leg\) => leg\.date \|\| String\(leg\.kickoff \|\| ""\)\.slice\(0, 10\);/);
  assert.match(prebuild, /K\.fixtureKey\(legDay\(leg\), leg\.home, leg\.away\)/);

  const days = JSON.parse(fs.readFileSync(path.join(root, "data", "daily-codes.json"), "utf8"));
  const legs = Object.values(days).flatMap((e) => (e && e.legs) || []);
  assert.ok(legs.length >= 5, "no codes minted yet, so this proves nothing");
  const legDay = (leg) => leg.date || String(leg.kickoff || "").slice(0, 10);
  for (const l of legs) {
    assert.match(legDay(l), /^\d{4}-\d{2}-\d{2}$/,
      l.home + " v " + l.away + " can be placed on no day at all");
  }

  /* And the key really is the shape the build's result index is keyed in. */
  let payload = null;
  try {
    payload = JSON.parse(fs.readFileSync(path.join(root, "public", "predictions.json"), "utf8"));
  } catch (e) { return; }                 /* no build output here - the assertions above stand alone */
  const byKey = new Set((payload.results || [])
    .filter((r) => r && r.hg != null)
    .map((r) => K.fixtureKey(r.date || "", r.home, r.away)));
  const older = legs.filter((l) => legDay(l) < new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10));
  const found = older.filter((l) => byKey.has(K.fixtureKey(legDay(l), l.home, l.away)));
  /* Not all of them: the payload carries a fortnight of results and the leagues
     it grades, so an older day or a smaller league is legitimately absent. One
     resolution is the whole point - it was nought. */
  assert.ok(found.length > 0,
    "not one settled leg matched a result, which is what 'pending for ever' looks like");
});
