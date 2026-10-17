"use strict";
/* THE DAILY LADDER (owner, 17 Oct 2026: a gambler "that wants the best picked
 * for him without doing any research or edits and want viable big odds").
 * Every morning at 10:30 Lagos, one slip per rung - x5, x10, x20, x100, x1000 -
 * picked by Big odds of the day's own rules (lib/bigodds.js pick: every leg 75%+
 * on the board's number, x1.10+, one leg per game, no market family on more than
 * 40%, the cheapest upgrade first) with a leg budget per rung, then booked on
 * SportyBet and converted to the other five books. A rung that cannot reach 80%
 * of its payout is left out that day rather than published under its name.
 *
 * "My daily slip" (Wizard Pass): a reader picks one rung and one bookie once and
 * gets that rung's code every morning by push and/or Telegram. Everyone on a rung
 * shares one booking, so the bookies see five slips a day, not one per reader.
 */
const BIG = require("./bigodds.js");
const S = require("./social.js");

/* Leg budgets: x1000 needs about 40 legs at ~x1.19, and 40 is the smallest
   bookie limit (BetKing, Betway). */
const RUNGS = [
  { x: 5, maxLegs: 8 },
  { x: 10, maxLegs: 12 },
  { x: 20, maxLegs: 16 },
  { x: 100, maxLegs: 30 },
  { x: 1000, maxLegs: 40 },
];
const SHORT = 0.8;
const BOOK_NAMES = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa", onexbet: "1xBet", betway: "Betway" };

/* Pure: the legs for one rung, or null. */
function pickRung(pay, now, feed, rung) {
  return BIG.pick(pay, now, feed, { target: rung.x, maxLegs: rung.maxLegs, floor: rung.x * SHORT });
}

/* Picks and books one rung. The stored row, or null. Never throws. */
async function mintRung(pay, now, feed, rung) {
  try {
    const picked = pickRung(pay, now, feed, rung);
    if (!picked) return null;
    const b = await BIG.bookAll(picked, now);
    /* What SportyBet booked, not what was picked: a dropped leg can pull a rung
       under its floor, and then it is not that rung any more. */
    if (!b || b.odds < rung.x * SHORT) return null;
    return { day: S.dayOf(now), rung: rung.x, odds: Number(b.odds.toFixed(2)), codes: b.codes,
      legs: b.legs.map((l) => ({ home: l.home, away: l.away, code: l.prediction, p: l.p, odds: l.odds })) };
  } catch (e) { return null; }
}

/* The message a reader gets. Plain English, one idea per line, 18+. */
function note(row, book) {
  const c = row && row.codes && row.codes[book];
  if (!c) return null;
  const n = Array.isArray(row.legs) ? row.legs.length : c.n;
  return {
    push: "Your x" + row.rung + " slip is ready. " + BOOK_NAMES[book] + " code: " + c.code + ". 18+",
    tg: "🧙 <b>Your x" + row.rung + " slip is ready</b>\n\n" + BOOK_NAMES[book] + " code: <code>" + c.code + "</code>\n" +
      (c.n < n ? c.n + " of " + n + " games" : n + " games") + " · pays about x" + Number(row.odds).toFixed(0) +
      "\n\nTap the code to copy it.\nChange your slip: soccerwizard.live\n\n18+ · Stake only what you can afford to lose",
  };
}

module.exports = { RUNGS, SHORT, BOOK_NAMES, pickRung, mintRung, note };
