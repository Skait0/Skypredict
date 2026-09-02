"use strict";

/**
 * Downloads results and fixtures, fits the model, returns the payload the
 * site renders.
 *
 * Runs inside a serverless function, so the constraints that shape this file
 * are time and memory rather than CPU. Downloads happen with bounded
 * concurrency: firing sixty requests at once gets throttled and is slower
 * than a steady stream, and it risks exhausting memory holding every
 * response at the same time.
 *
 * Nothing here throws on a single bad source. A league that fails to
 * download is logged and skipped, because losing one league is far better
 * than losing the whole site.
 */

const M = require("./model.js");
const DB = require("./supabase.js");
const KEY = require("./key.js");
const GRADE = require("./grade.js");
const ORACLE = require("./oracle.js");
const SV = require("./soccervista.js");
const FD = require("./footballdata.js");
const CAL = require("./calibrate.js");

/* The old scoreline: round the two expected-goal figures to a total, nudge it
   to agree with the over/under call, split it in proportion and push off a
   draw. No longer what the page shows - see scoreForTip below for why it could
   only ever produce five scorelines and never a draw. Kept solely as a
   fallback for a payload carrying no score distribution to draw from. */
function houseScoreline(k) {
  const sum = (k.lh || 0) + (k.la || 0);
  /* Null, not "0-0". Without the expected-goal figures there is nothing to
     summarise, and a fabricated nil-nil would be indistinguishable from a
     real prediction of one. */
  if (!(sum > 0)) return null;
  let total = Math.round(sum);
  if (k.o25 >= 0.5 && total < 3) total = 3;
  if (k.o25 < 0.5 && total > 2) total = 2;
  let h = Math.round((k.lh / sum) * total), a = total - h;
  if (h === a && !(k.draw >= k.home && k.draw >= k.away)) {
    if (k.home >= k.away) { h += 1; a -= 1; } else { a += 1; h -= 1; }
  }
  return h + "-" + a;
}

/* A stable pseudo-random number from a string. Same fixture, same number,
   every build - so a scoreline never changes between visits. */
function h32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

/* The scoreline published beside a tip.
 *
 * This was the expected scoreline: round the two expected-goal figures to a
 * total, split it in proportion, then push off a draw. Every step of that is
 * defensible and the result was not football. Measured on a 276-fixture board:
 *
 *   five distinct scorelines, 0% draws, 0% games of one goal or fewer,
 *   2-1 on 42% and 2-0 on 39% of the card.
 *
 * Against 242 real results over the same period: 32 distinct scorelines, 29%
 * draws, 22% of games finishing with one goal or none, and the most common
 * result of all - 1-1, 14% - a scoreline we could not print at all.
 *
 * Two causes, both structural. Expected goals never drop below 1.75 on a real
 * board, so rounding a total can only ever give 2, 3 or 4: 0-0 and 1-0 were
 * arithmetically unreachable. And the rule that kept a level scoreline asked
 * whether the model favoured the draw over BOTH sides, which in a Poisson
 * model it essentially never does - it fired zero times in 276 fixtures, so
 * all 130 level scorelines were converted into wins.
 *
 * Underneath both: the mean of a distribution is not an outcome of it.
 * Expected goals of 2.7 does not make 2-1 likely; it makes 2.7 the average.
 *
 * The obvious correction is worse. Publishing the single likeliest scoreline
 * gives 1-1 on 84% of the card - not a bug, but what happens when two sides
 * expect about 1.4 goals each and every cell is a few percent. The mode is
 * right and useless, which is why an earlier attempt at it was reverted.
 *
 * So: draw from the fixture's own distribution rather than collapsing it to a
 * point. Seeded by the fixture's identity, so it is fixed for that match
 * forever and does not flicker between builds. Constrained to scorelines the
 * tip does not lose on, which keeps the coherence guarantee that a tip and the
 * score beside it can never contradict each other.
 *
 * That yields 26 distinct scorelines, 27% draws and 22% low-scoring games,
 * against 31 / 28% / 22% in the results over the same period - a board shaped
 * like the football it is describing.
 *
 * What it is NOT is "the most likely score", and it should not be labelled as
 * one. It is a representative result: one of the ways this match plausibly
 * ends, drawn in proportion to how likely the model thinks each way is.
 */
/* See the note beside its use. Measured against real results, not picked. */
const DRAW_WEIGHT = 0.60;

function scoreForTip(k, tipLabel, seed) {
  if (!k) return null;

  let table = Array.isArray(k.scores) ? k.scores.filter(c => c && c.s && c.p > 0) : null;
  /* No distribution to draw from - an older payload, or a caller with only a
     summary. Fall back to what the page did before rather than invent one. */
  if (!table || !table.length) return houseScoreline(k) || k.score;

  /* Scorelines this tip survives. gradeLabel returns false only for an outright
     loss; null means the market cannot be settled by a final score at all
     (first-half goals, for instance), and those place no constraint. */
  let pool = table;
  if (tipLabel) {
    const ok = table.filter(c => {
      const [h, a] = c.s.split("-").map(Number);
      return GRADE.gradeLabel(tipLabel, h, a) !== false;
    });
    /* Every candidate loses the tip - which should not happen, but publishing
       a contradiction is the one outcome worth guarding against absolutely. */
    if (ok.length) pool = ok;
  }

  /* Only outcomes the model itself considers live.
     The scoreline is drawn from the distribution, and a distribution contains
     outcomes the model thinks unlikely - so it published 2-2 for a Real Madrid
     side it makes 68% to win, and 3-0 in a Napoli match it makes 41/28/31.
     Both were inside the distribution and both read as the model contradicting
     itself, because that is what they are: a reader sees "68% home win" and a
     drawn scoreline beside it.
     The old rule forced the scoreline onto whichever of home/draw/away was
     likeliest. That is why draws vanished entirely - in a Poisson model the
     draw is almost never the single likeliest outcome, even when it is a real
     possibility - and 0% draws against 29% in reality was the complaint that
     replaced this one.
     So the gate is relative, not absolute: an outcome stays in play while it is
     within OUTCOME_FLOOR of the likeliest one. A 68/19/13 fixture offers only
     the home win, because the draw is under a third as likely. A 41/28/31 one
     offers all three, because they are genuinely close - and that is exactly
     the fixture where a draw belongs.
     Applied AFTER the tip filter and never allowed to empty what it leaves.
     Coherence is the harder promise: a tip and the score beside it must not
     contradict each other, so where the two constraints disagree the tip wins.
     Ordering it the other way published 2-0 beside "Away win" - the gate
     removed every away scoreline, then the tip had nothing left to fall back
     to. A test caught that. */
  /* 0.35 - an outcome must be at least about a third as likely as the
     favourite to be shown. Measured against the fixtures that prompted this,
     rather than picked:
        Real Madrid 68/19/13   draw is 0.28 of the best   excluded
        58/23/19               draw is 0.40               kept
        48/25/27               draw is 0.52               kept
        Napoli 41/28/31        draw is 0.70               kept
     Anything above 0.40 starts suppressing draws on ordinary favourites, which
     is the complaint this rule is trying not to recreate. */
  const OUTCOME_FLOOR = 0.35;
  const oc = { home: k.home, draw: k.draw, away: k.away };
  if (oc.home != null && oc.draw != null && oc.away != null) {
    const best = Math.max(oc.home, oc.draw, oc.away);
    if (best > 0) {
      const live = {
        home: oc.home >= best * OUTCOME_FLOOR,
        draw: oc.draw >= best * OUTCOME_FLOOR,
        away: oc.away >= best * OUTCOME_FLOOR,
      };
      const kept = pool.filter((c) => {
        const [h, a] = c.s.split("-").map(Number);
        return h > a ? live.home : (h < a ? live.away : live.draw);
      });
      /* Never at the cost of leaving nothing to draw from. */
      if (kept.length) pool = kept;
    }
  }


  /* Draws come out about three points high without this, and the cause is a
     selection effect rather than the model. Most of our tips are double
     chance, and filtering to scorelines the tip survives removes one side's
     wins while leaving every draw in - so renormalising what is left raises
     the draw share above its unconditional value. That is the honest
     distribution GIVEN the tip lands, but a board should describe what will
     happen, and our tips land about three times in four.
     0.60 is measured, and the first attempt at it was wrong in a way worth
     recording. A sweep against a matrix rebuilt from published expected goals
     said 0.90 - but an independent Poisson carries less draw mass than the
     fitted model does, so on the real board 0.90 moved the rate barely three
     points. The tip-eligible mass here is about 41% draws, and solving
     0.41w / (0.59 + 0.41w) = 0.29 gives 0.60, which a rebuild confirmed.
     Re-measure against a real build, never a reconstruction, if the tip mix
     moves. */
  /* And only scorelines that are actually likely for this fixture.
     The outcome gate above removes outcomes the model doubts; it says nothing
     about improbable scorelines WITHIN an outcome. Napoli v Como was published
     3-0 - a home win, home being the favourite, so the outcome gate passed it
     straight through - when 3-0 is a quarter as likely as 1-1 in a match
     expecting 1.34 goals to 1.13. Directionally right and still not a
     prediction anybody would make.
     So a cell stays in play while it is within CELL_FLOOR of the likeliest
     one. Same shape of rule as the outcome gate, one level down. */
  /* 0.30 - the loosest floor that removes the reported case, chosen for that
     reason. Napoli's 3-0 sits at 0.25 of the likeliest cell, so anything above
     0.25 excludes it; tighter floors only cost variety and understate goals
     further (0.40 drops the board to 14 scorelines and 2.13 mean goals, 0.50 to
     12 and 2.11).
     The cost, stated: the board averages 2.29 goals against 2.76 expected. That
     is the price of publishing only likely scorelines - the mode of a
     right-skewed distribution sits below its mean, so a board of individually
     likely lines must run below expectation. There is no setting that gives
     both, and a reader looking at one match is owed the likely line. */
  const CELL_FLOOR = 0.30;
  if (pool.length > 1) {
    const bestP = pool.reduce((m, c) => (c.p > m ? c.p : m), 0);
    if (bestP > 0) {
      const likely = pool.filter((c) => c.p >= bestP * CELL_FLOOR);
      if (likely.length) pool = likely;
    }
  }

  const weighted = pool.map(c => {
    const [h, a] = c.s.split("-").map(Number);
    return { s: c.s, p: c.p * (h === a ? DRAW_WEIGHT : 1) };
  });
  /* Keep every scoreline the fixture could reasonably produce, and drop the
     ones it could not.
     Sampling the untrimmed distribution sized the tail correctly across the
     card and put 4-3 on a 2.85-goal fixture and a 5-0 in a league averaging
     2.25. Trimming by probability mass instead - keeping the likeliest 80%
     of cells - fixed that and broke something quieter: a right-skewed
     distribution keeps its low cells and loses its high ones, so the board
     began UNDER-stating goals everywhere. Austria printed 1.75 goals a game
     against 2.67 expected and 3.17 actually scored; Brazil 1.78 against
     2.59 and 2.83.
     So the cut is on the thing that was actually wrong - how far a
     scoreline sits above what THIS match expects - rather than on how rare
     it is. Everything up to three goals clear of expectation stays, which
     leaves the distribution its shape and its mean, and removes only the
     outcomes a reader would reject for that fixture. A 2.0-goal game can
     still print 4-1; it can no longer print 5-0. */
  const expect = (k.lh != null && k.la != null) ? (k.lh + k.la) : null;
  /* 2.5, not 3.0. A flat three goals clear of expectation is fine for a
     high-scoring fixture and far too loose at the quiet end: it let a 2.06
     expected-goal Argentinian game print 4-1, which is the same objection
     that started this. At 2.5 no fixture expecting under 2.4 goals can print
     five, and Argentina tops out at four. The cost is 0.16 of a goal on the
     board mean against 0.08 - a rounding error next to the alternative. */
  const MAX_OVER = 2.5;
  let bulk = weighted;
  if (expect != null) {
    const near = weighted.filter((c) => {
      const [h, a] = c.s.split("-").map(Number);
      return (h + a) - expect <= MAX_OVER;
    });
    if (near.length) bulk = near;
  }

  const total = bulk.reduce((t, c) => t + c.p, 0);
  if (!(total > 0)) return pool[0].s;

  /* The seed is the fixture, so the same match always shows the same result.
     Without one, fall back to the shape of the distribution itself - stable,
     and identical fixtures deserve identical scorelines anyway. */
  /* The tip is deliberately NOT part of the seed. It selects which
     scorelines are eligible, and it should not also move the draw within
     them: two tips that constrain nothing must land on the same result, and
     a tip changing between refits should not reshuffle a fixture that is
     otherwise unchanged. */
  let r = h32(String(seed == null ? (k.lh + "|" + k.la) : seed)) * total;
  for (const c of bulk) { r -= c.p; if (r <= 0) return c.s; }
  return bulk[bulk.length - 1].s;
}

