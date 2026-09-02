"use strict";

/**
 * Falling through per FIXTURE, not per date.
 *
 * The bug this pins, measured in the production build log on 2 Sep 2026:
 *
 *   soccervista 2026-08-28: 0 of 2 confirmed from 485 finished
 *   2 recorded result(s) held back - no confirmed final score
 *
 * SoccerVista had the date and 485 finished matches, and neither of the two
 * games we needed. `firstScoreSource` returned the first source with ANY rows,
 * so football-data and the oracle were never asked about those two fixtures -
 * a source holding the day won the whole day. Both results were held back with
 * two untried sources sitting behind them.
 *
 * Having the DATE is not having the GAME. So the search now runs per fixture,
 * and the memo that keeps the oracle's allowance safe keys on source AND date
 * rather than the date alone.
 *
 * These use injected sources throughout. An earlier test in this repo drove
 * the real list and quietly made live calls to SoccerVista, which is slow,
 * flaky, and measures somebody else's uptime rather than our code.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const B = require("../lib/build.js");

/* A source that holds a fixed set of rows per date and counts how often it is
   actually asked. The count is the point of half these tests: the fall-through
   must not turn into extra requests. */
function stub(name, byDate, opts) {
  const o = opts || {};
  const s = {
    calls: [],
    api: {
      configured: () => o.configured !== false,
      async resultsFor(date) {
        s.calls.push(date);
        if (o.throws) throw new Error("upstream on fire");
        const rows = byDate[date] || [];
        return { ok: o.ok === false ? false : true, why: o.why || "", rows,
                 quota: o.quota == null ? undefined : o.quota };
      },
    },
  };
  s.name = name;
  return s;
}

const R = (home, away, hg, ag, extra) =>
  Object.assign({ home, away, hg, ag, league: "x", status: "FT" }, extra || {});

/* Yesterday, not the 28 August of the log above. The oracle refuses anything
   older than its three-day window, so a hard-coded date quietly stops the
   chain ever reaching the third source - the tests would pass on the day they
   were written and rot a week later. */
const DATE = new Date(Date.now() - 26 * 3600 * 1000).toISOString().slice(0, 10);

/* The production shape: a wide source with the date and not the game, and a
   narrow one that has it. */
function chain() {
  const wide = stub("soccervista", {
    [DATE]: [R("Halifax", "Hartlepool", 2, 0), R("Ipswich", "Liverpool", 0, 3)],
  });
  const narrow = stub("footballdata", {
    [DATE]: [R("Aston Villa", "Arsenal", 0, 1, { hth: 0, hta: 0 })],
  });
  const last = stub("oracle", {
    [DATE]: [R("Petro Luanda", "Al Ahly", 1, 1)],
  });
  return { wide, narrow, last, all: [wide, narrow, last] };
}

/* ------------------------------------------------- the fall-through itself */

test("a game the first source lacks is found by the second", () => {
  /* The exact failure. SoccerVista answered for the date, did not have this
     game, and that used to end the search. */
  const c = chain();
  return B.findScore(DATE, "Aston Villa", "Arsenal", [], B.makeScoreBudget(), c.all)
    .then((got) => {
      assert.ok(got, "a source further down the chain has this game");
      assert.strictEqual(got.from, "footballdata");
      assert.strictEqual(got.m.hg, 0);
      assert.strictEqual(got.m.ag, 1);
    });
});

test("and one only the last source has still reaches it", async () => {
  /* Cup ties are the real case: SoccerVista misses some and football-data is
     league-only, so the oracle is the only thing that can settle them. */
  const c = chain();
  const got = await B.findScore(DATE, "Petro Luanda", "Al Ahly", [], B.makeScoreBudget(), c.all);
  assert.ok(got);
  assert.strictEqual(got.from, "oracle");
});

test("the order still holds - the first source with the game wins", async () => {
  /* Falling through must not become shopping around. When SoccerVista has the
     game, nothing else is consulted, whatever the others hold. */
  const c = chain();
  const got = await B.findScore(DATE, "Halifax", "Hartlepool", [], B.makeScoreBudget(), c.all);
  assert.strictEqual(got.from, "soccervista");
  assert.deepStrictEqual(c.narrow.calls, [], "the second source is not asked at all");
  assert.deepStrictEqual(c.last.calls, [], "and the rationed one certainly is not");
});

