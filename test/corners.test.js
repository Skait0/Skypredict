"use strict";

/* Corners: the rates, the tail, and the two copies of the arithmetic.
 *
 * The thing most worth pinning here is that the page and the build compute the
 * same number. The fixture carries two rates and nothing else, so every corners
 * line a reader sees is worked out in the browser from a formula that also
 * lives in lib/corners.js - and a mirrored formula that drifts is a bug nobody
 * sees until a slip is judged wrong. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const C = require("../lib/corners.js");
const M = require("../lib/model.js");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
const grab = (name) => {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error(name + " is gone from index.html");
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error(name + " never closes");
};

/* -------------------------------------------------------------- the columns */

test("the corners columns are read off the file the build already downloads", () => {
  /* Main layout carries HC and AC beside HST and AST. Parsed here through the
     shipped normalise, in the real column order, so a header rename upstream
     fails this rather than silently unpricing the board. */
  const rows = [
    ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "HTHG", "HTAG", "HST", "AST", "HC", "AC"],
    ["E0", "16/08/2026", "Arsenal", "Chelsea", "2", "1", "1", "0", "5", "3", "7", "4"],
  ];
  const out = M.normalise(rows);
  assert.equal(out.matches.length, 1, out.error || "");
  assert.equal(out.matches[0].hc, 7);
  assert.equal(out.matches[0].ac, 4);

  /* The extra files have no such column, and must come back null rather than
     zero - a league with "0 corners every match" would price every under at
     one. */
  const extra = M.normalise([
    ["Country", "League", "Date", "Home", "Away", "HG", "AG"],
    ["Argentina", "Liga Profesional", "16/08/2026", "Boca Juniors", "River Plate", "1", "1"],
  ]);
  assert.equal(extra.matches.length, 1, extra.error || "");
  assert.equal(extra.matches[0].hc, null);
  assert.equal(extra.matches[0].ac, null);
});

/* ------------------------------------------------------------------ the fit */

/* A league built to a known shape, so the fit can be checked against the
   answer rather than against itself. Home sides win 6, away 4, except one
   heavy home team that wins 10 and one leaky defence that concedes 9. */
function season(opts) {
  const o = opts || {};
  const teams = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const out = [];
  const day = 86400000;
  let d = Date.now() - 300 * day;
  for (let round = 0; round < 24; round++) {
    for (let i = 0; i < teams.length; i += 2) {
      const h = teams[(i + round) % teams.length], a = teams[(i + 1 + round) % teams.length];
      if (h === a) continue;
      let hc = 6, ac = 4;
      if (h === "A") hc = 10;                       /* a corner machine at home */
      if (a === "H") hc += 3;                       /* and a defence that invites them */
      out.push({ date: new Date(d), league: "Test League", home: h, away: a,
        hg: 1, ag: 1, hc: o.blank ? null : hc, ac: o.blank ? null : ac });
      d += day;
    }
  }
  return out;
}

test("a team's own corner rate is recovered, and a league with no column is refused", () => {
  const m = C.fitCorners(season());
  assert.ok(m, "a full season of corners fitted to nothing");
  const plain = C.cornersFor(m, "B", "C", "Test League");
  const machine = C.cornersFor(m, "A", "C", "Test League");
  assert.ok(machine.ch > plain.ch * 1.2,
    "the team that wins ten corners at home must price above the one that wins six");
  const leaky = C.cornersFor(m, "B", "H", "Test League");
  assert.ok(leaky.ch > plain.ch, "and a defence that concedes them must lift the other side");

  /* The whole point of the null: no column, no rate, no price. */
  assert.equal(C.fitCorners(season({ blank: true })), null,
    "a league whose file carries no corners must fit to nothing at all");
  assert.equal(C.cornersFor(m, "Boca Juniors", "River Plate", "Argentina Liga Profesional"), null,
    "a team we hold no corners for must not be priced off somebody else's league");
});

test("the spread is measured from the sample, never assumed", () => {
  /* A perfectly regular league cannot be over-dispersed, and the fit must not
     answer with a negative k when the variance sits at or under the mean. */
  const flat = C.fitCorners(season());
  assert.ok(flat.k > 0 && isFinite(flat.k), "k must stay a usable number on flat data");

  /* Now a league that alternates quiet and wild matches: same mean, far more
     spread, so k has to come down. */
  const wild = season().map((m, i) => ({ ...m, hc: i % 2 ? 1 : 11, ac: i % 2 ? 1 : 7 }));
  const w = C.fitCorners(wild);
  assert.ok(w.k < flat.k, "a wilder league must fit a smaller k, not the same one");
  assert.ok(w.dispersion > 1, "and it must report itself as over-dispersed");
});

/* ----------------------------------------------------------------- the tail */

test("the tail behaves like a distribution", () => {
  const k = 20, lam = 10;
  const over = (l) => C.overProb(lam, k, l);
  assert.ok(over(9.5) > over(10.5) && over(10.5) > over(11.5),
    "a higher line must be less likely, every time");
  assert.ok(over(9.5) > 0.4 && over(9.5) < 0.6,
    "the line at the mean should sit near even, and does not");
  assert.ok(over(0.5) > 0.99, "almost every match has a corner");
  assert.equal(C.overProb(0, k, 9.5), null, "no rate, no answer");
  assert.equal(C.overProb(lam, 0, 9.5), null, "no spread, no answer");

  /* Over-dispersion is the reason this is not a plain Poisson: it has to put
     more weight in both tails than Poisson does at the same mean. */
  const disp = C.overProb(lam, 3, 15.5), tight = C.overProb(lam, 500, 15.5);
  assert.ok(disp > tight * 1.5,
    "a wide k must price the outer line well above a tight one, or the mixture does nothing");
});

