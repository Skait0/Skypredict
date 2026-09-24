"use strict";
/* THE CONVERTER, SERVER SIDE - for the Telegram bot (api/tg.js).
 *
 * The site converts in the browser, pairing games through the book ids it
 * merges from four feeds at load. The bot has no page, so this pairs each leg
 * of a read code with the TARGET book's own feed directly: same kickoff (within
 * three hours), both clubs matched by the results matcher (lib/oracle.js), and
 * only when exactly one event answers - a guess would book somebody's bet on
 * the wrong game.
 *
 * The line rules are the page's (index.html NEAREST_LINE / ahReline): a whole
 * line the target does not sell moves half a goal in the punter's favour, and
 * nothing else is ever substituted. The page's 1X2-or-Over/Under switch is not
 * offered here - those legs are left behind and named, and the site link does
 * the rest.
 *
 * Booking goes straight to the Railway route the site's /api/book proxies.
 * A refusal that names legs drops exactly those and re-books, at most
 * ROUNDS times; every dropped leg is reported with why.
 */
const TM = require("./teammatch.js");
const { UPSTREAM, BOOKS: PATHS } = require("./bookproxy.js");

const SITE = () => process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const FEED = { sporty: "/api/fixtures", bet9ja: "/api/bet9ja", betking: "/api/betking", betpawa: "/api/betpawa" };
const LABEL = { sporty: "SportyBet", bet9ja: "Bet9ja", betking: "BetKing", betpawa: "betPawa" };
const WHOLE_LINES = { sporty: true };      // only SportyBet sells Over 2 / Over 3
const NEAREST_LINE = { "OVER_2": "OVER_1.5", "OVER_3": "OVER_2.5", "UNDER_2": "UNDER_2.5", "UNDER_3": "UNDER_3.5" };
const ROUNDS = 2;   // with 8s calls and an 8s feed, a whole conversion fits well inside the bot's 60s

function ahReline(code) {
  const m = /^(AH_[12])_(-?\d+)$/.exec(code || "");
  return m ? m[1] + "_" + (Number(m[2]) + (m[1] === "AH_1" ? 0.5 : -0.5)) : null;
}

/* One shape for four feeds. */
function events(book, body) {
  const m = body && body.matches;
  const rows = Array.isArray(m) ? m : Object.values(m || {});
  return rows.map((x) => {
    let home = x.homeTeam, away = x.awayTeam;
    if (!home && typeof x.teams === "string") {
      const i = x.teams.indexOf(" - ");
      if (i > 0) { home = x.teams.slice(0, i); away = x.teams.slice(i + 3); }
    }
    const ko = typeof x.startTime === "number" ? x.startTime : Date.parse(x.kickoff || x.startdate || "");
    return { id: x.eventId, home, away, ko, odds: x.odds || {} };
  }).filter((e) => e.id != null && e.home && e.away && isFinite(e.ko));
}

/* THE SITE'S RULE, WITH THE SITE'S CODE (lib/teammatch.js is lifted from
   index.html): both names normalising identically wins outright; otherwise
   same kickoff slot, each side scoring 0.6+, and the best pair must reach
   1.2 - the thresholds scripts/b9match.js measured at 98-100% of what a book
   lists. The leg plays the part of our fixture, the book's event the feed's. */
function pair(evs, leg) {
  const ko = Number(leg.kickoff) || Date.parse(leg.kickoff || "");
  if (!isFinite(ko) || !leg.home || !leg.away) return null;
  const f = { home: leg.home, away: leg.away, kickoff: new Date(ko).toISOString() };
  const fh = TM.normTeam(f.home), fa = TM.normTeam(f.away);
  const near = evs.filter((e) => Math.abs(e.ko - ko) < 2 * 864e5);
  const exact = near.find((e) => TM.normTeam(e.home) === fh && TM.normTeam(e.away) === fa);
  if (exact) return exact;
  let best = null, score = 0;
  for (const e of near) {
    if (!TM.sameSlot(f, { startTime: e.ko })) continue;
    const sh = TM.simTeams(f.home, e.home), sa = TM.simTeams(f.away, e.away);
    if (sh >= 0.6 && sa >= 0.6 && sh + sa > score) { score = sh + sa; best = e; }
  }
  return best && score >= 1.2 ? best : null;
}

/* What can cross, what cannot, and what changed on the way. Pure. */
function plan(legs, to, evs, now) {
  const picks = [], stuck = [], changed = [];
  for (const l of legs || []) {
    const ko = Number(l.kickoff) || Date.parse(l.kickoff || "");
    if (isFinite(ko) && ko <= now) { stuck.push({ leg: l, why: "already started" }); continue; }
    if (!l.prediction) { stuck.push({ leg: l, why: "a market we don't carry" }); continue; }
    let code = l.prediction;
    if (/^MIX_[12X]_(OV|UN)_(1\.5|3\.5)$/.test(code) && to === "sporty") {
      stuck.push({ leg: l, why: "SportyBet only sells this at 2.5" }); continue;
    }
    const e = pair(evs, l);
    if (!e) { stuck.push({ leg: l, why: LABEL[to] + " doesn't list this game" }); continue; }
    const near = NEAREST_LINE[code] || ahReline(code);
    if (near && !WHOLE_LINES[to]) { changed.push({ leg: l, from: code, to: near }); code = near; }
    picks.push({ leg: l, eventId: e.id, code });
  }
  return { picks, stuck, changed };
}

const selOf = (to, p) => (to === "sporty" ? { eventId: p.eventId, prediction: p.code } : { eventId: p.eventId, code: p.code });
const codeOf = (to, d) => (to === "sporty" ? d && d.booking_code : d && d.code);

async function post(to, picks) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(UPSTREAM + PATHS[to], { method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ selections: picks.map((p) => selOf(to, p)) }) });
    return await r.json().catch(() => null);
  } catch (e) { return null; } finally { clearTimeout(t); }
}

/* Read legs -> a code at `to`. Returns {code, booked, stuck, changed} or
   {error}. Never throws. */
async function convert(legs, to, now) {
  if (!PATHS[to] || !FEED[to]) return { error: "unknown book" };
  let body = null;
  try { body = await (await fetch(SITE() + FEED[to], { signal: AbortSignal.timeout(8000) })).json(); } catch (e) { body = null; }
  const evs = events(to, body);
  if (!evs.length) return { error: LABEL[to] + "'s games are not loading right now" };
  const p = plan(legs, to, evs, now || Date.now());
  let picks = p.picks;
  const stuck = p.stuck.slice();
  for (let round = 0; round <= ROUNDS && picks.length; round++) {
    const d = await post(to, picks);
    const code = d && d.success !== false && codeOf(to, d);
    if (code) return { code, booked: picks, stuck, changed: p.changed };
    const bad = (d && Array.isArray(d.unbookable)) ? d.unbookable : [];
    const kill = new Set(bad.map((b) => b.eventId + "|" + (b.prediction || b.code)));
    const keep = picks.filter((x) => !kill.has(x.eventId + "|" + x.code));
    if (!bad.length || keep.length === picks.length) {
      return { error: LABEL[to] + " wouldn't take this slip" + (d && d.detail ? " (" + d.detail + ")" : ""), stuck };
    }
    for (const x of picks) if (!keep.includes(x)) stuck.push({ leg: x.leg, why: LABEL[to] + " refused it" });
    picks = keep;
  }
  return { error: "nothing left that " + LABEL[to] + " will take", stuck };
}

module.exports = { convert, plan, pair, events, ahReline, LABEL };
