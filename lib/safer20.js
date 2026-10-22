"use strict";
/* THE SAFER X20 OF THE DAY (owner, 22 Oct 2026: "do 3 also and make sure its graded and result posted
 * the following day"). In place of Big odds of the day: Merlin's Pick (lib/merlin.js) at x20 with every
 * leg 72%+ on our model, booked on SportyBet and converted (lib/bigodds.js bookAll), posted at 12:00
 * Lagos on X, Facebook and Telegram (api/social.js). Stored in big_odds (one row a day), graded on the
 * final scores the next morning with the ladder's own check (lib/ladder.js rungState), and the result
 * posted, a win or a loss: the record is public, misses too.
 */
const MERLIN = require("./merlin.js");
const BIG = require("./bigodds.js");
const L = require("./ladder.js");
const S = require("./social.js");

const TARGET = 20, MAX_LEGS = 22, MIN_P = 0.72;
const BOOKS = [["sporty", "SportyBet"], ["bet9ja", "Bet9ja"], ["betking", "BetKing"], ["betway", "Betway"]];

/* Picks and books today's slip. The row to store, or null. Never throws. */
async function mint(pay, now, feed) {
  try {
    const p = MERLIN.pick(pay, now, feed, TARGET, MAX_LEGS, null, MIN_P);
    if (!p) return null;
    const b = await BIG.bookAll(p, now);
    if (!b || !b.codes || !b.codes.sporty || b.odds < TARGET * L.SHORT) return null;
    return { day: S.dayOf(now), odds: Number(b.odds.toFixed(2)), codes: b.codes,
      legs: b.legs.map((l) => ({ home: l.home, away: l.away, code: l.prediction, p: l.p, odds: l.odds })) };
  } catch (e) { return null; }
}

/* The post, in the reply layout (owner, 22 Oct 2026): one bookie and code per line. A bookie that
   took only part of the slip says how much. */
function post(row) {
  const n = (row.legs || []).length;
  const lines = BOOKS.filter(([k]) => row.codes && row.codes[k] && row.codes[k].code).map(([k, name]) => {
    const c = row.codes[k];
    return name + ": " + c.code + (c.n && c.n < n ? " (" + c.n + " of " + n + ")" : "");
  });
  if (!lines.length) return null;
  const zero = lines.some((l) => /: \S*0/.test(l)) ? "\n(0 is a zero)" : "";
  return "Safer x20 from Merlin's Pick 🧙\n\n" + n + " games today, every pick 72% or more on our model. ×" +
    Number(row.odds).toFixed(2) + "\n\n" + lines.join("\n") + zero + "\n\nsoccerwizard.live\n18+";
}

/* Yesterday's result, or null while a game is still unsettled. */
function result(row, results) {
  const state = L.rungState(row, results);
  if (state !== "landed" && state !== "lost") return null;
  const code = row.codes && row.codes.sporty && row.codes.sporty.code;
  const n = (row.legs || []).length;
  if (state === "landed") {
    return "🔥 Yesterday's safer x20 landed: " + n + " of " + n + " games, ×" + Number(row.odds).toFixed(2) +
      " on SportyBet (" + code + ").\n\nToday's safer x20 comes at 12:00.\nsoccerwizard.live\n18+";
  }
  const DET = require("./slipdetail.js"), LG = require("./legrade.js"), D = require("./doctor.js");
  const missed = (row.legs || []).filter((l) => {
    const r = DET.resultFor({ home: l.home, away: l.away, kickoff: row.day + "T12:00:00Z" }, results);
    return r && LG.gradeLeg(l.code, r) === false;
  });
  const names = missed.slice(0, 2).map((l) => D.label({ prediction: l.code, home: l.home, away: l.away }) + " (" + l.home + " v " + l.away + ")");
  return "Yesterday's safer x20 lost: " + (n - missed.length) + " of " + n + " games won.\nMissed: " + names.join(", ") +
    (missed.length > 2 ? " and " + (missed.length - 2) + " more" : "") + ".\n\nWe post every result, wins and misses. Today's safer x20 comes at 12:00.\n18+";
}

module.exports = { mint, post, result, TARGET, MIN_P };

/* The first safer x20 (22 Oct 2026, Y5NEDC) was booked by hand before this ran, so it is not in
   big_odds; data/safer20-seed.json holds it so its result still posts on 23 Oct. */
function seed(day) {
  try { const r = require("../data/safer20-seed.json"); return r && r.day === day ? r : null; } catch (e) { return null; }
}
module.exports.seed = seed;
