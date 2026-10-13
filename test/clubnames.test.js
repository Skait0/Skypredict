"use strict";
/* One name, two clubs, two countries (30 Sep 2026): Arsenal of England and
 * Arsenal Dzerzhinsk of Belarus were fitted as one team. */
const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");
const M = require("../lib/model.js");

function m(league, home, away) { return { date: new Date("2026-09-01"), league, home, away, hg: 1, ag: 0 }; }

test("a name in two countries becomes two clubs, and each fixture finds its own", () => {
  const ms = [
    m("England Premier League", "Arsenal", "Chelsea"),
    m("Belarus Vysshaya Liga", "Arsenal", "Dinamo Minsk"),
    m("England Premier League", "Chelsea", "Liverpool"),
  ];
  assert.deepStrictEqual(B.disambiguateClubs(ms), ["Arsenal"]);
  assert.strictEqual(ms[0].home, "Arsenal [England]");
  assert.strictEqual(ms[1].home, "Arsenal [Belarus]");
  assert.strictEqual(ms[2].home, "Chelsea", "a name in one country is left alone");

  const idx = M.buildIndex(ms);
  idx.clubPick = B.clubPicks(idx);
  const epl = idx.lIdx["England Premier League"], bel = idx.lIdx["Belarus Vysshaya Liga"];
  assert.strictEqual(M.matchTeam(idx, "Arsenal", epl), "Arsenal [England]");
  assert.strictEqual(M.matchTeam(idx, "Arsenal", bel), "Arsenal [Belarus]");
  assert.strictEqual(M.matchTeam(idx, "Arsenal", null, "Belarus"), "Arsenal [Belarus]", "a Belarus cup");
  assert.strictEqual(M.matchTeam(idx, "Arsenal", null, "International"), "Arsenal [England]",
    "a European tie goes to the stronger UEFA country");
  assert.strictEqual(M.matchTeam(idx, "Chelsea", epl), "Chelsea");
  assert.strictEqual(B.plainClub("Arsenal [England]"), "Arsenal", "readers never see the key");
});

test("a clash nothing settles is refused, never matched to either club by resemblance", () => {
  const ms = [m("Guatemala Liga Nacional", "Comunicaciones", "Mixco"),
              m("Argentina Primera B", "Comunicaciones", "Flandria")];
  B.disambiguateClubs(ms);
  const idx = M.buildIndex(ms);
  idx.clubPick = B.clubPicks(idx);
  assert.strictEqual(M.matchTeam(idx, "Comunicaciones", null, "International"), null);
});
