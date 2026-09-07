"use strict";
/**
 * SoccerVista's day of finished matches -> rows the model can be fitted on.
 *
 * WHY THIS EXISTS
 *
 * football-data.co.uk carries the history the model is fitted on, and on
 * 5 Sep 2026 it started answering 503 to everyone and had not stopped a week
 * later. The committed floor under data/results keeps the site building - see
 * cachedResultsFor in lib/build.js - but a floor holds only what it held when
 * it was committed, so every day of the outage the board is fitted on form one
 * day older, and nothing about the board looks wrong while that happens.
 *
 * lib/soccervista.js already fetches a thousand-odd finished matches a day,
 * with the score stated rather than inferred, and the site already grades
 * against it. This turns that same feed into the corpus the fit is missing.
 *
 * WHAT MAKES IT SAFE, AND THE ONLY THING THAT DOES
 *
 * A club is a name here, not an id. "Man United" and "Manchester United FC"
 * are two teams to buildIndex, each with half the matches and neither with a
 * usable rating, and nothing downstream would report that - the board would
 * simply be worse. So no name from this feed is ever written as they spell it.
 * Every club is resolved against the index the floor already built, through
 * matchTeam's league-filtered case, and anything that does not resolve is
 * DROPPED and counted. A dropped match costs one result; a wrongly resolved
 * one silently corrupts a rating for a season.
 *
 * That is also why the league mapping below is a written table rather than
 * fuzzy matching. `Spain LaLiga2` is one edit away from `Spain LaLiga`, and
 * a league confused for the division above it would put twenty clubs in the
 * wrong pool at once.
 */
const M = require("./model.js");

/* Their name for a league -> ours, where the two differ. Everything not in
   here has to match our name exactly, which 23 of our 38 leagues already do.
   Written from what the feed actually returned on 1-6 Sep 2026, not from what
   the competitions are called officially.

   Ireland is the trap in this list and is deliberately absent: they publish
   BOTH `Ireland Premier Division` (which is ours, exactly) and `Ireland
   National League`, and guessing which of the two is the League of Ireland
   top flight is exactly the kind of coin-toss this table exists to refuse. */
const LEAGUE_ALIAS = {
  "England League One": "England League 1",
  "England League Two": "England League 2",
  "England National League": "England Conference National",
  "Scotland League One": "Scotland League 1",
  "Scotland League Two": "Scotland League 2",
  "Germany Bundesliga": "Germany Bundesliga 1",
  "Germany 2. Bundesliga": "Germany Bundesliga 2",
  "Spain LaLiga": "Spain La Liga 1",
  "Spain LaLiga2": "Spain La Liga 2",
  "Belgium Jupiler Pro League": "Belgium Pro League",
  "Portugal Liga Portugal": "Portugal Primeira Liga",
  "Brazil Serie A Betano": "Brazil Serie A",
  /* The three warming leagues below. Their canonical names are the ones the
     FIXTURE feed uses, so a harvested result and a fixture to price end up
     under one string - and so the entries in UNRATED_LEAGUES read as the same
     league they gate. */
  "Denmark 1st Division": "Denmark 1. Division",
  "Norway OBOS-ligaen": "Norway 1st Division",
};

/* LEAGUES WE HARVEST BUT HAVE NO HISTORY FOR.
 *
 * football-data never carried these, so there is nothing to seed them with and
 * nothing to backfill from - SoccerVista's board reaches about a week back.
 * They start at zero and gain a round a week.
 *
 * That is fine, and it needs no switch. lib/build.js drops any league with
 * fewer than cfg.minLeagueMatches results before fitting, so a warming league
 * sits in the harvest file, stays out of the model on its own, and joins the
 * board the week it crosses the line - roughly seven or eight rounds, so about
 * two months from the first harvest.
 *
 * The only thing that cannot be recovered later is the calendar: a week not
 * harvested is a week that never enters the corpus. That is the whole reason
 * to start collecting a league before it is of any use. */
const HARVEST_EXTRA = [
  "Netherlands Eerste Divisie",
  "Denmark 1. Division",
  "Norway 1st Division",
];

/* Their league name -> ours, but only if we hold ratings for it. `allowed` is
   the set of league names the build fits on; anything else is not a mapping
   failure, it is a competition we correctly do not model. */
function ourLeague(theirs, allowed) {
  const name = LEAGUE_ALIAS[theirs] || theirs;
  return allowed && allowed.has(name) ? name : null;
}

/* Rows from lib/soccervista.js `resultsFor`, plus the date they were asked
   for, resolved into matches in OUR spelling.
 *
 * Returns the matches and a tally of why rows were let go, because the tally
 * is the only warning available if their naming drifts: a table that has
 * quietly stopped matching shows up as a resolution rate, never as an error. */
/* Which league indices belong to each country, by the convention every league
   name in this codebase follows: "England Championship", "Spain La Liga 2". */
function leaguesByCountry(idx) {
  const by = new Map();
  idx.leagues.forEach((name, li) => {
    const country = String(name).split(" ")[0];
    if (!by.has(country)) by.set(country, []);
    by.get(country).push(li);
  });
  return by;
}

