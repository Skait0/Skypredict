"use strict";
/**
 * A COUNTRY PINNED AT THE CAP IS A COUNTRY WE CANNOT COMPARE.
 *
 * COUNTRY_CAP is 0.70 because log scaling runs away in the tail and the
 * domestic ladder's widest real step is 0.77 - so a fit that ends up sitting
 * ON the cap has not measured the gap, it has run out of room to describe it.
 * The number that comes out is a lower bound wearing an estimate's clothes.
 *
 * The corpus says how much that matters. Goals observed over expected, after
 * both the offsets and the venue term were fitted:
 *
 *   Ireland  0.474 (n=14)   Romania 0.659 (n=20)
 *   Finland  0.627 (n=14)   Switzerland 0.948 (n=39)
 *
 * Irish clubs score less than half what we predict. No wider cap fixes that
 * without pricing on a gap the model was never fitted across.
 *
 * So these ties are refused, which is not a new idea here: countryHandicap has
 * always returned null for a country with no coefficient, and null means
 * "refuse", never "treat as equal". Being unable to say is a supported answer.
 *
 * Switzerland is refused too, and that is the deliberate cost of the rule
 * rather than an oversight - it prices well today (0.948) but its fit is
 * truncated, so we do not actually know what it would have been.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const B = require("../lib/build.js");
const E = require("../lib/euroffsets.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capped-"));
const write = (name, body) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, body);
  return p;
};
const artefact = (countries) => JSON.stringify({
  generated: "2026-09-07", seasons: ["2025-26"], shrinkageK: 5,
  anchor: "England", homeEdge: 0.0573, countries,
});

const fromCoefficient = (country) => {
  const c = B.UEFA_COEFFICIENT[country];
  return Math.min(B.COUNTRY_CAP, Math.max(0,
    0.5 * (Math.log(B.UEFA_COEFFICIENT.England) - Math.log(c))));
};

test("a country whose fit hit the cap is refused, not priced at the cap", () => {
  E._loadFrom(write("pinned.json", artefact({
    Ireland: { offset: 0.70, prior: 0.70, matches: 14, clamped: true },
  })));
  assert.equal(B.countryHandicap("Ireland"), null,
    "the cap means we ran out of room to describe the gap, so we cannot price it");
});

test("and the refusal reaches the fixture, not just the handicap", () => {
  /* The caller is the point. tierEdge returning null is what makes lib/build
     drop the fixture and report it, rather than quietly pricing it flat. */
  E._loadFrom(write("pinned2.json", artefact({
    Ireland: { offset: 0.70, prior: 0.70, matches: 14, clamped: true },
  })));
  assert.equal(B.tierEdge("England Premier League", "Ireland Premier Division"), null,
    "a tie against a pinned country has no edge we can stand behind");
});

test("a country the fit could actually place is priced as normal", () => {
  E._loadFrom(write("fine.json", artefact({
    Spain: { offset: 0.173, prior: 0.106, matches: 117, clamped: false },
  })));
  assert.equal(B.countryHandicap("Spain"), 0.173);
  assert.ok(B.tierEdge("England Premier League", "Spain La Liga 1") !== null);
});

test("no evidence is not the same as pinned evidence", () => {
  /* Russia sits ON 0.70 and always will - it has been out of UEFA since 2022,
     so nothing will ever measure it. That is the imported number standing
     unopposed, which is exactly what it was before any of this existed, and
     it must keep being priced the way it is today. */
  E._loadFrom(write("russia.json", artefact({
    Russia: { offset: 0.70, prior: 0.70, matches: 0, clamped: false },
  })));
  assert.equal(B.countryHandicap("Russia"), fromCoefficient("Russia"));
  assert.equal(B.countryHandicap("Russia"), B.COUNTRY_CAP);
});

test("a country absent from the artefact still falls back to the coefficient", () => {
  E._loadFrom(write("partial2.json", artefact({
    Spain: { offset: 0.173, prior: 0.106, matches: 117, clamped: false },
  })));
  assert.ok(Math.abs(B.countryHandicap("Norway") - fromCoefficient("Norway")) < 1e-9);
});

test("a broken artefact refuses nobody the coefficient can place", () => {
  /* The failure to avoid: a corrupt file reading as "everything is clamped"
     and emptying the European board. Poland stands for the countries the
     imported arithmetic can actually place - it must price with no artefact,
     with an empty one and with a broken one. */
  for (const p of [null, write("empty2.json", ""), write("bad2.json", "{ nope")]) {
    E._loadFrom(p);
    assert.ok(Math.abs(B.countryHandicap("Poland") - fromCoefficient("Poland")) < 1e-9,
      "with no artefact, a placeable country prices exactly as it did before");
  }
});

test("the tail is refused by the arithmetic, not by a missing file", () => {
  /* Ireland's coefficient asks for 0.916, past the cap. With the artefact it is
     refused for being pinned; without one it is refused for the same reason one
     step earlier. Either way the answer is "we cannot say", never 0.70. */
  E._loadFrom(null);
  assert.equal(B.countryHandicap("Ireland"), null);
  assert.ok(0.5 * (Math.log(B.UEFA_COEFFICIENT.England) - Math.log(B.UEFA_COEFFICIENT.Ireland))
    >= B.COUNTRY_CAP);
});

test("the committed artefact refuses exactly the countries stuck at the cap", () => {
  /* Reads what actually ships, so re-running the harvest tells us straight
     away if the set has moved. */
  E._loadFrom(path.join(__dirname, "..", "data", "country-offsets.json"));
  const art = require("../data/country-offsets.json");
  const pinned = Object.keys(art.countries)
    .filter((c) => art.countries[c].clamped && art.countries[c].matches > 0).sort();
  for (const c of pinned) {
    assert.equal(B.countryHandicap(c), null, c + " is pinned and must be refused");
  }
  for (const c of Object.keys(art.countries)) {
    if (pinned.includes(c)) continue;
    assert.ok(B.countryHandicap(c) !== null, c + " is placeable and must still be priced");
  }
  assert.ok(pinned.length < 8,
    "if most of Europe is pinned the cap is wrong, not the countries: " + pinned.join(", "));
});
