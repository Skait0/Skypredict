"use strict";

/**
 * Corners, priced off the file the build already downloads.
 *
 * WHERE THE DATA COMES FROM, and why this costs nothing. Every
 * football-data.co.uk main-division CSV carries `HC` and `AC` - the corners
 * each side won - in the same row as `FTHG` and `HST`, which lib/model.js has
 * been reading all along. The build pulls those files to fit the goals model,
 * so the corners were already in memory and already parsed; they were simply
 * being dropped on the floor. No request, no key, no quota, no third party.
 *
 * WHAT IT DOES NOT COVER, said plainly. The EXTRA files - Argentina, Brazil,
 * MLS, the Nordics, Mexico, Romania, Russia - are a different, shorter format
 * with no corners column at all. Those leagues get no rate here, `cornersFor`
 * returns null for them, and every caller already treats null as "we cannot
 * price this one". The alternative was API-Football at one request per fixture
 * against a hundred a day, or scraping a site whose terms forbid it. Neither
 * is worth a number we cannot stand behind.
 *
 * THE MODEL IS DELIBERATELY SMALLER THAN THE GOALS ONE. Corners are far less
 * matchup-sensitive than goals: most of the variance is the league and the two
 * teams' own rates, not the interaction between them. So this is weighted
 * corners-for and corners-against per team, shrunk towards the league mean,
 * with a home-advantage multiplier - no iterative fit, no optimiser. The same
 * over-dispersion device as the goals model carries it the rest of the way: a
 * shared Gamma multiplier, which makes the total negative binomial rather than
 * Poisson. Corners are famously over-dispersed and a flat Poisson would price
 * the outer lines far too confidently.
 *
 * `fitCorners` returns the rates. It does NOT return probabilities: the tails
 * are computed where they are read, from two numbers per fixture, so a line
 * neither book sells today can still be answered tomorrow without a rebuild.
 */

/* Half-life in days, and how hard a thin team is pulled to the league mean.
   Both deliberately looser than the goals model's: a team's corner rate moves
   slower than its scoring, and there are fewer matches behind each one. */
const HALF_LIFE = 260;
const SHRINK = 6;

/* A rate below this is a parsing accident, not a football match. Teams average
   4-7 corners a side; a league mean outside this range means the column was
   read wrong and the whole league is better dropped than published. */
const MIN_MEAN = 2.0, MAX_MEAN = 9.0;

/* Fewer matches than this in a league and the mean is noise. */
const MIN_MATCHES = 40;

function fitCorners(matches, opts) {
  const o = opts || {};
  const halfLife = o.halfLife || HALF_LIFE;
  const decay = Math.log(2) / halfLife;
  const rows = (matches || []).filter((m) =>
    m && m.hc != null && m.ac != null && isFinite(m.hc) && isFinite(m.ac));
  if (!rows.length) return null;

  const ref = o.reference || rows.reduce((a, m) => (m.date > a ? m.date : a), rows[0].date);
  const wOf = (m) => Math.exp(-decay * Math.max(0, (ref - m.date) / 86400000));

  /* League means first: every team rate is expressed relative to its own
     league, so a Conference side is not judged against the Bundesliga. */
  const lg = new Map();
  for (const m of rows) {
    let s = lg.get(m.league);
    if (!s) lg.set(m.league, (s = { h: 0, a: 0, w: 0, n: 0 }));
    const w = wOf(m);
    s.h += w * m.hc; s.a += w * m.ac; s.w += w; s.n++;
  }
  const league = new Map();
  for (const [name, s] of lg) {
    if (s.n < MIN_MATCHES || !s.w) continue;
    const mh = s.h / s.w, ma = s.a / s.w;
    const mean = (mh + ma) / 2;
    if (!(mean > MIN_MEAN && mean < MAX_MEAN)) continue;
    /* Home advantage as a multiplier on the league's own mean rather than a
       constant lifted from somewhere else. It is real and small - the home
       side wins more corners nearly everywhere - and measuring it per league
       costs one division. */
    league.set(name, { mean: mean, hadv: mh / mean, aadv: ma / mean, n: s.n });
  }
  if (!league.size) return null;

  /* Team rates. `for` is how many that team wins, `against` how many it
     concedes, both as a multiplier on its league's mean and both shrunk
     towards 1 by SHRINK matches' worth of prior. A promoted side with six
     games played reads almost exactly like its league until it has earned
     otherwise. */
  const t = new Map();
  const bump = (name, lgName, forC, againstC, w) => {
    let s = t.get(name);
    if (!s) t.set(name, (s = { lg: lgName, f: 0, a: 0, w: 0, n: 0 }));
    s.lg = lgName;                      /* a team belongs to the league it plays in NOW */
    s.f += w * forC; s.a += w * againstC; s.w += w; s.n++;
  };
  for (const m of rows) {
    if (!league.has(m.league)) continue;
    const w = wOf(m);
    bump(m.home, m.league, m.hc, m.ac, w);
    bump(m.away, m.league, m.ac, m.hc, w);
  }

  const team = new Map();
  for (const [name, s] of t) {
    const L = league.get(s.lg);
    if (!L || !s.w) continue;
    const shr = (sum, w) => (sum + SHRINK * L.mean * (w / Math.max(1, s.n)))
      / (w + SHRINK * (w / Math.max(1, s.n)));
    team.set(name, {
      league: s.lg,
      for: shr(s.f, s.w) / L.mean,
      against: shr(s.a, s.w) / L.mean,
      n: s.n,
    });
  }

  /* THE SPREAD, MEASURED RATHER THAN ASSUMED. k is the shared Gamma
     multiplier's shape: total | z ~ Poisson(lambda z), z ~ Gamma(k, k), which
     makes the total negative binomial with variance mean + mean^2/k. So k
     falls straight out of the sample mean and variance of match totals - no
     fit, and it is checked rather than trusted: a sample whose variance is at
     or below its mean cannot be over-dispersed, and gets the flattest k we
     will use instead of a negative one. */
  let n = 0, sum = 0, sumsq = 0;
  for (const m of rows) {
    if (!league.has(m.league)) continue;
    const tot = m.hc + m.ac;
    n++; sum += tot; sumsq += tot * tot;
  }
  const mean = sum / n;
  const varc = Math.max(0, sumsq / n - mean * mean);
  const K_FLAT = 200;                    /* effectively Poisson */
  const k = (varc > mean * 1.02) ? Math.min(K_FLAT, mean * mean / (varc - mean)) : K_FLAT;

  return { league: league, team: team, k: k, matches: n,
           mean: mean, dispersion: varc / mean };
}

