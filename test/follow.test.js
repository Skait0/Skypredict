"use strict";
/* "Follow my slip" (lib/follow.js, api/tgfollow.js, lib/grade.js additions). */
const test = require("node:test");
const assert = require("node:assert");
const F = require("../lib/follow.js");
const G = require("../lib/grade.js");

const legs = [
  { date: "2026-09-25", home: "Inverness C", away: "Morton", code: "1X", grade: "1X", name: "Inverness C or draw" },
  { date: "2026-09-25", home: "Girona", away: "Albacete", code: "HOME_OVER_0.5", grade: "Home over 0.5", name: "Girona to score" },
];
const res = (home, away, hg, ag) => ({ date: "2026-09-25", home, away, hg, ag });

test("the grader settles team totals and side combinations now", () => {
  assert.strictEqual(G.gradeLabel("Home over 0.5", 1, 0), true);
  assert.strictEqual(G.gradeLabel("Away over 1.5", 3, 1), false);
  assert.strictEqual(G.gradeLabel("Home win or over 2.5", 1, 2), true);
  assert.strictEqual(G.gradeLabel("Away win or both score", 2, 0), false);
  assert.strictEqual(G.gradeLabel("Not both teams score", 1, 1), false);
  assert.strictEqual(F.labelFor("HOME_OVER_1.5"), "Home over 1.5");
  assert.strictEqual(F.labelFor("MIX_2_OV_2.5"), "Away win or over 2.5");
  assert.strictEqual(F.labelFor("FH_OVER_0.5"), null, "a half-time market is not tracked");
});

test("each leg is announced once, as it settles", () => {
  const f = { code: "RQWKNC", legs, seen: {} };
  const a = F.step(f, [res("Inverness C", "Morton", 2, 1)]);
  assert.deepStrictEqual(a.lines, ["✅ Inverness C or draw · Inverness C 2-1 Morton"]);
  assert.strictEqual(a.done, false);
  const b = F.step(Object.assign({}, f, { seen: a.seen }), [res("Inverness C", "Morton", 2, 1)]);
  assert.deepStrictEqual(b.lines, [], "no repeat on the next run");
});

test("the slip's final word: landed, so close, or we go again", () => {
  const all = F.step({ code: "RQWKNC", legs, seen: {} }, [res("Inverness C", "Morton", 1, 1), res("Girona", "Albacete", 2, 0)]);
  assert.ok(all.done);
  assert.match(all.final, /YOUR SLIP LANDED/);
  const close = F.step({ code: "RQWKNC", legs, seen: {} }, [res("Inverness C", "Morton", 1, 1), res("Girona", "Albacete", 0, 0)]);
  assert.match(close.final, /So close.*1 of 2/);
  assert.match(close.lines[1], /^😤 Girona to score/);
});

test("a slip days old and still unsettled closes itself", () => {
  const f = { code: "OLD", legs, seen: {}, last_kickoff: "2026-09-20T18:00:00Z" };
  const s = F.step(f, [], Date.parse("2026-09-24T18:00:00Z"));
  assert.ok(s.done && s.stale);
  const fresh = F.step(Object.assign({}, f, { last_kickoff: "2026-09-24T17:00:00Z" }), [], Date.parse("2026-09-24T18:00:00Z"));
  assert.ok(!fresh.done);
});

test("the follow job refuses strangers", async () => {
  const saved = { cron: process.env.CRON_SECRET, key: process.env.SWEEP_KEY };
  process.env.CRON_SECRET = "s3cret"; process.env.SWEEP_KEY = "k";
  const h = require("../api/tgfollow.js");
  const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; } };
  await h({ headers: { "user-agent": "vercel-cron/1.0" } }, res);
  assert.strictEqual(res.code, 401, "with a secret set, the user agent alone is not enough");
  await h({ headers: { authorization: "Bearer wrong" } }, res);
  assert.strictEqual(res.code, 401);
  process.env.CRON_SECRET = saved.cron || ""; if (!saved.cron) delete process.env.CRON_SECRET;
  process.env.SWEEP_KEY = saved.key || ""; if (!saved.key) delete process.env.SWEEP_KEY;
});

test("names with & or < reach Telegram escaped, and the board's own &amp; is not doubled", () => {
  const f = { code: "BIH", seen: {}, legs: [{ date: "2026-09-25", home: "Bosnia &amp; Herzegovina", away: "A<B",
    code: "1X", grade: "1X", name: "Bosnia &amp; Herzegovina or draw" }] };
  const s = F.step(f, [{ date: "2026-09-25", home: "Bosnia &amp; Herzegovina", away: "A<B", hg: 1, ag: 0 }]);
  assert.strictEqual(s.lines[0], "✅ Bosnia &amp; Herzegovina or draw · Bosnia &amp; Herzegovina 1-0 A&lt;B");
});

test("whole goal lines are not tracked - a push must not be called a loss", () => {
  assert.strictEqual(F.labelFor("OVER_2"), null);
  assert.strictEqual(F.labelFor("UNDER_3"), null);
  assert.strictEqual(F.labelFor("OVER_2.5"), "Over 2.5");
});

test("the timed jobs share one door, and a faked user agent is refused once CRON_SECRET is set", () => {
  const { allowed } = require("../lib/cronauth.js");
  const saved = { c: process.env.CRON_SECRET, k: process.env.SWEEP_KEY };
  process.env.CRON_SECRET = "c1"; process.env.SWEEP_KEY = "k1";
  try {
    assert.ok(allowed({ headers: { authorization: "Bearer c1" } }));
    assert.ok(allowed({ headers: { "x-sweep-key": "k1" } }), "the sweep key still works by hand");
    assert.ok(!allowed({ headers: { "user-agent": "vercel-cron/1.0" } }));
  } finally {
    if (saved.c == null) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved.c;
    if (saved.k == null) delete process.env.SWEEP_KEY; else process.env.SWEEP_KEY = saved.k;
  }
});
