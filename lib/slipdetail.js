"use strict";
/* ONE BOOKED SLIP, LEG BY LEG, FOR THE ADMIN'S CHECK (owner, 13 Oct 2026: "from the
 * 132 odds i cant really tell what option the user picked and what to check").
 *
 * The ledger keeps only the legs it can grade off our board, so a "check" slip hid
 * the rest behind a count - and an Over 2.5 on a game we do not cover counted as
 * "cannot grade" next to a corners leg that really cannot. Here every leg the
 * bookmaker reads back is named in words, matched to a final score by team names
 * (any game the results sweep holds, on our board or not), and settled where a
 * score settles it. Corners and shots show the counts when the sweep has them;
 * anything else says plainly what to look at on the bookmaker.
 *
 * Pure: legs in ({home, away, kickoff, prediction, odds}), results in
 * ({match_date, home, away, hg, ag, hc, ac, hsh, ash}), rows out.
 */
const LG = require("./legrade.js");
const D = require("./doctor.js");
const TM = require("./teammatch.js");

const DAY = 864e5;

/* The score row for a leg: same teams, within a day of kickoff. Exact names first,
   then the site's own similarity (0.6+ each side), so "Inverness CT" finds
   "Inverness Caledonian Thistle" as it does on the board. */
function resultFor(leg, results) {
  const ko = Number(leg.kickoff) || Date.parse(leg.kickoff || "");
  const near = (r) => !isFinite(ko) || Math.abs(Date.parse(r.match_date + "T12:00:00Z") - ko) <= 1.5 * DAY;
  const h = TM.normTeam(leg.home), a = TM.normTeam(leg.away);
  const pool = (results || []).filter((r) => r && r.hg != null && r.ag != null && near(r));
  const exact = pool.find((r) => TM.normTeam(r.home) === h && TM.normTeam(r.away) === a);
  if (exact) return exact;
  let best = null, score = 0;
  for (const r of pool) {
    const sh = TM.simTeams(r.home, leg.home), sa = TM.simTeams(r.away, leg.away);
    if (sh >= 0.6 && sa >= 0.6 && sh + sa > score) { score = sh + sa; best = r; }
  }
  return best && score >= 1.2 ? best : null;
}

const okN = (n) => Number.isFinite(n) && n >= 0;
/* D.label hands back the raw code when it has no words for it ("CORNERS_OVER_9.5"). */
function words(label, code) {
  if (label !== String(code || "")) return label;
  const p = String(code || "").replace(/_/g, " ").toLowerCase()
    .replace(/\bov\b/g, "over").replace(/\bun\b/g, "under").replace(/\bh\b/g, "home").replace(/\ba\b/g, "away");
  return p.length <= 3 ? String(code) : p.charAt(0).toUpperCase() + p.slice(1);
}

function detail(legs, results) {
  return (legs || []).map((l) => {
    const row = {
      match: (l.home || "Home") + " v " + (l.away || "Away"),
      pick: words(D.label(l), l.prediction),
      odds: Number(l.odds) > 1 ? Number(l.odds) : null,
      kickoff: l.kickoff || null,
      score: null, verdict: null, why: "",
    };
    const code = String(l.prediction || "");
    const r = resultFor(l, results);
    if (r) row.score = r.hg + "-" + r.ag;
    /* The ledger's own grader (lib/legrade.js): goals, corners, shots, goal order and
       the half-time score, where the results row has them. */
    const v = r ? LG.gradeLeg(code, r) : null;
    if (v === true || v === false) { row.verdict = v ? "won" : "lost"; return row; }
    if (v === 0.5) { row.verdict = "void"; row.why = "Voided: the stake comes back."; return row; }
    if (/CORNER/i.test(code)) {
      row.why = r && okN(r.hc) && okN(r.ac) ? "Corners were " + (r.hc + r.ac) + " (" + r.hc + "-" + r.ac + "). Check the line on the bookmaker."
        : "A corners pick. Check it on the bookmaker.";
    } else if (/SHOT/i.test(code)) {
      row.why = r && okN(r.hsh) && okN(r.ash) ? "Shots were " + (r.hsh + r.ash) + " (" + r.hsh + "-" + r.ash + "). Check the line on the bookmaker."
        : "A shots pick. Check it on the bookmaker.";
    } else if (/^FH_|HALF|^HT/i.test(code)) {
      row.why = "A first-half pick. We only have the full-time score, so check it on the bookmaker.";
    } else if (!r) {
      row.why = "No final score for this game in our results. Check it on the bookmaker.";
    } else {
      row.why = "We cannot settle this pick from the score. Check it on the bookmaker.";
    }
    return row;
  });
}

/* One leg as a line for a win banner and caption. */
function nameOf(l) {
  let name = words(D.label(l), l.prediction);
  if (l.home && l.away && !name.includes(l.home) && !name.includes(l.away)) name += " (" + l.home + " v " + l.away + ")";
  return name;
}

/* Every leg read back from the bookie, named, with its price and verdict, for a row
   whose ledger kept only some legs (api/account.js postwin). */
function full(legs, results) {
  const rows = detail(legs, results);
  return (legs || []).map((l, i) => ({ home: l.home || null, away: l.away || null, code: l.prediction || null,
    name: nameOf(l), odds: rows[i].odds, verdict: rows[i].verdict }));
}

module.exports = { detail, resultFor, nameOf, full };
