"use strict";

/**
 * Over 0.5 goals: the near-certain leg a Bankers slip is built from (owner,
 * 11 Oct 2026: "yes add over 0.5 goals"). SportyBet prices it on market 18
 * total=0.5 (live 11 Oct: Liverpool v Man City x1.02, Hull v Everton x1.06).
 * A pick and a chip, never the board's tip.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../lib/model.js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.indexOf("\nfunction " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

test("o05 is one minus the 0-0 cell of the model's own matrix", () => {
  const m = M.scoreMatrix(1.6, 1.2, 8);
  const k = M.markets({ matrix: m, lh: 1.6, la: 1.2, total: 2.8 }, { drawBoost: 0 });
  assert.ok(Math.abs(k.o05 - (1 - m[0][0])) < 1e-9, "o05 " + k.o05 + " vs " + (1 - m[0][0]));
  assert.ok(k.o05 > k.o15, "a lower line is always the likelier one");
});

test("before the build ships o05 the page works it out exactly from team goals and both-score", () => {
  const o05Of = new Function(grab("o05Of") + "\nreturn o05Of;")();
  const m = M.scoreMatrix(1.4, 0.9, 8);
  const k = M.markets({ matrix: m, lh: 1.4, la: 0.9, total: 2.3 }, { drawBoost: 0 });
  const derived = o05Of({ h_o05: k.hO05, a_o05: k.aO05, btts: k.btts });
  assert.ok(Math.abs(derived - (1 - m[0][0])) < 1e-9, "P(home)+P(away)-P(both) is P(at least one goal)");
  assert.strictEqual(o05Of({ o05: 0.9, h_o05: 0.1, a_o05: 0.1, btts: 0.1 }), 0.9, "the shipped figure wins");
  assert.strictEqual(o05Of({ h_o05: 0.8 }), null, "missing parts, no guess");
});

test("the page grades Over 0.5 at the line: 0-0 loses, any goal wins", () => {
  const gradeLeg = new Function(grab("gradeLeg") + "\nreturn gradeLeg;")();
  assert.strictEqual(gradeLeg({}, "OVER_0.5", 0, 0), false);
  assert.strictEqual(gradeLeg({}, "OVER_0.5", 1, 0), true);
  assert.strictEqual(gradeLeg({}, "OVER_0.5", 0, 3), true);
});

test("it is a pick and a chip, off by default, never the board's tip, and the sweep's absence counts", () => {
  assert.match(src, /opt\("Over 0\.5 goals",o05Of\(f\)/, "the match's options offer it");
  assert.match(src, /\{k:"o05", label:"Over 0\.5", tier:0,/, "the builders' chip");
  assert.match(src, /out:true,o05:false,o15:true/, "off by default");
  assert.match(src, /"OVER_0\.5":BUILD\.mk\.o05===true/, "the slider reads the chip");
  assert.match(src, /if\(WSP\.mk\.o05\)m\.push\("OVER_0\.5"\);/, "and so does the wizard");
  const fetched = new Function("SAFE_UNPRICED", grab("fetchedMarket") + "\nreturn fetchedMarket;")({});
  assert.strictEqual(fetched("OVER_0.5"), true, "SportyBet's sweep carries it, so a missing price means not sold");
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.doesNotMatch(build, /"OVER_0\.5"/, "the build never makes it the headline tip");
});

test("o05Of is top level, not nested in mProb beside marginGe (11 Oct 2026 outage)", () => {
  /* Put next to marginGe, it landed inside mProb: the match options could not
     reach it, every paint threw, and load() retried the board every few
     seconds. grab() lifts a nested function just the same, so only the
     nesting itself can be checked. */
  const body = grab("mProb");
  assert.doesNotMatch(body, /function o05Of\(/, "o05Of must not live inside mProb");
  assert.match(src, /\nfunction o05Of\(f\)\{/, "and it exists at top level");
});

test("load() resets its retry count only after the board has painted", () => {
  const at = src.indexOf("\nasync function load(){");
  assert.ok(at > 0, "the page's load()");
  const load = src.slice(at, src.indexOf("\nfunction hideLoader(", at));
  const paint = load.indexOf("paint();"), reset = load.indexOf("LOAD_RETRY=0;");
  assert.ok(paint > 0 && reset > paint, "a paint bug must not reset the count and loop for ever");
});
