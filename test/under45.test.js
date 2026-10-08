"use strict";

/**
 * Under 4.5: a pick readers can add, never a board tip (owner, 8 Oct 2026).
 *
 * Held out over 5,447 matches (fit before 8 Aug, graded to 7 Oct): calls at
 * 93% and up landed 94.5%, the 80-90% band ran about three points hot. The
 * model already prices every scoreline, so this is one more read of the same
 * matrix - checked here against the matrix itself, and against the grader at
 * the line.
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

test("o45 is the five-or-more tail of the model's own scoreline matrix", () => {
  const m = M.scoreMatrix(1.6, 1.2, 8);
  const k = M.markets({ matrix: m, lh: 1.6, la: 1.2, total: 2.8 }, { drawBoost: 0 });
  let tail = 0;
  m.forEach((row, i) => row.forEach((p, j) => { if (i + j >= 5) tail += p; }));
  assert.ok(Math.abs(k.o45 - tail) < 1e-9, "o45 " + k.o45 + " vs tail " + tail);
  assert.ok(k.o45 < k.o35 && k.o45 > 0, "a higher line is always the rarer one");
});

test("the page grades Under 4.5 at the line: four goals wins, five loses", () => {
  const gradeLeg = new Function(grab("gradeLeg") + "\nreturn gradeLeg;")();
  assert.strictEqual(gradeLeg({}, "UNDER_4.5", 2, 2), true);
  assert.strictEqual(gradeLeg({}, "UNDER_4.5", 3, 1), true);
  assert.strictEqual(gradeLeg({}, "UNDER_4.5", 3, 2), false);
  assert.strictEqual(gradeLeg({}, "UNDER_4.5", 0, 5), false);
});

test("it is a pick and a chip, never the board's tip", () => {
  assert.ok(src.includes('opt("Under 4.5 goals",f.o45==null?null:1-f.o45,f.o45!=null&&(1-f.o45)>=.9,"UNDER_4.5",id)'),
    "the match's options offer it with an add button");
  assert.match(src, /\{k:"u45", label:"Under 4\.5", tier:0,/, "the builders' chip");
  assert.match(src, /o35:false,u45:false,fh:false/, "off by default in the Slider and the Wizard");
  const build = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.doesNotMatch(build, /UNDER_4\.5/, "the build never makes it the headline tip");
});
