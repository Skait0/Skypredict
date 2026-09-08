"use strict";
/**
 * One strength offset per country, fitted from cross-border matches and shrunk
 * toward the imported UEFA-derived prior.
 *
 * THE MEAN STRUCTURE IS COPIED FROM predictTotals AND tierEdge ON PURPOSE, so
 * what comes out is already in the units countryHandicap hands to tierEdge:
 *
 *   e  = (rung(awayLeague) + C_away) - (rung(homeLeague) + C_home)
 *   lh = exp(lgI[homeLeague] + att[h] - def[a] + hadv + e)
 *   la = exp(lgI[homeLeague] + att[a] - def[h] - e)
 *
 * The home side's league carries the intercept for both, which is what
 * build.js does when it sets li = hl for a cross-tier fixture.
 *
 * FITTED BY POISSON QUASI-LIKELIHOOD. The model's dispersion k is a variance
 * parameter: it widens the interval and does not move the location, so the
 * Poisson score equations give consistent estimates of the mean parameters
 * without it. It is neither used nor re-estimated here.
 *
 * dl/de = (hg - lh) - (ag - la),  de/dC_home = -1,  de/dC_away = +1
 *
 * THE VENUE TERM IS FITTED ALONGSIDE, AND IS NOT A COUNTRY OFFSET. European
 * ties carry more home advantage than the domestic model was fitted on: over
 * the committed corpus, home sides beat expectation by 7.0% and away sides
 * fell 4.8% short of it. That is separable from strength because a country
 * offset flips sign when the same pair swap venues and a venue effect does
 * not - so as long as countries play about as often at home as away, which
 * they do here, the two do not compete for the same evidence. It enters the
 * mean exactly where the edge does, `+v` home and `-v` away, which is why the
 * board can add it to tierEdge's number and change nothing else.
 */

/* How much weaker than the anchor this country is, in log goal-rate - the
   number countryHandicap computes today, and the centre of the prior. */
function priorFor(country, coefficients, opts) {
  const o = opts || {};
  const c = coefficients[String(country || "")];
  if (c === undefined || !(c > 0)) return null;
  const raw = o.scale * (Math.log(o.anchor) - Math.log(c));
  return Math.min(o.cap, Math.max(0, raw));
}

function prepare(matches, modelOf, rungOf) {
  const out = [];
  for (const m of (matches || [])) {
    const model = modelOf(m.season);
    if (!model) continue;
    const i = model.index;
    const h = i.tIdx[m.home], a = i.tIdx[m.away], l = i.lIdx[m.homeLeague];
    if (h === undefined || a === undefined || l === undefined) continue;
    const rh = rungOf(m.homeLeague), ra = rungOf(m.awayLeague);
    if (rh === null || ra === null) continue;
    out.push({
      baseH: model.lgI[l] + model.att[h] - model.def[a] + model.hadv,
      baseA: model.lgI[l] + model.att[a] - model.def[h],
      rung: ra - rh,
      hc: m.homeCountry, ac: m.awayCountry,
      hg: m.hg, ag: m.ag,
      cross: m.homeCountry !== m.awayCountry,
    });
  }
  return out;
}

/* Mean per-match Fisher information, evaluated at the prior. Expressing the
   penalty in these units is what makes K read as "this prior is worth K
   matches", so the result behaves as (n*MLE + K*prior)/(n + K). */
function meanInfo(rows, C, v) {
  if (!rows.length) return 1;
  const w = v || 0;
  let s = 0;
  for (const r of rows) {
    const e = (r.rung + (C[r.ac] || 0)) - (C[r.hc] || 0) + (r.cross ? w : 0);
    s += Math.exp(r.baseH + e) + Math.exp(r.baseA - e);
  }
  return s / rows.length;
}

