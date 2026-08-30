"use strict";

/**
 * The confidence correction.
 *
 * The model is under-confident: across 199 graded results it predicted 73.3%
 * and landed 79.9%, and the gap is uneven - "1X, home or draw" is honest at
 * +1.9 points while "Over 1.5" says 83.4% for something that lands 94.2%.
 *
 * The confidence figure is the number a reader decides on, so being wrong about
 * it is not cosmetic. But a correction fitted on thin data is a confident lie,
 * and worse than none - which is what most of this file is about.
 */

const test = require("node:test");
const assert = require("node:assert");

const C = require("../lib/calibrate.js");

/* Deterministic samples: n predictions at probability p, of which `wins`
   landed. Enough to reproduce any bias exactly. */
function samples(tip, p, n, wins) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ tip, p, hit: i < wins });
  return out;
}

test("a model that is right needs no correction", () => {
  /* 200 tips at 70%, 140 land. Nothing to fix. */
  const cal = C.build(samples("t", 0.70, 200, 140));
  assert.ok(Math.abs(cal.apply("t", 0.70) - 0.70) < 0.01,
    "a calibrated model must be left alone, got " + cal.apply("t", 0.70));
});

test("under-confidence is corrected upward", () => {
  /* Says 70%, lands 80%. */
  const cal = C.build(samples("t", 0.70, 200, 160));
  const out = cal.apply("t", 0.70);
  assert.ok(out > 0.70, "should have been raised, got " + out);
  assert.ok(out <= 0.80 + 1e-9, "must not overshoot what the data shows, got " + out);
});

test("over-confidence is corrected downward", () => {
  const cal = C.build(samples("t", 0.80, 200, 120));   // says 80%, lands 60%
  const out = cal.apply("t", 0.80);
  assert.ok(out < 0.80, "should have been lowered, got " + out);
});

test("thin evidence gets no correction at all", () => {
  /* Ten results screaming 100% is not evidence, it is a small number. */
  const cal = C.build(samples("t", 0.60, 10, 10));
  assert.strictEqual(cal.apply("t", 0.60), 0.60,
    "under MIN_SAMPLES the correction must be the identity");
});

test("the correction is shrunk toward zero by how much data supports it", () => {
  const small = C.build(samples("t", 0.70, 30, 24));    // same bias
  const large = C.build(samples("t", 0.70, 600, 480));  // same bias, more data
  const ds = small.apply("t", 0.70) - 0.70;
  const dl = large.apply("t", 0.70) - 0.70;
  assert.ok(ds > 0 && dl > 0, "both should correct upward");
  assert.ok(dl > ds * 1.5,
    `600 samples should move it much further than 30 (${dl.toFixed(3)} vs ${ds.toFixed(3)})`);
});

test("no amount of data buys an unbounded correction", () => {
  /* 5000 results saying 10% that always land. The honest answer is "something
     upstream is broken", and the safe one is to refuse to publish a wild
     adjustment. */
  const cal = C.build(samples("t", 0.10, 5000, 5000));
  const out = cal.apply("t", 0.10);
  const shift = C.logit(out) - C.logit(0.10);
  assert.ok(Math.abs(shift) <= C.MAX_SHIFT + 1e-9,
    "shift " + shift.toFixed(3) + " exceeds the cap " + C.MAX_SHIFT);
});

test("each market is corrected on its own evidence", () => {
  /* One market honest, one badly out. The honest one must not be dragged. */
  const rows = samples("honest", 0.70, 200, 140).concat(samples("wrong", 0.70, 200, 180));
  const cal = C.build(rows);
  assert.ok(Math.abs(cal.apply("honest", 0.70) - 0.70) < 0.03,
    "the calibrated market was moved: " + cal.apply("honest", 0.70));
  assert.ok(cal.apply("wrong", 0.70) > 0.75,
    "the miscalibrated market was not corrected: " + cal.apply("wrong", 0.70));
});

