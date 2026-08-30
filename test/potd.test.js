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
  const i = potd.indexOf("if(!top&&lock&&lock.id)");
  assert.ok(i > 0, "the lock fallback is gone");
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

/* ------------------------------------------------- decided once, in the build */

const build = require("../lib/build.js");

function fx(o) {
  return Object.assign({ date: "2026-08-30", league: "Eliteserien", tip_p: 0.8,
    kickoff: "2026-08-30T20:00:00.000Z" }, o);
}
const FUTURE = Date.parse("2026-08-30T12:00:00.000Z");

test("the build stamps the pick, so every device shows the same one", () => {
  /* Deciding it per browser meant two people never had to be looking at the
     same "pick of the day", and a cleared cache re-rolled it. */
  const p = build.choosePotd([
    fx({ home: "A", away: "B", tip_p: 0.80 }),
    fx({ home: "C", away: "D", tip_p: 0.94 }),
  ], null, FUTURE);
  assert.strictEqual(p.home, "C", "highest confidence wins");
  assert.strictEqual(p.id, "m20260830CD", "and carries the client's own id form");
});

test("a pick already made is kept, which is the whole point", () => {
  const board = [fx({ home: "A", away: "B", tip_p: 0.80 }),
                 fx({ home: "C", away: "D", tip_p: 0.94 })];
  const prev = { id: "m20260830AB", home: "A", away: "B", date: "2026-08-30" };
  assert.deepStrictEqual(build.choosePotd(board, prev, FUTURE), prev,
    "the weaker previous pick still holds - a rebake must not re-roll it");
});

test("but a pick that has left the card is replaced", () => {
  const board = [fx({ home: "C", away: "D", tip_p: 0.94 })];
  const prev = { id: "m20260830AB", home: "A", away: "B", date: "2026-08-30" };
  assert.strictEqual(build.choosePotd(board, prev, FUTURE).home, "C");
});

test("a game that has already kicked off is not picked", () => {
  /* The reported case: an MLS kickoff at 23:30 UTC is 00:30 in Lagos, played
     overnight, still stamped as today's, and it was ranking second. */
  const p = build.choosePotd([
    fx({ home: "Inter Miami", away: "CF Montreal", tip_p: 0.93,
         kickoff: "2026-08-29T23:30:00.000Z" }),
    fx({ home: "Viking", away: "Aalesund", tip_p: 0.88 }),
  ], null, FUTURE);
  assert.strictEqual(p.home, "Viking",
    "the overnight game is out even though it is the stronger call");
});

test("a day with nothing left to come still yields a pick", () => {
  const past = [fx({ home: "A", away: "B", kickoff: "2026-08-30T09:00:00.000Z" })];
  assert.ok(build.choosePotd(past, null, FUTURE),
    "a hard filter would blank the headline late at night");
});

test("thin support and a league we model badly are still demerits", () => {
  const p = build.choosePotd([
    fx({ home: "A", away: "B", tip_p: 0.95, thin: true }),
    fx({ home: "C", away: "D", tip_p: 0.94, league: "Japan J1 League" }),
    fx({ home: "E", away: "F", tip_p: 0.70 }),
  ], null, FUTURE);
  assert.strictEqual(p.home, "E",
    "the headline is the last place a number nobody has earned should lead");
});

test("the build's Asia list matches the app's, character for character", () => {
  /* Two copies exist because index.html is standalone and cannot import. This
     turns the drift risk into a failing test instead of a silent divergence. */
  const m = /var ASIA_PREFIXES=\[([\s\S]*?)\];/.exec(src);
  assert.ok(m, "ASIA_PREFIXES not found in index.html");
  /* Collapse the line breaks between entries only - stripping all whitespace
     would also eat the spaces inside "Saudi Arabia" and report a drift that
     is not there. */
  const app = JSON.parse("[" + m[1].replace(/\s*\n\s*/g, " ") + "]");
  assert.deepStrictEqual(build.POTD_ASIA, app,
    "lib/build.js POTD_ASIA and index.html ASIA_PREFIXES have drifted apart");
});

test("the app prefers the baked pick over its own localStorage lock", () => {
  assert.match(potd, /DATA\.potd&&DATA\.potd\.date===dateStr/,
    "the payload's pick must be consulted first");
  const i = potd.indexOf("const baked=");
  const j = potd.indexOf("if(!top&&lock&&lock.id)");
  assert.ok(i > 0 && j > i, "the lock is now only the fallback");
});
