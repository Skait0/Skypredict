"use strict";
/* THE FALLBACK IS THE FEATURE.
 *
 * This file must never be the reason the site fails to build. A missing,
 * empty or broken data/country-offsets.json has to produce EXACTLY the numbers
 * the site produces today - which is why these assertions compare against a
 * recomputed coefficient value rather than a constant typed in here. A test
 * that hardcodes 0.106 keeps passing when countryHandicap stops being called
 * at all; this codebase has shipped that bug before. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const B = require("../lib/build.js");
const E = require("../lib/euroffsets.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "offsets-"));
const write = (name, body) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, body);
  return p;
};
const artefact = (countries) => JSON.stringify({
  generated: "2026-09-07", seasons: ["2025-26"], shrinkageK: 40,
  anchor: "England", countries,
});

/* What the coefficient arithmetic alone would say - the behaviour we must
   degrade to. */
const fromCoefficient = (country) => {
  const c = B.UEFA_COEFFICIENT[country];
  return Math.min(B.COUNTRY_CAP, Math.max(0,
    0.5 * (Math.log(B.UEFA_COEFFICIENT.England) - Math.log(c))));
};

test("a fitted offset is what countryHandicap returns", () => {
  E._loadFrom(write("good.json", artefact({
    Spain: { offset: 0.2222, prior: 0.1062, matches: 38, clamped: false },
  })));
  assert.equal(B.countryHandicap("Spain"), 0.2222,
    "countryHandicap must actually consult the artefact, not merely load it");
});

test("a fitted offset changes tierEdge for a cross-border pair", () => {
  /* The caller is what matters. An offset nothing reads is not a feature. */
  E._loadFrom(write("wide.json", artefact({
    Spain: { offset: 0.60, prior: 0.1062, matches: 38, clamped: false },
  })));
  const wide = B.tierEdge("England Premier League", "Spain La Liga 1");
  E._loadFrom(write("narrow.json", artefact({
    Spain: { offset: 0.10, prior: 0.1062, matches: 38, clamped: false },
  })));
  const narrow = B.tierEdge("England Premier League", "Spain La Liga 1");
  assert.notEqual(wide, narrow, "the offset has to reach tierEdge, not stop at countryHandicap");
  assert.ok(wide > narrow);
});

test("a country absent from the artefact keeps the imported number", () => {
  E._loadFrom(write("partial.json", artefact({
    Spain: { offset: 0.2222, prior: 0.1062, matches: 38, clamped: false },
  })));
  assert.ok(Math.abs(B.countryHandicap("Norway") - fromCoefficient("Norway")) < 1e-9);
});

test("Russia, which can never be fitted, is unchanged", () => {
  E._loadFrom(null);
  assert.ok(Math.abs(B.countryHandicap("Russia") - fromCoefficient("Russia")) < 1e-9);
  assert.equal(B.countryHandicap("Russia"), B.COUNTRY_CAP, "0.886 raw, clamped to the cap");
});

test("a missing, empty or broken file degrades to today's behaviour and never throws", () => {
  const cases = [
    null,
    write("empty.json", ""),
    write("broken.json", "{ this is not json"),
    write("wrongshape.json", JSON.stringify({ countries: "nonsense" })),
    path.join(tmp, "does-not-exist.json"),
  ];
  for (const p of cases) {
    assert.doesNotThrow(() => E._loadFrom(p));
    assert.ok(Math.abs(B.countryHandicap("Spain") - fromCoefficient("Spain")) < 1e-9,
      "a bad artefact must leave the site exactly as it is today");
  }
});

test("a country with no coefficient is still refused, never treated as equal", () => {
  E._loadFrom(null);
  assert.equal(B.countryHandicap("Brazil"), null);
  assert.equal(B.countryHandicap(""), null);
});

test("the artefact cannot introduce a country we hold no coefficient for", () => {
  E._loadFrom(write("intruder.json", artefact({
    Narnia: { offset: 0.20, prior: 0.20, matches: 9, clamped: false },
  })));
  assert.equal(B.countryHandicap("Narnia"), null,
    "non-UEFA countries keep being refused; the artefact is not a back door");
});
