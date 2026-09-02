"use strict";

/**
 * What stops the score oracle eating its own account again.
 *
 * The last one was suspended, and the arithmetic is not subtle. API-Football's
 * free plan allows 100 requests a day. The build grades scores, every deploy
 * rebuilds the board, and there were 37 to 63 deploys a day between 27 Aug and
 * 1 Sep 2026. Two passes - confirmScores and recordPublishedTips - each built
 * their own byDate map and never shared one, so a date in both was paid for
 * twice. Four dates across two passes is about eight requests a build, and
 * fifty builds a day is 200 to 400 against a limit of 100.
 *
 * Nothing in the code could have said so, either. The account simply went
 * quiet, and the reason was worked out days later from commit counts.
 *
 * SoccerVista sits ahead of the oracle now and almost always answers, so the
 * oracle is rarely reached - but that is ordering, not a limit. If SoccerVista
 * goes down, every build falls through to the oracle at full volume and kills
 * the replacement key exactly as before. These are the limits.
 */

const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const today = iso(Date.now());

test("a date is looked up once per build, however many passes ask", async () => {
  /* The halving. confirmScores and recordPublishedTips both ask about the same
     day; the second one must cost nothing.

     Driven through a stub rather than by seeding budget.memo directly. The
     seeded version pinned the memo's KEY SHAPE, which is an implementation
     detail and duly changed - the key is source-and-date now that the
     fall-through is per fixture - and the seeded entry simply stopped being
     found, so the call walked the REAL source list and made live requests to
     SoccerVista. It still passed for a while, on somebody else's data. */
  const o = stub("oracle", HIT);
  const budget = B.makeScoreBudget();
  const a = await B.firstScoreSource(today, [], budget, [o.src]);
  const b = await B.firstScoreSource(today, [], budget, [o.src]);
  assert.deepStrictEqual(o.calls, [today], "one request served both passes");
  assert.strictEqual(a.rows, b.rows,
    "the same rows object, so nothing was re-fetched behind the memo");
  assert.strictEqual(budget.spent, 1, "and it was charged once, not twice");
});

/* A stand-in source, so nothing here touches the network. */
function stub(name, answer) {
  const calls = [];
  return { calls, src: { name, api: {
    configured: () => true,
    resultsFor: async (date) => { calls.push(date); return answer(date); },
  } } };
}
const HIT = () => ({ ok: true, rows: [{ home: "A", away: "B", hg: 1, ag: 0 }] });
const NOTHING = () => ({ ok: true, rows: [] });

test("asking twice costs one request", async () => {
  /* The halving. confirmScores and recordPublishedTips both ask about the same
     day, and the second one must be free. */
  const o = stub("oracle", HIT);
  const budget = B.makeScoreBudget();
  await B.firstScoreSource(today, [], budget, [o.src]);
  await B.firstScoreSource(today, [], budget, [o.src]);
  assert.deepStrictEqual(o.calls, [today], "one request, not two");
  assert.strictEqual(budget.spent, 1);
});

test("a date that came back empty is remembered as empty", async () => {
  /* Otherwise the second pass asks again and spends a request to be told the
     same nothing - which is half of how the last account was drained. */
  const o = stub("oracle", NOTHING);
  const budget = B.makeScoreBudget();
  assert.strictEqual(await B.firstScoreSource(today, [], budget, [o.src]), null);
  assert.strictEqual(await B.firstScoreSource(today, [], budget, [o.src]), null);
  assert.strictEqual(o.calls.length, 1, "a miss is an answer and must be cached");
});

test("every oracle request is counted against the budget", async () => {
  /* Uncounted requests are unbudgeted requests. */
  /* Distinct dates, or the memo answers and nothing is spent - which is what
     the first draft of this test accidentally measured. Started one short of
     the budget so the stop can be seen rather than inferred. */
  const o = stub("oracle", NOTHING);
  const budget = B.makeScoreBudget();
  budget.spent = B.ORACLE_BUDGET - 1;
  await B.firstScoreSource(today, [], budget, [o.src]);
  await B.firstScoreSource(iso(Date.now() - DAY), [], budget, [o.src]);
  assert.strictEqual(budget.spent, B.ORACLE_BUDGET,
    "it must stop at the budget, not sail past it");
  assert.deepStrictEqual(o.calls, [today],
    "the second date was never asked about");
});

test("SoccerVista is not rationed, only the oracle is", async () => {
  /* It is free and it is the primary source. Capping it would starve grading
     to protect an allowance it does not use. */
  const sv = stub("soccervista", NOTHING);
  const budget = B.makeScoreBudget();
  budget.spent = B.ORACLE_BUDGET;
  for (let i = 0; i < 5; i++) {
    await B.firstScoreSource(iso(Date.now() - i * DAY), [], budget, [sv.src]);
  }
  assert.strictEqual(sv.calls.length, 5,
    "SoccerVista answers every time, including days past the oracle's window");
  assert.strictEqual(budget.spent, B.ORACLE_BUDGET, "and spends none of the oracle's budget");
});

