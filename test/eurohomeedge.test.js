"use strict";
/**
 * THE VENUE TERM HAS TO REACH A FIXTURE, NOT JUST THE LOADER.
 *
 * This repo has shipped three bugs past green tests that asserted on source
 * strings or on inputs the test built itself. So this file drives the thing
 * the board actually calls - M.predictTotals with the edge lib/build.js hands
 * it - and checks the goals move in opposite directions for the two sides.
 *
 * What is being added, and why it is not a country offset: over the committed
 * corpus of 618 cross-border matches, home sides scored 7.0% above the model's
 * expectation and away sides 4.8% below it. A country offset flips sign when
 * the same two clubs swap venues, so it cannot express that; a venue term can,
 * and the two are separable as long as countries play about as often at home
 * as away, which every country in the corpus does within 0.14.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const M = require("../lib/model.js");
const E = require("../lib/euroffsets.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "homeedge-"));
const write = (name, body) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, body);
  return p;
};
const artefact = (extra) => JSON.stringify(Object.assign({
  generated: "2026-09-07", seasons: ["2025-26"], shrinkageK: 5, anchor: "England",
  countries: { Spain: { offset: 0.20, prior: 0.10, matches: 40, clamped: false } },
}, extra));

/* A model with everything at zero, so the only thing that can move a goal
   expectation is the edge the board passes in. */
const model = {
  index: { tIdx: { H: 0, A: 1 }, lIdx: { "England Premier League": 0 } },
  att: [0, 0], def: [0, 0], lgI: [Math.log(1.4)], hadv: 0.2, k: 200,
};
const at = (edge) => M.predictTotals(model, "H", "A", "England Premier League", edge);

test("the loader reports the venue term the artefact carries", () => {
  E._loadFrom(write("with.json", artefact({ homeEdge: 0.0588 })));
  assert.equal(E.homeEdge(), 0.0588);
});

test("an artefact from before this existed prices exactly as it did", () => {
  E._loadFrom(write("without.json", artefact({})));
  assert.equal(E.homeEdge(), 0,
    "a missing venue term is zero, never a guess - an older artefact must not " +
    "start moving European ties on its own");
});

test("no artefact at all is zero, not an error", () => {
  E._loadFrom(null);
  assert.equal(E.homeEdge(), 0);
  E._loadFrom(write("broken.json", "{ not json"));
  assert.equal(E.homeEdge(), 0);
});

test("a corrupt venue term is bounded rather than trusted", () => {
  /* One number that moves every European tie at once. A typo in the artefact
     must not be able to double the goals on the whole competition. */
  E._loadFrom(write("wild.json", artefact({ homeEdge: 9 })));
  assert.equal(E.homeEdge(), 0.5, "clamped to the same +-0.5 the fit uses");
  E._loadFrom(write("nan.json", artefact({ homeEdge: "lots" })));
  assert.equal(E.homeEdge(), 0, "a non-number is no term at all");
});

test("it moves the two sides in opposite directions, like the edge does", () => {
  const flat = at(0);
  const bumped = at(0.0588);
  assert.ok(bumped.lh > flat.lh, "the home side must gain");
  assert.ok(bumped.la < flat.la, "and the away side must lose");
  /* +v home and -v away, exactly. */
  assert.ok(Math.abs(bumped.lh - flat.lh * Math.exp(0.0588)) < 1e-9);
  assert.ok(Math.abs(bumped.la - flat.la * Math.exp(-0.0588)) < 1e-9);
});

test("it is nearly neutral on the total, which is what the board tips on", () => {
  /* European ties get goals markets and nothing else, so the interesting
     question is what this does to lh+la. Between two evenly matched sides it
     very nearly cancels: a 6% shift each way is a 0.2% change in the total. */
  const flat = at(0), bumped = at(0.0588);
  const move = Math.abs(bumped.total - flat.total) / flat.total;
  assert.ok(move < 0.01,
    "the venue term redistributes goals rather than adding them; moved " +
    (move * 100).toFixed(2) + "%");
});

test("the board adds it for a cross-border tie and never for a domestic one", () => {
  /* Read from lib/build.js rather than reimplemented here: the failure this
     guards is the term being wired into the wrong branch, where it would move
     every cup tie in England. */
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  const m = /crossCountry = 1;([\s\S]{0,900}?)\n\s*\}/.exec(src);
  assert.ok(m, "the cross-border branch has moved - find it before trusting this");
  assert.match(m[1], /edge \+= EUROFF\.homeEdge\(\)/,
    "the venue term must be added inside the cross-border branch");
  const before = src.slice(0, src.indexOf("crossCountry = 1;"));
  assert.ok(!/EUROFF\.homeEdge\(\)/.test(before),
    "and nowhere earlier, or domestic fixtures would carry it too");
});
