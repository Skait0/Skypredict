"use strict";
/**
 * openfootball rows -> matches named the way our index names them.
 *
 * Only the countries our ratings cover are listed. A club from anywhere else
 * is dropped: 188 of the 367 clubs in five seasons of European football play
 * in countries we hold no ratings for, and that is an expected outcome rather
 * than a failure to fix.
 *
 * The country tag is what makes this safe. Every lookup is matchTeam's narrow
 * league-filtered case, never the whole-index case that once scored York City
 * 0.889 against Cork City.
 */
const M = require("./model.js");

const COUNTRY_OF_CODE = {
  ESP: "Spain", ENG: "England", ITA: "Italy", GER: "Germany", FRA: "France",
  POR: "Portugal", NED: "Netherlands", BEL: "Belgium", TUR: "Turkey",
  GRE: "Greece", SCO: "Scotland", DEN: "Denmark", NOR: "Norway",
  SWE: "Sweden", AUT: "Austria", SUI: "Switzerland", POL: "Poland",
  ROU: "Romania", RUS: "Russia", IRL: "Ireland", FIN: "Finland",
};

function leaguesByCountry(idx) {
  const by = new Map();
  idx.leagues.forEach((name, li) => {
    const country = String(name).split(" ")[0];
    if (!by.has(country)) by.set(country, []);
    by.get(country).push(li);
  });
  return by;
}

/* Unique hit across that country's divisions, or nothing. A club that matches
   in two divisions is ambiguous and is refused - the same rule matchTeam uses
   for an alias. */
function findIn(idx, by, country, name) {
  const lis = by.get(country) || [];
  const hits = new Map();
  for (const li of lis) {
    const t = M.matchTeam(idx, name, li);
    if (t) hits.set(t, li);
  }
  if (hits.size !== 1) return null;
  const team = [...hits.keys()][0];
  return { team: team, league: idx.leagues[hits.get(team)] };
}

function resolve(rows, idx) {
  const by = leaguesByCountry(idx);
  const matches = [], dropped = [], byCountry = {};
  for (const r of (rows || [])) {
    const hc = COUNTRY_OF_CODE[r.homeCC], ac = COUNTRY_OF_CODE[r.awayCC];
    if (!hc || !ac) {
      dropped.push({ what: r.home + " v " + r.away, why: "country we hold no ratings for" });
      continue;
    }
    const h = findIn(idx, by, hc, r.home), a = findIn(idx, by, ac, r.away);
    if (!h || !a) {
      dropped.push({ what: (h ? r.away : r.home), why: "could not resolve the club" });
      continue;
    }
    matches.push({ home: h.team, away: a.team,
                   homeCountry: hc, awayCountry: ac,
                   homeLeague: h.league, awayLeague: a.league,
                   hg: r.hg, ag: r.ag });
    /* Only a border carries the signal the offsets are fitted from. A domestic
       tie is a usable match and no evidence at all about country strength. */
    if (hc !== ac) {
      byCountry[hc] = (byCountry[hc] || 0) + 1;
      byCountry[ac] = (byCountry[ac] || 0) + 1;
    }
  }
  return { matches: matches, dropped: dropped, byCountry: byCountry };
}

module.exports = { resolve, COUNTRY_OF_CODE };
