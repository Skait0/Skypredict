"use strict";
/**
 * Shots, off the column the build already downloads.
 *
 * football-data.co.uk's main-division rows carry HS/AS (total shots) and
 * HST/AST (on target) beside the corners. The corners fit is generic in
 * everything but the column names, so shots are that same fit pointed at
 * different columns - these tests pin that the columns are read, that the
 * corners defaults did not move when the function learned to take them, and
 * that a league with no shots column prices nothing rather than borrowing a
 * mean that is not its own.
 */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");
const C = require("../lib/corners.js");

const HEAD = "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,HTHG,HTAG,HS,AS,HST,AST,HC,AC";

function csv(rows) { return [HEAD].concat(rows).join("\n"); }

test("total shots are read from the main layout, beside the shots on target", () => {
  const res = M.normalise(M.parseCSV(csv(["E0,16/08/2025,Arsenal,Leeds,2,0,1,0,19,7,8,2,9,3"])));
  assert.ok(!res.error, res.error);
  const m = res.matches[0];
  assert.equal(m.hs, 19);
  assert.equal(m.as, 7);
  assert.equal(m.hst, 8);
  assert.equal(m.ast, 2);
});

test("a file with no shots column leaves them absent, not zero", () => {
  /* Absent is what makes the fit skip the row. Zero would be a real-looking
     match in which nobody shot, and it would drag the league mean down. */
  const res = M.normalise(M.parseCSV(
    "Div,Date,HomeTeam,AwayTeam,FTHG,FTAG\nE0,16/08/2025,Arsenal,Leeds,2,0"));
  assert.equal(res.matches[0].hs, null);
  assert.equal(res.matches[0].as, null);
});

/* A small league where one side shoots a lot and the other barely at all. */
function league() {
  const rows = [];
  const teams = ["Attackers", "Middling", "Parkers", "Also Ran"];
  let day = 1;
  for (let r = 0; r < 12; r++) {
    for (const h of teams) for (const a of teams) {
      if (h === a) continue;
      const hs = h === "Attackers" ? 20 : h === "Parkers" ? 6 : 12;
      const as = a === "Attackers" ? 16 : a === "Parkers" ? 4 : 9;
      const d = String(((day - 1) % 28) + 1).padStart(2, "0");
      const mo = String(1 + Math.floor((day - 1) / 28) % 12).padStart(2, "0");
      rows.push(`E0,${d}/${mo}/2025,${h},${a},1,1,0,0,${hs},${as},${Math.round(hs / 3)},${Math.round(as / 3)},5,4`);
      day++;
    }
  }
  return M.normalise(M.parseCSV(csv(rows))).matches;
}

test("the shots fit ranks a side that shoots above one that does not", () => {
  const model = C.fitCorners(league(), { home: "hs", away: "as", minMean: 5, maxMean: 25 });
  assert.ok(model, "no shots model from a league that carries the column");
  const hi = C.cornersFor(model, "Attackers", "Middling", "England Premier League");
  const lo = C.cornersFor(model, "Parkers", "Middling", "England Premier League");
  assert.ok(hi && lo);
  assert.ok(hi.ch > lo.ch, `Attackers expected ${hi.ch} shots, Parkers ${lo.ch}`);
});

test("the corners fit did not move when it learned to take column names", () => {
  /* Same matches, asked with no options and with the corners' own columns
     spelled out: the two must agree to the last digit. */
  const ms = league();
  const a = C.fitCorners(ms);
  const b = C.fitCorners(ms, { home: "hc", away: "ac" });
  assert.equal(a.mean, b.mean);
  assert.equal(a.k, b.k);
  assert.deepEqual(C.cornersFor(a, "Attackers", "Parkers", "England Premier League"),
                   C.cornersFor(b, "Attackers", "Parkers", "England Premier League"));
});

test("shots bounds refuse a column read wrong, not a real league", () => {
  /* A shots mean of 3 a side is a corners column mistaken for shots. */
  const ms = league().map((m) => Object.assign({}, m, { hs: 3, as: 2 }));
  assert.equal(C.fitCorners(ms, { home: "hs", away: "as", minMean: 5, maxMean: 25 }), null);
});

test("a promoted club is read against its new league, not its old one", () => {
  /* Falkirk won Scotland's third tier shooting at will; those counts, divided
     by the Premiership's mean, priced them at 23 shots at home. Counts from a
     league a club has left are on the wrong scale and must not be used. */
  const rows = [];
  const lower = ["Promoted", "Minnow A", "Minnow B"];
  const upper = ["Giant", "Solid", "Promoted"];
  let day = 1;
  const d = () => { const n = day++; return `${String(((n - 1) % 28) + 1).padStart(2, "0")}/${String(1 + Math.floor((n - 1) / 28)).padStart(2, "0")}/2025`; };
  for (let r = 0; r < 10; r++) for (const h of lower) for (const a of lower) {
    if (h === a) continue;
    const hs = h === "Promoted" ? 30 : 8;   /* dominant a tier down */
    rows.push(`SC2,${d()},${h},${a},1,0,0,0,${hs},6,5,2,5,4`);
  }
  /* Eight rounds: the fit ignores a league with fewer than 40 matches, and a
     new league it has not fitted cannot be the one the club is read against. */
  for (let r = 0; r < 8; r++) for (const h of upper) for (const a of upper) {
    if (h === a) continue;
    rows.push(`SC0,${d()},${h},${a},1,1,0,0,12,11,4,4,5,4`);
  }
  const ms = M.normalise(M.parseCSV(csv(rows))).matches;
  const model = C.fitCorners(ms, { home: "hs", away: "as", minMean: 5, maxMean: 25 });
  const T = model.team.get("Promoted");
  assert.ok(T, "no rate for the promoted club");
  assert.ok(T.for < 1.3,
    `promoted club rated ${T.for.toFixed(2)}x its new league - its old league's counts leaked in`);
});