test("a game no source carries is null, never a guess", async () => {
  const c = chain();
  assert.strictEqual(
    await B.findScore(DATE, "Someone", "Else", [], B.makeScoreBudget(), c.all), null,
    "no score, no row - the whole point of confirming");
});

/* --------------------------------------------------------- the cost of it */

test("falling through does not cost a second request for the same date", async () => {
  /* The memo is what makes this safe. Ten fixtures on one date consult each
     source at most once; without it the oracle's 100-a-day allowance would be
     spent by a single build. */
  const c = chain();
  const budget = B.makeScoreBudget();
  for (const [h, a] of [["Halifax", "Hartlepool"], ["Aston Villa", "Arsenal"],
                        ["Petro Luanda", "Al Ahly"], ["Nobody", "AtAll"],
                        ["Ipswich", "Liverpool"]]) {
    await B.findScore(DATE, h, a, [], budget, c.all);
  }
  assert.deepStrictEqual(c.wide.calls, [DATE], "asked once for five fixtures");
  assert.deepStrictEqual(c.narrow.calls, [DATE]);
  assert.deepStrictEqual(c.last.calls, [DATE]);
});

test("a source with nothing for the date is not re-asked either", async () => {
  /* "Nothing" is an answer. Re-asking costs a request to be told the same
     thing, which is exactly what the allowance cannot afford. */
  const empty = stub("soccervista", {});
  const have = stub("footballdata", { [DATE]: [R("Chelsea", "Fulham", 1, 0)] });
  const budget = B.makeScoreBudget();
  await B.findScore(DATE, "Chelsea", "Fulham", [], budget, [empty, have]);
  await B.findScore(DATE, "Chelsea", "Fulham", [], budget, [empty, have]);
  assert.deepStrictEqual(empty.calls, [DATE], "the empty answer was remembered");
});

test("a source that throws is remembered as empty, not retried per fixture", async () => {
  const broken = stub("soccervista", {}, { throws: true });
  const have = stub("footballdata", { [DATE]: [R("Chelsea", "Fulham", 1, 0)] });
  const budget = B.makeScoreBudget();
  const log = [];
  for (let i = 0; i < 4; i++) await B.findScore(DATE, "Chelsea", "Fulham", log, budget, [broken, have]);
  assert.strictEqual(broken.calls.length, 1,
    "an outage must not be hammered once per fixture");
  assert.ok(log.some((l) => /soccervista .*fire/.test(l)), "and it is said out loud");
});

test("an unconfigured source is skipped without being called", async () => {
  const off = stub("soccervista", { [DATE]: [R("Chelsea", "Fulham", 1, 0)] }, { configured: false });
  const on = stub("footballdata", { [DATE]: [R("Chelsea", "Fulham", 2, 2)] });
  const got = await B.findScore(DATE, "Chelsea", "Fulham", [], B.makeScoreBudget(), [off, on]);
  assert.deepStrictEqual(off.calls, []);
  assert.strictEqual(got.from, "footballdata");
});

/* ------------------------------------------------ the oracle's rationing */

test("the oracle is not spent on a game a free source already has", async () => {
  const c = chain();
  const budget = B.makeScoreBudget();
  await B.findScore(DATE, "Halifax", "Hartlepool", [], budget, c.all);
  assert.strictEqual(budget.spent, 0, "nothing was charged to the allowance");
});

test("reaching the oracle charges the allowance exactly once per date", async () => {
  const c = chain();
  const budget = B.makeScoreBudget();
  await B.findScore(DATE, "Petro Luanda", "Al Ahly", [], budget, c.all);
  await B.findScore(DATE, "Nobody", "AtAll", [], budget, c.all);
  assert.strictEqual(budget.spent, 1,
    "two fixtures that both fell all the way through, one request");
});