test("a market with too little of its own data falls back to the overall shift", () => {
  const rows = samples("big", 0.70, 300, 240).concat(samples("tiny", 0.70, 5, 5));
  const cal = C.build(rows);
  const tiny = cal.apply("tiny", 0.70);
  assert.ok(tiny > 0.70, "should still get the overall correction, got " + tiny);
  assert.ok(tiny < 0.95, "but not its own five-sample one, got " + tiny);
});

test("nothing in, identity out", () => {
  for (const input of [null, undefined, [], [{}], [{ tip: "x" }]]) {
    const cal = C.build(input);
    assert.strictEqual(cal.apply("x", 0.62), 0.62, "empty input must be a no-op");
  }
});

test("junk probabilities are passed through untouched", () => {
  const cal = C.build(samples("t", 0.70, 200, 160));
  for (const bad of [null, undefined, NaN, "0.7"]) {
    assert.strictEqual(cal.apply("t", bad), bad);
  }
});

test("the correction never produces an impossible probability", () => {
  const cal = C.build(samples("t", 0.95, 400, 400));
  for (const p of [0.001, 0.5, 0.99, 0.9999]) {
    const out = cal.apply("t", p);
    assert.ok(out > 0 && out < 1, p + " became " + out);
  }
});

test("it reports what it did, so a silent adjustment is not possible", () => {
  const cal = C.build(samples("Over 1.5", 0.83, 120, 113));
  const lines = cal.report().join("\n");
  assert.match(lines, /calibration: overall shift/);
  assert.match(lines, /Over 1\.5: shift/);
  assert.match(lines, /n=120/);
});

/* The real numbers, so the premise stays checkable rather than becoming
   folklore in a comment. */
test("the measured Over 1.5 bias would be materially corrected", () => {
  /* 52 results, predicted 83.4%, landed 94.2% - 49 of 52. */
  const cal = C.build(samples("Over 1.5", 0.834, 52, 49));
  const out = cal.apply("Over 1.5", 0.834);
  assert.ok(out > 0.85,
    "a +10.8 point bias on 52 samples should move the number, got " + (out * 100).toFixed(1));
  assert.ok(out < 0.942,
    "but shrinkage must stop it jumping straight to the observed rate, got " +
    (out * 100).toFixed(1));
});

/* ---------------------------------------------------------- the feedback trap */

/**
 * The one invariant that keeps this honest.
 *
 * Fixtures publish the CORRECTED probability; graded results must keep the RAW
 * one. If results ever stored the corrected figure, every build would fit a
 * correction on top of the last one and the adjustment would walk away from
 * reality a little further each day - a runaway loop that looks like learning
 * and is not.
 */
const fs = require("fs");
const path = require("path");
const buildSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");

test("graded results store the RAW probability, never the corrected one", () => {
  assert.match(buildSrc, /tip_p: rr\(tp\.p\)/,
    "the grading loop must store the model's own probability");
  assert.doesNotMatch(buildSrc, /tip_p: rr\(tipPcal\)|tip_p: rr\(calibrator/,
    "storing the corrected probability on a result creates a runaway feedback loop");
});

test("the correction is fitted before any fixture is priced", () => {
  const fitAt = buildSrc.indexOf("const calibrator = CAL.build(");
  const useAt = buildSrc.indexOf("calibrator.apply(tip.label");
  assert.ok(fitAt > 0 && useAt > 0, "both the fit and its use must exist");
  assert.ok(fitAt < useAt,
    "the calibrator is used before it is built - the grading loop has to come first");
});

test("the fit draws only on results, which carry raw probabilities", () => {
  const m = /const calibrator = CAL\.build\(([\s\S]{0,220})/.exec(buildSrc);
  assert.ok(m, "calibrator construction not found");
  assert.match(m[1], /results/,
    "it must be fitted on the graded results, not on anything carrying published figures");
});
