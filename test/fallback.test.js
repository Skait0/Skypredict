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
  assert.ok(log.some((l) => /oracle .*not asked/.test(l)));
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
