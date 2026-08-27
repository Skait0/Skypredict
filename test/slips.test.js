"use strict";

/* Slip history and settlement.
 *
 * This is the part that tells somebody whether their own bet came in, so the
 * failures that matter are the quiet ones: a leg graded against the wrong
 * market, a slip called a loss because a score had not arrived yet, or a
 * market nobody can settle being counted as lost.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.search(new RegExp("(?:^|\\n)function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found: " + name);
  let j = src.indexOf("{", i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

const api = new Function([
  "var DATA={fixtures:[],results:[]};",
  "var SLIPS=[];",
  "var store={};",
  "function normTeam(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');}",
  "function fixtureById(id){return (DATA.fixtures||[]).filter(f=>f.__id===id)[0]||null;}",
  "function fixtureState(){return null;}",
  "function legOdd(f,c,p){return 1/Math.max(0.05,p);}",
  "const SLIPS_KEEP=60;",
  "function saveSlips(){ if(SLIPS.length>SLIPS_KEEP) SLIPS=SLIPS.slice(0,SLIPS_KEEP); }",
  grab("gradeCode"), grab("finalScoreFor"), grab("countVoid"),
  grab("settleSlips"), grab("myRecord"),
].join("\n") + `
  return { gradeCode, finalScoreFor, settleSlips, myRecord,
           setData(d){DATA=d;}, setSlips(s){SLIPS=s;}, slips(){return SLIPS;} };
`)();

/* ------------------------------------------------------------ gradeCode */

test("match-result markets settle correctly", () => {
  assert.equal(api.gradeCode("1", 2, 0), "win");
  assert.equal(api.gradeCode("1", 1, 1), "lose");
  assert.equal(api.gradeCode("2", 0, 3), "win");
  assert.equal(api.gradeCode("X", 1, 1), "win");
  assert.equal(api.gradeCode("X", 2, 1), "lose");
});

test("double chance settles on the draw as well as the win", () => {
  assert.equal(api.gradeCode("1X", 1, 1), "win", "a draw wins 1X");
  assert.equal(api.gradeCode("1X", 0, 1), "lose");
  assert.equal(api.gradeCode("X2", 1, 1), "win", "a draw wins X2");
  assert.equal(api.gradeCode("12", 1, 1), "lose", "a draw loses 12");
  assert.equal(api.gradeCode("12", 2, 1), "win");
});

test("goal lines settle on the line, not around it", () => {
  /* The classic off-by-one: over 1.5 needs two goals, not one. */
  assert.equal(api.gradeCode("OVER_1.5", 1, 0), "lose", "one goal is under 1.5");
  assert.equal(api.gradeCode("OVER_1.5", 1, 1), "win");
  assert.equal(api.gradeCode("OVER_2.5", 1, 1), "lose", "two goals is under 2.5");
  assert.equal(api.gradeCode("OVER_2.5", 2, 1), "win");
  assert.equal(api.gradeCode("OVER_3.5", 2, 1), "lose");
  assert.equal(api.gradeCode("OVER_3.5", 2, 2), "win");
});

test("both teams to score needs both", () => {
  assert.equal(api.gradeCode("GG", 1, 1), "win");
  assert.equal(api.gradeCode("GG", 3, 0), "lose");
  assert.equal(api.gradeCode("GG", 0, 0), "lose");
});

test("team totals settle on that team's goals only", () => {
  /* The failure to avoid is reading the match total instead of one side's. */
  assert.equal(api.gradeCode("HOME_OVER_0.5", 1, 4), "win");
  assert.equal(api.gradeCode("HOME_OVER_0.5", 0, 4), "lose", "four away goals do not help");
  assert.equal(api.gradeCode("AWAY_OVER_0.5", 4, 0), "lose", "four home goals do not help");
  assert.equal(api.gradeCode("HOME_OVER_1.5", 1, 0), "lose");
  assert.equal(api.gradeCode("HOME_OVER_1.5", 2, 0), "win");
  assert.equal(api.gradeCode("AWAY_OVER_1.5", 0, 2), "win");
});

test("a market a final score cannot settle returns null, never lose", () => {
  /* First-half goals need a half-time score nothing here carries. Calling it
     a loss would mark somebody's slip down on a leg nobody graded. */
  assert.equal(api.gradeCode("FH_OVER_0.5", 3, 2), null);
  assert.equal(api.gradeCode("NOT_A_MARKET", 1, 1), null);
});

test("a missing score grades nothing", () => {
  assert.equal(api.gradeCode("1", null, 1), null);
  assert.equal(api.gradeCode("1", 1, undefined), null);
  assert.equal(api.gradeCode("1", NaN, 1), null);
});

/* ---------------------------------------------------------- settlement */

const leg = (o) => Object.assign(
  { id: "g1", code: "1", label: "x", home: "Celta", away: "Osasuna",
    date: "2026-08-27", p: 0.6, odd: 1.6 }, o);

function fresh(legs) {
  return [{ sid: "s1", at: "2026-08-27T10:00:00Z", code: "ABC",
            legs: legs, odds: 2, settled: false, won: null, hits: 0, graded: 0 }];
}