function fitOffsets(opts) {
  const priors = opts.priors || {};
  const K = opts.K == null ? 40 : opts.K;
  const cap = opts.cap == null ? 0.70 : opts.cap;
  const anchorCountry = opts.anchorCountry || "England";
  const iters = opts.iters || 600;
  const fitHomeEdge = !!opts.fitHomeEdge;
  const rows = prepare(opts.matches, opts.modelOf, opts.rungOf);

  const countries = Object.keys(priors);
  const C = {};
  for (const c of countries) C[c] = priors[c];

  const seen = {};
  for (const r of rows) if (r.cross) {
    seen[r.hc] = (seen[r.hc] || 0) + 1;
    seen[r.ac] = (seen[r.ac] || 0) + 1;
  }

  /* The venue term. Unpenalised: there is no imported number to shrink it
     toward, and one parameter over hundreds of matches does not need one. */
  let v = 0;
  let vMom = 0, vVel = 0;

  const pen = K * meanInfo(rows, C, v);
  const lr = 0.02, b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const mom = {}, vel = {};
  for (const c of countries) { mom[c] = 0; vel[c] = 0; }

  for (let it = 1; it <= iters; it++) {
    const g = {};
    let gv = 0;
    for (const c of countries) g[c] = 0;
    for (const r of rows) {
      const e = (r.rung + (C[r.ac] || 0)) - (C[r.hc] || 0) + (r.cross ? v : 0);
      const lh = Math.exp(r.baseH + e), la = Math.exp(r.baseA - e);
      const d = (r.hg - lh) - (r.ag - la);
      if (r.hc in g) g[r.hc] -= d;
      if (r.ac in g) g[r.ac] += d;
      /* Same derivative as the edge, without the sign flip that makes an
         offset an offset - which is the whole reason the two separate. */
      if (r.cross) gv += d;
    }
    for (const c of countries) {
      if (c === anchorCountry) continue;
      g[c] -= pen * (C[c] - priors[c]);
      mom[c] = b1 * mom[c] + (1 - b1) * g[c];
      vel[c] = b2 * vel[c] + (1 - b2) * g[c] * g[c];
      const step = lr * (mom[c] / (1 - Math.pow(b1, it))) /
                   (Math.sqrt(vel[c] / (1 - Math.pow(b2, it))) + eps);
      C[c] = Math.min(cap, Math.max(0, C[c] + step));
    }
    C[anchorCountry] = 0;
    if (fitHomeEdge) {
      vMom = b1 * vMom + (1 - b1) * gv;
      vVel = b2 * vVel + (1 - b2) * gv * gv;
      v += lr * (vMom / (1 - Math.pow(b1, it))) /
           (Math.sqrt(vVel / (1 - Math.pow(b2, it))) + eps);
      /* A venue effect wider than half a goal in log terms is not a venue
         effect, it is a bug in the corpus. */
      v = Math.min(0.5, Math.max(-0.5, v));
    }
  }

  const out = {};
  /* Underscored so it cannot collide with a country name, and so the artefact
     writer has to name it deliberately rather than iterating it by accident. */
  out._homeEdge = Math.round(v * 1e4) / 1e4;
  for (const c of countries) {
    const raw = c === anchorCountry ? 0 : C[c];
    const n = seen[c] || 0;
    /* No evidence means the penalty was the whole objective, so the answer is
       the prior - said exactly rather than left to converge to it. */
    const v = n === 0 ? priors[c] : raw;
    out[c] = {
      offset: Math.round(v * 1e4) / 1e4,
      prior: Math.round(priors[c] * 1e4) / 1e4,
      matches: n,
      clamped: n > 0 && (v >= cap - 1e-9 || (v <= 1e-9 && priors[c] > 1e-9)),
    };
  }
  return out;
}

