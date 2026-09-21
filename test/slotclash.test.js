"use strict";

/**
 * A club cannot play two matches at the same minute, and on 21 Sep 2026 the
 * board said two of them did.
 *
 * "Barracas Central v Ind. Rivadavia" came off the bookmaker's card and
 * "Barracas Central v Independiente" off the league feed - same competition,
 * same 22:00 kick-off, one of them a match that does not exist. Both away
 * names are real Argentine clubs, so the name matcher resolved each to a
 * different team and every guard in the build passed them: the dedupe is keyed
 * on the two MATCHED teams, and those genuinely differed.
 *
 * The cost was not cosmetic. Both rows paired to the same SportyBet event, so
 * the day's own booking code SPXK1M went out with five legs and four games,
 * and the two books that refuse a same-game multiple - BetKing and Betpawa -
 * rejected a converted slip whose fixtures all looked different to the reader.
 * The duplicate leg would also have been graded twice in the record.
 */

const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");

const KO = "2026-09-21T22:00:00.000Z";
const LATER = "2026-09-21T23:00:00.000Z";

test("the second fixture on a club's kick-off slot is refused", () => {
  const seen = {};
  assert.strictEqual(
    B.slotClash(seen, KO, ["barracas", "rivadavia"], "Barracas v Ind. Rivadavia"),
    null, "the first fixture takes the slot");
  /* The real pair: the home club is the same team, the away clubs are not. */
  assert.strictEqual(
    B.slotClash(seen, KO, ["barracas", "independiente"], "Barracas v Independiente"),
    "Barracas v Ind. Rivadavia",
    "a second match for the same club at the same minute must be named");
});

test("the away side counts as much as the home side", () => {
  const seen = {};
  B.slotClash(seen, KO, ["a", "b"], "A v B");
  assert.ok(B.slotClash(seen, KO, ["c", "b"], "C v B"),
    "B cannot be away in two places at once either");
});

test("a double-header at another time is left alone", () => {
  /* The guard is on the INSTANT, not the date. A club playing twice in one day
     at different times is rare and real, and refusing it would drop a fixture
     that exists - the opposite mistake. */
  const seen = {};
  B.slotClash(seen, KO, ["a", "b"], "A v B");
  assert.strictEqual(B.slotClash(seen, LATER, ["a", "c"], "A v C"), null);
});

test("two ordinary fixtures at the same minute are not a clash", () => {
  /* Saturday at 15:00 is a dozen matches. Only a shared CLUB is the tell. */
  const seen = {};
  B.slotClash(seen, KO, ["a", "b"], "A v B");
  assert.strictEqual(B.slotClash(seen, KO, ["c", "d"], "C v D"), null);
  assert.strictEqual(B.slotClash(seen, KO, ["e", "f"], "E v F"), null);
});

test("the guard records both clubs, not only the one it was asked about", () => {
  /* A half-recorded slot is a guard that passes the second time and fails the
     third, which is worse than no guard: it would look like it works. */
  const seen = {};
  B.slotClash(seen, KO, ["a", "b"], "A v B");
  assert.deepStrictEqual(Object.keys(seen).sort(), [KO + "|a", KO + "|b"]);
});

test("the build prefers the bookmaker's row when two feeds clash", () => {
  /* Which of the two survives is not arbitrary: the bookmaker's spelling is
     the one its odds pair against and the one a reader can book, so the loop
     sorts those first and the league feed's row is the one dropped. Asserted
     on the source because the loop it lives in needs a fitted model and a
     league index to run at all. */
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(
    path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /sort\(\s*\(a, b\) => \(b\.src === "sporty"/,
    "the bookmaker's rows are no longer sorted first");
  assert.match(src, /src: "sporty"/,
    "the bookmaker's fixtures are no longer tagged, so the sort sees nothing");
  /* On the emitted kickoff, not on f.date - the two feeds disagree about what
     f.date carries (an instant from the bookmaker, a bare day from the league
     feed), and the first version of this guard keyed on it and fired on
     nothing while looking exactly like a guard that works. */
  assert.match(src, /slotClash\(bySlot, kickoff \|\| f\.date\.toISOString\(\)/,
    "the clash guard is no longer keyed on the emitted kickoff");
});

test("the bookmaker's spelling of Independiente Rivadavia finds the right club", () => {
  /* The cause under the clash. Their feed writes it in full, the index carries
     it as "Ind. Rivadavia", and plain Independiente is a DIFFERENT club in the
     same division - so the trailing-qualifier rule dropped "Rivadavia" as
     decoration and two names landed on one club.
     Fixed with an alias rather than a tighter rule: refusing any tail another
     club's name contains costs Excelsior Rotterdam and Fluminense FC RJ their
     matches, measured over all 1,655 names the live feeds carry. */
  const M = require("../lib/model.js");
  const teams = ["Independiente", "Ind. Rivadavia", "Barracas Central"];
  const idx = { teams, teamLeague: teams.map(() => 0), leagues: ["x"], lIdx: { x: 0 } };
  assert.strictEqual(M.matchTeam(idx, "Independiente Rivadavia", 0), "Ind. Rivadavia");
  /* And Avellaneda IS Independiente, so that one must still collapse. */
  assert.strictEqual(M.matchTeam(idx, "CA Independiente Avellaneda", 0), "Independiente");
  assert.strictEqual(M.matchTeam(idx, "CA Barracas Central", 0), "Barracas Central");
});
