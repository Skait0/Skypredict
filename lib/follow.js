"use strict";
/* "FOLLOW MY SLIP" - the Telegram bot DMs a reader as each leg of their slip
 * settles, and once more when the whole slip has. Pure: api/tg.js creates the
 * follow, api/tgfollow.js runs step() every ten minutes against the results
 * table and sends what it returns.
 *
 * Legs are mapped to OUR fixture names and date when followed, because that is
 * how the results table keys a match. Only legs the shared grader can settle
 * (lib/grade.js) are tracked; the rest are counted and said, never guessed.
 */
const G = require("./grade.js");
const D = require("./doctor.js");

/* Market code -> the label lib/grade.js settles. First-half markets need a
   half-time score the results table does not carry, so they are left out. */
function labelFor(code) {
  const c = String(code || "");
  const fixed = { "1": "Home win", "2": "Away win", "X": "Draw", "GG": "Both teams score",
    "NG": "Not both teams score", "1X": "1X", "X2": "X2", "12": "12",
    "MIXGG_X": "Draw or both", "MIXGG_1": "Home win or both score", "MIXGG_2": "Away win or both score" };
  if (fixed[c]) return fixed[c];
  let m = /^(OVER|UNDER)_(\d+(?:\.5)?)$/.exec(c);
  if (m) return (m[1] === "OVER" ? "Over " : "Under ") + m[2];
  m = /^(HOME|AWAY)_OVER_(\d\.5)$/.exec(c);
  if (m) return (m[1] === "HOME" ? "Home" : "Away") + " over " + m[2];
  m = /^MIX_([12X])_OV_(\d\.5)$/.exec(c);
  if (m) return (m[1] === "X" ? "Draw" : m[1] === "1" ? "Home win" : "Away win") + " or over " + m[2];
  return null;
}

/* The follow's legs, from a read code and today's board. */
function track(legs, fixtures) {
  const out = [];
  for (const l of legs || []) {
    const f = l && l.prediction ? D.findFixture(fixtures || [], l) : null;
    const grade = l && labelFor(l.prediction);
    if (!f || !grade) continue;
    let name = D.label(Object.assign({}, l, { home: f.home, away: f.away }));
    if (!name.includes(f.home) && !name.includes(f.away)) name += " (" + f.home + " v " + f.away + ")";
    out.push({ date: f.date, home: f.home, away: f.away, code: l.prediction, grade, name, ko: f.kickoff || null });
  }
  return out;
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* One pass for one follow. `results` are {date, home, away, hg, ag}. Returns
   the lines to send (maybe none), the new `seen`, and whether it is done. */
function step(follow, results, now) {
  const byKey = new Map();
  for (const r of results || []) {
    if (r && r.hg != null && r.ag != null) byKey.set(r.date + "|" + norm(r.home) + "|" + norm(r.away), r);
  }
  const legs = follow.legs || [];
  const seen = Object.assign({}, follow.seen || {});
  const lines = [];
  legs.forEach((l, i) => {
    if (seen[i]) return;
    const r = byKey.get(l.date + "|" + norm(l.home) + "|" + norm(l.away));
    if (!r) return;
    const won = G.gradeLabel(l.grade, Number(r.hg), Number(r.ag));
    if (won == null) return;
    seen[i] = won ? "won" : "lost";
    lines.push((won ? "✅ " : "😤 ") + l.name + " · " + r.home + " " + r.hg + "-" + r.ag + " " + r.away);
  });
  const settled = legs.length && legs.every((_, i) => seen[i]);
  let final = null;
  if (settled) {
    const won = legs.filter((_, i) => seen[i] === "won").length;
    final = won === legs.length
      ? "🔥🧙 <b>YOUR SLIP LANDED!</b> All " + won + " in. " + follow.code + " came home!"
      : won >= legs.length - 1
        ? "😤 <b>So close</b>: " + won + " of " + legs.length + " landed on " + follow.code + ", one leg off."
        : "💪 " + follow.code + " is settled: " + won + " of " + legs.length + " landed. We go again.";
  }
  /* A slip whose games are days behind us and still unsettled will not settle
     now - the results table has what it is going to get. Close it quietly
     rather than follow it forever. */
  const last = Date.parse(follow.last_kickoff || "");
  const stale = !settled && isFinite(last) && (now || Date.now()) - last > 3 * 864e5;
  return { lines, seen, done: !!settled || stale, final, stale };
}

module.exports = { labelFor, track, step };