/* Poisson deviance, the held-out score. y*log(y/lambda) is 0 at y = 0.
 *
 * THE VENUE TERM BELONGS IN HERE. Scoring without it prices every held-out tie
 * as though European home advantage were the domestic number, which it is not
 * - and the difference does not cancel, because it is the same sign in every
 * match. Left out, the missing 0.057 has to be absorbed by whatever else can
 * move, which is the country offsets: the fit that shrinks LEAST looks best,
 * and K comes back at the bottom of the grid for a reason that has nothing to
 * do with how much evidence there is. */
function deviance(rows, C, v) {
  let d = 0;
  const w = v || 0;
  for (const r of rows) {
    const e = (r.rung + (C[r.ac] || 0)) - (C[r.hc] || 0) + (r.cross ? w : 0);
    const pairs = [[r.hg, Math.exp(r.baseH + e)], [r.ag, Math.exp(r.baseA - e)]];
    for (const p of pairs) {
      const y = p[0], lam = p[1];
      d += 2 * ((y > 0 ? y * Math.log(y / lam) : 0) - (y - lam));
    }
  }
  return d;
}

function chooseK(opts) {
  const folds = opts.folds || 5;
  /* Down to zero, because the answer used to come back as the smallest number
     on offer - and a grid whose optimum sits on its own edge has not been
     searched, it has been bounded. */
  const grid = opts.grid || [0, 1, 2, 3, 5, 10, 20, 40, 80, 160, 320];
  const all = (opts.matches || []).slice();
  const scored = [];
  for (const K of grid) {
    let total = 0;
    const perFold = [];
    for (let f = 0; f < folds; f++) {
      const train = all.filter((_, i) => i % folds !== f);
      const test = all.filter((_, i) => i % folds === f);
      /* fitHomeEdge, because the shipped fit uses it. Choosing K under a
         model the board does not run is choosing it for a different question. */
      const fit = fitOffsets(Object.assign({}, opts,
        { matches: train, K, fitHomeEdge: true }));
      const C = {};
      for (const c in fit) if (c !== "_homeEdge") C[c] = fit[c].offset;
      const d = deviance(prepare(test, opts.modelOf, opts.rungOf), C, fit._homeEdge);
      perFold.push(d);
      total += d;
    }
    scored.push({ K: K, deviance: total, perFold: perFold });
  }
  const best = scored.slice().sort((a, b) => a.deviance - b.deviance)[0];
  /* THE ARGMIN IS NOT THE ANSWER ON A FLAT CURVE.
   *
   * Measured 8 Sep 2026 over 627 matches: K=0 scored 1535.4 and K=10 scored
   * 1538.1, which is 0.18% - and the same run refused six countries at K=0
   * against three at K=10, because with no prior to lean on, Poland (n=31),
   * Switzerland and Austria land on the cap and the board stops pricing their
   * ties at all. Buying a fifth of a percent of held-out deviance with three
   * countries is not a trade worth making.
   *
   * So: the most shrinkage the evidence cannot argue against. The folds are
   * the same partitions for every K, so the comparison is paired - the
   * standard error of the DIFFERENCE against the best K is the right yardstick,
   * not the spread of the level, which is dominated by how many goals happen
   * to be in each fold. Largest K whose loss is inside one standard error of
   * that difference. This is the one-standard-error rule, chosen deliberately
   * on the shrinkage side: a prior that turns out to be worth nothing costs a
   * fraction of a percent, and a fit with no prior costs whole countries. */
  const within = scored.filter((s) => {
    if (s.K === best.K) return true;
    const diffs = s.perFold.map((d, i) => d - best.perFold[i]);
    const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    if (mean <= 0) return true;
    const varr = diffs.reduce((a, b) => a + (b - mean) * (b - mean), 0) /
                 Math.max(1, diffs.length - 1);
    const se = Math.sqrt(varr / diffs.length);
    return mean <= se;
  });
  const pick = within.slice().sort((a, b) => b.K - a.K)[0] || best;
  return { K: pick.K, deviance: pick.deviance, best: best.K, grid: scored };
}

module.exports = { priorFor, fitOffsets, chooseK, deviance, prepare };
