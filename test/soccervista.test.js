"use strict";

/**
 * The second source of final scores.
 *
 * lib/oracle.js stopped answering - the API-Football account is suspended and
 * its free plan only ever reached three days - which left the sweep as the
 * only source of finality, and GitHub throttles that to about five runs a day.
 * On 31 Aug 2026 six games were graded out of roughly thirty.
 *
 * These tests are about the parsing and the refusals, which is where a score
 * source can quietly do damage: a half-read score becomes a published result
 * and a wrong verdict on somebody's slip. Nothing here touches the network.
 */

const test = require("node:test");
const assert = require("node:assert");
const SV = require("../lib/soccervista.js");
const ORACLE = require("../lib/oracle.js");

/* One tournament block in the shape they send it. */
function day(events) {
  return [{ name: "Premier League", countryName: "England", events: events }];
}
const EV = (over) => Object.assign({
  id: "abc", timeStart: 1788217200, homeTeam: "Aston Villa", awayTeam: "Arsenal",
  score: "0:1", isLive: false, isFinished: true, isScheduled: false, isPaused: false,
}, over || {});

test("their date format is not ours", () => {
  assert.strictEqual(SV.toTheirDate("2026-08-31"), "31-08-2026");
  assert.strictEqual(SV.toTheirDate("2026-01-05"), "05-01-2026");
  for (const bad of ["31-08-2026", "2026/08/31", "", null, "yesterday"]) {
    assert.strictEqual(SV.toTheirDate(bad), null, JSON.stringify(bad));
  }
});

test("a score is two numbers and nothing else", () => {
  assert.deepStrictEqual(SV.parseScore("0:1"), [0, 1]);
  assert.deepStrictEqual(SV.parseScore(" 10 : 2 "), [10, 2]);
  /* Refused on purpose. An extra-time or shootout string carries a number we
     do not settle on - our markets are 90 minutes - and a guess here writes a
     wrong result onto somebody's record. */
  for (const bad of ["3:3 (4:2)", "1-0", "?:?", "", null, undefined, "abc", "1:"]) {
    assert.strictEqual(SV.parseScore(bad), null, JSON.stringify(bad));
  }
});

test("only finished matches become rows", () => {
  const rows = SV.parseDay(day([
    EV(),
    EV({ homeTeam: "Live", isFinished: false, isLive: true, score: "1:1" }),
    EV({ homeTeam: "Later", isFinished: false, isScheduled: true, score: null }),
    /* Finished AND live at once should not happen, and if it does the match is
       still running as far as we are concerned. */
    EV({ homeTeam: "Both", isLive: true }),
  ]));
  assert.deepStrictEqual(rows.map((r) => r.home), ["Aston Villa"]);
});

test("a finished match with an unreadable score is dropped, not guessed", () => {
  assert.deepStrictEqual(SV.parseDay(day([EV({ score: "3:3 (4:2)" })])), []);
  assert.deepStrictEqual(SV.parseDay(day([EV({ score: null })])), []);
});

test("rows come out in the shape the oracle produces", () => {
  /* Both sources are handed to ORACLE.findMatch, so one shape or the pairing
     code needs to know which source it is looking at - and that is exactly the
     kind of branch that gets a score written against the wrong match. */
  const r = SV.parseDay(day([EV()]))[0];
  assert.deepStrictEqual(Object.keys(r).sort(),
    ["ag", "away", "hg", "home", "league", "status"].sort());
  assert.strictEqual(r.status, "FT");
  assert.strictEqual(r.hg, 0);
  assert.strictEqual(r.ag, 1);
  assert.strictEqual(r.league, "England Premier League");
});

test("the oracle's own matcher pairs these rows", () => {
  const rows = SV.parseDay(day([
    EV(),
    EV({ homeTeam: "Chelsea", awayTeam: "Fulham", score: "2:0" }),
  ]));
  const m = ORACLE.findMatch(rows, "Aston Villa", "Arsenal");
  assert.ok(m, "the shared matcher must accept a row from this source");
  assert.strictEqual(m.hg + "-" + m.ag, "0-1");
  assert.strictEqual(ORACLE.findMatch(rows, "Aston Villa", "Chelsea"), null,
    "and must still refuse a pairing where only one side agrees");
});

test("junk from the wire is an empty day, not an exception", () => {
  for (const bad of [null, undefined, {}, "nope", 42, [null], [{ events: null }]]) {
    assert.deepStrictEqual(SV.parseDay(bad), [], JSON.stringify(bad));
  }
});

test("a tournament with no country still names its league", () => {
  const rows = SV.parseDay([{ name: "Champions League", events: [EV()] }]);
  assert.strictEqual(rows[0].league, "Champions League");
});

test("it can be switched off without a deploy", () => {
  const was = process.env.SOCCERVISTA_OFF;
  try {
    process.env.SOCCERVISTA_OFF = "1";
    assert.strictEqual(SV.configured(), false);
    delete process.env.SOCCERVISTA_OFF;
    assert.strictEqual(SV.configured(), true, "on by default - there is no key to hold");
  } finally {
    if (was === undefined) delete process.env.SOCCERVISTA_OFF;
    else process.env.SOCCERVISTA_OFF = was;
  }
});

test("the build asks both sources, in order, and falls past a dead one", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /const SCORE_SOURCES = \[/,
    "the order lives in one place or the two call sites will disagree");
  const list = src.slice(src.indexOf("const SCORE_SOURCES"), src.indexOf("];", src.indexOf("const SCORE_SOURCES")));
  assert.ok(list.indexOf("soccervista") < list.indexOf("oracle"),
    "SoccerVista first: the oracle is suspended and reaches three days to its seven");
  assert.match(src, /name: "oracle", api: ORACLE/,
    "and the oracle stays, so a restored account works with no change here");
  /* Both the record path and the fixture path must walk the same list. */
  const uses = src.match(/SCORE_SOURCES/g) || [];
  assert.ok(uses.length >= 3, "confirmScores and the fixture enrichment both use it");
});