test("a slip settles as won only when every leg has landed", () => {
  api.setData({ fixtures: [], results: [
    { date: "2026-08-27", home: "Celta", away: "Osasuna", hg: 2, ag: 0 },
    { date: "2026-08-27", home: "Vejle", away: "Silkeborg", hg: 1, ag: 1 },
  ]});
  api.setSlips(fresh([
    leg({ code: "1" }),
    leg({ id: "g2", code: "1X", home: "Vejle", away: "Silkeborg" }),
  ]));
  const settled = api.settleSlips();
  const s = api.slips()[0];
  assert.equal(s.settled, true);
  assert.equal(s.won, true);
  assert.equal(s.hits, 2);
  assert.equal(settled.length, 1, "reports what it just settled");
});

test("one losing leg settles the whole slip as lost", () => {
  api.setData({ fixtures: [], results: [
    { date: "2026-08-27", home: "Celta", away: "Osasuna", hg: 0, ag: 1 },
  ]});
  api.setSlips(fresh([
    leg({ code: "1" }),
    leg({ id: "g2", code: "1", home: "Nobody", away: "Yet", date: "2026-08-27" }),
  ]));
  api.settleSlips();
  const s = api.slips()[0];
  assert.equal(s.settled, true, "a lost leg settles it immediately");
  assert.equal(s.won, false);
  /* The point: it does NOT wait for the second game. It cannot be rescued. */
});

test("a slip with a game still to play stays open", () => {
  api.setData({ fixtures: [], results: [
    { date: "2026-08-27", home: "Celta", away: "Osasuna", hg: 2, ag: 0 },
  ]});
  api.setSlips(fresh([
    leg({ code: "1" }),
    leg({ id: "g2", code: "1", home: "Later", away: "Tonight" }),
  ]));
  api.settleSlips();
  const s = api.slips()[0];
  assert.equal(s.settled, false, "not settled while a leg has no score");
  assert.equal(s.won, null);
  assert.equal(s.hits, 1, "but the landed leg is counted");
});

test("an ungradeable leg does not sink an otherwise winning slip", () => {
  api.setData({ fixtures: [], results: [
    { date: "2026-08-27", home: "Celta", away: "Osasuna", hg: 2, ag: 1 },
    { date: "2026-08-27", home: "Vejle", away: "Silkeborg", hg: 1, ag: 1 },
  ]});
  api.setSlips(fresh([
    leg({ code: "1" }),
    leg({ id: "g2", code: "FH_OVER_0.5", home: "Vejle", away: "Silkeborg" }),
  ]));
  api.settleSlips();
  const s = api.slips()[0];
  assert.equal(s.legs[1].res, "void", "the first-half leg is void, not lost");
  assert.equal(s.settled, true);
  assert.equal(s.won, true, "the gradeable legs all won");
});

test("settling twice changes nothing", () => {
  api.setData({ fixtures: [], results: [
    { date: "2026-08-27", home: "Celta", away: "Osasuna", hg: 2, ag: 0 },
  ]});
  api.setSlips(fresh([leg({ code: "1" })]));
  api.settleSlips();
  const first = JSON.stringify(api.slips());
  const again = api.settleSlips();
  assert.equal(again.length, 0, "nothing newly settled the second time");
  assert.equal(JSON.stringify(api.slips()), first);
});

test("a result for a different date does not settle the leg", () => {
  /* Same two clubs, different day - a return fixture must not grade this one. */
  api.setData({ fixtures: [], results: [
    { date: "2026-08-20", home: "Celta", away: "Osasuna", hg: 5, ag: 0 },
  ]});
  api.setSlips(fresh([leg({ code: "1" })]));
  api.settleSlips();
  assert.equal(api.slips()[0].settled, false);
});

/* -------------------------------------------------------------- record */

test("the record counts slips and legs separately", () => {
  api.setSlips([
    { sid: "a", settled: true, won: true, odds: 4.2,
      legs: [{ res: "win" }, { res: "win" }] },
    { sid: "b", settled: true, won: false, odds: 9.0,
      legs: [{ res: "win" }, { res: "lose" }] },
    { sid: "c", settled: false, won: null, odds: 3.0, legs: [{}, {}] },
  ]);
  const r = api.myRecord();
  assert.equal(r.built, 3);
  assert.equal(r.settled, 2);
  assert.equal(r.won, 1);
  assert.equal(r.pending, 1);
  assert.equal(r.legs, 4, "four graded legs across the settled slips");
  assert.equal(r.legHits, 3);
  assert.equal(r.best.sid, "a", "best is the biggest WINNING slip, not the biggest");
});

test("the streak counts consecutive wins from the most recent", () => {
  api.setSlips([
    { settled: true, won: true, odds: 2, legs: [] },
    { settled: true, won: true, odds: 2, legs: [] },
    { settled: true, won: false, odds: 2, legs: [] },
    { settled: true, won: true, odds: 2, legs: [] },
  ]);
  assert.equal(api.myRecord().streak, 2, "stops at the loss, does not count past it");
});

test("an unsettled slip does not break the streak", () => {
  /* Today's slip is still running; that is not a loss. */
  api.setSlips([
    { settled: false, won: null, odds: 2, legs: [] },
    { settled: true, won: true, odds: 2, legs: [] },
  ]);
  assert.equal(api.myRecord().streak, 1);
});

test("an empty history is safe", () => {
  api.setSlips([]);
  const r = api.myRecord();
  assert.equal(r.built, 0);
  assert.equal(r.streak, 0);
  assert.equal(r.best, null);
});
