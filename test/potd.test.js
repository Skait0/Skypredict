"use strict";

/**
 * The Pick of the day has to stay picked.
 *
 * Reported: "the POTD changed to a game tommorw, i thought we agreed that it
 * stays, the result cant be put if it has been played... and why is POTD even
 * a game by 12.30 am of the neext daay?"
 *
 * Two faults, and the second caused the first.
 *
 * 1. The lock was looked up only among the rows for the day being viewed:
 *
 *        top = day.filter(f => fid(f) === lock.id)[0] || null;
 *        if (!top) { ...pick a fresh one and overwrite the lock... }
 *
 *    predictions.json is rebaked on every deploy, not only by the 06:30 cron -
 *    scripts/prebuild.js bakes it as part of the build. A rebake can drop or
 *    re-date a row, and when it did, the lock fell through in silence and the
 *    card re-picked. That is how it jumped off a game that had been played,
 *    taking the result it was supposed to be holding with it.
 *
 * 2. What it jumped ONTO was a game already finished. The fixture day is a
 *    calendar date in UTC, so an MLS kickoff at 23:30 UTC is 00:30 in Lagos -
 *    played overnight, still stamped as today's, and ranking second on the
 *    board (Inter Miami v CF Montreal, 93.19%, against the leader's 94.07%).
 *    Calling a game that finished before breakfast "the pick of the day" is
 *    not a prediction.
 *
 * Worth keeping in view: the top of the board is a dense cluster - the top six
 * were all Over 1.5 between 90.4% and 94.1%, the first two separated by 0.88
 * of a point. Recalibration moves those numbers every build, so which fixture
 * is "strongest" is genuinely unstable. The lock is what makes the promise;
 * nothing about the ordering can be relied on to.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

const potd = grab("renderPotd");

/* Slice the custom-payout input handler by brace matching rather than a fixed
   character count. A window of "i + 900" broke once already when a comment
   grew - the test then fails for a reason that has nothing to do with the
   behaviour it is guarding. */
function custInputHandler() {
  const i = src.indexOf('_cust.addEventListener("input"');
  assert.ok(i > 0, "the custom box has no input handler");
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}


test("the lock is searched across the whole payload, not just the day", () => {
  /* The exact fall-through. Searching only `day` meant a rebake that moved the
     row silently re-picked and overwrote the lock. */
  const i = potd.indexOf("if(lock&&lock.id)");
  assert.ok(i > 0, "the lock lookup is gone");
  const lookup = potd.slice(i, i + 320);
  assert.match(lookup, /DATA\.fixtures/,
    "a lock that is not among today's rows must still be looked for in the payload");
});

test("a pick that has already kicked off is not chosen", () => {
  assert.match(potd, /notStarted\(f\)/,
    "selection must prefer fixtures that have not started");
  const i = potd.indexOf("var upcoming=");
  const j = potd.indexOf("potdDemerit=");
  assert.ok(i > 0 && j > i,
    "the kickoff filter has to narrow the pool BEFORE it is ranked, or it " +
    "ranks the full pool and the filter does nothing");
});

test("but a card with nothing left to come still shows a pick", () => {
  /* A hard filter would blank the headline late at night, which is worse than
     showing the day's game. Preference, not exclusion - the same shape as the
     cross_tier guard above it. */
  assert.match(potd, /if\(upcoming\.length\)\s*pool=upcoming;/,
    "the narrowing must be conditional on there being anything left");
});

test("the rank claim is only made while it is true", () => {
  /* The pick is locked for the day and the board is refitted underneath it, so
     another fixture can overtake it by the evening. */
  assert.match(potd, /_stillTop/, "the claim must be conditional");
  /* lastIndexOf, not indexOf: the comment explaining this contains the same
     phrase, and matching that instead would pass whatever the code did. */
  const i = potd.lastIndexOf("strongest call on the day's card");
  assert.ok(i > 0);
  assert.match(potd.slice(Math.max(0, i - 200), i), /_stillTop\?/,
    '"the strongest call" has to be guarded by whether it still is');
});

test("a win is announced and a loss is left alone", () => {
  /* "if it wins, say so, if it doesnt win. leave it as it is." Already the
     behaviour - pinned so it stays that way. */
  assert.match(potd, /celebrate wins only/);
  assert.match(potd, /potd-status potd-won'>✔ Won/,
    "a win gets a Won chip");
  const i = potd.indexOf("upcoming, or lost");
  assert.ok(i > 0, "the losing branch must fall back to the plain tip");
  const branch = potd.slice(i, i + 260);
  assert.doesNotMatch(branch, /Lost|Miss|✘/,
    "a loss is never labelled as one");
});

/* ------------------------------------------------------ the custom payout */

test("typing your own payout drops the ladder pick and the built slip", () => {
  /* Reported: "when the 'own' input tab is toggled, let any xN selection be
     unchecked and slip cleared." The chip stayed lit and the slip built for it
     stayed on screen until the box was committed, so the panel showed x1k
     selected, x1k's games below, and a different half-typed target in the box. */
  const h = custInputHandler();
  assert.match(h, /WSP\.odds=null/, "the ladder selection must be dropped");
  assert.match(h, /WSP\.conjured=false/, "and the built slip cleared");
  assert.match(h, /WSP\._slip=null/);
  assert.match(h, /renderBuilder\(\)/, "and the panel redrawn to show it");
});

test("the typed digits and the caret survive that redraw", () => {
  /* The redraw builds a fresh input whose value comes from WSP.odds, which was
     just set to null - so without this the first keystroke vanishes. */
  const h = custInputHandler();
  assert.match(h, /again\.value=c/, "the keystroke must be put back");
  assert.match(h, /setSelectionRange\(c\.length,c\.length\)/,
    "and the caret left after it, not at the start");
});

test("it only redraws once, not on every keystroke", () => {
  const h = custInputHandler();
  assert.match(h, /if\(WSP\.odds==null && !WSP\.conjured\) return;/,
    "with nothing selected and nothing built there is nothing to clear, so " +
    "every keystroke after the first must return early");
});