test("the oracle stops once its build budget is gone", async () => {
  const c = chain();
  const budget = B.makeScoreBudget();
  budget.spent = 99;                      // well past ORACLE_BUDGET
  const log = [];
  const got = await B.findScore(DATE, "Petro Luanda", "Al Ahly", log, budget, c.all);
  assert.strictEqual(got, null, "held back rather than overrunning the plan");
  assert.deepStrictEqual(c.last.calls, []);
  assert.ok(log.some((l) => /oracle.*budget/i.test(l)),
    "the budget refusal is the actionable one and must be said: " + JSON.stringify(log));
});

test("a budget refusal is not cached, because it is about now and not the date", async () => {
  /* The distinction matters: "this source has nothing for 28 Aug" is true
     forever and worth remembering; "the allowance is spent" is true for the
     next few seconds. Caching the second would carry a refusal across a build
     that had room. */
  const c = chain();
  const budget = B.makeScoreBudget();
  budget.spent = 99;
  await B.findScore(DATE, "Petro Luanda", "Al Ahly", [], budget, c.all);
  budget.spent = 0;                       // as a later build would start
  const got = await B.findScore(DATE, "Petro Luanda", "Al Ahly", [], budget, c.all);
  assert.ok(got, "asked again once there was allowance for it");
  assert.strictEqual(got.from, "oracle");
});

/* ------------------------------------------------------------ the logging */

test("the budget line counts dates, not lookups", async () => {
  /* memo.size used to be the date count. It now holds a key per source per
     date, so reading it off directly would report three sources on one date as
     "3 date(s) looked up". */
  const c = chain();
  const budget = B.makeScoreBudget();
  await B.findScore(DATE, "Nobody", "AtAll", [], budget, c.all);   // touches all three
  const log = [];
  B.logScoreBudget(budget, log);
  const line = log.find((l) => /date\(s\) looked up/.test(l));
  assert.ok(line, "the build must say what it spent");
  assert.match(line, /1 date\(s\) looked up/, "one date, three sources: " + line);
});

test("the confirmation line names every source that answered", async () => {
  /* "soccervista 28 Aug: 0 of 2 confirmed from 485 finished" read as a
     coverage problem when it was a fall-through problem, and hid that nothing
     else had been asked. */
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /confirmed \(\$\{who\}\)/);
  assert.doesNotMatch(src, /confirmed from \$\{got\.rows\.length\} finished/,
    "the per-date line implied one source spoke for the whole date");
});

/* --------------------------------------------------------- the call sites */

test("both grading passes fall through per fixture", () => {
  /* Call-site assertion, and the one that actually matters. Every test above
     drives findScore directly and would pass unchanged while confirmScores and
     recordPublishedTips still took the first source with any rows for the
     date - which is precisely the bug. Counted rather than matched, because
     there are two passes and fixing one is not fixing it. */
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");

  const passes = (src.match(/await findScore\(date, \w+\.home, \w+\.away, log, budget, sources\)/g) || []).length;
  assert.strictEqual(passes, 2,
    "confirmScores and recordPublishedTips must both use it, got " + passes);

  /* And neither may still be reaching for a whole date's rows. */
  assert.doesNotMatch(src, /const got = await firstScoreSource\(date, log, budget, sources\)/,
    "a per-date fetch feeding a per-fixture loop is the bug itself");

  /* The lookup has to sit INSIDE the fixture loop. Hoisted above it, the
     source list would be walked once for the date again and every assertion
     above would still pass. */
  for (const fn of ["confirmScores", "recordPublishedTips"]) {
    const body = src.slice(src.indexOf("async function " + fn));
    const loop = body.indexOf("for (const ");
    const call = body.indexOf("await findScore(");
    assert.ok(loop !== -1 && call > loop,
      fn + ": the per-fixture lookup must sit inside the loop over fixtures");
  }
});

test("the memo keys on source and date, not the date alone", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /const key = src\.name \+ "\|" \+ date;/,
    "a date-only key makes the second source reuse the first source's rows");
});

/* --------------------------------------------- and it has to reach the log */

