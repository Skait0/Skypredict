"use strict";
/* WHAT THIS FIT IS ALLOWED TO CLAIM.
 *
 * The mean structure is predictTotals' and tierEdge's, exactly:
 *   e   = (rung(away league) + C_away) - (rung(home league) + C_home)
 *   lh  = exp(lgI[home league] + att[h] - def[a] + hadv + e)
 *   la  = exp(lgI[home league] + att[a] - def[h] - e)
 * so the number that comes out is in the units countryHandicap hands to
 * tierEdge, and nothing has to be converted on the way in.
 *
 * England is pinned at 0 because that is the anchor COUNTRY_ANCHOR already
 * uses. Everything else is measured relative to it, shrunk toward the
 * imported coefficient by how much evidence there is.
 *
 * Russia has been banned from UEFA competitions since 2022 and will never
 * acquire evidence. It must come out carrying today's number exactly. */
const test = require("node:test");
const assert = require("node:assert");
const F = require("../lib/eurofit.js");

/* A toy world: two countries, ratings all zero, so the ONLY thing that can
   explain a goal difference is the country offset. */
const model = {
  index: { tIdx: { A1: 0, A2: 1, B1: 2, B2: 3 }, lIdx: { "Aland Top": 0, "Bland Top": 1 } },
  att: [0, 0, 0, 0], def: [0, 0, 0, 0],
  lgI: [Math.log(1.3), Math.log(1.3)], hadv: 0, k: 200,
};
const modelOf = () => model;
const rungOf = () => 0;
const isA = (t) => t === "A1" || t === "A2";
const tie = (home, away, hg, ag) => ({
  home, away, hg, ag, season: "2025-26",
  homeCountry: isA(home) ? "Aland" : "Bland",
  awayCountry: isA(away) ? "Aland" : "Bland",
  homeLeague: isA(home) ? "Aland Top" : "Bland Top",
  awayLeague: isA(away) ? "Aland Top" : "Bland Top",
});

test("a country with no evidence comes out on exactly its prior", () => {
  const out = F.fitOffsets({
    matches: [tie("A1", "A2", 1, 1)],          /* domestic - no cross-border signal */
    modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.31, Neverland: 0.55 },
    K: 40,
  });
  assert.equal(out.Neverland.matches, 0);
  assert.equal(out.Neverland.offset, 0.55,
    "a country with nothing measured must keep the imported number, unchanged");
});

test("the anchor is pinned at zero and never drifts", () => {
  const ms = [];
  for (let i = 0; i < 200; i++) ms.push(tie("A1", "B1", 4, 0));
  const out = F.fitOffsets({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.31 }, K: 1 });
  assert.equal(out.Aland.offset, 0, "England's analogue must stay the anchor");
});

test("lopsided evidence moves the weaker country away from the anchor", () => {
  /* Aland clubs beat Bland clubs 4-0, every time, home and away. */
  const ms = [];
  for (let i = 0; i < 200; i++) { ms.push(tie("A1", "B1", 4, 0)); ms.push(tie("B2", "A2", 0, 4)); }
  const out = F.fitOffsets({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.10 }, K: 1 });
  assert.ok(out.Bland.offset > 0.10,
    "with overwhelming evidence Bland is weaker than the prior said; got " + out.Bland.offset);
  assert.equal(out.Bland.matches, 400);
});

test("shrinkage: thin evidence stays near the prior, thick evidence leaves it", () => {
  const thin = [tie("A1", "B1", 4, 0), tie("B2", "A2", 0, 4)];
  const thick = [];
  for (let i = 0; i < 400; i++) { thick.push(tie("A1", "B1", 4, 0)); thick.push(tie("B2", "A2", 0, 4)); }
  const priors = { Aland: 0, Bland: 0.10 };
  const a = F.fitOffsets({ matches: thin, modelOf, rungOf, priors, K: 40 }).Bland.offset;
  const b = F.fitOffsets({ matches: thick, modelOf, rungOf, priors, K: 40 }).Bland.offset;
  assert.ok(Math.abs(a - 0.10) < Math.abs(b - 0.10),
    "two matches must move the number less than eight hundred do");
});

test("a fitted value never escapes the cap", () => {
  const ms = [];
  for (let i = 0; i < 400; i++) ms.push(tie("A1", "B1", 9, 0));
  const out = F.fitOffsets({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.10 }, K: 1, cap: 0.70 });
  assert.ok(out.Bland.offset <= 0.70);
  assert.equal(out.Bland.clamped, true, "the artefact must record that the cap bound");
});

test("the prior is the number the site ships today", () => {
  const coef = { England: 102.019, Spain: 82.493, Russia: 17.332 };
  const o = { anchor: 102.019, scale: 0.5, cap: 0.7 };
  assert.equal(F.priorFor("England", coef, o), 0);
  const spain = F.priorFor("Spain", coef, o);
  assert.ok(Math.abs(spain - 0.1062) < 0.0005, "0.5*(ln 102.019 - ln 82.493); got " + spain);
  assert.equal(F.priorFor("Russia", coef, o), 0.7,
    "Russia's raw 0.886 must clamp to the cap, as it does today");
  assert.equal(F.priorFor("Narnia", coef, o), null,
    "no coefficient means refuse, never treat as equal");
});

test("chooseK scores every K on the grid and picks by held-out deviance", () => {
  const ms = [];
  for (let i = 0; i < 300; i++) { ms.push(tie("A1", "B1", 3, 0)); ms.push(tie("B2", "A2", 0, 3)); }
  const got = F.chooseK({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.02 }, grid: [1, 40, 10000], folds: 5 });
  assert.equal(got.grid.length, 3, "every K on the grid must be scored");
  assert.ok(got.grid.every((g) => isFinite(g.deviance)));
  assert.notEqual(got.K, 10000,
    "with 600 consistent matches the fit should not be dragged back to a badly wrong prior");
});