/* A CLUB THAT HAS MOVED DIVISION IS STILL THE SAME CLUB.
 *
 * matchTeam is league-filtered, and the index gives a club the league of its
 * most recent match - which, with football-data down, is last season's. So on
 * 5-6 Sep 2026 every promoted and relegated side failed to resolve: Sheffield
 * Wednesday and Leicester in League One, Girona and Mallorca in La Liga 2,
 * eight of Serie B. 65 of 258 in-scope rows, and all of them clubs we have
 * years of history for.
 *
 * So a miss in the named league is retried across that country's other
 * divisions - the same widening lib/euroresolve.js does, with the same rule:
 * a UNIQUE hit or nothing. The whole-index search is never used. Two clubs
 * called Rangers in different divisions is exactly the coincidence that would
 * put a second-tier result on a top-flight club's rating.
 *
 * The match is then recorded under the league the FEED named, not the one the
 * index remembers, because the feed is describing this season and the index is
 * describing last one. That is also how the promotion reaches the index at
 * all: buildIndex takes a club's league from its newest match. */
function findClub(idx, name, league, byCountry) {
  const li = idx.lIdx[league];
  if (li != null) {
    const direct = M.matchTeam(idx, name, li);
    if (direct) return direct;
  }
  const country = String(league).split(" ")[0];
  const hits = new Set();
  for (const other of (byCountry.get(country) || [])) {
    if (other === li) continue;
    const t = M.matchTeam(idx, name, other);
    if (t) hits.add(t);
    if (hits.size > 1) return null;
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/* A LEAGUE WITH NO HISTORY CANNOT RESOLVE ITS OWN CLUBS.
 *
 * findClub asks the index, and for a warming league the index holds nothing -
 * so the first harvest of Netherlands Eerste Divisie dropped all 22 rows and
 * would have dropped them every week forever. The league can never start.
 *
 * So for HARVEST_EXTRA leagues only, a club that resolves nowhere is taken at
 * the feed's spelling and entered as a new club. That is the only way one of
 * these leagues ever gets a first row.
 *
 * Two things keep it honest. findClub still runs FIRST, so a side relegated
 * out of a league we do rate is recognised as itself rather than minted a
 * second time under another spelling. And a youth, reserve or women's side is
 * refused outright: matchTeam guards those, minting would not, and this is the
 * one path that skips matchTeam. */
function resolve(rows, idx, allowed, date, bootstrap) {
  const matches = [];
  const dropped = { league: 0, club: 0, malformed: 0 };
  const byCountry = leaguesByCountry(idx);
  const canStart = bootstrap instanceof Set ? bootstrap : new Set(bootstrap || []);
  for (const r of (rows || [])) {
    const league = ourLeague(r && r.league, allowed);
    if (!league) { dropped.league++; continue; }
    /* A warming league is absent from the index by definition, which is not a
       reason to drop its rows - it is the state it has to pass through. Any
       other league missing from the index is one we hold no ratings for. */
    if (idx.lIdx[league] == null && !canStart.has(league)) { dropped.league++; continue; }
    if (!r.home || !r.away || r.home === r.away ||
        !Number.isFinite(r.hg) || !Number.isFinite(r.ag)) {
      dropped.malformed++; continue;
    }
    const mint = (name) => {
      const t = String(name || "").trim();
      return (canStart.has(league) && t && !M.isVariantSide(t)) ? t : null;
    };
    const home = findClub(idx, r.home, league, byCountry) || mint(r.home);
    const away = findClub(idx, r.away, league, byCountry) || mint(r.away);
    if (!home || !away || home === away) { dropped.club++; continue; }
    matches.push({ date, league, home, away, hg: r.hg, ag: r.ag });
  }
  return { matches, dropped };
}

/* The generic layout lib/model.js normalise() already reads, so nothing in the
   build has to learn a new shape. Quoted throughout: a club with a comma in it
   would otherwise silently shift every column right of it. */
const HEADER = "date,league,home_team,away_team,home_goals,away_goals";

function q(s) { return '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"'; }

function toCSV(matches) {
  const lines = [HEADER];
  for (const m of (matches || [])) {
    lines.push([m.date, m.league, m.home, m.away, m.hg, m.ag].map(q).join(","));
  }
  return lines.join("\n") + "\n";
}

/* Reading our own file back, so a harvest can be merged into the one before it
   rather than replacing it. Deliberately tolerant of a missing or short file -
   the first run has nothing to merge with. */
function fromCSV(text) {
  const rows = M.parseCSV(String(text || ""));
  if (rows.length < 2) return [];
  const res = M.normalise(rows);
  if (res.error) return [];
  return res.matches.map((m) => ({
    date: m.date instanceof Date ? m.date.toISOString().slice(0, 10) : String(m.date),
    league: m.league, home: m.home, away: m.away, hg: m.hg, ag: m.ag,
  }));
}

/* One match, one row. The same tie can arrive twice - a harvest overlapping the
   previous one, or their feed listing a late kick-off under both dates - and a
   duplicated result is a match the fit counts twice. */
function dedupe(matches) {
  const seen = new Set(), out = [];
  for (const m of (matches || [])) {
    const k = `${m.date}|${m.league}|${m.home}|${m.away}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 :
    a.league < b.league ? -1 : a.league > b.league ? 1 :
    a.home < b.home ? -1 : a.home > b.home ? 1 : 0));
  return out;
}

module.exports = { LEAGUE_ALIAS, HARVEST_EXTRA, ourLeague, resolve, findClub, toCSV, fromCSV, dedupe, HEADER };