test("prebuild's whitelist passes the line confirmScores actually emits", async () => {
  /* This shipped broken for one deploy. The confirmation line was correct in
     build.js and the whitelist in prebuild.js still matched the OLD wording
     ("confirmed from 485 finished"), so the line was written and silently
     dropped - a filter keyed on another function's phrasing breaks without
     failing anything.
   *
   * So: the real regex, lifted out of the real script, run against a line this
   * test made confirmScores produce. Nothing here is hand-written, which is the
   * only version of this test worth having. */
  const script = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  const m = script.match(/\.filter\(\(l\) => (\/.+\/i)\.test\(l\)\)/);
  assert.ok(m, "the build-log whitelist must still be findable in prebuild.js");
  const whitelist = eval(m[1]);   // the script's own regex, not a copy of it

  const src = stub("soccervista", { [DATE]: [R("Halifax", "Hartlepool", 2, 0)] });
  const log = [];
  await B.confirmScores(
    [{ match_date: DATE, home: "Petro Luanda", away: "Al Ahly",
       hg: 1, ag: 1, tip: "Over 1.5", hit: false, source: "sweep" }],
    log, B.makeScoreBudget(), [src]);

  const line = log.find((l) => /of \d+ confirmed/.test(l));
  assert.ok(line, "confirmScores must say what it confirmed: " + JSON.stringify(log));
  assert.ok(whitelist.test(line),
    "prebuild drops this line, so the deploy log will not show it: " + line);
});

/* ------------------------------------------------------- backfill windows */

/**
 * One window for everybody made the metered source's limit everyone's limit.
 * Rows older than a week were dropped before football-data - which holds the
 * whole downloaded season in memory - was ever offered them.
 *
 * The oracle is deliberately NOT widened. Its free plan refuses anything older
 * than a few days and a refusal still costs a request, so a wider window would
 * turn a free local skip into a real refused request. At forty-odd builds a
 * day that is 80-120 wasted requests against a limit of 100, which is exactly
 * how the last account was suspended.
 */

const DAY = 86400000;
const ago = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

test("football-data is asked about a date three weeks old", () => {
  /* It costs a Map lookup over results the build already downloaded. There was
     never a reason for its window to be small. */
  assert.strictEqual(
    B.sourceCanAnswer({ name: "footballdata" }, ago(21), B.makeScoreBudget()), true);
});

test("the oracle is not, and that is the whole point", () => {
  assert.strictEqual(
    B.sourceCanAnswer({ name: "oracle" }, ago(21), B.makeScoreBudget()), false,
    "widening the metered source is how the last account died");
  assert.strictEqual(
    B.sourceCanAnswer({ name: "oracle" }, ago(5), B.makeScoreBudget()), false,
    "five days is already past what the free plan will serve");
  assert.strictEqual(
    B.sourceCanAnswer({ name: "oracle" }, ago(1), B.makeScoreBudget()), true,
    "yesterday is still its job");
});

test("SoccerVista keeps its week - it is somebody else's server", () => {
  assert.strictEqual(
    B.sourceCanAnswer({ name: "soccervista" }, ago(3), B.makeScoreBudget()), true);
  assert.strictEqual(
    B.sourceCanAnswer({ name: "soccervista" }, ago(21), B.makeScoreBudget()), false,
    "a month of dates every build would be rude, slow, and unanswered");
});

test("an old row reaches the free source instead of being dropped", async () => {
  /* The behaviour, end to end. Three weeks back: SoccerVista and the oracle
     both decline locally, football-data answers, and the row is confirmed
     without a single request being made. */
  const old = ago(21);
  const sv = stub("soccervista", { [old]: [R("Halifax", "Hartlepool", 9, 9)] });
  const fd = stub("footballdata", { [old]: [R("Chelsea", "Fulham", 2, 0)] });
  const or = stub("oracle", { [old]: [R("Chelsea", "Fulham", 5, 5)] });
  const sources = [
    { name: "soccervista", api: sv.api, days: 7 },
    { name: "footballdata", api: fd.api, days: 30 },
    { name: "oracle", api: or.api, days: 3 },
  ];
  const log = [];
  const budget = B.makeScoreBudget();
  const row = { match_date: old, home: "Chelsea", away: "Fulham",
                hg: 0, ag: 0, tip: "1X, home or draw", hit: false, source: "sweep" };

  const out = await B.confirmScores([row], log, budget, sources);

  assert.strictEqual(out.size, 1, "the row was confirmed, not dropped as stale");
  assert.strictEqual(out.get(row).hg, 2, "and from football-data's score");
  assert.deepStrictEqual(sv.calls, [], "SoccerVista declined locally, no request");
  assert.deepStrictEqual(or.calls, [], "and the oracle was never touched");
  assert.strictEqual(budget.spent, 0, "not one unit of allowance spent");
  assert.ok(log.some((l) => /backfill: 1 result/.test(l)),
    "and it says what the wider window was worth: " + JSON.stringify(log));
});

