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

/* THE OPEN SLIPS NEVER SHOW A LOCKED ONE (owner, 18 Oct 2026). Every rung stacks
   the same safest-first games, so x5 was the first games of x10, and x10 the first
   of x20. x5 and Big odds of the day (both open to everyone) are picked after the
   locked rungs, without x10's and x20's games; if that leaves too few, without
   x10's only. x100 and x1000 are not kept out: 30-40 legs would leave nothing,
   and a few of their games are not their slip. */
const KEEP_OUT = [[10, 20], [10]];
function gamesOf(rows, rungs) {
  const out = new Set();
  for (const r of rows || []) if (rungs.includes(r.rung)) for (const l of r.legs || []) out.add(l.home + "|" + l.away);
  return out;
}
function openSkips(rows) { return KEEP_OUT.map((k) => gamesOf(rows, k)); }
/* Big odds also keeps out the open x5 (owner, 18 Oct 2026: "keep out x5 too"): it had
   been x5's 8 games plus 4. Falls back the same way, x5 kept out longest. */
const BIG_KEEP_OUT = [[5, 10, 20], [5, 10], [10]];
function bigSkips(rows) { return BIG_KEEP_OUT.map((k) => gamesOf(rows, k)); }

/* Pure: the legs for one rung, or null. `rows`: the locked rungs already booked today. */
function pickRung(pay, now, feed, rung, rows) {
  const o = { target: rung.x, maxLegs: rung.maxLegs, floor: rung.x * SHORT };
  if (rung.x !== OPEN_RUNG) return BIG.pick(pay, now, feed, o);
  for (const skip of openSkips(rows)) { const p = BIG.pick(pay, now, feed, Object.assign({ skip }, o)); if (p) return p; }
  return null;
}

/* Picks and books one rung. The stored row, or null. Never throws. */
async function mintRung(pay, now, feed, rung, rows) {
  try {
    const picked = pickRung(pay, now, feed, rung, rows);
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

/* Sent once, the first morning after a reader's pass runs out (api/ladder.js). */
function ended(rung) {
  return {
    push: "Your Wizard Pass has ended, so your x" + rung + " slip was not sent today. Today's codes are on the home page. Renew to get them here every morning. 18+",
    tg: "🧙 <b>Your Wizard Pass has ended</b>\n\nYour x" + rung + " slip was not sent today. Today's codes are on the home page: soccerwizard.live\n\n" +
      "Renew your pass to get your slip here every morning.\n\n18+ · Stake only what you can afford to lose",
  };
}

/* A rung without a pass (owner, 18 Oct 2026): only x5 keeps its codes. The rest
   keep the odds and how many games per book, no code and no legs (a list of games
   is the slip, typed by hand). Used by api/ladder.js and the /booking-codes pages. */
const OPEN_RUNG = 5;
function locked(row) {
  if (row.rung === OPEN_RUNG) return row;
  const codes = {};
  Object.keys(row.codes || {}).forEach((k) => { codes[k] = { n: row.codes[k] && row.codes[k].n }; });
  return { day: row.day, rung: row.rung, odds: row.odds, games: Array.isArray(row.legs) ? row.legs.length : 0, codes, legs: [], locked: true, lost: !!row.lost, state: row.state || null };
}

/* A RUNG THAT CAN NO LONGER LAND (owner, 18 Oct 2026: "dont put the lost, just gray it
   out. only show the remaining"). True once any leg has lost on its final score,
   matched to the results by team names (lib/slipdetail.js resultFor). */
/* "started" (owner, 18 Oct 2026: the ladder end states): a game has kicked off, so the
   code no longer books the whole slip. fixtures (the board's, for kickoff times) and
   now are optional; without them a rung is only ever lost, landed or live. */
function rungState(row, results, fixtures, now) {
  const DET = require("./slipdetail.js"), LG = require("./legrade.js");
  const vs = (row.legs || []).map((l) => {
    const r = DET.resultFor({ home: l.home, away: l.away, kickoff: row.day + "T12:00:00Z" }, results);
    return r ? LG.gradeLeg(l.code, r) : null;
  });
  if (vs.some((v) => v === false)) return "lost";
  if (vs.length && vs.every((v) => v === true || v === 0.5)) return "landed";
  if (fixtures && now) {
    const norm = (s) => String(s || "").toLowerCase();
    const ko = (l) => { const f = fixtures.find((x) => norm(x.home) === norm(l.home) && norm(x.away) === norm(l.away)); return f ? Date.parse(f.kickoff) : NaN; };
    if ((row.legs || []).some((l) => ko(l) <= now)) return "started";
  }
  return "live";
}
const rungLost = (row, results) => rungState(row, results) === "lost";

module.exports = { RUNGS, SHORT, BOOK_NAMES, OPEN_RUNG, gamesOf, openSkips, bigSkips, pickRung, mintRung, note, ended, locked, rungLost, rungState };
