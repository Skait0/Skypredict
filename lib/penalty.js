// lib/penalty.js
"use strict";
/* PLAY PENALTY - the rules, and nothing else. Pure functions: the API judges
   every contested kick with these, the page uses the same copy for the
   challenger's practice match, and the tests pin them. See
   docs/specs/2026-10-08-penalty-wahala-design.md section 3. */
const crypto = require("crypto");

const SPOTS = 6;                 // col = s % 3 (0 left, 1 middle, 2 right); high = s >= 3
const REG = 5, BONUS = 3;
/* Tuning, set by play-testing on a phone. Below weakBelow the shot is weak;
   above overAbove it sails over (high) or hits the bar (low). */
const ZONES = { weakBelow: 0.55, overAbove: 0.88 };

const col = (s) => s % 3;
const high = (s) => s >= 3;

function strike(spot, power) {
  const kind = power > ZONES.overAbove ? "over" : power < ZONES.weakBelow ? "weak" : "green";
  return { spot, kind };
}
function neighbour(a, b) {
  if (a === b) return false;
  if (col(a) === col(b)) return true;                       // other height, same column
  return high(a) === high(b) && Math.abs(col(a) - col(b)) === 1;
}
function judge(shot, dive) {
  const s = strike(shot.spot, shot.power);
  if (s.kind === "over") return high(s.spot) ? "over" : "bar";
  if (dive === s.spot) return "save";
  if (s.kind === "weak" && neighbour(dive, s.spot)) return "save";
  return "goal";
}
/* Outcomes alternate A, B, A, B... Regulation is five each and ends early once
   the trailing side cannot catch up; then up to BONUS rounds of sudden death;
   still level after that is a draw. */
function shootout(outcomes) {
  let a = 0, b = 0;
  const n = outcomes.length;
  for (let i = 0; i < n; i++) if (outcomes[i] === "goal") { if (i % 2 === 0) a++; else b++; }
  const takenA = Math.ceil(n / 2), takenB = Math.floor(n / 2);
  const round = Math.max(takenA, 1);
  const res = (done, winner) => ({ a, b, done, winner, next: done ? null : (n % 2 === 0 ? "a" : "b"), round });
  if (takenA <= REG && takenB <= REG) {
    const leftA = REG - takenA, leftB = REG - takenB;
    if (a > b + leftB) return res(true, "a");
    if (b > a + leftA) return res(true, "b");
    if (takenA < REG || takenB < REG) return res(false, null);
    if (a !== b) return res(true, a > b ? "a" : "b");
    return res(false, null);
  }
  if (takenA !== takenB) return res(false, null);          // B still to kick this round
  if (a !== b) return res(true, a > b ? "a" : "b");
  if (takenA >= REG + BONUS) return res(true, "draw");
  return res(false, null);
}
function dailyDives(key, day) {
  const h = crypto.createHmac("sha256", key).update("daily:" + day).digest();
  return [0, 1, 2, 3, 4].map((i) => h[i] % SPOTS);
}
/* RANKED: the keeper for kick i of run `run`, from the secret key, so no page
   can know it in advance. He reads your column more often the longer your
   streak runs (the same curve as the page's Sudden Death), capped well short
   of certain. Judged only here; the leaderboard trusts nothing the page says. */
function rankedDive(key, run, i, spot, streak) {
  const h = crypto.createHmac("sha256", key).update("ranked:" + run + ":" + i).digest();
  const read = Math.min(0.6, 0.15 + 0.035 * streak);
  if (h[0] / 256 < read) return (spot % 3) + (h[1] % 2 ? 3 : 0);
  return h[2] % SPOTS;
}
/* DIVISIONS (owner, 9 Oct 2026 - weekly leagues). Your division this week is
   the higher of what your best run LAST week earned and what your best run
   THIS week earns: promotion is instant, relegation happens at the Monday
   reset. Thresholds are goals in a row in Ranked. */
const DIVISIONS = [
  { id: "grassroots", name: "Grassroots", at: 0 },
  { id: "npfl", name: "NPFL", at: 3 },
  { id: "champions", name: "Champions League", at: 6 },
  { id: "legend", name: "Legend", at: 10 },
];
function tierOf(best) { let t = 0; DIVISIONS.forEach((d, i) => { if ((best || 0) >= d.at) t = i; }); return t; }
function divisionOf(bestLast, bestThis) { return Math.max(tierOf(bestLast), tierOf(bestThis)); }
/* Monday of the Lagos week, as a day string: the weekly table starts there. */
function lagosWeek(ms) {
  const d = new Date(ms + 3600000), back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}
/* CLUB WARS (owner, 9 Oct 2026): a player picks a club, every Ranked goal
   counts for it, and the clubs have their own weekly table. The page holds
   names and colours; this is the list the server will store. */
const CLUBS = ["arsenal", "chelsea", "man-united", "man-city", "liverpool", "barcelona", "real-madrid",
  "enyimba", "kano-pillars", "rangers", "rivers-united", "shooting-stars", "remo-stars"];
function cleanClub(s) { return CLUBS.indexOf(s) >= 0 ? s : null; }
function cleanName(s) {
  if (typeof s !== "string") return null;
  const t = s.normalize("NFC").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16).trim();
  return t ? t : null;
}
function lagosDay(ms) { return new Date(ms + 3600000).toISOString().slice(0, 10); }
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newId() {
  const b = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}
const validDive = (d) => Number.isInteger(d) && d >= 0 && d < SPOTS;
const validPick = (x) => !!x && validDive(x.spot) && typeof x.power === "number" && x.power >= 0 && x.power <= 1;

module.exports = { SPOTS, REG, BONUS, ZONES, strike, neighbour, judge, shootout, dailyDives, rankedDive, lagosWeek,
  DIVISIONS, tierOf, divisionOf, CLUBS, cleanClub,
  cleanName, lagosDay, newId, validPick, validDive, ALPHA };
