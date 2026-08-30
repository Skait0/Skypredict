"use strict";

/**
 * A La Liga fixture booked as an Ecuadorian one.
 *
 * Reported: "i think our model mixes barcelona sc in ecuador for Barcelona of
 * spain because i just got a game from equador 1x."
 *
 * Right about the symptom, and it was worse than a mixed-up rating — the wrong
 * event id was attached, so the booking code put an Ecuadorian match on the
 * slip. Our "Barcelona v Vallecano" (La Liga, 31 Aug, kick-off 19:30) carried
 * `sr:match:68687872`, which is "Barcelona SC v CSD Independiente del Valle"
 * (Ecuador, 3 Sept). The right event, `sr:match:72478512`, was on the same feed
 * at the same minute and lost.
 *
 * Two faults compounded, and neither alone would have done it:
 *
 * 1. "Barcelona SC" — Barcelona Sporting Club of Guayaquil — normalises to
 *    exactly "barcelona". The "SC" is stripped by the Brazilian state-code rule
 *    (SC = Santa Catarina). So both home sides scored a perfect 2.0 and the
 *    away side decided the match.
 *
 * 2. On the away side our feed writes "Vallecano" where SportyBet writes "Rayo
 *    Vallecano", which an alias folds to "rayo" — so the CORRECT pairing scored
 *    0.0. Meanwhile "Vallecano" matched "Independiente del VALLE" at 1.0,
 *    because the token prefix rule accepts "valle" as a prefix of "vallecano".
 *
 * Final scores: the Ecuador fixture 3.0, the real one 2.0. The wrong game won.
 *
 * The fix is two-part, and the choice of lever was measured rather than
 * guessed. Tightening the prefix rule with a length-ratio guard also killed the
 * bug — and took "Univ. Craiova" -> "CS Universitatea Craiova" with it at every
 * threshold from 0.6 to 0.8, a correct match lost. So the prefix rule is left
 * alone and the two real causes are addressed instead:
 *
 *   - an alias so our "Vallecano" and their "Rayo Vallecano" converge
 *   - a kick-off fence, because two events two days apart are not one match
 *
 * Measured on the live feed: of 214 attached fixtures, 212 sat within fifteen
 * minutes of their event and one more within seven hours. The only one outside
 * a day was this bug, at 52.5 hours. Simulated over the whole board, the fix
 * left the match count identical at 217, moved Barcelona onto the right event,
 * and left Craiova alone.
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

/* Take the window from the source, never redeclare it here. Written the lazy
   way first - `"var MATCH_WINDOW_MS=24*60*60*1000;" + ...` - which meant the
   tests measured the harness's own constant. Widening the real one to a week
   changed nothing and every assertion still passed. */
const WINDOW_DECL = /var MATCH_WINDOW_MS\s*=\s*[^;]+;/.exec(src);
assert.ok(WINDOW_DECL, "MATCH_WINDOW_MS not found in index.html");
const api = new Function(
  WINDOW_DECL[0] + grab("evStart") + grab("sameSlot") +
  "\nreturn {sameSlot: sameSlot, MATCH_WINDOW_MS: MATCH_WINDOW_MS};")();

test("the fence is a day, and the tests are measuring the real one", () => {
  assert.strictEqual(api.MATCH_WINDOW_MS, 24 * 60 * 60 * 1000,
    "a wider fence lets the 52.5-hour mismatch back in");
});

const FIX = { kickoff: "2026-08-31T19:30:00.000Z" };
const ev = (iso) => ({ startTime: Date.parse(iso) });

test("the reported pairing is refused on time alone", () => {
  /* 31 Aug 19:30 against 3 Sept 00:00 - 52.5 hours. */
  assert.strictEqual(api.sameSlot(FIX, ev("2026-09-03T00:00:00.000Z")), false,
    "an event two days away cannot be the same match");
});

test("the right event is accepted", () => {
  assert.strictEqual(api.sameSlot(FIX, ev("2026-08-31T19:30:00.000Z")), true);
});

test("the fence is wide enough for the honest disagreements", () => {
  /* 212 of 214 matches sit inside fifteen minutes, and one legitimate pairing
     (Celta v Malaga) is seven hours out because one feed had a provisional
     time. A tight window would drop that; a day would not. */
  assert.strictEqual(api.sameSlot(FIX, ev("2026-09-01T02:30:00.000Z")), true,
    "seven hours is a provisional kick-off, not a different match");
  assert.strictEqual(api.sameSlot(FIX, ev("2026-09-01T19:29:00.000Z")), true,
    "just under a day still matches");
  assert.strictEqual(api.sameSlot(FIX, ev("2026-09-01T19:31:00.000Z")), false,
    "just over a day does not");
});

test("a missing time never refuses a match", () => {
  /* No time is not evidence of a mismatch. Refusing on it would drop good
     matches whenever the feed omits a kick-off - a fix worse than the bug. */
  assert.strictEqual(api.sameSlot({}, ev("2026-09-03T00:00:00.000Z")), true,
    "our fixture has no kickoff - allow it");
  assert.strictEqual(api.sameSlot(FIX, { startTime: null }), true,
    "the event has no start time - allow it");
  assert.strictEqual(api.sameSlot(FIX, { startTime: "not a date" }), true);
});

/* ------------------------------------------------------- wiring and aliases */

test("every name-based matching path is fenced", () => {
  /* Three paths attach an event id by name: the exact-normalised pass, the
     per-side scoring pass, and the global fallback that searches the whole
     feed regardless of date. The kick-off fallback has its own ten-minute
     bound. All of them need the fence; the global one most of all. */
  /* Anchored on the `!` so this counts guard sites, not the declaration
     `function sameSlot(f,m){`, which the looser pattern also matched. */
  const calls = src.match(/if\(!sameSlot\(f,\s*(?:m|cand\[i\])\)\)/g) || [];
  assert.strictEqual(calls.length, 3,
    "expected the fence on all three name-based passes, found " + calls.length);
});

test("our Vallecano and their Rayo Vallecano converge", () => {
  const block = src.slice(src.indexOf("var TEAM_ALIASES ="), src.indexOf("var NT_CACHE"));
  assert.match(block, /"rayo vallecano":\s*"rayo"/, "theirs");
  assert.match(block, /"vallecano":\s*"rayo"/,
    "ours - without this the correct pairing scored zero on the away side");
});

test("the prefix rule is deliberately left alone", () => {
  /* A length-ratio guard on it also fixed the bug and broke "Univ. Craiova"
     against "CS Universitatea Craiova" at every threshold tried. Whoever
     revisits this should know that was measured, not assumed. */
  const fn = grab("simTeams");
  assert.match(fn, /x\.indexOf\(y\)===0\|\|y\.indexOf\(x\)===0/,
    "the prefix rule stays - Univ. Craiova depends on it");
});