const BASE = "https://www.football-data.co.uk";
const UA = "Mozilla/5.0 (compatible; FormlineBot/1.0)";
const LIVE_SCORES_URL = "https://web-production-798c0.up.railway.app/api/livescores";

/* -------- helpers for cross-source team-name matching -------- */
function normalizeTeam(name) {
  return (name || "").toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(fc|afc|cf|sc|ac|bsc|cfc|afc)\b/g, "")
    .replace(/\b(u19|u21|u23|ii|iii|b team|reserves?)\b/g, "")
    .trim();
}
function teamKey(name) {
  return normalizeTeam(name).replace(/\s+/g, "");
}

/* -------- kick-off times -------------------------------------------------
   The two feeds disagree about what a clock time means. SportyBet gives a UTC
   instant. football-data publishes UK local time - so through British Summer
   Time its 19:45 is 18:45 UTC, and stamping a "Z" on it put every one of its
   fixtures an hour late on the site: a game that kicked off at 8 showed as 9.
   The offset is read from the zone database rather than assumed, so it is
   right on both sides of the March and October switches, and right for the
   years when the UK next changes its mind about them. */
function zoneOffsetMs(utcMs, zone) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  /* en-GB renders midnight as hour 24; Date.UTC would roll that into the next
     day and put the offset out by 24 hours. */
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day,
                           (+p.hour) % 24, +p.minute, +p.second);
  return asIfUTC - utcMs;
}
function wallTimeToUtcMs(y, m, d, hh, mm, zone) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  /* Offset at the guess, then re-read at the corrected instant: one pass is
     enough to land on the right side of a clock change. */
  let t = guess - zoneOffsetMs(guess, zone);
  return guess - zoneOffsetMs(t, zone);
}

/* SportyBet and football-data name a number of competitions differently. The
   results, the record and the results view all speak football-data's names, so
   fixtures adopt those too - otherwise La Liga appears twice in the league
   filter, once per feed, and a league pinned from one list never matches the
   other. Only pairs that are unambiguously the same competition belong here;
   anything genuinely distinct (a cup, a different tier) keeps its own name. */
const LEAGUE_ALIASES = {
  "Spain LaLiga": "Spain La Liga 1",
  "Spain LALIGA HYPERMOTION": "Spain La Liga 2",
  "England League One": "England League 1",
  "England League Two": "England League 2",
  "Germany Bundesliga": "Germany Bundesliga 1",
  "Germany 2. Bundesliga": "Germany Bundesliga 2",
  "Portugal Liga Portugal": "Portugal Primeira Liga",
  "Turkiye Super Lig": "Turkey Super Lig",
  "Brazil Brasileiro Serie A": "Brazil Serie A",
  "China Chinese Super League": "China Super League",
  "Argentina Primera LPF": "Argentina Liga Profesional",
};
function canonLeague(name) {
  const s = (name || "").trim();
  return LEAGUE_ALIASES[s] || s;
}

// Div code -> display name. Seasonal files live at /mmz4281/<season>/<code>.csv
const MAIN = {
  E0: "England Premier League", E1: "England Championship",
  E2: "England League 1", E3: "England League 2",
  EC: "England Conference National",
  SC0: "Scotland Premiership", SC1: "Scotland Championship",
  SC2: "Scotland League 1", SC3: "Scotland League 2",
  D1: "Germany Bundesliga 1", D2: "Germany Bundesliga 2",
  I1: "Italy Serie A", I2: "Italy Serie B",
  SP1: "Spain La Liga 1", SP2: "Spain La Liga 2",
  F1: "France Ligue 1", F2: "France Ligue 2",
  N1: "Netherlands Eredivisie", B1: "Belgium Pro League",
  P1: "Portugal Primeira Liga", T1: "Turkey Super Lig",
  G1: "Greece Super League",
};

// Country -> competition kept from that country's combined file.
// These files hold several competitions, so the value filters within them.
const EXTRA = {
  Argentina: "Liga Profesional", Austria: "Bundesliga",
  Brazil: "Serie A", China: "Super League",
  Denmark: "Superliga", Finland: "Veikkausliiga",
  Ireland: "Premier Division", Japan: "J1 League",
  Mexico: "Liga MX", Norway: "Eliteserien",
  Poland: "Ekstraklasa", Romania: "Superliga",
  Russia: "Premier League", Sweden: "Allsvenskan",
  Switzerland: "Super League", USA: "MLS",
};

const EXTRA_FILE = {
  Argentina: "ARG.csv", Austria: "AUT.csv", Brazil: "BRA.csv",
  China: "CHN.csv", Denmark: "DNK.csv", Finland: "FIN.csv",
  Ireland: "IRL.csv", Japan: "JPN.csv", Mexico: "MEX.csv",
  Norway: "NOR.csv", Poland: "POL.csv", Romania: "ROU.csv",
  Russia: "RUS.csv", Sweden: "SWE.csv", Switzerland: "SWZ.csv",
  USA: "USA.csv",
};

const DEFAULTS = {
  seasons: ["2425", "2526"],
  halfLife: 200,
  shrinkage: 35,
  daysAhead: 21,
  minLeagueMatches: 60,
  minSinceDate: "2023-07-01",
  concurrency: 6,
  fetchTimeoutMs: 20000,
  xgWeight: 0.30,
  recordDays: 21,
  resultDays: 14,
};