test("the page and the build compute the same corners number", () => {
  /* The mirrored copy, lifted out of index.html and run against ours over the
     whole grid both books quote. Anything above a tenth of a point apart would
     show up as a slip judged differently from the record that grades it. */
  const page = new Function(grab("cLgamma") + grab("cornersOver") + "return cornersOver;")();
  let worst = 0, checked = 0;
  [4, 12, 40, 200].forEach((k) => {
    [6, 8.4, 10.1, 13].forEach((lam) => {
      [3.5, 6.5, 7.5, 9.5, 12.5, 14.5].forEach((line) => {
        const a = C.overProb(lam, k, line), b = page(lam, k, line);
        worst = Math.max(worst, Math.abs(a - b)); checked++;
      });
    });
  });
  assert.equal(checked, 96);
  assert.ok(worst < 1e-12, "the two copies disagree by " + worst);
});

/* ------------------------------------------------------- what the page sees */

function prices(fixture, k) {
  return new Function("f", "DATA",
    grab("cLgamma") + grab("cornersOver") + grab("cornersK") + grab("mProb") +
    "return function(c){return mProb(f,c);};")(fixture, { cornersK: k });
}

test("every corners line either book sells is priced, and the unders agree", () => {
  const f = { ch: 5.4, ca: 4.2 };
  const p = prices(f, 18);
  ["6.5", "7.5", "8.5", "9.5", "10.5", "11.5", "12.5"].forEach((line) => {
    const ov = p("CORNERS_OV_" + line), un = p("CORNERS_UN_" + line);
    assert.ok(ov > 0 && ov < 1, line + " priced outside 0..1");
    assert.ok(Math.abs(ov + un - 1) < 1e-12,
      line + ": over and under must be one bet and its opposite");
  });
  /* Per side, off that side's own rate - and the home team wins more here, so
     its line must price above the away one. */
  assert.ok(p("CORNERS_H_OV_4.5") > p("CORNERS_A_OV_4.5"),
    "the side with the higher rate must carry the higher chance");
  /* The total is both sides together, so it must beat either alone. */
  assert.ok(p("CORNERS_OV_6.5") > p("CORNERS_H_OV_6.5"));
});

test("a league with no corners is not priced, and neither is a board with no spread", () => {
  /* The case that matters most, because it is most of the board: Argentina,
     Brazil, MLS and the rest carry no corners column, so their fixtures carry
     no rate - and a missing rate has to reach the reader as null, not as a
     number computed off half a fixture. */
  const none = prices({ ch: null, ca: null }, 18);
  assert.equal(none("CORNERS_OV_9.5"), null);
  const halfOnly = prices({ ch: 5.4, ca: null }, 18);
  assert.equal(halfOnly("CORNERS_OV_9.5"), null, "half a fixture is not a fixture");
  assert.ok(halfOnly("CORNERS_H_OV_4.5") > 0, "though the side we do hold still prices");
  /* And a build that fitted nothing ships no cornersK, which unprices the lot
     rather than falling back to a spread nobody measured. */
  assert.equal(prices({ ch: 5.4, ca: 4.2 }, undefined)("CORNERS_OV_9.5"), null);
});

test("the model knows it publishes corners now", () => {
  /* modelPrices is what tells the editor a null is permanent rather than a
     hole in one payload - see saferRungs. It probes the shipped mProb, so it
     must follow this market family without being told about it. */
  const knows = new Function("DATA",
    grab("cLgamma") + grab("cornersOver") + grab("cornersK") + grab("mProb") +
    "var MODEL_KNOWS={};" + grab("modelPrices") + "return modelPrices;")({ cornersK: 18 });
  assert.equal(knows("CORNERS_OV_9.5"), true);
  assert.equal(knows("CORNERS_H_OV_4.5"), true);
  assert.equal(knows("CORNERS_OV_9"), false, "a whole line is not one either book sells");
});

/* --------------------------------------------- the shape, against real data */

test("the fitted distribution matches fourteen thousand real matches", () => {
  /* Measured on 21 Sep 2026 over 14,519 main-division matches from the same
   * football-data files the build downloads - 2024-25 through 2026-27, twenty
   * divisions. Mean total 9.75, variance 11.51, so dispersion 1.18 and a
   * moment k of 53.8.
   *
   * The table is why this ships as a negative binomial rather than a Poisson.
   * At the same mean, Poisson is wrong in both directions - too generous at
   * 6.5 and far too mean at 12.5 - while the mixture lands within half a point
   * at every line either book quotes. A change to the tail arithmetic that
   * breaks this is a change that mis-prices somebody's ticket. */
  const EMPIRICAL = { 6.5: 83.2, 7.5: 73.3, 8.5: 61.9, 9.5: 50.5,
                      10.5: 38.9, 11.5: 28.6, 12.5: 20.1 };
  const mean = 9.75, k = 53.8;
  for (const line of Object.keys(EMPIRICAL)) {
    const got = 100 * C.overProb(mean, k, +line);
    assert.ok(Math.abs(got - EMPIRICAL[line]) < 1.0,
      `line ${line}: model says ${got.toFixed(1)}%, ${EMPIRICAL[line]}% of real matches went over`);
  }
  /* And the same table says a flat Poisson would not do: it misses the ends by
     more than a point in opposite directions, which is exactly the error that
     makes an outer line look like value when it is not. */
  const poisson = (line) => 100 * C.overProb(mean, 1e6, line);
  assert.ok(poisson(12.5) < EMPIRICAL[12.5] - 1.5, "Poisson should be too mean at 12.5");
  assert.ok(poisson(6.5) > EMPIRICAL[6.5] + 1.0, "and too generous at 6.5");
});
