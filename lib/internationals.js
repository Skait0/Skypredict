"use strict";

/**
 * National teams, rated by the same goals model as the clubs.
 *
 * WHY. On 23 Sep 2026, a week inside an international window, 104 of the 609
 * fixtures dropped as "no league" were national teams - the Nations League,
 * AFCON and World Cup qualifying, the CONCACAF Nations League. We held no
 * results for a single one of those sides.
 *
 * WHERE FROM. martj42/international_results: every men's international since
 * 1872, one row a match, maintained on GitHub and released CC0 - public
 * domain, so a commercial site can use it without asking. It is RESULTS, not
 * someone else's ratings: the teams are fitted here, by fitModel, exactly as
 * a club is, so an international and a league match are priced by one model.
 *
 * THREE THINGS THE FILE NEEDS BEFORE THE FIT CAN USE IT.
 *
 * 1. A third of these matches are at a neutral venue - every tournament game
 *    that does not involve the host. The fit gives every "home" side home
 *    advantage, so a neutral match goes in twice, once each way round, at
 *    half weight each: the home term cancels and the match still counts once.
 * 2. Friendlies are half the evidence a competitive match is. Squads rotate,
 *    and a coach trying six debutants is not the side that plays a qualifier.
 *    They stay in the fit at half weight; they are not published at all (see
 *    UNRATED_LEAGUES in lib/build.js).
 * 3. The file spells eleven countries differently from SportyBet, whose names
 *    are the ones fixtures arrive with. They are renamed HERE, on the way in,
 *    rather than in TEAM_ALIAS_SRC: that table is keyed on the name alone and
 *    applies to every club on every board, and "Ireland" or "Georgia" is not
 *    a spelling to hand it lightly.
 */

const URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";
const LEAGUE = "International";

/* The file's spelling -> SportyBet's. Checked against every national side on
   the card of 23 Sep 2026: 180 of 192 matched as they stood, and these are
   the rest. Eritrea was the twelfth and is simply absent - they have played
   almost nothing since 2023 - so it stays unrated rather than guessed. */
const RENAME = {
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "China": "China PR",
  "DR Congo": "Congo DR",
  "Curaçao": "Curacao",
  "Czech Republic": "Czechia",
  "Iran": "IR Iran",
  "Republic of Ireland": "Ireland",
  "South Korea": "Korea Republic",
  "Turkey": "Turkiye",
  "United States": "USA",
  "Saint Martin": "Saint-Martin",
};

const FRIENDLY_WEIGHT = 0.5;

/* The international fit's own settings, walked forward over the twelve months
   to 26 Aug 2026 (393 competitive home-venue matches, refitted every two
   months), 1X2 logloss:

     half-life  200, shrink 1.5, from 2023-07  0.8351   (the clubs' settings)
     half-life  500, shrink 1.5, from 2021     0.8043
     half-life 1000, shrink 1.5, from 2020     0.7973
     half-life 1000, shrink 0.5, from 2020     0.7892   <- these
     half-life 1000, shrink 0.2, from 2020     0.7866

   The last is a hair better on 1X2 and a hair worse on Over 1.5; 0.5 keeps a
   little more pull towards the mean for sides that barely play. */
const SINCE = "2020-01-01";
const HALF_LIFE = 1000;
const REG = 0.5;

/* A senior men's national-team competition as SportyBet labels it:
   "International UEFA Nations League", "International Africa Cup of Nations
   Qualification". Club competitions ("International Clubs ...") and youth
   ("International Youth ...") share the prefix and are not this. */
function isNationalCompetition(label) {
  const s = String(label || "");
  return /^International /.test(s) && !/^International (Clubs|Youth)\b/.test(s) &&
    !/women|simulated|\bsrl\b/i.test(s);
}

/* The CSV has no quoted commas today, but a city or tournament with one would
   shift every column after it. A quote-aware split costs four lines. */
function splitRow(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { q = !q; continue; }
    if (c === "," && !q) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse the file into fit-ready matches from `since` onward.
 * Returns [] for anything it cannot read - the build treats that as "no
 * internationals today", never as a reason to stop.
 */
function parse(text, since) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const h = splitRow(lines[0]);
  const at = (k) => h.indexOf(k);
  const iD = at("date"), iH = at("home_team"), iA = at("away_team"),
        iHG = at("home_score"), iAG = at("away_score"),
        iT = at("tournament"), iN = at("neutral");
  if ([iD, iH, iA, iHG, iAG].some((i) => i < 0)) return [];
  const cutoff = since ? new Date(since) : null;
  const name = (s) => { const t = String(s || "").trim(); return RENAME[t] || t; };

  const out = [];
  for (let r = 1; r < lines.length; r++) {
    const c = splitRow(lines[r]);
    const date = new Date(c[iD] + "T12:00:00Z");
    if (isNaN(date) || (cutoff && date < cutoff)) continue;
    const hg = parseInt(c[iHG], 10), ag = parseInt(c[iAG], 10);
    const home = name(c[iH]), away = name(c[iA]);
    /* An unplayed fixture carries NA in the score columns. */
    if (!home || !away || home === away || isNaN(hg) || isNaN(ag)) continue;
    const friendly = /friendly/i.test(c[iT] || "");
    const neutral = String(c[iN] || "").toUpperCase() === "TRUE";
    const w = friendly ? FRIENDLY_WEIGHT : 1;
    if (neutral) {
      out.push({ date, league: LEAGUE, home, away, hg, ag, weight: w / 2, neutral: true });
      out.push({ date, league: LEAGUE, home: away, away: home, hg: ag, ag: hg, weight: w / 2, neutral: true });
    } else {
      out.push({ date, league: LEAGUE, home, away, hg, ag, weight: w });
    }
  }
  return out;
}

module.exports = { parse, isNationalCompetition, URL, LEAGUE, RENAME, FRIENDLY_WEIGHT, SINCE, HALF_LIFE, REG };
