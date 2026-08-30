"use strict";

/**
 * Keeping DRAW_WEIGHT honest.
 *
 * lib/build.js multiplies level scorelines by 0.60 before sampling, to undo a
 * selection effect: filtering a scoreline to what the tip survives strips one
 * side's wins while leaving every draw in, which lifts the draw share above
 * its true value. The constant was measured against a real build.
 *
 * It is measured against ONE tip mix, and that is the problem this file exists
 * for. The correction was calibrated when 97% of tips permitted a draw. A tip
 * that excludes draws can never show one, so it dilutes the board directly:
 *
 *     tips permitting a draw   resulting board draw rate (at w = 0.60)
 *              97%                          29%
 *              85%                          25%
 *              70%                          21%
 *              50%                          15%
 *
 * That dependency was originally recorded as a comment saying "re-measure if
 * the tip mix moves" - which is a note somebody has to remember to act on. The
 * two tests below make it something that fails instead.
 *
 * They run against the built payload, which changes daily, so the bands are
 * deliberately set where a real regression trips them and ordinary day-to-day
 * variation does not. The tip-mix test is the tight one, because that quantity
 * is stable and is the actual dependency. The draw-rate test is loose on
 * purpose - it is a catch-all for gross breakage, like the 0%-draws board this
 * whole thing replaced, not a fine calibration check.
 */

const test = require("node:test");
const assert = require("node:assert");

const G = require("../lib/grade.js");

/* The mix DRAW_WEIGHT was calibrated at. If this moves, the constant is stale
   by construction, whatever the realised rate happens to look like today. */
const CALIBRATED_AT_PERMIT_SHARE = 0.97;
const PERMIT_TOLERANCE = 0.15;

function payload() {
  try { return require("../public/predictions.json"); } catch (e) { return null; }
}
function drawShare(rows, get) {
  const d = rows.filter(get).length;
  return { d, n: rows.length, p: rows.length ? d / rows.length : 0 };
}

test("the tip mix has not drifted from what the draw weight was measured against", () => {
  const p = payload();
  if (!p) return;
  const fx = (p.fixtures || []).filter(f => f.tip);
  if (fx.length < 80) return;

  const permit = fx.filter(f => G.gradeLabel(f.tip, 1, 1) !== false).length / fx.length;
  const drift = Math.abs(permit - CALIBRATED_AT_PERMIT_SHARE);

  assert.ok(drift <= PERMIT_TOLERANCE,
    `${(permit * 100).toFixed(0)}% of tips now permit a draw, against the ` +
    `${(CALIBRATED_AT_PERMIT_SHARE * 100).toFixed(0)}% DRAW_WEIGHT was calibrated at.\n` +
    `    A tip that excludes draws can never show one, so this moves the board's ` +
    `draw rate directly.\n` +
    `    Re-measure DRAW_WEIGHT in lib/build.js against a REAL build - never a ` +
    `reconstructed score matrix, which is what got it wrong the first time.`);
});

test("the board's draw rate is in the same country as reality", () => {
  const p = payload();
  if (!p) return;
  const fx = (p.fixtures || []).filter(f => /^\d+-\d+$/.test(f.score || ""));
  const rs = (p.results || []).filter(r => r.hg != null && r.ag != null);
  if (fx.length < 80 || rs.length < 80) return;

  const board = drawShare(fx, f => { const [h, a] = f.score.split("-").map(Number); return h === a; });
  const real = drawShare(rs, r => r.hg === r.ag);

  /* Loose by design. With a few hundred of each, the standard error on the
     difference is around four points, so a band this wide will not flap on
     ordinary variation - it is here to catch a board that has stopped
     describing football at all, which is what 0% draws was. */
  const gap = Math.abs(board.p - real.p);
  const implied = (t, m = 0.41) => (t * (1 - m)) / (m * (1 - t));

  assert.ok(gap <= 0.12,
    `board shows ${(board.p * 100).toFixed(0)}% draws (${board.d}/${board.n}), ` +
    `results show ${(real.p * 100).toFixed(0)}% (${real.d}/${real.n}).\n` +
    `    That is ${(gap * 100).toFixed(0)} points apart.\n` +
    `    DRAW_WEIGHT would need to be about ${implied(real.p).toFixed(2)} to match ` +
    `(it is currently 0.60).`);
});

/* The floor. Whatever the calibration is doing, these must never be true again:
   they are the exact shape of the bug this replaced. */
test("draws and low-scoring games are on the board at all", () => {
  const p = payload();
  if (!p) return;
  const fx = (p.fixtures || []).filter(f => /^\d+-\d+$/.test(f.score || ""));
  if (fx.length < 80) return;

  const parse = f => f.score.split("-").map(Number);
  const draws = fx.filter(f => { const [h, a] = parse(f); return h === a; }).length;
  const low = fx.filter(f => { const [h, a] = parse(f); return h + a <= 1; }).length;
  const distinct = new Set(fx.map(f => f.score)).size;

  assert.ok(draws > 0, "not one draw on the whole board - this was the reported bug");
  assert.ok(low > 0, "not one game of a goal or fewer - 22% of real results end that way");
  assert.ok(distinct >= 12,
    `only ${distinct} distinct scorelines across ${fx.length} fixtures; ` +
    `real results over the same period span about 31`);
});
