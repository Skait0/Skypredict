"use strict";
/* The server's leg grader (lib/legrade.js) must agree with the page's gradeLeg on
   every market the page settles, and add only the half-time markets. Driven off
   the real page source, so the two cannot drift. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const LG = require("../lib/legrade.js");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\("));
  assert.ok(i >= 0, "not found: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}
const page = new Function(grab("nr3Grade") + grab("gradeLeg") + "\nreturn gradeLeg;")();

/* Every market code the page knows, read out of its own switch and regexes. */
const CODES = [...new Set(src.slice(src.indexOf("function gradeLeg("), src.indexOf("function mLabel(")).match(/case"([^"]+)"/g)
  .map((m) => m.slice(5, -1)))]
  .concat(["AH_1_-0.5", "AH_2_1.5", "AH_1_0", "AH_1_-1", "AH_2_-0.25", "DNB_1", "DNB_2",
    "CORNERS_OV_9.5", "CORNERS_UN_8.5", "CORNERS_H_OV_4.5", "CORNERS_A_OV_2.5", "CORNERS_OV_9",
    "SHOTS_OV_24.5", "SHOTS_UN_19.5", "SHOTS_H_OV_12.5", "SHOTS_A_OV_9.5", "NOPE"]);
const SCORES = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [3, 0], [0, 3], [3, 1], [4, 2], [2, 2], [5, 0]];
const STATS = [null, { hc: 6, ac: 5, hsh: 14, ash: 9 }, { hc: 2, ac: 1, hsh: 7, ash: 3 }, { hc: -1, ac: 4 }, { seq: "HHAH" }, { seq: "HHHA" }];

test("the server grades every market exactly as the page does", () => {
  let n = 0;
  for (const c of CODES) for (const [hg, ag] of SCORES) for (const st of STATS) {
    const want = page(null, c, hg, ag, st);
    const got = LG.gradeLeg(c, Object.assign({ hg, ag }, st || {}));
    assert.strictEqual(got, want, c + " " + hg + "-" + ag + " " + JSON.stringify(st));
    n++;
  }
  assert.ok(n > 2000 && CODES.length > 50, "the matrix is too small to mean anything: " + n);
});

test("first half and win either half are settled from the half-time score", () => {
  const row = (hg, ag, hth, hta) => ({ hg, ag, hth, hta });
  assert.strictEqual(LG.gradeLeg("FH_OVER_0.5", row(1, 0, 1, 0)), true);
  assert.strictEqual(LG.gradeLeg("FH_OVER_0.5", row(1, 0, 0, 0)), false);
  assert.strictEqual(LG.gradeLeg("FH_OVER_0.5", { hg: 1, ag: 0 }), null, "no half-time score: unknown, never a guess");
  assert.strictEqual(LG.gradeLeg("FH_OVER_0.5", row(1, 0, 2, 0)), null, "a half-time score bigger than the final is not this match");
  /* Home 0-1 at the break, 2-1 at the end: lost the first half, won the second 2-0. */
  assert.strictEqual(LG.gradeLeg("WINHALF_H_Y", row(2, 1, 0, 1)), true);
  assert.strictEqual(LG.gradeLeg("WINHALF_A_Y", row(2, 1, 0, 1)), true);
  assert.strictEqual(LG.gradeLeg("WINHALF_H_N", row(2, 1, 0, 1)), false);
  assert.strictEqual(LG.gradeLeg("WINHALF_A_Y", row(1, 1, 1, 0)), true, "home won the first half 1-0, away the second 1-0");
  assert.strictEqual(LG.gradeLeg("WINHALF_H_Y", row(0, 0, 0, 0)), false);
  assert.strictEqual(LG.gradeLeg("OVER_2.5", { hg: 2, ag: 1 }), true, "a full-time market ignores a missing half-time score");
});

test("API-Football's half-time score is kept on every finished fixture", () => {
  const O = require("../lib/oracle.js");
  const rows = O.parseFixtures({ response: [
    { fixture: { id: 7, status: { short: "FT" } }, teams: { home: { name: "A" }, away: { name: "B" } },
      score: { fulltime: { home: 2, away: 1 }, halftime: { home: 0, away: 1 } }, league: { name: "L" } },
    { fixture: { id: 8, status: { short: "FT" } }, teams: { home: { name: "C" }, away: { name: "D" } },
      score: { fulltime: { home: 1, away: 0 } }, league: { name: "L" } }] });
  assert.deepStrictEqual(rows.map((r) => [r.hth, r.hta]), [[0, 1], [null, null]]);
});
