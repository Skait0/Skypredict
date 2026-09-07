"use strict";
/* THE SPELLINGS THE FIXTURE FEED USES, AGAINST THE ONES FOOTBALL-DATA DOES.
 *
 * Measured on the live board 6 Sep 2026: 759 fixtures dropped, 608 of them for
 * "no league". Not one was a missing league. They were clubs already in the
 * index under football-data's short form, arriving from the feed spelled out
 * in full - "Borussia Dortmund" against Dortmund, "Ein Frankfurt" against
 * Eintracht Frankfurt, "Ath Bilbao" against Athletic Bilbao. Germany was
 * pricing 3 fixtures against 10 dropped, and Real Madrid v Rayo Vallecano was
 * not on the board at all.
 *
 * Adding aliases recovered 93 fixtures. This file is the other half of that
 * change: proof that the recovery did not come at the price of a wrong club.
 *
 * It builds the index from the committed results floor rather than from
 * fixtures written here, because the whole question is what football-data
 * ACTUALLY calls these clubs. A hand-written fixture would only test my
 * assumption about the spelling, which is the thing that was wrong to begin
 * with. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const M = require("../lib/model.js");

const DIR = path.join(__dirname, "..", "data", "results");

let IDX = null;
function index() {
  if (IDX) return IDX;
  let matches = [];
  for (const f of fs.readdirSync(DIR)) {
    if (!f.endsWith(".gz")) continue;
    const text = zlib.gunzipSync(fs.readFileSync(path.join(DIR, f))).toString("utf8");
    const n = M.normalise(M.parseCSV(text));
    if (n && n.matches) matches = matches.concat(n.matches);
  }
  IDX = M.buildIndex(matches);
  return IDX;
}
function resolve(name) {
  const idx = index();
  const t = M.matchTeam(idx, name, null);
  if (!t) return null;
  const ti = idx.tIdx[t];
  return { team: t, league: ti === undefined ? null : idx.leagues[idx.teamLeague[ti]] };
}

/* The clubs whose fixtures were being thrown away, and where they belong.
   Spot-checked one at a time against the index - these are not guesses. */
const RESOLVES = [
  ["Borussia Dortmund",       "Dortmund",        "Germany Bundesliga 1"],
  ["Bayer Leverkusen",        "Leverkusen",      "Germany Bundesliga 1"],
  ["Eintracht Frankfurt",     "Ein Frankfurt",   "Germany Bundesliga 1"],
  ["Cologne",                 "FC Koln",         "Germany Bundesliga 1"],
  ["Hamburger SV",            "Hamburg",         "Germany Bundesliga 1"],
  /* Both promoted for 2026-27. The index takes a club's league from its
     newest match, and the harvest in data/results/live_*.csv.gz is now the
     newest thing in it - which is the point of harvesting at all. Before it
     existed these two read as second-tier all season, because the floor
     stops at May 2026. */
  ["Schalke",                 "Schalke 04",      "Germany Bundesliga 1"],
  ["SV 07 Elversberg",        "Elversberg",      "Germany Bundesliga 1"],
  ["Atletico Madrid",         "Ath Madrid",      "Spain La Liga 1"],
  ["Athletic Bilbao",         "Ath Bilbao",      "Spain La Liga 1"],
  ["Real Sociedad",           "Sociedad",        "Spain La Liga 1"],
  ["Rayo Vallecano",          "Vallecano",       "Spain La Liga 1"],
  ["Peterborough United",     "Peterboro",       "England League 1"],
  ["Sheffield Wednesday",     "Sheffield Weds",  "England League 1"],   /* relegated, and the harvest knows */
  ["Bristol Rovers",          "Bristol Rvs",     "England League 2"],
  ["Argentinos Juniors",      "Argentinos Jrs",  "Argentina Liga Profesional"],
  ["SE Palmeiras SP",         "Palmeiras",       "Brazil Serie A"],
  ["Caykur Rizespor",         "Rizespor",        "Turkey Super Lig"],
];

test("the clubs the board was dropping now resolve, to the right club", () => {
  for (const [feed, team, league] of RESOLVES) {
    const r = resolve(feed);
    assert.ok(r, feed + " still does not resolve; its fixtures are still being dropped");
    assert.equal(r.team, team, feed + " resolved to " + r.team + ", expected " + team);
    assert.equal(r.league, league, feed + " landed in " + r.league + ", expected " + league);
  }
});

/* THE OTHER HALF, AND THE MORE IMPORTANT ONE.
   Every name here has a tempting near-match in the index and is a DIFFERENT
   club. They are exactly what a looser matcher would have swallowed - the
   generic "drop a leading word" and "index name is a subset of feed name"
   rules were both tried and both produce these. A dropped fixture is
   recoverable; a fixture booked against the wrong club is not. */
const MUST_REFUSE = [
  "Bohemians Prague 1905",        /* Czech - not Bohemians of Dublin */
  "CD Everton Vina del Mar",      /* Chile - not Everton */
  "Boca Juniors de Cali",         /* Colombia - not Boca Juniors */
  "Independiente Santa Fe",       /* Colombia - not Independiente */
  "CSD Independiente del Valle",  /* Ecuador - not Independiente */
  "Internacional de Bogota.",     /* Colombia - not Internacional */
  "Atletico Nacional",            /* Colombia - not Nacional of Madeira */
  "Club Nacional de Football",    /* Uruguay - not Nacional */
  "Central Espanol FC",           /* Uruguay - not Espanyol */
  "FC Eindhoven",                 /* not PSV Eindhoven */
  "Paris 13 Atletico",            /* not Paris FC */
  "Botafogo FC SP",               /* not Botafogo RJ */
  "Gremio Novorizontino SP",      /* not Gremio */
  "CA Huracan Las Heras",         /* Mendoza - not Huracan of Buenos Aires */
  "CAS Defensores de Belgrano",   /* not Belgrano de Cordoba */
  "Club Leon",                    /* Mexico - fuzzy reaches Lyon */
  "Riga FC",                      /* Latvia - fuzzy reaches Wigan */
];

test("clubs that merely share a name with ours are still refused", () => {
  for (const n of MUST_REFUSE) {
    const r = resolve(n);
    assert.equal(r, null,
      n + " resolved to " + (r && r.team) + " in " + (r && r.league) +
      ". It is a different club, and booking it would be worse than dropping it.");
  }
});

test("national teams never resolve to a club", () => {
  /* September is a qualifying window, so the feed carries them. We hold no
     international ratings. Their nearest index matches are Port Vale, Astra
     and Sunderland, which is the whole problem. */
  for (const n of ["Germany", "Portugal", "England", "Wales", "Austria",
                   "Switzerland", "Netherlands", "Denmark", "Norway", "Serbia"]) {
    const r = resolve(n);
    assert.equal(r, null, "the national team " + n + " resolved to " + (r && r.team));
  }
});

test("no alias points at a name two different clubs share", () => {
  /* matchTeam requires a unique hit, so an ambiguous alias silently does
     nothing - it looks added and never fires. Catch it here instead. */
  const idx = index();
  const counts = Object.create(null);
  for (const t of idx.teams) {
    const n = M.normName(t);
    counts[n] = (counts[n] || 0) + 1;
  }
  for (const k of Object.keys(M.TEAM_ALIAS)) {
    const v = M.TEAM_ALIAS[k];
    assert.ok(!(counts[v] > 1),
      "alias " + k + " -> " + v + " is ambiguous: " + counts[v] +
      " clubs in the index normalise to that name, so the alias never fires.");
  }
});