test("with no source reaching back, an old row is still left alone", async () => {
  /* The gate must follow the sources, not a constant. Given only SoccerVista,
     a three-week-old row is out of everybody's reach and must not be put to
     anyone. */
  const old = ago(21);
  const sv = stub("soccervista", { [old]: [R("Chelsea", "Fulham", 2, 0)] });
  const log = [];
  const out = await B.confirmScores(
    [{ match_date: old, home: "Chelsea", away: "Fulham",
       hg: 0, ag: 0, tip: "1X, home or draw", hit: false, source: "sweep" }],
    log, B.makeScoreBudget(), [{ name: "soccervista", api: sv.api, days: 7 }]);
  assert.strictEqual(out.size, 0);
  assert.deepStrictEqual(sv.calls, [], "nobody could answer, so nobody was asked");
  assert.ok(log.some((l) => /older than the oracle window/.test(l)));
});

test("the age refusal is not logged once per fixture", async () => {
  /* It became the ordinary case the moment backfill widened the row gate - a
     month of dates past the oracle's three days is what the window is FOR - so
     logging it per fixture buried the build output in "working as intended".
     The budget refusal still speaks, because that one means something. */
  const old = ago(21);
  const fd = stub("footballdata", { [old]: [
    R("Chelsea", "Fulham", 2, 0), R("Inter", "Udinese", 1, 1)] });
  const sources = [
    { name: "footballdata", api: fd.api, days: 30 },
    { name: "oracle", api: stub("oracle", {}).api, days: 3 },
  ];
  const log = [];
  const budget = B.makeScoreBudget();
  for (const [h, a] of [["Chelsea", "Fulham"], ["Inter", "Udinese"], ["No", "Body"]]) {
    await B.findScore(old, h, a, log, budget, sources);
  }
  assert.strictEqual(log.filter((l) => /older than/.test(l)).length, 0,
    "an expected skip is not news: " + JSON.stringify(log));
});

test("the budget refusal still speaks, and exactly once", async () => {
  const c = chain();
  const budget = B.makeScoreBudget();
  budget.spent = 99;
  const log = [];
  for (const [h, a] of [["No", "Body"], ["Still", "Nobody"], ["Third", "Miss"]]) {
    await B.findScore(DATE, h, a, log, budget, c.all);
  }
  const said = log.filter((l) => /budget/i.test(l));
  assert.strictEqual(said.length, 1,
    "said once per build, not once per fixture: " + JSON.stringify(log));
});

test("the windows on the list a real build uses", () => {
  /* Asserted on scoreSources() itself, not on a hand-made {name:"oracle"}.
     Every window test above went through sourceDays' NAME FALLBACK, so
     widening the oracle to the backfill window in the real list changed
     nothing any of them could see - the mutation ran green. The list the
     build actually grades from is the only place these numbers matter.

     If a window is deliberately changed, change it here too and say why in
     the commit. That is the point of pinning it. */
  const days = {};
  for (const s of B.scoreSources(MATCHES_FOR_WINDOWS)) days[s.name] = s.days;

  assert.strictEqual(days.oracle, 3,
    "the metered source must stay narrow - a refusal still costs a request, " +
    "and 40-odd builds a day of those is how the last account was suspended");
  assert.strictEqual(days.soccervista, 7,
    "somebody else's server, and it does not reach further than a week anyway");
  assert.strictEqual(days.footballdata, 30,
    "a Map lookup over results already downloaded - nothing to ration");

  assert.ok(days.footballdata > days.oracle,
    "the whole backfill is that the free source reaches further than the metered one");
});