async function fetchText(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!r.ok) return { url, error: `HTTP ${r.status}` };
    const text = await r.text();
    if (text.length < 200) return { url, error: `short response (${text.length}b)` };
    return { url, text };
  } catch (e) {
    return { url, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/** Run tasks with a fixed number in flight at once. */
async function pool(items, limit, worker) {
  const out = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return out;
}

function buildSourceList(cfg) {
  const list = [];
  for (const code of Object.keys(cfg.main)) {
    for (const season of cfg.seasons) {
      list.push({ kind: "main", url: `${BASE}/mmz4281/${season}/${code}.csv`,
                  code, league: cfg.main[code] });
    }
  }
  for (const country of Object.keys(cfg.extra)) {
    const file = EXTRA_FILE[country];
    if (!file) continue;
    list.push({ kind: "extra", url: `${BASE}/new/${file}`,
                country, league: cfg.extra[country] });
  }
  return list;
}

function rowsToMatches(text, src, cfg) {
  const rows = M.parseCSV(text);
  if (rows.length < 2) return [];
  const res = M.normalise(rows);
  if (res.error) return [];

  const out = [];
  const cutoff = new Date(cfg.minSinceDate);
  for (const m of res.matches) {
    if (!m.date || m.date < cutoff) continue;
    if (src.kind === "main") {
      // trust the configured name over whatever the file's Div says
      m.league = src.league;
    } else {
      // combined country file: keep only the configured competition
      const want = `${src.country} ${src.league}`;
      if (m.league !== want) continue;
    }
    out.push(m);
  }
  return out;
}

/* ---------------------------------------------------------------- cup ties
   A cup tie between divisions cannot be read off the ratings alone. Attack
   and defence are centred WITHIN each league when the model is fitted, so a
   mid-table Championship side and a mid-table Premier League side both sit
   at roughly zero and the model would call them equals.

   Nothing in the data fixes that. There are no cup results in the training
   feeds and not one club appears in two leagues, so there is no observation
   anywhere that ties one division's scale to another's. This number is
   therefore a stated assumption, not a measurement, and it is the only one
   of its kind in the model.

   0.20 per division, applied to both sides of the tie, so one step is a
   0.40 swing in log goal-rate - a shade above home advantage, which is about
   the right order for a division. Three steps (Premier League against League
   Two) makes the bigger club a heavy favourite without making the tie a
   foregone conclusion, which is what cup football actually looks like.

   Because it is an assumption, predictions built on it are marked and their
   confidence is pulled hard toward even - see CROSS_TIER_SHRINK. They appear
   on the board; they do not get to be anybody's banker. */
/* How much weaker than its country's top flight each division is, in log
   goal-rate. Subtracting one from another gives the edge for a cup tie
   between them.

   A flat step per division was the first thing I wrote and it was wrong on
   its face: it claimed the Premier League to Championship gap equals the
   League One to League Two gap. It does not, and it is not close. That top
   gap is the widest in English football - it is why parachute payments exist
   and why promoted sides so often go straight back down.

   These follow the separations published rating scales settle on between
   English tiers, roughly 200 Elo at the top, then 150, then 100, then 100,
   converted at about 0.14 of log goal-rate per 100 Elo. So one step down
   from the Premier League costs more than twice what the bottom step does.
   Two-tier countries take a single step near the English top one, which is
   the right order for a major league against its second division.

   It remains an assumption. Nothing in our data can measure it: the training
   feeds carry no cup results, and no club appears in two leagues, so there is
   no observation tying one division's scale to another's. What changed is
   that the assumption now has the shape the real game has, instead of a flat
   one chosen for convenience. */
const TIER_HANDICAP = {
  "England Premier League": 0.00,
  "England Championship": 0.28,
  "England League 1": 0.49,
  "England League 2": 0.63,
  "England Conference National": 0.77,

  "Scotland Premiership": 0.00,
  "Scotland Championship": 0.24,
  "Scotland League 1": 0.42,
  "Scotland League 2": 0.56,

  "Germany Bundesliga 1": 0.00, "Germany Bundesliga 2": 0.24,
  "Spain La Liga 1": 0.00,      "Spain La Liga 2": 0.26,
  "Italy Serie A": 0.00,        "Italy Serie B": 0.26,
  "France Ligue 1": 0.00,       "France Ligue 2": 0.26,
};
/* Confidence is still pulled toward even, though less hard than when the
   ladder was flat - a better-shaped assumption deserves a little more room,
   not a free pass. These stay barred from the pick of the day and the slip of
   the day regardless of what this number is. */
const CROSS_TIER_SHRINK = 0.70;

/* Which division a league actually is. 1 is a country's top flight.
 *
 * "Top flight only" was decided in the page by pattern-matching the league
 * name, and it leaked: England National League (the fifth tier) came through
 * as a top flight along with Denmark 1. Division, Ireland First Division and
 * Romania Liga 2, because the regex was looking for "conference",
 * "1st division" and "division 2" while the feed writes something else.
 *
 * Two things made that unwinnable. The obvious one is that every feed spells
 * its divisions differently. The subtler one is that the label on a fixture is
 * not always the league we rated it in - those National League games arrive
 * labelled "England National League" while the clubs sit in our index under
 * "England Conference National", so the page was pattern-matching a string the
 * model never used.
 *
 * So the tier is decided here, against the league the model actually resolved,
 * and travels with the fixture as a number. The page filters on that. Adding a
 * league means adding a line here, which is a far better failure mode than a
 * regex quietly admitting a fifth division.
 */
const LEAGUE_TIER = {
  "England Premier League": 1, "England Championship": 2, "England League 1": 3,
  "England League 2": 4, "England Conference National": 5,

  "Scotland Premiership": 1, "Scotland Championship": 2,
  "Scotland League 1": 3, "Scotland League 2": 4,

  "Germany Bundesliga 1": 1, "Germany Bundesliga 2": 2,
  "Italy Serie A": 1,        "Italy Serie B": 2,
  "Spain La Liga 1": 1,      "Spain La Liga 2": 2,
  "France Ligue 1": 1,       "France Ligue 2": 2,

  "Netherlands Eredivisie": 1, "Belgium Pro League": 1,
  "Portugal Primeira Liga": 1, "Turkey Super Lig": 1,
  "Greece Super League": 1,    "Argentina Liga Profesional": 1,
  "Austria Bundesliga": 1,     "Brazil Serie A": 1,
  "China Super League": 1,     "Denmark Superliga": 1,
  "Finland Veikkausliiga": 1,  "Ireland Premier Division": 1,
  "Japan J1 League": 1,        "Mexico Liga MX": 1,
  "Norway Eliteserien": 1,     "Poland Ekstraklasa": 1,
  "Romania Superliga": 1,      "Russia Premier League": 1,
  "Sweden Allsvenskan": 1,     "Switzerland Super League": 1,
  "USA MLS": 1,
};

/* A fixture is only top flight if BOTH clubs are.
 *
 * This is what a cup tie needs. "Top flight" asked about a competition cannot
 * describe the FA Cup, where a Premier League club draws a fourth-division
 * one; asked about the two clubs actually playing, it can. So the fixture
 * takes the worse of the two, and a cup tie involving a lower-division side is
 * correctly not a top-flight game.
 *
 * Unknown leagues return 0, which reads as "not established" - the page treats
 * only a known 1 as top flight, so anything unmapped is left out of a filter
 * that promises the top division rather than smuggled into it.
 */
function tierOfLeague(league) {
  const t = LEAGUE_TIER[String(league || "")];
  return t === undefined ? 0 : t;
}
function fixtureTier(homeLeague, awayLeague) {
  const h = tierOfLeague(homeLeague), a = tierOfLeague(awayLeague);
  if (!h || !a) return 0;
  return Math.max(h, a);
}

function countryOfLeague(league) { return String(league || "").split(" ")[0]; }

/* The edge for home, positive when home is the higher division. Null when the
   two cannot be compared at all - a different country, or a division missing
   from the ladder. Null means "do not predict this", never "treat as equal":
   silently calling a Premier League side and a third-tier side evens is the
   exact mistake this whole ladder exists to avoid. */
function tierEdge(homeLeague, awayLeague) {
  if (homeLeague === awayLeague) return 0;
  if (countryOfLeague(homeLeague) !== countryOfLeague(awayLeague)) return null;
  const h = TIER_HANDICAP[homeLeague], a = TIER_HANDICAP[awayLeague];
  if (h === undefined || a === undefined) return null;
  return a - h;
}
/* Competitions we hold no ratings for, and must therefore refuse to price.
 *
 * The danger is specific and it is not that these games are unimportant. A
 * youth or reserve or women's side usually carries its club's name, so when
 * the fixture's own competition is unknown the resolver below falls through to
 * matching on name alone - and finds the SENIOR men's team. "Stuttgart v
 * Freiburg" in the DFB-Pokal Junioren was published priced off the two
 * Bundesliga first teams, which is not a slightly worse prediction but an
 * answer to a different question, presented with the same confidence as the
 * rest of the card. It reads as a Bundesliga tie, which is exactly why it got
 * picked for someone's slip.
 *
 * So this is a statement about our data, not about the football: we have no
 * results for these competitions, and borrowing another team's record because
 * the name collides is worse than saying nothing. If training data for one of
 * them is ever added, delete its marker here - the exclusion exists only for
 * as long as the ratings are missing.
 */
const UNRATED_COMPETITION =
  /\b(amateur|amateure|junior(?:en|s)?|youth|jugend|academy|primavera|reserves?|jong|u ?1[5-9]|u ?2[0-3])\b|\bwomen\b|\bfrauen\b|\bfemenin[ao]\b|\bf[ée]minin(?:e|es)?\b/i;

function isUnratedCompetition(league) {
  return UNRATED_COMPETITION.test(String(league || ""));
}

/* The league a club actually plays in, regardless of what competition this
   particular fixture belongs to. */
function leagueOfTeam(idx, name) {
  const t = M.matchTeam(idx, name, null);
  if (!t) return null;
  const ti = idx.tIdx[t];
  return ti === undefined ? null : idx.teamLeague[ti];
}

/* Confirm a batch of recorded results against the score oracle.
 *
 * Returns a Map from the row we were given to { hg, ag, hit } for the ones an
 * authoritative source could settle. A row missing from the map is one nobody
 * could confirm, and the caller does not publish it.
 *
 * Rows already marked `source: "oracle"` were confirmed on an earlier build
 * and are taken as they stand - that is what makes a confirmation outlive the
 * few-day window the free plan will answer for. Everything else is looked up,
 * one request per distinct date, and written back so the next build need not
 * ask again.
 *
 * Non-fatal throughout: no key, an unreachable API, a date the plan refuses -
 * each ends with rows unconfirmed and therefore unpublished, which is the same
 * shape of answer as "the results feed has not got there yet".
 */
/* Two sources of finality, asked in order.
   SoccerVista first: it answers about seven days either side of today, needs
   no key, and on the days both could be checked it agreed with our own grades
   63/63 and 64/64. API-Football second, because it is the one we hold a key
   for and it should not be dropped merely because it is currently suspended -
   the day that account is restored this keeps working without a change here.
   Rows come back in one shape, so ORACLE.findMatch pairs either of them. */
const SCORE_SOURCES = [
  { name: "soccervista", api: SV, days: 7 },
  { name: "oracle", api: ORACLE, days: 3 },
];

/* The list an actual build uses, with football-data slotted in between.
 *
 * It goes second, not first: SoccerVista is the fastest and the widest and it
 * took grading from 132 rows to 308, so it keeps the front. Demoting the best
 * source to feel less dependent on somebody else's feed would trade real
 * coverage for a feeling, and it would not change the licence question either
 * way - that is answered by reading their terms, not by reordering an array.
 *
 * It goes ahead of the oracle because it is free and already in memory, and
 * the oracle has 100 requests a day. There is no reason to spend an allowance
 * on a date something we already downloaded can answer.
 *
 * `matches` is what the build fitted the model on. Passing it in costs no
 * request at all. */
function scoreSources(matches) {
  const fd = FD.fromMatches(matches);
  if (!fd.configured()) return SCORE_SOURCES;
  return [
    { name: "soccervista", api: SV, days: SV_DAYS },
    { name: "footballdata", api: fd, days: BACKFILL_DAYS },
    { name: "oracle", api: ORACLE, days: ORACLE_MAX_AGE_DAYS },
  ];
}

/* HOW FAR BACK EACH SOURCE IS ASKED, and why it is not one number.
 *
 * It used to be one number for everybody, sized to the tightest source. That
 * made the metered source's limit everyone's limit: rows older than a week
 * were dropped before football-data - which holds the entire downloaded season
 * in memory - was ever offered them.
 *
 * The three sources have nothing in common cost-wise, so they get their own
 * windows:
 *
 *   soccervista   7   A network call, free and unmetered, but somebody else's
 *                     server and it reaches about a week back anyway. Asking
 *                     it for a month of dates every build would be rude and
 *                     slow, and it would not answer.
 *   footballdata  30  A Map lookup over results the build ALREADY downloaded
 *                     to fit the model. Not a request. Not rate-limited. There
 *                     is no reason for its window to be small, and every row
 *                     it settles is a row that was being held back for free.
 *   oracle        3   Metered, 100 a day, and the free plan REFUSES anything
 *                     older - a refusal still costs a request. This one is
 *                     deliberately NOT widened for backfill: turning a free
 *                     local skip into a refused request, at forty-odd builds a
 *                     day, is precisely how the last account was suspended.
 *
 * In practice DB.recentResults only fetches `resultDays` (14) back, so that is
 * today's real cap. Keyed off the source rather than that number so widening
 * the fetch widens the backfill without a second edit. */
const SV_DAYS = 7;
const BACKFILL_DAYS = 30;

/* Kept as the fallback for a source that declares no window of its own -
   test stubs, mostly - and as the "was it always confirmable" mark that the
   backfill count below is measured against. */
const ORACLE_WINDOW_DAYS = 7;

function sourceDays(src) {
  if (src && typeof src.days === "number") return src.days;
  /* A stub with a familiar name still gets that source's real window, so a
     test cannot accidentally measure a window nobody uses. */
  if (src && src.name === "oracle") return ORACLE_MAX_AGE_DAYS;
  if (src && src.name === "footballdata") return BACKFILL_DAYS;
  return ORACLE_WINDOW_DAYS;
}

/* Is this date worth putting to ANY source? The widest window on offer - so
   adding a source that reaches further automatically lets older rows through,
   and the row gate stops being the tightest source's limit. */
function inScoreWindow(date, sources) {
  const t = Date.parse(date + "T00:00:00Z");
  if (!isFinite(t)) return false;
  let widest = ORACLE_WINDOW_DAYS;
  for (const src of (sources || [])) widest = Math.max(widest, sourceDays(src));
  return (Date.now() - t) <= widest * 86400000;
}

/* Whichever source answers first with rows for this date. One that is down,
   suspended or past its window reports a reason and the next is tried, so a
   dead provider no longer means a blank day. Returns {rows, from} or null. */
/* HOW THE LAST ORACLE ACCOUNT DIED, and what stops it happening again.
 *
 * API-Football's free plan allows 100 requests a day. The build grades scores,
 * EVERY DEPLOY REBUILDS, and there were 37 to 63 deploys a day between 27 Aug
 * and 1 Sep 2026. Worse, two passes - confirmScores and recordPublishedTips -
 * each built their own byDate map and never shared one, so a date appearing in
 * both was paid for twice. Four dates across two passes is roughly eight
 * requests a build; fifty builds a day is 200 to 400 against a limit of 100.
 * The account was suspended, and nothing in the code could have said why.
 *
 * Three things now bound it, and none of them relies on anybody remembering:
 *
 *  1. ONE LOOKUP PER DATE PER BUILD. The memo below is shared by both passes,
 *     so asking twice costs once. This alone halves it.
 *  2. A HARD BUDGET. At most ORACLE_BUDGET oracle calls per build, whatever
 *     happens. SoccerVista answers first and almost always answers, so the
 *     oracle is rarely reached - but that is ordering, not a limit, and if
 *     SoccerVista goes down every build would otherwise fall through to the
 *     oracle at full volume and kill the new key exactly as before.
 *  3. ITS OWN WINDOW, not ours. The free plan serves a rolling three days and
 *     REFUSES the rest - and a refusal still costs a request. ORACLE_WINDOW_DAYS
 *     is 7 because SoccerVista reaches a week; the oracle is not asked past
 *     three.
 *
 * The remaining allowance is logged whenever the oracle answers, so the next
 * time this gets close it says so in the build output rather than going quiet.
 */
const ORACLE_BUDGET = 3;
const ORACLE_MAX_AGE_DAYS = 3;

function makeScoreBudget() {
  return { spent: 0, memo: new Map(), quota: null };
}

/* Only ask a source about a date it can actually answer for. Every source has
   a window now, not just the oracle - see sourceDays. */
function sourceCanAnswer(src, date, budget) {
  if (src.name === "oracle" && budget.spent >= ORACLE_BUDGET) return false;
  const t = Date.parse(date + "T00:00:00Z");
  return isFinite(t) && (Date.now() - t) <= sourceDays(src) * 86400000;
}

/* `sources` is injectable so this can be tested without reaching the
   internet. An earlier test drove the real list and quietly made live calls to
   SoccerVista, which is slow, flaky, and measures somebody else's uptime. */
/* One fetch per source per date, remembered.
 *
 * The memo used to key on the date alone, which was enough while the fallback
 * was per-date: the first source to answer won and nothing else was ever
 * asked. Falling through per FIXTURE means a later source can be asked about a
 * date an earlier one already answered, and that must not turn into a second
 * request - the whole point of the memo is that the oracle has 100 a day.
 *
 * Returns the rows, or null when this source has nothing for the date. A null
 * is cached too: "nothing" is an answer, and re-asking costs a request to be
 * told the same thing. */
async function sourceRows(src, date, log, budget) {
  log = log || [];
  budget = budget || makeScoreBudget();
  const key = src.name + "|" + date;
  if (budget.memo.has(key)) return budget.memo.get(key);

  let rows = null;
  if (!src.api.configured()) {
    budget.memo.set(key, null);
    return null;
  }
  if (!sourceCanAnswer(src, date, budget)) {
    /* Only the budget refusal is worth a line, and only once.
       Backfill made the age refusal the ordinary case - a month of dates past
       the oracle's three days is exactly what widening football-data's window
       is FOR - so logging it per fixture buried the build output in a message
       that means "working as intended". The budget refusal is the one that
       says something is wrong, so it survives, deduped. */
    if (src.name === "oracle" && budget.spent >= ORACLE_BUDGET) {
      const said = budget.said || (budget.said = new Set());
      if (!said.has("budget")) {
        said.add("budget");
        log.push(`oracle: not asked again this build (budget of ${ORACLE_BUDGET} spent)`);
      }
    }
    /* NOT cached. A refusal on budget grounds is about this moment, not about
       the date - the next build has a fresh allowance. */
    return null;
  }

  if (src.name === "oracle") budget.spent++;
  let r;
  try { r = await src.api.resultsFor(date); }
  catch (e) { r = { ok: false, why: String(e && e.message || e), rows: [] }; }
  if (r && r.quota != null) budget.quota = r.quota;
  if (r && r.ok && r.rows && r.rows.length) rows = r.rows;
  else log.push(`${src.name} ${date}: ${r && r.ok ? "no finished matches" : (r && r.why) || "failed"}`);

  budget.memo.set(key, rows);
  return rows;
}

/* The score for ONE match, from whichever source actually has it.
 *
 * A source answering for the DATE is not the same as having the GAME, and the
 * two were treated as one. Measured in production on 2 Sep: SoccerVista
 * returned 485 finished matches for 28 August, none of them the two we needed,
 * and the chain stopped there because the first source with any rows won. Both
 * results were held back while football-data and the oracle sat unasked.
 *
 * So the fall-through is per fixture. The memo means a source already fetched
 * for that date costs nothing to consult again. */
async function findScore(date, home, away, log, budget, sources) {
  budget = budget || makeScoreBudget();
  for (const src of (sources || SCORE_SOURCES)) {
    const rows = await sourceRows(src, date, log, budget);
    if (!rows) continue;
    const m = ORACLE.findMatch(rows, home, away);
    if (m) return { m, from: src.name, rows: rows.length };
  }
  return null;
}

async function firstScoreSource(date, log, budget, sources) {
  budget = budget || makeScoreBudget();
  for (const src of (sources || SCORE_SOURCES)) {
    const rows = await sourceRows(src, date, log, budget);
    if (rows) return { rows, from: src.name };
  }
  return null;
}

/* Said once at the end of a build rather than per call, so it is one line to
   look for. */
function logScoreBudget(budget, log) {
  if (!budget) return;
  /* Counted, not read off memo.size. The memo gained a key per SOURCE per
     date when the fallback went per-fixture, so its size is a count of
     lookups now and would report three times the dates. */
  const dates = new Set();
  for (const k of budget.memo.keys()) dates.add(String(k).split("|").pop());
  log.push(`oracle: ${budget.spent} of ${ORACLE_BUDGET} calls used, ` +
    `${dates.size} date(s) looked up` +
    (budget.quota == null ? "" : `, ${budget.quota} left on the plan today`));
  if (budget.quota != null && budget.quota < 20) {
    log.push(`oracle: WARNING only ${budget.quota} requests left today`);
  }
}

async function confirmScores(rows, log, budget, srcs) {
  const out = new Map();
  if (!rows || !rows.length) return out;

  const fresh = [];
  for (const r of rows) {
    if (String(r.source || "") === "oracle") {
      /* Already settled, and re-grading costs nothing but keeps the verdict
         honest if the tip text or the grader ever changes. */
      const hit = GRADE.gradeLabel(r.tip, Number(r.hg), Number(r.ag));
      out.set(r, { hg: Number(r.hg), ag: Number(r.ag), hit: hit === null ? !!r.hit : hit });
    } else {
      fresh.push(r);
    }
  }
  /* The caller's list when it passed one - a build hands over the sources
     built from the results it already downloaded - and the module default
     otherwise, so a direct caller still works. */
  const sources = (srcs || SCORE_SOURCES).filter((s) => s.api.configured());
  if (!fresh.length || !sources.length) {
    if (fresh.length && !sources.length) {
      log.push(`no score source configured - ${fresh.length} recorded result(s) cannot be confirmed`);
    }
    return out;
  }

  /* Only ask about dates the source can actually answer for. The results
     window is a fortnight, but the free plan serves a rolling few days and
     refuses the rest - and a refusal still costs a request. Asking for four
     days keeps every build inside a handful of calls, and anything older is
     already the results feed's job. */

  const byDate = new Map();
  let stale = 0, backfilled = 0;
  for (const r of fresh) {
    if (!inScoreWindow(r.match_date, sources)) { stale++; continue; }
    if (!byDate.has(r.match_date)) byDate.set(r.match_date, []);
    byDate.get(r.match_date).push(r);
  }
  if (stale) log.push(`${stale} recorded result(s) older than the oracle window - left to the results feed`);

  for (const [date, group] of byDate) {
    /* Per fixture, not per date. A source holding the day but not the game
       used to end the search for every other row on that date - see
       findScore. */
    let n = 0;
    const usedBy = new Map();
    for (const r of group) {
      const found = await findScore(date, r.home, r.away, log, budget, sources);
      if (!found) continue;
      const m = found.m;
      usedBy.set(found.from, (usedBy.get(found.from) || 0) + 1);
      /* Half-time goes through when the source has it. Only football-data
         does, and gradeLabel refuses a first-half market without one - which
         is why every FH_OVER_0.5 tip has come back ungraded. */
      const hit = GRADE.gradeLabel(r.tip, m.hg, m.ag,
        (m.hth != null && m.hta != null) ? { hth: m.hth, hta: m.hta } : null);
      if (hit === null) continue;   // a tip no final score can settle
      out.set(r, { hg: m.hg, ag: m.ag, hit: hit });
      n++;
      /* Older than the single window everyone used to share, so this row was
         being dropped before any source saw it. Counted to say out loud what
         the wider per-source window is actually worth - a number that was
         impossible to get before, because the rows never reached a source. */
      if (!inScoreWindow(r.match_date, [{ name: "legacy" }])) backfilled++;
      /* Persist the correction. The row keeps our tip and gains a real score,
         so it never needs confirming again - and the wrong number stops being
         the one on record. */
      try { await DB.verifyResult({ match_date: r.match_date, home: r.home, away: r.away,
        hg: m.hg, ag: m.ag, hit: hit }); } catch (e) { /* non-fatal by design */ }
    }
    /* Broken down per source. "soccervista 28 Aug: 0 of 2 confirmed from 485
       finished" read as a coverage problem when it was really a fall-through
       problem, and hid that nothing else had been asked. */
    const who = usedBy.size
      ? [...usedBy].map(([k, v]) => `${v} from ${k}`).join(", ")
      : "no source had these games";
    log.push(`${date}: ${n} of ${group.length} confirmed (${who})`);
  }
  if (backfilled) {
    log.push(`backfill: ${backfilled} result(s) older than ${ORACLE_WINDOW_DAYS} days ` +
      `confirmed from results already in memory - no request made`);
  }
  return out;
}

/* Write down the tips we actually published, once the games have been played.
 *
 * A tip only reaches the record if a row exists saying we made it, and the
 * only thing writing those rows was the sweep - which notices a match by
 * seeing it live. GitHub throttles the sweep to about five runs a day, so on
 * 31 August it recorded 21 of roughly 30 tips; the rest never happened as far
 * as the record was concerned. No score source can repair that, because a
 * score source supplies scores, not predictions.
 *
 * THE TIP COMES FROM THE BOARD WE PUBLISHED, NOT FROM THIS BUILD.
 *
 * That is the whole design. The model refits on every build, so re-deciding a
 * tip after the final whistle would file whichever call happened to look
 * better and the record would flatter us. prebuild already fetches the live
 * predictions.json - it carries the pick of the day forward that way - so the
 * previous board is to hand, tips and all, exactly as readers saw them before
 * kick-off. Those are the tips written here.
 *
 * The score comes from a source that watched the match, and the verdict is
 * graded from the two. So a row is complete and true when it is written:
 * published tip, observed score, verdict derived. That also happens to satisfy
 * a results table which requires a real score - hg is NOT NULL and ag carries
 * a check constraint - and it should: this table is for results, and a fixture
 * that has not been played is not one.
 *
 * Insertion is ignore-duplicates, so a row already written by the sweep keeps
 * whatever it has and this adds only the matches the sweep never saw.
 */
/* Long enough for extra time and penalties, and short enough that a finished
   match falls off the same day. Matches the client's own live window, so the
   two agree about when a game stops counting as current. */
const IN_PLAY_MAX_MS = 4.5 * 3600 * 1000;

function fxKey(date, home, away) {
  const n = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${date}|${n(home)}|${n(away)}`;
}

/* Put back a match that has kicked off and is not over yet. Mutates
   `fixtures`, returns how many were added.

   The two fixture feeds part company the moment a game starts. football-data
   publishes a league schedule ahead of time and keeps it, so a league match is
   found again by every rebuild. SportyBet's endpoint lists what you can still
   bet on and DROPS a match at kick-off - and it is the only source of cup ties,
   because football-data is league-only.

   So every rebuild during a cup tie deleted that tie from the board. Not a
   theory: FK Rostov v CSKA Moscow, Russia Russian Cup, kicked off around 17:55
   on 1 Sep 2026; a deploy at about 19:10 rebuilt the board, SportyBet no
   longer carried it, and it vanished mid-match. Torino v Monza survived that
   same build only because it had started eleven minutes earlier and had not
   been dropped yet - nothing about Rostov was special, it just kicked off
   sooner than the push.

   Two harms, and the second is the worse one. The reader loses the match from
   the board while it is being played, which is exactly when they want it. And
   the client resolves a slip leg through fixtureById, so once the fixture is
   gone the leg can never be re-graded, and a wrong verdict from the live feed
   is frozen for good.

   The previous board is already in hand for recordPublishedTips. Anything on
   it that has started, has not been running long enough to be over, and is not
   in the new list, goes back.

   The tip is recomputed here like any other fixture, so it can move mid-match
   if the refit moves it. A reader's own slip is unaffected - a leg stores its
   own market - but pinning the published tip for a match in play would be the
   stricter thing to do. */
function carryInPlay(fixtures, prevFixtures, now) {
  const have = new Set((fixtures || []).map((f) =>
    fxKey(f.date.toISOString().slice(0, 10), f.home, f.away)));
  let carried = 0;
  for (const p of (prevFixtures || [])) {
    if (!p || !p.home || !p.away || !p.date) continue;
    const ko = Date.parse(p.kickoff || "");
    if (!isFinite(ko)) continue;
    const age = now - ko;
    if (age < 0 || age > IN_PLAY_MAX_MS) continue;
    /* Already carries a score, so it is settled and the results path owns it
       from here. */
    if (p.hg != null && p.ag != null) continue;
    const k = fxKey(p.date, p.home, p.away);
    if (have.has(k)) continue;
    have.add(k);
    fixtures.push({
      date: new Date(ko),
      time: new Date(ko).toISOString().slice(11, 16),
      league: (p.league || "").trim(),
      home: p.home, away: p.away,
      tz: "UTC",
    });
    carried++;
  }
  return carried;
}

async function recordPublishedTips(prevFixtures, log, budget, srcs) {
  const sources = srcs || SCORE_SOURCES;
  if (!DB.configured()) return;
  const fx = (prevFixtures || []).filter((f) =>
    f && f.tip && f.date && f.home && f.away);
  if (!fx.length) return;

  const now = Date.now();
  const byDate = new Map();
  for (const f of fx) {
    /* Kicked off. There is no waiting period beyond that and there does not
       need to be: a score source only returns matches it says are finished, so
       a game still being played is simply not in the rows and nothing is
       written for it. An arbitrary two-hour wait only narrowed the window in
       which a build could catch a result before the day rolled over and the
       fixture left the board. */
    const ko = Date.parse(f.kickoff || "");
    if (!isFinite(ko) || ko > now) continue;
    if (!inScoreWindow(f.date, sources)) continue;
    if (!byDate.has(f.date)) byDate.set(f.date, []);
    byDate.get(f.date).push(f);
  }
  if (!byDate.size) return;

  const rows = [];
  for (const [date, group] of byDate) {
    for (const f of group) {
      /* Per fixture, same as confirmScores. Cup ties are the case that pays
         here: SoccerVista misses some, and football-data is league-only, so
         the oracle is the only thing that can settle them - and it was never
         reached while a source with the date won outright. */
      const found = await findScore(date, f.home, f.away, log, budget, sources);
      if (!found) continue;
      const m = found.m;
      const hit = GRADE.gradeLabel(f.tip, m.hg, m.ag,
        (m.hth != null && m.hta != null) ? { hth: m.hth, hta: m.hta } : null);
      if (hit === null) continue;   // a tip no final score can settle
      const model = {};
      for (const k of RESULT_MODEL_KEYS) if (f[k] != null) model[k] = f[k];
      rows.push({
        match_date: f.date,
        home: f.home, away: f.away,
        home_norm: KEY.slug(f.home), away_norm: KEY.slug(f.away),
        league: f.league || "",
        tip: f.tip,
        tip_p: (f.tip_p != null ? f.tip_p : null),
        hg: m.hg, ag: m.ag, hit: hit,
        model: Object.keys(model).length ? model : null,
        /* "oracle" here means what it means everywhere else in this file: the
           score came from something that watched the match, so the row is
           settled and confirmScores will not re-ask about it. */
        source: "oracle",
      });
    }
  }
  if (!rows.length) return;
  try {
    const out = await DB.insertResults(rows);
    if (out.ok) log.push(`recorded ${out.inserted} published tip(s) of ${rows.length} played`);
    else log.push(`recording published tips failed (non-fatal): ${out.why}`);
  } catch (e) {
    log.push(`recording published tips failed (non-fatal): ${e.message}`);
  }
}

async function buildPayload(options = {}) {
  /* One budget for the whole build, shared by both grading passes, so a
     date asked about twice is paid for once and the oracle can never run
     away with the day's allowance. See the note above firstScoreSource. */
  const scoreBudget = makeScoreBudget();
  const cfg = Object.assign({}, DEFAULTS, options, {
    main: options.main || MAIN,
    extra: options.extra || EXTRA,
  });
  const log = [];
  const started = Date.now();

  const sources = buildSourceList(cfg);
  const fetched = await pool(sources, cfg.concurrency,
    (s) => fetchText(s.url, cfg.fetchTimeoutMs).then((r) => ({ ...s, ...r })));

  let matches = [];
  let failed = 0;
  let extraGot = 0;
  for (const f of fetched) {
    if (f.error) {
      failed++;
      log.push(`skip ${f.url.split("/").pop()}: ${f.error}`);
      continue;
    }
    const got = rowsToMatches(f.text, f, cfg);
    if (got.length) {
      matches = matches.concat(got);
      if (f.kind === "extra") extraGot += got.length;
    }
  }
  log.push(`downloaded ${sources.length - failed}/${sources.length} sources`);

  /* The per-country file names are a convention rather than something
     documented, so if none of them yielded anything, fall back to the
     combined results file that the site links explicitly. Trying the
     specific files first is worth it because they carry full history,
     while the combined file holds only recent results. */
  if (extraGot === 0 && Object.keys(cfg.extra).length) {
    log.push("per-country extra files gave nothing, trying combined file");
    const alt = await fetchText(`${BASE}/new/Latest_Results.csv`, cfg.fetchTimeoutMs);
    if (alt.error) {
      log.push(`combined extra file: ${alt.error}`);
    } else {
      const rows = M.parseCSV(alt.text);
      const res = M.normalise(rows);
      if (!res.error) {
        const cutoff = new Date(cfg.minSinceDate);
        let n = 0;
        for (const m of res.matches) {
          if (!m.date || m.date < cutoff) continue;
          // m.league is already "Country Competition" from the Country column
          const want = Object.keys(cfg.extra)
            .map((c) => `${c} ${cfg.extra[c]}`);
          if (!want.includes(m.league)) continue;
          matches.push(m); n++;
        }
        log.push(`combined extra file supplied ${n} results`);
      }
    }
  }

  // de-duplicate: seasons overlap and combined files can repeat rows
  const seen = new Set();
  matches = matches.filter((m) => {
    const k = `${m.date.getTime()}|${m.league}|${m.home}|${m.away}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // drop leagues too thin to rate teams in
  const counts = {};
  for (const m of matches) counts[m.league] = (counts[m.league] || 0) + 1;
  const tiny = new Set(Object.keys(counts).filter((l) => counts[l] < cfg.minLeagueMatches));
  if (tiny.size) {
    matches = matches.filter((m) => !tiny.has(m.league));
    log.push(`dropped thin leagues: ${[...tiny].join(", ")}`);
  }

  if (matches.length < 400) {
    throw new Error(`only ${matches.length} results downloaded, refusing to build`);
  }
  log.push(`${matches.length} results across ${Object.keys(counts).length - tiny.size} leagues`);

  /* The results just downloaded also make a score source - free, already in
     memory, and the only one of the three carrying a half-time score. */
  cfg._sources = scoreSources(matches);
  log.push(`score sources: ${cfg._sources.map((x) => x.name).join(" -> ")}`);

  // fixtures: both feeds
  const fxUrls = [`${BASE}/fixtures.csv`, `${BASE}/new_league_fixtures.csv`];
  const fxRes = await pool(fxUrls, 2, (u) => fetchText(u, cfg.fetchTimeoutMs));
  let fixtures = [];
  for (const r of fxRes) {
    if (r.error) { log.push(`fixtures ${r.url.split("/").pop()}: ${r.error}`); continue; }
    const parsed = M.parseFixtures(r.text);
    if (parsed.error) { log.push(`fixtures parse: ${parsed.error}`); continue; }
    fixtures = fixtures.concat(parsed.fixtures);
  }
  log.push(`${fixtures.length} fixtures in feeds`);

  /* SportyBet fixtures: pulls today's games earlier than football-data and
     lets the model predict any match whose two teams it already knows. The
     feed names each event's competition, so the fixture carries its real
     league (cup ties included) rather than being guessed from the teams. */
  try {
    const sbUrl = cfg.sportyFixturesUrl ||
      "https://web-production-798c0.up.railway.app/api/fixtures";
    /* This one feed supplies the large majority of the card, so losing it is
       the difference between a full day and a near-empty one. It sits behind a
       cold-start-prone host, where the first request after an idle spell can
       time out and the next succeeds - worth one retry before giving up. */
    let sbRes = await fetchText(sbUrl, cfg.fetchTimeoutMs);
    if (sbRes.error) {
      log.push(`SportyBet fixtures attempt 1: ${sbRes.error} - retrying`);
      await new Promise((r) => setTimeout(r, 1200));
      sbRes = await fetchText(sbUrl, cfg.fetchTimeoutMs);
    }
    if (!sbRes.error) {
      const j = JSON.parse(sbRes.text);
      let added = 0;
      for (const m of (j.matches || [])) {
        if (!m.homeTeam || !m.awayTeam || !m.startTime) continue;
        fixtures.push({
          date: new Date(m.startTime),
          time: new Date(m.startTime).toISOString().slice(11, 16),
          league: (m.league || "").trim(),
          home: m.homeTeam, away: m.awayTeam,
          /* Already an instant, not a wall-clock reading. */
          tz: "UTC",
        });
        added++;
      }
      log.push(`+${added} SportyBet fixtures`);
    } else {
      log.push(`SportyBet fixtures: ${sbRes.error}`);
    }
  } catch (e) { log.push(`SportyBet fixtures failed (non-fatal): ${e.message}`); }

  /* Keep a match that has kicked off and is not over yet.
   *
   * The two fixture feeds behave differently once a game starts. football-data
   * publishes a league schedule ahead of time and keeps it, so a league match
   * is found again by every rebuild. SportyBet's fixtures endpoint lists what
   * you can still bet on and DROPS a match at kick-off - and it is the only
   * source of cup ties, because football-data is league-only.
   *
   * So every rebuild during a cup tie deleted that tie from the board. Not a
   * theory: FK Rostov v CSKA Moscow, Russia Russian Cup, kicked off about
   * 17:55 on 1 Sep 2026, a deploy at about 19:10 rebuilt the board, SportyBet
   * no longer carried it, and it vanished mid-match. Torino v Monza survived
   * the same build only because it had kicked off eleven minutes earlier and
   * SportyBet had not dropped it yet.
   *
   * Two harms. The reader loses the match from the board while it is being
   * played, which is when they most want it. And the client resolves a slip
   * leg through fixtureById, so once the fixture is gone the leg can never be
   * re-graded - a wrong verdict from the live feed is then frozen for good.
   *
   * The previous board is already in hand for recordPublishedTips. Anything on
   * it that has started, has not been going long enough to be over, and is not
   * in the new list, is put back.
   *
   * Note the tip is recomputed like any other fixture here, so it can move
   * mid-match if the refit moves it. The reader's own slip is unaffected - a
   * leg stores its own market - but pinning the published tip for a match in
   * play would be the stricter thing to do. */
  {
    const carried = carryInPlay(fixtures, cfg.prevFixtures, Date.now());
    if (carried) log.push(`+${carried} in-play fixture(s) carried forward from the last board`);
  }

  /* First-half share per league, measured rather than assumed. Only the
     main-league files carry half-time goals; the combined country files do
     not, so those fall back to the cross-league average. A league needs a
     decent sample before its own figure is trusted. */
  const fhAgg = {};
  for (const m of matches) {
    if (m.hth == null || m.hta == null) continue;
    const a = fhAgg[m.league] || (fhAgg[m.league] = { ht: 0, ft: 0, n: 0 });
    a.ht += m.hth + m.hta;
    a.ft += m.hg + m.ag;
    a.n++;
  }
  const fhShare = {};
  for (const lg of Object.keys(fhAgg)) {
    const a = fhAgg[lg];
    if (a.n >= 150 && a.ft > 0) {
      const sh = a.ht / a.ft;
      if (sh > 0.35 && sh < 0.55) fhShare[lg] = sh;   // reject nonsense
    }
  }
  log.push(`first-half share measured for ${Object.keys(fhShare).length} leagues`);

  // fit
  const t0 = Date.now();
  const model = M.fitModel(matches, { halfLife: cfg.halfLife, reg: cfg.shrinkage, xgWeight: cfg.xgWeight });
  log.push(`fitted in ${Date.now() - t0}ms, k=${model.k.toFixed(1)}, ` +
           `home adv ${model.hadv.toFixed(3)}`);

  // predict everything inside the window
  const idx = model.index;
  const today = new Date();
  const t0d = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const horizon = t0d + cfg.daysAhead * 86400000;

  /* Last-5 form per team (most recent first), from the played matches we hold.
     Keyed by the same canonical team name the index uses, so it lines up with
     each fixture's resolved home/away. */
  const formMap = {};
  {
    const byTeam = {};
    for (const m of matches) {
      if (m.hg == null || m.ag == null) continue;
      (byTeam[m.home] = byTeam[m.home] || []).push(
        { d: m.date.getTime(), r: m.hg > m.ag ? "W" : (m.hg < m.ag ? "L" : "D") });
      (byTeam[m.away] = byTeam[m.away] || []).push(
        { d: m.date.getTime(), r: m.ag > m.hg ? "W" : (m.ag < m.hg ? "L" : "D") });
    }
    for (const t of Object.keys(byTeam)) {
      byTeam[t].sort((a, b) => b.d - a.d);
      formMap[t] = byTeam[t].slice(0, 5).map((x) => x.r);
    }
  }

  /* Results are graded BEFORE the fixtures below, which is not the order
     they are published in and is deliberate. The confidence correction is
     fitted from these graded results, and every fixture's published
     probability passes through it - so it has to exist before the first
     fixture is priced. Nothing here depends on the fixtures; the model,
     index, league first-half shares and form map are all built above. */
  const results = [];
  /* Recorded matches we hold back for want of a confirmed score, by date. See
     where it is filled: it is what lets the site say how much of a day is
     still being graded rather than implying the day was that small. */
  const heldByDate = {};
  const rfloor = t0d - (cfg.resultDays || 4) * 86400000;
  for (const m of matches) {
    const d = Date.UTC(m.date.getUTCFullYear(), m.date.getUTCMonth(), m.date.getUTCDate());
    if (d < rfloor || d >= t0d) continue;
    if (idx.lIdx[m.league] === undefined) continue;
    const pr = M.predictTotals(model, m.home, m.away, m.league);
    if (!pr) continue;
    const kk = M.markets(pr, { fhShare: fhShare[m.league], k: model.k });
    const tp = M.bestTip(kk);
    const won = M.gradeTip(tp.label, m);
    if (won === null) continue;
    /* The same numbers a fixture carries, kept on the result too.
       They cost nothing here - predictTotals and markets have just run to
       decide the tip, and everything below was being computed and thrown
       away. Without them a match page goes thin the day the game is played:
       the fixture leaves the board and takes its probabilities with it, so
       the page that showed the full picture in the morning shows a bare
       scoreline by night. Same field names as a fixture, so anything reading
       one can read the other. */
    const rr = (x) => (x == null || isNaN(x)) ? undefined : Math.round(x * 10000) / 10000;
    results.push({ date: m.date.toISOString().slice(0, 10), league: m.league,
      home: m.home, away: m.away, hg: m.hg, ag: m.ag, tip: tp.label, hit: won,
      tip_p: rr(tp.p),
      form_home: formMap[m.home] || [], form_away: formMap[m.away] || [],
      lh: rr(kk.lh), la: rr(kk.la), total: rr(kk.total),
      score: scoreForTip(kk, tp.label,
        m.date.toISOString().slice(0, 10) + "|" + m.home + "|" + m.away),
      home_p: rr(kk.home), draw_p: rr(kk.draw), away_p: rr(kk.away),
      dc1x: rr(kk.dc1x), dc12: rr(kk.dc12), dcx2: rr(kk.dcx2),
      o15: rr(kk.o15), o25: rr(kk.o25), o35: rr(kk.o35), btts: rr(kk.btts),
      fh_o05: rr(kk.fhO05) });
  }
  results.sort((a, b) => (a.date < b.date ? 1 : -1));
  log.push(`${results.length} recent results graded`);

  /* Fit the confidence correction here, and here specifically.
     These results carry the RAW model probability - the grading loop above
     stores tp.p, not the published figure - so the correction is fitted
     against what the model actually believed, never against its own earlier
     corrections. Move this below the database merge and that stops being
     true: those rows carry whatever the fixture published at the time, and
     the adjustment would compound on itself a little more every build. */
  const calibrator = CAL.build(results
    .filter((r) => typeof r.tip_p === "number" && typeof r.hit === "boolean")
    .map((r) => ({ tip: r.tip, p: r.tip_p, hit: r.hit })));
  for (const line of calibrator.report()) log.push(line);

  const out = [];
  let unmatched = 0;
  const dropped = [];
  const seenKey = {};
  for (const f of fixtures) {
    const d = Date.UTC(f.date.getUTCFullYear(), f.date.getUTCMonth(), f.date.getUTCDate());
    if (d < t0d || d > horizon) continue;

    /* Before any league resolution, because the harm here is done by the
       name-matching fallback below rather than by the fixture itself. */
    if (isUnratedCompetition(f.league)) {
      unmatched++;
      dropped.push(`${f.home} v ${f.away} (${f.league}: no ratings for this competition)`);
      continue;
    }

    let li = (f.league && f.league in idx.lIdx) ? idx.lIdx[f.league] : null;
    if (li == null) {
      for (let l = 0; l < idx.leagues.length; l++) {
        if (M.matchTeam(idx, f.home, l) && M.matchTeam(idx, f.away, l)) { li = l; break; }
      }
    }
    /* Cup ties. The loop above needs both clubs inside one league, which a
       cup tie across divisions never satisfies - and that is why the EFL Cup
       never appeared here at all. Resolve each side in whatever league it
       actually plays in, and carry the gap between those divisions as an
       edge. See TIER_HANDICAP for what that number is and is not. */
    let edge = 0, crossTier = 0;
    if (li == null) {
      const hl = leagueOfTeam(idx, f.home);
      const al = leagueOfTeam(idx, f.away);
      if (hl != null && al != null) {
        const e = tierEdge(idx.leagues[hl], idx.leagues[al]);
        /* Null means these two divisions cannot be compared - a different
           country, or a tier missing from the ladder. Skip the fixture. The
           tempting shortcut is to carry on with no edge at all, which quietly
           declares a top-flight side and a third-tier side evenly matched:
           the exact error the ladder exists to prevent, and worse for being
           invisible. */
        if (e == null) { unmatched++; dropped.push(`${f.home} v ${f.away} (tiers not comparable)`); continue; }
        li = hl; edge = e; crossTier = 1;
      }
    }
    if (li == null) { unmatched++; dropped.push(`${f.home} v ${f.away} (no league)`); continue; }
    /* When the two came from different divisions, each was resolved in its
       own - so look them up the same way rather than forcing both into one. */
    const h = crossTier ? M.matchTeam(idx, f.home, leagueOfTeam(idx, f.home))
                        : M.matchTeam(idx, f.home, li);
    const a = crossTier ? M.matchTeam(idx, f.away, leagueOfTeam(idx, f.away))
                        : M.matchTeam(idx, f.away, li);
    if (!h || !a) { unmatched++; dropped.push(`${f.home} v ${f.away} (team)`); continue; }

    /* The divisions the two clubs actually play in, which for a cup tie are
       two different things and for everything else are both `li`. */
    const hLeague = idx.leagues[crossTier ? leagueOfTeam(idx, f.home) : li];
    const aLeague = idx.leagues[crossTier ? leagueOfTeam(idx, f.away) : li];
    const tier = fixtureTier(hLeague, aLeague);

    const p = M.predictTotals(model, h, a, idx.leagues[li], edge);
    if (!p) { unmatched++; dropped.push(`${f.home} v ${f.away} (no prediction)`); continue; }
    const _pair = [h, a].sort().join("|");
    const dedup = f.date.toISOString().slice(0, 10) + "|" + _pair;
    if (seenKey[dedup]) continue;
    seenKey[dedup] = 1;
    const k = M.markets(p, { fhShare: fhShare[idx.leagues[li]], k: model.k });
    const tip = M.bestTip(k, { crossTier: !!crossTier });
    // uncertainty band: thin recent data widens confidence toward 50/50
    const sup = M.support(model, h, a);
    let shrink = sup >= 6 ? 1 : Math.max(0.55, sup / 6);
    /* A cross-division tie rests on TIER_HANDICAP, an assumption rather
       than anything measured, so its confidence is pulled hard toward even.
       The game still appears on the board; it cannot pass itself off as a
       banker, top the pick of the day, or reach a slip built out of the
       safest numbers on the card. */
    if (crossTier) shrink = Math.min(shrink, CROSS_TIER_SHRINK);
    /* Corrected against what actually happened, then shrunk for how thin the
       evidence behind this particular fixture is. The order matters: the
       correction is a statement about the model, the shrink is a statement
       about this match, and applying the shrink first would let the
       correction partly undo it. */
    const tipPcal = calibrator.apply(tip.label, tip.p);
    const tipPadj = 0.5 + (tipPcal - 0.5) * shrink;
    const r = (x) => Math.round(x * 10000) / 10000;

    /* Full kickoff instant when the feed carried a time. The site uses this to
       drop games that have already started; without it, it can only compare
       dates and a mid-afternoon fixture lingers all day.
       f.tz says how to read the clock: SportyBet's is already UTC, everything
       from football-data is UK local. The emitted time is normalised to UTC so
       the whole payload speaks one language. */
    let kickoff = null, timeOut = f.time || "";
    if (f.time && /^\d{1,2}:\d{2}/.test(f.time)) {
      const [hh, mm] = f.time.split(":").map(Number);
      const y = f.date.getUTCFullYear(), mo = f.date.getUTCMonth() + 1,
            dd = f.date.getUTCDate();
      const ms = f.tz === "UTC"
        ? Date.UTC(y, mo - 1, dd, hh, mm)
        : wallTimeToUtcMs(y, mo, dd, hh, mm, "Europe/London");
      if (!isNaN(ms)) {
        kickoff = new Date(ms).toISOString();
        timeOut = kickoff.slice(11, 16);
      }
    }

    /* The competition this game is actually in. Both feeds name it now -
       SportyBet carries the tournament, football-data's fixtures carry a
       normalised "Country League" - so we report what the feed says instead of
       inferring. Inferring was wrong in both directions: it labelled ordinary
       league games "England Cup", and it showed a cup tie between two Premier
       League sides as the Premier League. The teams' usual league is not
       evidence of which competition they are playing in today. */
    const known = canonLeague(f.league);
    let label = known;
    if (!label) {
      /* Neither feed knows. Say so with a country-scoped generic rather than
         asserting a league - and mark it, so a real name can replace it later. */
      const country = (idx.leagues[li] || "").split(" ")[0];
      label = country ? `${country} Cup` : "Cup";
    }

    out.push({
      date: f.date.toISOString().slice(0, 10),
      time: timeOut, kickoff: kickoff,
      league: label,
      home: h, away: a,
      /* Divisions apart, and therefore leaning on an assumption rather than a
         measurement. Emitted so the site can say so rather than presenting
         the number with the same face as every other. */
      cross_tier: crossTier ? Math.round(Math.abs(edge) * 100) / 100 : undefined,
      /* Which division this fixture really is - the worse of the two clubs'.
         The page's "top flight only" filter reads this rather than guessing
         from the league label, which is how a fifth division was getting in. */
      tier: tier || undefined,
      form_home: formMap[h] || [], form_away: formMap[a] || [],
      lh: Math.round(k.lh * 100) / 100, la: Math.round(k.la * 100) / 100,
      total: Math.round(k.total * 100) / 100,
      /* Seeded by the fixture, so this match keeps the same scoreline on
         every rebuild rather than being redrawn each morning. */
      score: scoreForTip(k, tip.label, f.date + "|" + h + "|" + a),
      home_p: r(k.home), draw_p: r(k.draw), away_p: r(k.away),
      dc1x: r(k.dc1x), dc12: r(k.dc12), dcx2: r(k.dcx2),
      o15: r(k.o15), o25: r(k.o25), o35: r(k.o35), btts: r(k.btts),
      /* Each side's own goals, so a slip can back one team to score. */
      h_o05: r(k.hO05), h_o15: r(k.hO15),
      a_o05: r(k.aO05), a_o15: r(k.aO15),
      btts_o25: r(k.bttsAndO25),
      fh_o05: r(k.fhO05),
      anybody: r(k.anybodyWin),
      draw_o25: r(k.drawOrO25),
      draw_btts: r(k.drawOrBtts),
      /* A draw flag earns its place only if it is rare enough to notice.
         A flat 30% threshold fires on nearly every fixture in a low-scoring
         league; requiring the draw to actually win fires on almost none.
         Live-and-close catches roughly one game in thirty, which is about
         right for something meant to make you look twice. */
      draw_watch: k.draw >= 0.30 && (Math.max(k.home, k.away) - k.draw) <= 0.06,
      tip: tip.label, tip_p: r(tipPadj), thin: sup < 6,
      /* Store normalized team keys so we can later enrich with actual FT
         scores from live scores API or football-data. */
      _homeKey: teamKey(h), _awayKey: teamKey(a),
      /* Label is a guess, not something a feed told us - the FT pass may
         replace it with the real competition. Stripped before output. */
      _guessedLeague: !known,
    });
  }
  log.push(`predicted ${out.length} fixtures, ${unmatched} unmatched`);
  if (dropped.length) log.push(`dropped: ${dropped.slice(0, 25).join("; ")}`);

  // recent results: last few days of played games with the model's graded tip


  /* Results the sweep wrote down from the live feed, folded in underneath the
     ones graded above. Two things reach the board only this way: the days the
     results feed has not published yet - it runs two or three days behind -
     and cup ties, which are never graded above because a cup has no league in
     the model's index to be graded against.
     Ours never displace a result graded from the feed: the merge only fills
     gaps. Non-fatal by construction, like every other enrichment here - with
     no Supabase configured this is a no-op and the payload is exactly what it
     was before. */
  try {
    const since = new Date(t0d - (cfg.resultDays || 14) * 86400000)
      .toISOString().slice(0, 10);
    const got = await DB.recentResults(since);
    if (got.ok && got.rows.length) {
      const have = new Set(results.map(r => KEY.fixtureKey(r.date, r.home, r.away)));
      const pending = [];
      for (const r of got.rows) {
        const k = KEY.fixtureKey(r.match_date, r.home, r.away);
        if (have.has(k)) continue;
        have.add(k);
        /* A cup tie is never graded above - a cup has no league in the
           model's index - so this is the only path by which one reaches a
           page at all, and the only place its numbers can come from is the
           snapshot the sweep stored when the match was still a fixture. */
        pending.push(r);
      }

      /* Each of these rows holds two things of very different standing. The
         tip and the probabilities are OURS, written down when the match was
         still a fixture, and they are exactly right. The score is a guess the
         sweep made from watching the match vanish from the live feed - see
         lib/oracle.js for how often that guess is wrong and why no amount of
         scraper accuracy fixes it. So the prediction is kept and the score is
         re-sourced from somewhere that actually knows. */
      const verified = await confirmScores(pending, log, scoreBudget, cfg._sources);

      let added = 0, held = 0;
      /* Held rows, counted by the day they belong to.
         The site says "how we did yesterday" from the results it can see, and
         on a morning when the confirming sources are behind that is six of six
         at a hundred per cent - which reads as a whole card gone perfect when
         it was six games out of thirty. The page already knows how to say "and
         N more are still being graded", but only for a reader whose browser
         kept yesterday's board. This is the same figure for everybody. */
      for (const r of pending) {
        const v = verified.get(r);
        /* Without a confirmed score we do not know how it finished, and a
           results page is the last place to print a guess. Nothing is lost:
           the row stays in the record, and the results feed reaches it in a
           day or two. */
        if (!v) {
          held++;
          heldByDate[r.match_date] = (heldByDate[r.match_date] || 0) + 1;
          continue;
        }
        results.push(Object.assign({ date: r.match_date, league: r.league || "",
          home: r.home, away: r.away, hg: v.hg, ag: v.ag,
          tip: r.tip, hit: v.hit, recorded: true },
          (r.model && typeof r.model === "object") ? r.model : {}));
        added++;
      }
      if (added) {
        results.sort((a, b) => (a.date < b.date ? 1 : -1));
        log.push(`${added} recorded result(s) published with a confirmed score`);
      }
      if (held) log.push(`${held} recorded result(s) held back - no confirmed final score`);
    } else if (!got.ok && got.why !== "not configured") {
      log.push(`live-score record unavailable (non-fatal): ${got.why}`);
    }
  } catch (e) {
    log.push(`live-score record merge failed (non-fatal): ${e.message}`);
  }

  // honest recent record: fit-on-past, grade-on-recent (never breaks the build)
  let record = null;
  try {
    const tb = Date.now();
    record = M.backtest(matches, { halfLife: cfg.halfLife, reg: cfg.shrinkage,
      xgWeight: cfg.xgWeight, days: cfg.recordDays });
    if (record) log.push(`record: ${record.correct}/${record.total} tips ` +
      `(${Math.round(100*record.correct/record.total)}%), brier ${record.brier}, ` +
      `graded in ${Date.now() - tb}ms`);
    else log.push("record: not enough graded matches, skipped");
  } catch (e) {
    log.push(`record backtest failed (non-fatal): ${e.message}`);
  }

  /* Market verification: the same held-out method over a much wider window.
     Every market is graded on every match in it, so each one gets the whole
     window rather than competing for the headline slot - which is how team
     goals, Over 2.5, both teams to score and the first-half markets came to be
     offered in the slip builder with no record at all.
     A separate, wider run because the two questions differ. "How are we doing
     lately" wants recency and keeps its 21 days. "Is this market trustworthy"
     wants sample, and a market's reliability does not change week to week.
     Non-fatal like every other enrichment: no market record simply means the
     builder falls back to the headline rows. */
  let marketRecord = null;
  try {
    const mb = Date.now();
    const wide = M.backtest(matches, { halfLife: cfg.halfLife, reg: cfg.shrinkage,
      xgWeight: cfg.xgWeight, days: cfg.marketDays || 120 });
    if (wide && wide.markets) {
      marketRecord = wide.markets;
      log.push(`markets: ${wide.markets.length} graded over ${wide.days}d ` +
        `(${wide.total} matches, ${Date.now() - mb}ms)`);
    }
  } catch (e) {
    log.push(`market backtest failed (non-fatal): ${e.message}`);
  }

  // yesterday-only record: same holdout method, one-day window
  let recordYest = null;
  try {
    recordYest = M.backtest(matches, { halfLife: cfg.halfLife, reg: cfg.shrinkage,
      xgWeight: cfg.xgWeight, days: 1 });
    if (recordYest) log.push(`yesterday: ${recordYest.correct}/${recordYest.total} tips`);
  } catch (e) {
    log.push(`yesterday backtest failed (non-fatal): ${e.message}`);
  }
  /* Hung off the published record so the client finds it in one place. The
     rows deliberately do not sum to record.total: each is the whole window
     seen through one market, not a slice of it. */
  if (record && marketRecord) record.markets = marketRecord;

  /* -------- Enrich fixtures & results with actual FT scores --------
     Two sources:
     1. Live scores API (has in-progress + recent FT, no eventId)
     2. football-data Latest_Results.csv (has FT for all leagues, including cups)
     Match by (date, normalized home, normalized away) to get actual scores. */
  async function enrichWithFTScores() {
    const ftMap = new Map(); // key: "YYYY-MM-DD|homeKey|awayKey" -> {hg, ag, league}
    /* The live feed carries no date - every match in it is in play or just
       over - so it is keyed on the teams alone and consulted only for a fixture
       dated today or yesterday. It used to be keyed with a "?" placeholder in
       place of the date, which matched no fixture at all, so today's results
       were never baked and vanished from the card the moment the live feed
       dropped the match. Reported as "all the finland fixtures that had results
       have suddenly gone resultless". */
    const liveFt = new Map(); // key: "homeKey|awayKey" -> {hg, ag, league}

    // Source 1: Live scores API
    try {
      const ls = await fetchText(LIVE_SCORES_URL, cfg.fetchTimeoutMs);
      if (!ls.error) {
        const data = JSON.parse(ls.text);
        for (const m of (data.matches || [])) {
          if (m.status === "FT" || m.status === "Finished") {
            const hk = teamKey(m.home);
            const ak = teamKey(m.away);
            liveFt.set(`${hk}|${ak}`, { hg: m.homeScore, ag: m.awayScore, league: m.league });
          }
        }
      }
    } catch (e) { log.push(`live scores fetch: ${e.message}`); }

    // Source 2: football-data Latest_Results.csv (has cups + all leagues)
    try {
      const fd = await fetchText(`${BASE}/new/Latest_Results.csv`, cfg.fetchTimeoutMs);
      if (!fd.error) {
        const rows = M.parseCSV(fd.text);
        const res = M.normalise(rows);
        if (!res.error) {
          for (const m of res.matches) {
            const hk = teamKey(m.home);
            const ak = teamKey(m.away);
            const key = `${m.date.toISOString().slice(0, 10)}|${hk}|${ak}`;
            if (!ftMap.has(key)) {
              ftMap.set(key, { hg: m.hg, ag: m.ag, league: m.league });
            }
          }
        }
      }
    } catch (e) { log.push(`football-data results fetch: ${e.message}`); }

    /* Source 3: the score oracle, for fixtures that finished TODAY.
     *
     * This is the gap that made a played match go blank. The card was showing
     * the live score while the match sat in the live feed; that feed carries
     * only games in play and drops each one the moment it ends, so the score
     * disappeared with it. Nothing baked it, because football-data does not
     * publish the day for another day or two - which is why yesterday's results
     * were fine and today's were not. Reported as "all the finland fixtures
     * that had results have suddenly gone resultless".
     *
     * The oracle already knows. It is what confirmScores uses to settle the
     * record, and asked for today it returned all six Finnish games at FT. It
     * was simply never consulted about fixtures.
     *
     * Names differ between feeds - "TPS" against "Turku PS", "Jaro" against
     * "FF Jaro" - so rows are matched with ORACLE.findMatch rather than by key,
     * the same way the results path does it. findMatch refuses an ambiguous
     * pair rather than guessing, which is the behaviour a score wants. */
    const oracleRows = new Map();   // "YYYY-MM-DD" -> rows
    for (const d of [0, 1]) {
      const date = new Date(t0d - d * 86400000).toISOString().slice(0, 10);
      /* Same order as confirmScores, and for the same reason: whichever
         source answers. */
      for (const src of SCORE_SOURCES) {
        if (!src.api.configured()) continue;
        try {
          const got = await src.api.resultsFor(date);
          if (got.ok && got.rows.length) { oracleRows.set(date, got.rows); break; }
        } catch (e) { log.push(`fixture ${src.name} ${date}: ${e.message}`); }
      }
    }

    log.push(`FT score map built: ${ftMap.size} dated, ${liveFt.size} live, ` +
      `${[...oracleRows.values()].reduce((n, r) => n + r.length, 0)} from the score sources`);

    /* Today and yesterday, UTC. A match in the live feed cannot be older than
       that, and keeping the window this tight stops a later meeting of the same
       two teams inheriting an old score. */
    const recentDays = new Set([0, 1].map((d) =>
      new Date(t0d - d * 86400000).toISOString().slice(0, 10)));

    // Enrich fixtures with actual scores (for those already played)
    let enrichedFixtures = 0;
    for (const f of out) {
      const key = `${f.date}|${f._homeKey}|${f._awayKey}`;
      /* Dated sources first, since football-data is authoritative. The live
         feed is the stopgap that keeps a result on the card for the day or two
         before football-data publishes it. */
      let ft = ftMap.get(key) ||
        (recentDays.has(f.date) ? liveFt.get(`${f._homeKey}|${f._awayKey}`) : null);
      /* Last, and only for the days the oracle covers: a fixture that finished
         today, which neither of the sources above can supply. */
      if (!ft && oracleRows.has(f.date)) {
        const m = ORACLE.findMatch(oracleRows.get(f.date), f.home, f.away);
        if (m && m.hg != null && m.ag != null) ft = { hg: m.hg, ag: m.ag, league: null };
      }
      if (ft) {
        f.hg = ft.hg; f.ag = ft.ag;
        /* Only a guessed label gives way to the results feed. Testing the text
           for "Cup" would clobber real competitions - "Russia Russian Cup" and
           "Germany DFB Pokal" are the actual names, not placeholders. */
        if (f._guessedLeague && ft.league) { f.league = ft.league; f._guessedLeague = false; }
        enrichedFixtures++;
      }
    }
    log.push(`fixtures enriched with FT scores: ${enrichedFixtures}`);

    // Re-grade results using actual scores (much more accurate than model-on-past)
    const enrichedResults = [];
    for (const m of matches) {
      const d = Date.UTC(m.date.getUTCFullYear(), m.date.getUTCMonth(), m.date.getUTCDate());
      if (d < rfloor || d >= t0d) continue;
      const hk = teamKey(m.home);
      const ak = teamKey(m.away);
      const key = `${m.date.toISOString().slice(0, 10)}|${hk}|${ak}`;
      const ft = ftMap.get(key);
      if (!ft) continue; // no actual score yet
      if (idx.lIdx[m.league] === undefined) continue;
      const pr = M.predictTotals(model, m.home, m.away, m.league);
      if (!pr) continue;
      const kk = M.markets(pr, { fhShare: fhShare[m.league], k: model.k });
      const tp = M.bestTip(kk);
      // Grade against actual FT score from ftMap (not m.hg/m.ag which might be from CSV)
      const won = M.gradeTip(tp.label, { ...m, hg: ft.hg, ag: ft.ag });
      if (won === null) continue;
      enrichedResults.push({ date: m.date.toISOString().slice(0, 10), league: m.league,
        home: m.home, away: m.away, hg: ft.hg, ag: ft.ag, tip: tp.label, hit: won });
    }
    enrichedResults.sort((a, b) => (a.date < b.date ? 1 : -1));
    log.push(`results enriched with actual FT: ${enrichedResults.length} graded`);

    // Replace results with enriched version (more accurate)
    if (enrichedResults.length > results.length) {
      results.length = 0;
      results.push(...enrichedResults);
    }

    // Strip internal keys from fixtures before returning
    for (const f of out) {
      delete f._homeKey;
      delete f._awayKey;
      delete f._guessedLeague;
    }
  }

  await enrichWithFTScores();
  await recordPublishedTips(cfg.prevFixtures, log, scoreBudget, cfg._sources);
  logScoreBudget(scoreBudget, log);

  const potd = choosePotd(out, cfg.prevPotd || null);

  return {
    generated: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    matches: matches.length,
    leagues: [...new Set(out.map((f) => f.league))].sort(),
    fixtures: out,
    potd: potd,
    results: results,
    unmatched: dropped,
    record: record,
    recordYest: recordYest,
    /* {date: n} - matches recorded but not yet confirmed. Small: a handful of
       dates at most, and it stops "6 of 6 tips landed" reading as a whole card
       when twenty-four more are still in the queue. */
    pendingByDate: heldByDate,
    theme: cfg.theme || "midnight",
    buildMs: Date.now() - started,
    log,
  };
}

/* The numbers a result carries for its match page and nothing else.
   The page generator wants them; the app never reads them, and shipping them
   in predictions.json put 70KB on a download every visitor makes over mobile
   data. So the payload keeps them in memory, the file on disk does not, and
   this is the one list that says which fields those are. */
const RESULT_MODEL_KEYS = ["form_home", "form_away", "lh", "la", "total", "score",
  "home_p", "draw_p", "away_p", "dc1x", "dc12", "dcx2",
  "o15", "o25", "o35", "btts", "fh_o05"];

function leanResults(payload) {
  if (!payload || !Array.isArray(payload.results)) return payload;
  return Object.assign({}, payload, {
    results: payload.results.map((r) => {
      const out = {};
      for (const k of Object.keys(r)) if (RESULT_MODEL_KEYS.indexOf(k) < 0) out[k] = r[k];
      return out;
    }),
  });
}

/* ------------------------------------------------------------ pick of the day
   Chosen here, once, and carried in the payload, so every visitor sees the same
   call and it survives a rebake.

   It used to be decided in each browser and kept in localStorage. That made it
   per-device, and worse, the lock was matched only against the rows for the day
   being viewed - so when a rebake dropped or re-dated the row, the lock fell
   through in silence and the card re-picked, abandoning a game that had already
   been played along with the result it was holding. Reported as "the POTD
   changed to a game tommorw, i thought we agreed that it stays".

   `prev` is the pick the deployed payload already carries. If it is for the same
   day and still on the card, it stays - that is the whole point. Same
   first-write-wins shape used for results.

   Only fixtures still to kick off are eligible. The fixture day is a calendar
   date in UTC, so an MLS game at 23:30 UTC is half past midnight in Lagos: it
   had been played by breakfast and was still ranking second on the board. */
function potdFid(f) {
  return "m" + (f.date + f.home + f.away).replace(/[^a-zA-Z0-9]/g, "");
}

/* Rank by the league table this file already keeps, not by continent.
 *
 * The headline used to carry a demerit for any Asian league, which sorted
 * ahead of confidence and so worked as a ban whenever anything else was on the
 * card. It was reaching past a China Super League pick at 89.9% to a
 * Conference National game, and LEAGUE_TIER puts China Super League at 1 -
 * level with the Premier League - while Conference National is 5. The rule was
 * overruling our own judgement of quality with a guess about geography.
 *
 * A step down in tier costs two points of confidence rather than the pick.
 * That is what "higher ranked games take priority" means in practice: on a day
 * with a strong top-flight game the top flight leads, and a standout in a
 * lower tier still has to be clearly better to take the headline rather than
 * merely present. A league missing from the table ranks below every named one,
 * which is the honest place for a competition we have not assessed. */
const POTD_TIER_COST = 0.02;
const POTD_UNRANKED = 6;
function potdTier(f) {
  const t = Number(f && f.tier);
  return (t >= 1 && t <= 5) ? t : POTD_UNRANKED;
}
function potdScore(f) {
  return (Number(f && f.tip_p) || 0) - POTD_TIER_COST * (potdTier(f) - 1);
}
function choosePotd(fixtures, prev, nowMs) {
  const now = nowMs || Date.now();
  const dates = [...new Set(fixtures.map((f) => f.date))].sort();
  if (!dates.length) return null;
  /* The soonest day that still has something to come - not simply the first
     date on the card, which by late evening is a day already played out. */
  const started = (f) => !(f.kickoff && new Date(f.kickoff).getTime() > now);
  const day = dates.find((d) => fixtures.some((f) => f.date === d && !started(f)))
           || dates[0];

  const onDay = fixtures.filter((f) => f.date === day);
  if (prev && prev.date === day && prev.id &&
      onDay.some((f) => potdFid(f) === prev.id)) return prev;

  let pool = onDay.filter((f) => !f.cross_tier);
  if (!pool.length) pool = onDay;
  const live = pool.filter((f) => !started(f));
  if (live.length) pool = live;
  /* Thin support is still a demerit of its own: a number nobody has earned
     should not lead the page whatever league it comes from. */
  const demerit = (f) => (f.thin ? 1 : 0);
  const top = pool.slice().sort((a, b) =>
    demerit(a) - demerit(b) || (potdScore(b) - potdScore(a)) ||
    (potdFid(a) < potdFid(b) ? -1 : 1))[0];
  if (!top) return null;
  return { id: potdFid(top), home: top.home, away: top.away, date: top.date };
}

module.exports = { buildPayload, choosePotd, POTD_TIER_COST, potdScore, leanResults, scoreForTip, RESULT_MODEL_KEYS, MAIN, EXTRA, EXTRA_FILE, DEFAULTS, recordPublishedTips,
  carryInPlay, IN_PLAY_MAX_MS, scoreSources,
  firstScoreSource, findScore, sourceRows,
  makeScoreBudget, logScoreBudget, sourceCanAnswer,
  ORACLE_BUDGET, ORACLE_MAX_AGE_DAYS,
  confirmScores,
  zoneOffsetMs, wallTimeToUtcMs,
  LEAGUE_ALIASES, canonLeague, isUnratedCompetition, tierOfLeague, fixtureTier, LEAGUE_TIER };