/* Expected corners for one fixture, or null where we hold no rate for it.
   Null is the whole point: it is what stops a league with no corners column
   from being priced off a league mean that is not its own. */
function cornersFor(model, home, away, leagueName) {
  if (!model) return null;
  const H = model.team.get(home), A = model.team.get(away);
  if (!H || !A) return null;
  /* A cross-league fixture - a cup tie - has two teams whose rates are
     relative to different means. The fixture's own league decides, and if we
     do not hold that league there is nothing honest to scale by. */
  const L = model.league.get(leagueName) || model.league.get(H.league);
  if (!L) return null;
  const ch = L.mean * L.hadv * H.for * A.against;
  const ca = L.mean * L.aadv * A.for * H.against;
  if (!(ch > 0 && ca > 0 && isFinite(ch) && isFinite(ca))) return null;
  return { ch: ch, ca: ca, total: ch + ca };
}

/* P(X > line) for X ~ Poisson(lambda * z), z ~ Gamma(k, k) - the same mixture
   the goals model uses, summed over the same kind of grid. Kept here so the
   build and the page can be checked against one implementation; the page
   carries its own copy of the arithmetic because it holds only lambda. */
function overProb(lambda, k, line) {
  if (!(lambda > 0) || !(k > 0)) return null;
  const N = 48, hiMult = 1 + 5 / Math.sqrt(k);
  const zMax = Math.min(6, hiMult * 1.6), step = zMax / N;
  const logNorm = k * Math.log(k) - lgamma(k);
  let acc = 0, wsum = 0;
  const cap = Math.floor(line);
  for (let q = 0; q < N; q++) {
    const z = (q + 0.5) * step;
    const w = Math.exp(logNorm + (k - 1) * Math.log(z) - k * z) * step;
    const lam = lambda * z;
    /* Poisson CDF up to the line, climbing term by term rather than calling a
       factorial: the lines run to 14.5 and the terms stay well inside range. */
    let term = Math.exp(-lam), cdf = term;
    for (let i = 1; i <= cap; i++) { term *= lam / i; cdf += term; }
    acc += w * (1 - cdf); wsum += w;
  }
  return wsum > 0 ? acc / wsum : null;
}

/* Lanczos, same coefficients as lib/model.js - two copies of a constant table
   beats a circular require between the model and the thing that reads it. */
function lgamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let xx = x, y = x, tmp = xx + 5.5;
  tmp -= (xx + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / xx);
}

module.exports = { fitCorners, cornersFor, overProb, HALF_LIFE, SHRINK };
