"use strict";
/* MERLIN'S PICK, ON THE SERVER (owner, 22 Oct 2026: "we should drop these codes everyday",
 * then "replace them" - the daily ladder's rungs). The site's wizardSpecial (index.html) on the
 * server's own pieces, as lib/pickforme.js is Pick for me's: of today's games still to come,
 * the slip MOST LIKELY TO LAND that still reaches the payout - an exact multiple-choice
 * knapsack over log odds, maximising the sum of log chance.
 * Its rules, as on the site: every leg 60%+ on the board's number (D.blend), SportyBet's real
 * price only, x1.15 or more, the favourite's side only for a result or a combo, a double chance
 * only on a side rated 50%+, no Unders of any kind (owner, 21 Oct 2026), markets people know
 * (no handicaps, corners, shots, halves, GG+), no market family on more than 40% of the slip.
 * Volatile leagues stay out, as on the site for a reader who never said yes to them (isVolatile,
 * owner 22 Oct 2026: "1 2 3"). The site's rout and high-scoring checks (judgedP) only touch
 * Unders, halves, handicaps and GG+, none of which Merlin offers. */
const C = require("./convert.js");
const S = require("./social.js");
const D = require("./doctor.js");

const MIN_P = 0.6, MIN_ODD = 1.15, STEP = 0.01, MAX_SHARE = 0.4;
const MARKETS = ["1", "2", "1X", "X2", "12", "OVER_0.5", "OVER_1.5", "OVER_2.5", "GG", "NG",
  "HOME_OVER_0.5", "AWAY_OVER_0.5", "HOME_OVER_1.5", "AWAY_OVER_1.5",
  "MIX_1_OV_1.5", "MIX_2_OV_1.5", "MIX_X_OV_1.5", "MIX_1_OV_2.5", "MIX_2_OV_2.5", "MIX_X_OV_2.5",
  "MIXGG_1", "MIXGG_2", "MIXGG_X"];

/* index.html VOL_NEW, word for word: API-Football's added leagues and the NPFL (owner, 21 Oct 2026). */
const VOL_NEW = new Set(["Germany 3. Liga", "France Ligue 3", "Italy Serie C, Group A", "Italy Serie C, Group B",
  "Italy Serie C, Group C", "Spain Primera Federacion", "Brazil Brasileiro Serie B", "Argentina Primera Nacional",
  "Austria 2. Liga", "Greece Super League 2", "Slovakia 2. Liga", "Bulgaria Vtora Liga", "Sweden Superettan",
  "Mexico Liga de Expansion MX", "USA USL Championship", "Colombia Liga DIMAYOR", "Uruguay Primera Division",
  "Chile Primera Division", "Northern Ireland Premiership", "Northern Ireland Championship",
  "Ecuador LigaPro Primera A", "Paraguay Division de Honor", "Canada Canadian Premier League",
  "Guatemala Liga Nacional", "Japan J2 League", "Ireland First Division", "Finland Ykkosliiga",
  "Russia 1. Liga", "Egypt 2. Division A", "Brazil Brasileiro Serie C", "Argentina Primera B",
  "Denmark 2nd Division", "Nigeria Premier League"]);
/* index.html isVolatile: a listed league, or one whose every fixture on the board is tier 3 to 5. */
function volatileLeagues(fixtures) {
  const lower = {};
  for (const f of fixtures) {
    const t = Number(f.tier), tier = t >= 1 && t <= 5 ? t : 6;
    lower[f.league] = lower[f.league] !== false && tier >= 3 && tier < 6;
  }
  return (l) => VOL_NEW.has(l) || !!lower[l];
}

function family(c) {
  if (/^MIX/.test(c)) return "combo";
  return require("./bigodds.js").family(c);
}
/* The side a result bet or a combo names must be the one the model rates stronger. */
function onFavourite(f, c) {
  const homeFav = f.home_p > f.away_p;
  if (c === "1") return homeFav;
  if (c === "2") return !homeFav;
  if (c === "1X") return f.home_p >= 0.5;
  if (c === "X2") return f.away_p >= 0.5;
  const m = /^(?:MIXGG_|MIX_)([12])(?:_|$)/.exec(c);
  return !m || (m[1] === "1" ? homeFav : !homeFav);
}

