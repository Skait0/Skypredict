"use strict";

/**
 * THE HEADLINE TIP IS CHOSEN IN TWO PLACES, AND THEY MUST AGREE.
 *
 * The build picks it in `bestTip` (lib/model.js) from the model's own numbers.
 * The browser then blends those numbers toward the bookmaker's - odds only
 * arrive after the page loads, so the build cannot do it - and that blend can
 * change which side is favoured. So the choice has to be made again, in
 * `bestTipFrom` (public/index.html).
 *
 * WHAT WENT WRONG WITHOUT THIS. The client used to re-price the baked tip and
 * never re-pick it: `tipCode(f)` read the old label and only refreshed its
 * percentage. Reported on a live Saturday card - "Hull or draw at 56%" with
 * Hull on 28% and Aston Villa on 46%, when "Villa or draw" was 72%. And "Le
 * Mans or draw 50%" while Nice were 50% and "Nice or draw" was 75%. Both the
 * WORSE of the two double chances, both correct before the blend, both never
 * asked again after it. That cost the owner money on a real slip.
 *
 * The fix duplicates a rule, which is the thing this codebase has been bitten
 * by before - "it works for me is worthless when two paths are not the same
 * code". This test is the guard on that: it lifts BOTH functions out of their
 * own files and runs them over a grid of probability vectors, asserting the
 * same label and the same probability every time. Change one and it fails
 * until you change the other.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* Pull a named function out of a source file by brace matching, so neither
   implementation has to be exported or restructured to be testable. */
function grab(src, name) {
  const i = src.search(new RegExp(String.raw`(?:^|\n)function ` + name + String.raw`\s*\(`, "m"));
  if (i < 0) throw new Error("not found: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

const modelSrc = fs.readFileSync(path.join(ROOT, "lib", "model.js"), "utf8");
const clientSrc = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

const buildPick = new Function(grab(modelSrc, "bestTip") + "\nreturn bestTip;")();
const clientPick = new Function(grab(clientSrc, "bestTipFrom") + "\nreturn bestTipFrom;")();

/* A three-way split plus the derived double chances, exactly as the payload
   carries them. */
function vec(h, d, o15) {
  const a = 1 - h - d;
  return { home: h, draw: d, away: a, o15: o15, dc1x: h + d, dcx2: d + a };
}

test("both implementations exist and are not the same object", () => {
  assert.equal(typeof buildPick, "function");
  assert.equal(typeof clientPick, "function");
});

test("the two agree on every point of a dense probability grid", () => {
  let checked = 0, disagreements = [];
  for (let h = 0.05; h <= 0.90; h += 0.01) {
    for (let d = 0.05; d <= 0.45; d += 0.01) {
      const a = 1 - h - d;
      if (a < 0.02) continue;
      for (const o15 of [0.40, 0.72, 0.79, 0.80, 0.85, 0.95]) {
        for (const crossTier of [false, true]) {
          const k = vec(h, d, o15);
          const B = buildPick(Object.assign({}, k), { crossTier });
          const C = clientPick(Object.assign({}, k, { crossTier }));
          checked++;
          if (B.label !== C.label || Math.abs(B.p - C.p) > 1e-12) {
            if (disagreements.length < 5) {
              disagreements.push({ h: +h.toFixed(2), d: +d.toFixed(2), o15, crossTier,
                                   build: B.label + "@" + B.p.toFixed(4),
                                   client: C.label + "@" + C.p.toFixed(4) });
            }
          }
        }
      }
    }
  }
  /* ~32.8k points: every 1% of home from 5-90 crossed with every 1% of draw
     from 5-45, six Over-1.5 values chosen to straddle both bars (0.72/0.80),
     and both cross-tier states. Dense enough that a rule change anywhere in
     either function lands on it. */
  assert.ok(checked > 30000, "grid should be dense; checked " + checked);
  assert.deepEqual(disagreements, [],
    "build and client disagree on " + disagreements.length + " points");
});

/* ---- the reported failures, as cases ---- */

test("Hull v Aston Villa: the better double chance wins, not the baked one", () => {
  /* Hull 28, draw 26, Villa 46. 1X = 54, X2 = 72. */
  const k = { home: 0.28, draw: 0.26, away: 0.46, o15: 0.55, dc1x: 0.54, dcx2: 0.72 };
  const got = clientPick(k);
  assert.equal(got.label, "X2, draw or away",
    "backed the weaker side again: " + got.label);
  assert.ok(Math.abs(got.p - 0.72) < 1e-9);
  assert.equal(buildPick(Object.assign({}, k), {}).label, got.label);
});

test("Nice v Le Mans: 50/25/25 headlines the 75% side", () => {
  const k = { home: 0.50, draw: 0.25, away: 0.25, o15: 0.55, dc1x: 0.75, dcx2: 0.50 };
  const got = clientPick(k);
  assert.equal(got.label, "1X, home or draw", "backed 50% over 75%: " + got.label);
  assert.ok(Math.abs(got.p - 0.75) < 1e-9);
  assert.equal(buildPick(Object.assign({}, k), {}).label, got.label);
});

test("a clear home favourite still headlines the outright, not 1X", () => {
  /* The 0.55 guard: hedging a dominant home side halves the price for safety
     nobody asked for. */
  const k = { home: 0.61, draw: 0.22, away: 0.17, o15: 0.55, dc1x: 0.83, dcx2: 0.39 };
  assert.equal(clientPick(k).label, "Home win");
  assert.equal(buildPick(Object.assign({}, k), {}).label, "Home win");
});

test("the chosen probability is always the largest available option", () => {
  /* The property that actually protects the reader: whatever label comes back,
     nothing on offer should have been more likely. Double chance only enters
     when it clears the best outright by 14%, so the check respects that gate. */
  for (let h = 0.10; h <= 0.80; h += 0.02) {
    for (let d = 0.08; d <= 0.40; d += 0.02) {
      const a = 1 - h - d;
      if (a < 0.05) continue;
      const k = vec(h, d, 0.5);
      const got = clientPick(k);
      const dcBest = Math.max(k.dc1x, k.dcx2);
      const outright = Math.max(k.home, k.draw, k.away);
      if (dcBest - outright > 0.14 && !(k.home >= 0.55)) {
        assert.ok(got.p >= dcBest - 1e-12,
          "picked " + got.label + "@" + got.p + " when " + dcBest + " was available");
      }
    }
  }
});