const MATCHES_FOR_WINDOWS = [
  { date: new Date(Date.now() - 3 * 86400000), league: "England Premier League",
    home: "Chelsea", away: "Fulham", hg: 2, ag: 0, hth: 1, hta: 0 },
];

test("every score source's own diagnostics survive prebuild's whitelist", () => {
  /* football-data reported into a void from the day it shipped. The whitelist
     listed source names one at a time - "oracle", "soccervista" - and nobody
     added the third, so `footballdata 2026-08-28: no finished matches` was
     written on every build and printed on none. That is the line that would
     have explained a held-back Ligue 1 game the source demonstrably carries.
   *
   * Names come from scoreSources(), so a fourth source cannot repeat this:
   * add it to the list and this test covers it without being touched. The
   * line is produced by sourceRows itself, not typed out here. */
  const script = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  const m = script.match(/\.filter\(\(l\) => (\/.+\/i)\.test\(l\)\)/);
  assert.ok(m, "the build-log whitelist must still be findable in prebuild.js");
  const whitelist = eval(m[1]);

  const names = B.scoreSources(MATCHES_FOR_WINDOWS).map((s) => s.name);
  assert.ok(names.length >= 3, "expected the full source list, got " + names);

  return Promise.all(names.map(async (name) => {
    const silent = stub(name, {});          // has the date, holds nothing
    const log = [];
    await B.sourceRows({ name, api: silent.api, days: 30 }, DATE, log, B.makeScoreBudget());
    assert.strictEqual(log.length, 1, name + " must say it had nothing");
    assert.ok(whitelist.test(log[0]),
      "prebuild drops " + name + "'s diagnostics, so they do not exist: " + log[0]);
  }));
});

test("an unmatched fixture says what each source actually held", async () => {
  /* "no source had these games" is true and useless. It stood over Lille v
     Paris SG for days while football-data, second in the chain, carried that
     exact fixture under that exact spelling with a half-time score. The line
     could not distinguish "asked and got nothing" from "never asked". */
  const sv = stub("soccervista", { [DATE]: [R("Halifax", "Hartlepool", 2, 0)] });
  const fd = stub("footballdata", {});                    // has the date, holds nothing
  const sources = [
    { name: "soccervista", api: sv.api, days: 7 },
    { name: "footballdata", api: fd.api, days: 30 },
    { name: "oracle", api: stub("oracle", {}).api, days: 3 },
  ];
  const budget = B.makeScoreBudget();
  budget.spent = 99;                                      // so the oracle is skipped, not asked
  const log = [];
  await B.confirmScores(
    [{ match_date: DATE, home: "Lille", away: "Paris SG",
       hg: 0, ag: 0, tip: "Over 1.5", hit: false, source: "sweep" }],
    log, budget, sources);

  const line = log.find((l) => /^unmatched/.test(l));
  assert.ok(line, "an unexplained hold must explain itself: " + JSON.stringify(log));
  assert.match(line, /Lille v Paris SG/);
  assert.match(line, /soccervista 1/, "how many rows it really had");
  assert.match(line, /footballdata 0/, "asked and empty is not the same as unasked");
  assert.match(line, /oracle skipped/, "and never asked must say so");
});

test("the trace costs no extra request", async () => {
  /* It re-reads the memo the failed lookup already filled. If it refetched,
     every unmatched fixture would double the day's requests - on exactly the
     bad day when the most fixtures go unmatched. */
  const sv = stub("soccervista", { [DATE]: [R("Halifax", "Hartlepool", 2, 0)] });
  const sources = [{ name: "soccervista", api: sv.api, days: 7 }];
  await B.confirmScores(
    [{ match_date: DATE, home: "Lille", away: "Paris SG",
       hg: 0, ag: 0, tip: "Over 1.5", hit: false, source: "sweep" },
     { match_date: DATE, home: "Rio Ave", away: "Sp Lisbon",
       hg: 0, ag: 0, tip: "Over 1.5", hit: false, source: "sweep" }],
    [], B.makeScoreBudget(), sources);
  assert.deepStrictEqual(sv.calls, [DATE],
    "one fetch, however many rows failed to match and got traced");
});
