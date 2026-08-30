"use strict";

/**
 * Correcting the model's confidence against what actually happened.
 *
 * The model is under-confident, measurably and consistently. Across 199 graded
 * results it predicted 73.3% and landed 79.9% - and the gap is not evenly
 * spread. "1X, home or draw" is close to honest at +1.9 points. "Over 1.5" is
 * out by +10.8, saying 83.4% for something that lands 94.2%, which is well
 * outside its own error bar.
 *
 * That is worth fixing for one reason above others: the confidence figure is
 * what a reader uses to decide. A tip shown at 83% that really lands 94% is not
 * a rounding error, it is the site being wrong about the one number it exists
 * to publish.
 *
 * WHAT THIS IS AND IS NOT
 *
 * It is a one-parameter correction per market: a shift in log-odds, fitted so
 * that what we predicted over the graded past adds up to what actually landed.
 * One parameter, not two, on purpose. A slope would fit the observed bands
 * better - the gap grows with confidence - but with a couple of hundred samples
 * and eleven of them in the top band, a slope fits noise as readily as signal.
 * An intercept captures the systematic half and cannot do anything wild.
 *
 * It is NOT a learning loop that compounds. It is refitted from scratch every
 * build against the most recent results, so it tracks the model rather than
 * accumulating on top of itself.
 *
 * THE FEEDBACK TRAP, AND WHY THIS AVOIDS IT
 *
 * Results store the RAW model probability; fixtures publish the corrected one.
 * That separation is what makes this safe. If graded results stored the
 * corrected figure, each build would fit a correction to already-corrected
 * numbers and the adjustment would walk away from reality a little more every
 * day. Anything moving `tip_p` into the results rows has to preserve that, and
 * the test suite pins it.
 *
 * EVERY GUARD HERE EXISTS BECAUSE THE ALTERNATIVE IS WORSE THAN NO CORRECTION
 *
 * A miscalibration fitted on thin data is a confident lie. So: a market needs
 * MIN_SAMPLES before it gets its own correction, the adjustment is shrunk
 * toward zero by how much data stands behind it, and it is capped outright. On
 * no data at all this returns the identity and the site behaves exactly as it
 * did before the file existed.
 */

/* Below this, a market has no business having its own correction. */
const MIN_SAMPLES = 25;

/* Shrinkage. The fitted shift is scaled by n/(n+PRIOR), so 25 samples move it
   only about a third of the way and it takes a few hundred to apply in full.
   Deliberately reluctant: being wrong about confidence is the failure mode. */
const PRIOR = 60;

/* Hard ceiling in log-odds, whatever the data says. 0.8 is enough to move 70%
   to 84% and nothing here should ever want more than that. A larger fitted
   value means something has gone wrong upstream, and the right response is to
   refuse it rather than publish it. */
const MAX_SHIFT = 0.8;

const clampP = (p) => Math.min(0.9999, Math.max(0.0001, p));
const logit = (p) => Math.log(clampP(p) / (1 - clampP(p)));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/* The shift that makes predicted totals match observed ones.
 *
 * Solved by bisection rather than gradient descent: the function is monotonic
 * in `shift`, the bracket is known, and forty iterations is exact to more
 * decimal places than anyone needs. No convergence to worry about and no
 * dependency to add.
 */
function fitShift(samples) {
  const rows = (samples || []).filter(
    (s) => s && typeof s.p === "number" && isFinite(s.p) && typeof s.hit === "boolean");
  if (rows.length < MIN_SAMPLES) return { shift: 0, n: rows.length, raw: 0 };

  const wins = rows.filter((r) => r.hit).length;
  const predict = (shift) =>
    rows.reduce((t, r) => t + sigmoid(logit(r.p) + shift), 0);

  /* Already matching: nothing to correct. */
  let lo = -3, hi = 3;
  if (predict(lo) > wins || predict(hi) < wins) return { shift: 0, n: rows.length, raw: 0 };

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (predict(mid) < wins) lo = mid; else hi = mid;
  }
  const raw = (lo + hi) / 2;

  /* Shrink toward no-correction by how much evidence there is, then cap. */
  const shrunk = raw * (rows.length / (rows.length + PRIOR));
  const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, shrunk));
  return { shift, n: rows.length, raw };
}

/* Build a calibrator from graded results.
 *
 * `samples` are { tip, p, hit } where `p` is the RAW model probability - see
 * the note above on why it must not be the corrected one.
 *
 * Returns { apply(tip, p), report() }. `apply` is the identity wherever there
 * is not enough evidence, so a new market, a quiet week or an empty database
 * all degrade to the behaviour this replaced.
 */
function build(samples) {
  const rows = (samples || []).filter(
    (s) => s && typeof s.p === "number" && isFinite(s.p) && typeof s.hit === "boolean");

  const overall = fitShift(rows);

  const byTip = new Map();
  const groups = new Map();
  for (const r of rows) {
    const k = String(r.tip || "");
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const [tip, group] of groups) {
    const f = fitShift(group);
    /* Only where the market itself has the evidence. Everything else falls
       back to the overall shift, which is better supported than a market
       correction fitted on a handful of games. */
    if (group.length >= MIN_SAMPLES) byTip.set(tip, f);
  }

  function apply(tip, p) {
    if (typeof p !== "number" || !isFinite(p)) return p;
    const f = byTip.get(String(tip || "")) || overall;
    if (!f || !f.shift) return p;
    return sigmoid(logit(p) + f.shift);
  }

  function report() {
    const lines = [];
    if (overall.n >= MIN_SAMPLES) {
      lines.push(`calibration: overall shift ${overall.shift.toFixed(3)} from ${overall.n} results`);
    } else {
      lines.push(`calibration: only ${overall.n} graded results - no correction applied`);
    }
    for (const [tip, f] of byTip) {
      lines.push(`  ${tip}: shift ${f.shift.toFixed(3)} (raw ${f.raw.toFixed(3)}, n=${f.n})`);
    }
    return lines;
  }

  return { apply, report, overall, byTip };
}

module.exports = { build, fitShift, logit, sigmoid, MIN_SAMPLES, PRIOR, MAX_SHIFT };