/* Pure. Returns { legs, odds } in lib/convert.js's leg shape, or null when nothing reaches
 * the payout in maxLegs. `skip`: a Set of "home|away" games left out (lib/ladder.js).
 * `minP`: the lowest chance a leg may have (default MIN_P; the safer x20 asks 0.72, lib/safer20.js). */
function pick(pay, now, feed, target, maxLegs, skip, minP) {
  const today = S.dayOf(now);
  const groups = [], isVolatile = volatileLeagues(pay.fixtures || []);
  for (const f of pay.fixtures || []) {
    if (f.date !== today || f.thin || !(Date.parse(f.kickoff || "") > now + 60 * 60000)) continue;
    if (isVolatile(f.league)) continue;
    if (skip && skip.has(f.home + "|" + f.away)) continue;
    const base = { home: f.home, away: f.away, kickoff: Date.parse(f.kickoff) };
    const e = C.pair(feed, Object.assign({ prediction: "1" }, base));
    if (!e || !e.odds) continue;                                   // no SportyBet price, no leg
    let opts = [];
    for (const c of MARKETS) {
      if (!onFavourite(f, c)) continue;
      const o = Number(e.odds[c]), m = D.probOf(f, c);
      if (!(o >= MIN_ODD) || m == null) continue;
      const p = D.blend(m, o);
      if (p >= (minP || MIN_P)) opts.push(Object.assign({}, base, { prediction: c, p, odds: o, lp: Math.log(p) }));
    }
    /* Beaten on price and chance by another of its own family: never the best choice. */
    opts = opts.filter((a) => !opts.some((b) => b !== a && family(b.prediction) === family(a.prediction) &&
      b.odds >= a.odds && b.p >= a.p && (b.odds > a.odds || b.p > a.p)));
    if (opts.length) groups.push(opts);
  }
  const NEED = Math.ceil(Math.log(target) / STEP), CAP = NEED + 160;
  function solve() {
    /* Weights round DOWN, so a slip that clears NEED in steps clears the payout for real.
       cnt keeps the leg budget: the best sum at each weight among slips of at most maxLegs. */
    let dp = [{ v: 0, n: 0, legs: [] }];
    for (const g of groups) {
      const nd = dp.slice();
      dp.forEach((s, b) => {
        if (!s || s.n >= maxLegs) return;
        for (const x of g) {
          if (x._out) continue;
          const nb = Math.min(CAP, b + Math.floor(Math.log(x.odds) / STEP)), v = s.v + x.lp;
          if (!nd[nb] || v > nd[nb].v) nd[nb] = { v, n: s.n + 1, legs: s.legs.concat([x]) };
        }
      });
      dp = nd;
    }
    let best = null;
    for (let b = NEED; b <= CAP; b++) if (dp[b] && (!best || dp[b].v > best.v)) best = dp[b];
    return best && best.legs;
  }
  /* The 40% cap by repair: the weakest leg of a family over its cap loses that option and the
     search runs again. A board offering only one family keeps its uncapped best. */
  let legs = null, first = null;
  /* One option out per round, so a board of near-twins needs about one round a game. */
  for (let round = 0; round < 2 * groups.length + 30; round++) {
    legs = solve();
    if (!first) first = legs;
    if (!legs) { legs = first; break; }
    const fc = {};
    legs.forEach((x) => (fc[family(x.prediction)] = fc[family(x.prediction)] || []).push(x));
    const cap = Math.max(2, Math.ceil(MAX_SHARE * legs.length));
    const over = Object.values(fc).filter((v) => v.length > cap).sort((a, b) => b.length - a.length)[0];
    if (!over) break;
    over.sort((a, b) => a.p - b.p)[0]._out = true;
  }
  if (!legs || !legs.length) return null;
  const odds = legs.reduce((t, l) => t * l.odds, 1);
  return { legs: legs.map(({ lp, _out, ...l }) => l), odds };
}

module.exports = { pick, MARKETS, MIN_P, MIN_ODD, family, VOL_NEW };
