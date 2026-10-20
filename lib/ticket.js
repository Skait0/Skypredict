"use strict";
/* CHECK MY TICKET (SportyClaw review, 20 Oct 2026): any code's results, leg by leg, from the
 * scores we bank in the results table, graded by the server's grader (lib/legrade.js).
 *
 * A bookie's read-back of a finished code carries no kick-off time (SportyBet sends ""), so a
 * leg finds its score by the club names, with the site's own matcher (lib/teammatch.js: the
 * reserve and youth guard included) and only inside a day of its kick-off when it has one.
 * A tie between two results is refused, never guessed. No score yet is "waiting", never a miss.
 */
const TM = require("./teammatch.js");
const G = require("./legrade.js");
const D = require("./doctor.js");

function findResult(results, leg) {
  if (!leg || !leg.home || !leg.away) return null;
  const ko = Number(leg.kickoff) || Date.parse(leg.kickoff || "");
  const near = (r) => !isFinite(ko) || Math.abs(Date.parse((r.match_date || r.date) + "T12:00:00Z") - ko) < 1.5 * 864e5;
  const pool = (results || []).filter((r) => r && r.hg != null && r.ag != null && near(r));
  const h = TM.normTeam(leg.home), a = TM.normTeam(leg.away);
  const exact = pool.filter((r) => TM.normTeam(r.home) === h && TM.normTeam(r.away) === a);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  let best = null, score = 0, tie = false;
  for (const r of pool) {
    const sh = TM.simTeams(leg.home, r.home), sa = TM.simTeams(leg.away, r.away);
    if (sh < 0.6 || sa < 0.6) continue;
    if (sh + sa > score) { score = sh + sa; best = r; tie = false; } else if (sh + sa === score) tie = true;
  }
  return best && score >= 1.2 && !tie ? best : null;
}

/* won: true, false, 0.5 (push) or null (no score yet, or a market a score cannot settle). */
function grade(legs, results) {
  const rows = (legs || []).map((leg) => {
    const r = findResult(results, leg);
    const won = r && leg.prediction ? G.gradeLeg(leg.prediction, r) : null;
    return { leg, r, won: won == null ? null : won };
  });
  const won = rows.filter((x) => x.won === true).length, lost = rows.filter((x) => x.won === false).length;
  const push = rows.filter((x) => x.won === 0.5).length, waiting = rows.filter((x) => x.won == null).length;
  return { rows, won, lost, push, waiting, done: !waiting, landed: !waiting && !lost && rows.length > 0 };
}

const esc = (s) => String(s == null ? "" : s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(code, bookName, g) {
  const out = ["📋 <b>Results for " + esc(code) + "</b> on " + esc(bookName), ""];
  for (const x of g.rows.slice(0, 30)) {
    const mark = x.won === true ? "✅" : x.won === false ? "❌" : x.won === 0.5 ? "↩️" : "⏳";
    const score = x.r ? " · " + x.r.hg + "-" + x.r.ag : "";
    out.push(mark + " " + esc(x.leg.home + " v " + x.leg.away) + score + "\n      " + esc(D.label(x.leg)));
  }
  if (g.rows.length > 30) out.push("+" + (g.rows.length - 30) + " more");
  const n = g.rows.length, ok = g.won + g.push;
  out.push("");
  if (g.landed) out.push("🔥🧙 <b>Landed 🎉</b> All " + n + " in!");
  else if (g.done && g.lost === 1) out.push("<b>So close 😤 - " + ok + " of " + n + "</b>. One leg off. We go again.");
  else if (g.done) out.push("💪 " + ok + " of " + n + " landed. We go again.");
  else if (g.lost) out.push("😤 " + g.lost + " leg" + (g.lost === 1 ? "" : "s") + " lost already. " + g.waiting + " still to come or not in yet.");
  else out.push("⏳ " + ok + " of " + n + " in so far. " + g.waiting + " still to come or not in yet.");
  out.push("<i>18+</i>");
  return out.join("\n");
}

/* Every game over: the book's own status where it sends one, else every kick-off 2 hours gone. */
function allOver(legs, now) {
  if (!legs || !legs.length) return false;
  if (legs.every((l) => l.status)) return legs.every((l) => /^ended$/i.test(l.status));
  return legs.every((l) => { const ko = Number(l.kickoff) || Date.parse(l.kickoff || ""); return isFinite(ko) && now - ko > 2 * 36e5; });
}

/* Why a code would not open, in one plain line. `got` from the read: expired, notFound, or neither. */
function whyNot(got, bookName, code) {
  const c = "<code>" + esc(code) + "</code>";
  if (got && got.expired) return "⏰ Every game on " + c + " has started or ended, so " + bookName + " won't open it any more.";
  if (got && got.notFound) return "I couldn't find " + c + " on " + bookName + ". Check the code. " +
    bookName + " also removes a code once its games are over.";
  return "I couldn't read " + c + " on " + bookName + " just now. Please try again in a minute.";
}

module.exports = { findResult, grade, text, allOver, whyNot };