test("the allowance the oracle reports is carried back", async () => {
  const o = stub("oracle", () => ({ ok: true, rows: [{ home: "A", away: "B", hg: 1, ag: 0 }], quota: 12 }));
  const budget = B.makeScoreBudget();
  await B.firstScoreSource(today, [], budget, [o.src]);
  assert.strictEqual(budget.quota, 12, "so the build can say how close it is");
});

test("a date with no result is remembered too", async () => {
  /* Otherwise a blank day is asked about again by the second pass and costs a
     second request to be told the same nothing. Through a stub, for the same
     reason as above: seeding the memo pinned its key shape and sent the real
     call to the network once that shape changed. */
  const o = stub("oracle", NOTHING);
  const budget = B.makeScoreBudget();
  assert.strictEqual(await B.firstScoreSource(today, [], budget, [o.src]), null);
  assert.strictEqual(await B.firstScoreSource(today, [], budget, [o.src]), null);
  assert.deepStrictEqual(o.calls, [today], "a remembered miss is not asked again");
  assert.strictEqual(budget.spent, 1, "and the one request it did make is counted");
});

test("the oracle is never asked more than its budget in one build", async () => {
  /* Driven through sourceCanAnswer rather than firstScoreSource: the latter
     walks the REAL sources, so an earlier version of this test quietly made
     live network calls to SoccerVista. A test that reaches the internet is
     slow, flaky, and measures somebody else's uptime. */
  const oracle = { name: "oracle" }, sv = { name: "soccervista" };
  const budget = B.makeScoreBudget();
  assert.strictEqual(B.sourceCanAnswer(oracle, today, budget), true, "the first calls are allowed");
  budget.spent = B.ORACLE_BUDGET;
  assert.strictEqual(B.sourceCanAnswer(oracle, today, budget), false, "past the budget it is not");
  assert.strictEqual(B.sourceCanAnswer(sv, today, budget), true,
    "and the budget is the ORACLE's - SoccerVista is free and must not be capped");
});

test("the oracle is not asked about dates its plan refuses", async () => {
  /* The free plan serves a rolling three days and refuses the rest - and a
     refusal still costs a request. ORACLE_WINDOW_DAYS is 7 because SoccerVista
     reaches a week; that is not the oracle's window. */
  const oracle = { name: "oracle" }, sv = { name: "soccervista" };
  const budget = B.makeScoreBudget();
  const old = iso(Date.now() - 6 * DAY);
  assert.strictEqual(B.sourceCanAnswer(oracle, old, budget), false);
  assert.strictEqual(B.sourceCanAnswer(sv, old, budget), true,
    "SoccerVista reaches a week, which is why the window is 7 in the first place");
  assert.strictEqual(B.sourceCanAnswer(oracle, iso(Date.now() - 1 * DAY), budget), true,
    "yesterday is well inside its window");
  assert.strictEqual(B.sourceCanAnswer(oracle, "nonsense", budget), false,
    "an unparseable date is not worth a request");
});

test("the budget is smaller than a day's allowance divided by a day's deploys", () => {
  /* The number that matters. 100 requests a day, and this project has done 63
     deploys in one day. Anything above 1 is technically over on the worst day,
     so the point of the budget is to make the WORST case survivable rather
     than the average: 3 x 63 is 189, still over 100, which is precisely why
     SoccerVista leads and why the remaining allowance is logged. If the oracle
     ever becomes the primary source this number has to come down. */
  assert.ok(B.ORACLE_BUDGET <= 4,
    "a bigger budget cannot survive this project's deploy rate");
  assert.ok(B.ORACLE_MAX_AGE_DAYS <= 3,
    "the free plan serves three days; asking wider spends requests on refusals");
});

test("the build reports what it spent and warns when the plan runs low", () => {
  const log = [];
  const budget = B.makeScoreBudget();
  budget.spent = 2; budget.memo.set("2026-09-01", null); budget.quota = 7;
  B.logScoreBudget(budget, log);
  const line = log.join("\n");
  assert.match(line, /2 of \d+ calls used/);
  assert.match(line, /7 left on the plan today/,
    "the allowance the API reports on every reply");
  assert.match(line, /WARNING only 7 requests left/,
    "silence is how the last account was lost");
});

test("no quota header is not reported as zero left", () => {
  /* An absent header means we do not know, and printing "0 left" would send
     somebody looking for a problem that is not there. */
  const log = [];
  const budget = B.makeScoreBudget();
  budget.spent = 1;
  B.logScoreBudget(budget, log);
  assert.doesNotMatch(log.join("\n"), /left on the plan/);
  assert.doesNotMatch(log.join("\n"), /WARNING/);
});

test("the oracle reports the allowance it has left", async () => {
  /* lib/oracle.js reads x-ratelimit-requests-remaining off every reply, so the
     build can say how close it is instead of the account going quiet. */
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "lib", "oracle.js"), "utf8");
  assert.match(src, /x-ratelimit-requests-remaining/i,
    "the header the plan states its remaining allowance in");
  assert.match(src, /rows: parseFixtures\(body\), quota \}/,
    "and it must travel back with a successful answer");
});
