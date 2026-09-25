/* The paid API-Football plan (Pro, 7,500 a day, kept from 25 Sep 2026).

   The free-plan limits in oraclebudget.test.js still stand and still guard the
   day the plan lapses. These pin the other side: on a paid plan the oracle
   leads and gets a budget worth having - and "paid" is only ever what
   /status says right now, never assumed. */

const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");
const ORACLE = require("../lib/oracle.js");

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const MATCHES = [
  { date: new Date(Date.now() - 3 * DAY), league: "England Premier League",
    home: "Chelsea", away: "Fulham", hg: 2, ag: 0, hth: 1, hta: 0 },
];

test("on a paid plan the oracle leads, then SoccerVista, then football-data", () => {
  assert.deepStrictEqual(B.scoreSources(MATCHES, true).map((s) => s.name),
    ["oracle", "soccervista", "footballdata"]);
  assert.deepStrictEqual(B.scoreSources([], true).map((s) => s.name),
    ["oracle", "soccervista"], "no downloaded results, no football-data");
});

test("without a paid plan the order is exactly the free one", () => {
  const shape = (list) => list.map((s) => s.name + ":" + s.days);
  assert.deepStrictEqual(shape(B.scoreSources(MATCHES, false)), shape(B.scoreSources(MATCHES)));
  assert.strictEqual(B.scoreSources(MATCHES)[0].name, "soccervista");
});

test("the paid oracle reaches back as far as results are held", () => {
  const days = {};
  for (const s of B.scoreSources(MATCHES, true)) days[s.name] = s.days;
  assert.strictEqual(days.oracle, B.PAID_ORACLE_DAYS);
  const oracle = B.scoreSources(MATCHES, true)[0];
  assert.strictEqual(B.sourceCanAnswer(oracle, iso(Date.now() - 10 * DAY), B.makeScoreBudget(true)), true,
    "ten days back is a normal ask on a paid plan");
});

test("a paid build gets the paid budget, and still stops at it", () => {
  const oracle = { name: "oracle", days: B.PAID_ORACLE_DAYS };
  const today = iso(Date.now());
  const paid = B.makeScoreBudget(true);
  paid.spent = B.ORACLE_BUDGET;
  assert.strictEqual(B.sourceCanAnswer(oracle, today, paid), true, "3 is nothing on 7,500 a day");
  paid.spent = B.PAID_ORACLE_BUDGET;
  assert.strictEqual(B.sourceCanAnswer(oracle, today, paid), false, "but the cap is still a cap");

  const free = B.makeScoreBudget();
  free.spent = B.ORACLE_BUDGET;
  assert.strictEqual(B.sourceCanAnswer(oracle, today, free), false, "no plan info, free limits");
});

test("the floor holds on a paid plan too", () => {
  const paid = B.makeScoreBudget(true);
  paid.quota = 5;
  assert.strictEqual(B.sourceCanAnswer({ name: "oracle" }, iso(Date.now()), paid), false,
    "a paid account at 5 left is one bad build from zero");
});

test("the paid budget fits the day at the worst deploy rate seen", () => {
  /* 63 deploys in one day, plus ~300 for the sweep and the stats fill. */
  assert.ok(B.PAID_ORACLE_BUDGET * 63 + 300 < 7500);
});

test("planStatus: paid only when /status says active with a paid-size limit", async () => {
  const had = process.env.APISPORTS_KEY, realFetch = global.fetch;
  process.env.APISPORTS_KEY = "test";
  const answer = (body) => { global.fetch = async () => ({ ok: true, json: async () => body }); };
  try {
    answer({ response: { subscription: { active: true, plan: "Pro" }, requests: { limit_day: 7500 } } });
    assert.deepStrictEqual(await ORACLE.planStatus(), { paid: true, limit: 7500 });

    answer({ response: { subscription: { active: true, plan: "Free" }, requests: { limit_day: 100 } } });
    assert.strictEqual((await ORACLE.planStatus()).paid, false, "the free plan is not paid");

    answer({ response: { subscription: { active: false }, requests: { limit_day: 7500 } } });
    assert.strictEqual((await ORACLE.planStatus()).paid, false, "a lapsed paid plan is not paid");

    answer({ errors: { access: "Your account is suspended" }, response: [] });
    assert.strictEqual((await ORACLE.planStatus()).paid, false, "a suspended account is not paid");

    global.fetch = async () => { throw new Error("network down"); };
    assert.strictEqual((await ORACLE.planStatus()).paid, false, "no answer means free limits");

    delete process.env.APISPORTS_KEY;
    global.fetch = async () => { throw new Error("must not be called without a key"); };
    assert.deepStrictEqual(await ORACLE.planStatus(), { paid: false, limit: null });
  } finally {
    global.fetch = realFetch;
    if (had === undefined) delete process.env.APISPORTS_KEY;
    else process.env.APISPORTS_KEY = had;
  }
});

test("the build asks for the plan and hands it to both the budget and the list", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "lib", "build.js"), "utf8");
  assert.match(src, /const plan = await ORACLE\.planStatus\(\);\s*const scoreBudget = makeScoreBudget\(plan\.paid\);/);
  assert.match(src, /cfg\._sources = scoreSources\(matches, plan\.paid\)/);
  assert.ok(!/for \(const src of SCORE_SOURCES\)/.test(src),
    "every build path walks cfg._sources, so the order cannot differ between passes");
});
