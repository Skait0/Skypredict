"use strict";
/* Each league's own home edge (owner, 30 Sep 2026: the NPFL's home side wins
 * 64% and the model, with one shared edge, called Sporting Lagos v Ikorodu
 * City 40/29/31). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../lib/model.js");

/* Two leagues of eight identical clubs; in "Fortress" the home side always
   scores two more than in "Level". */
function season() {
  const out = [], day = 86400000, t0 = Date.UTC(2026, 0, 1);
  let n = 0;
  for (const [lg, bonus] of [["Level", 0], ["Fortress", 2]]) {
    for (let r = 0; r < 6; r++) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      if (i === j) continue;
      out.push({ date: new Date(t0 + (n++ % 200) * day), league: lg,
        home: lg + i, away: lg + j, hg: 1 + bonus, ag: 1 });
    }
  }
  return out;
}

test("a league whose home sides win more gets its own home edge", () => {
  const ms = season();
  const on = M.fitModel(ms, { reg: 35, xgWeight: 0, leagueHadvReg: 30 });
  const off = M.fitModel(ms, { reg: 35, xgWeight: 0 });
  const l = on.index.lIdx;
  assert.ok(on.lhadv[l.Fortress] > on.lhadv[l.Level] + 0.3, "Fortress earns a bigger home edge");
  assert.ok(off.lhadv.every((x) => x === 0), "unset means the old model: no league edges");
  const pOn = M.predictTotals(on, "Fortress0", "Fortress1", "Fortress");
  const pOff = M.predictTotals(off, "Fortress0", "Fortress1", "Fortress");
  assert.ok(pOn.lh / pOn.la > pOff.lh / pOff.la, "the prediction uses it");
});

test("the build fits with it", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /leagueHadvReg: 30,/);
  assert.match(src, /M\.fitModel\(matches, \{[^}]*leagueHadvReg: cfg\.leagueHadvReg/);
});
