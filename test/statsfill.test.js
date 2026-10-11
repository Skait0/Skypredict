"use strict";
/* lib/statsfill.js: corners and shots onto results we hold (25 Sep 2026).
   Driven through fakes - nothing here reaches API-Football or Supabase. */
const test = require("node:test");
const assert = require("node:assert");
const SF = require("../lib/statsfill.js");
const O = require("../lib/oracle.js");

const NOW = Date.parse("2026-09-27T08:05:00Z");

function fakes(rows, day, stats, opts) {
  const writes = [], asked = { dates: [], ids: [] };
  const db = {
    resultsWithoutStats: async () => (opts && opts.noColumns) ? { ok: true, rows: [], noColumns: true } : { ok: true, rows },
    patchStats: async (r, s) => { writes.push([r.home, s]); return { ok: true }; },
  };
  const oracle = {
    configured: () => true,
    findMatch: O.findMatch,
    resultsFor: async (d) => { asked.dates.push(d); return { ok: true, rows: day, quota: (opts && opts.quota) || 500 }; },
    statsFor: async (ids) => { asked.ids.push(ids); const o = {}; for (const id of ids) o[id] = id in stats ? stats[id] : null; return { ok: true, stats: o, quota: 499 }; },
  };
  return { db, oracle, writes, asked };
}
const ours = (home, away, hg, ag) => ({ match_date: "2026-09-26", home, away, hg, ag, league: "x" });
const theirs = (home, away, hg, ag, id, status) => ({ home, away, hg, ag, id, status: status || "FT" });

test("a matched result with the same score gets its corners and shots", async () => {
  const f = fakes([ours("Arbroath", "Queens Park", 1, 2)],
    [theirs("Arbroath", "Queens Park", 1, 2, 101)],
    { 101: { hc: 4, ac: 6, hsh: 9, ash: 14 } });
  const out = await SF.fillStats({ db: f.db, oracle: f.oracle, log: [] }, NOW);
  assert.equal(out.filled, 1);
  assert.deepEqual(f.writes[0], ["Arbroath", { hc: 4, ac: 6, hsh: 9, ash: 14 }]);
});

test("a pairing that disagrees on the score is skipped, never written", async () => {
  const f = fakes([ours("Arbroath", "Queens Park", 1, 2)],
    [theirs("Arbroath", "Queens Park", 2, 2, 101)], { 101: { hc: 4, ac: 6 } });
  const out = await SF.fillStats({ db: f.db, oracle: f.oracle, log: [] }, NOW);
  assert.equal(f.writes.length, 0);
  assert.equal(out.skipped, 1);
});

test("extra time and a fixture with no statistics are marked -1, not guessed", async () => {
  const f = fakes([ours("Racing", "Boca", 1, 1), ours("Ayr", "Stenhousemuir", 0, 0)],
    [theirs("Racing", "Boca", 1, 1, 201, "PEN"), theirs("Ayr", "Stenhousemuir", 0, 0, 202)],
    { 202: null });
  await SF.fillStats({ db: f.db, oracle: f.oracle, log: [] }, NOW);
  const byTeam = Object.fromEntries(f.writes);
  assert.equal(byTeam.Racing.hc, SF.NO_STATS, "120 minutes of corners do not settle a 90-minute market");
  assert.equal(byTeam.Ayr.hc, SF.NO_STATS, "they answered, with nothing");
});

test("no columns yet: nothing is asked of API-Football at all", async () => {
  const f = fakes([], [], {}, { noColumns: true });
  const out = await SF.fillStats({ db: f.db, oracle: f.oracle, log: [] }, NOW);
  assert.equal(out.asked, 0);
  assert.equal(f.asked.dates.length, 0);
});

test("below the quota floor it stops after the first answer", async () => {
  const rows = [ours("Arbroath", "Queens Park", 1, 2), Object.assign(ours("Raith", "Livingston", 1, 0), { match_date: "2026-09-25" })];
  const f = fakes(rows, [theirs("Arbroath", "Queens Park", 1, 2, 101)], { 101: { hc: 4, ac: 6 } }, { quota: 12 });
  const out = await SF.fillStats({ db: f.db, oracle: f.oracle, log: [] }, NOW);
  assert.equal(out.asked, 1, "one date asked, then the floor stops it");
});

test("it runs every hour, in the first ten minutes", () => {
  assert.equal(SF.dueNow(Date.parse("2026-09-27T08:05:00Z")), true);
  assert.equal(SF.dueNow(Date.parse("2026-09-27T09:05:00Z")), true);
  assert.equal(SF.dueNow(Date.parse("2026-09-27T08:15:00Z")), false);
});

test("the oracle reads corners by team id, and wants both sides", () => {
  const f = { teams: { home: { id: 7 }, away: { id: 9 } }, statistics: [
    { team: { id: 9 }, statistics: [{ type: "Corner Kicks", value: 2 }, { type: "Total Shots", value: 11 }] },
    { team: { id: 7 }, statistics: [{ type: "Corner Kicks", value: 6 }, { type: "Total Shots", value: null }] },
  ] };
  assert.deepEqual(O.statsOfFixture(f), { hc: 6, ac: 2, hsh: null, ash: 11 });
  f.statistics[0].statistics[0].value = null;
  assert.equal(O.statsOfFixture(f), null, "one side's corners missing is no corners");
});

test("past its deadline it asks nothing, so the sweep's 30-second limit is safe", async () => {
  const f = fakes([ours("Arbroath", "Queens Park", 1, 2)], [], {});
  const out = await SF.fillStats({ db: f.db, oracle: f.oracle, log: [], deadline: Date.now() - 1 }, NOW);
  assert.equal(out.asked, 0);
});

/* The goal order, for "3 or more goals in a row" (owner, 11 Oct 2026). */
test("the goal order comes off the same answer: own goals as listed, missed penalties dropped, stoppage time in order", () => {
  const ev = (min, team, detail, extra) => ({ type: "Goal", detail: detail || "Normal Goal", team: { id: team }, time: { elapsed: min, extra: extra || null } });
  const f = { teams: { home: { id: 7 }, away: { id: 9 } }, goals: { home: 4, away: 1 }, events: [
    ev(90, 7, "Normal Goal", 3), ev(12, 7), ev(40, 9, "Own Goal"), ev(55, 7, "Missed Penalty"), ev(90, 7), ev(70, 7),
    { type: "Card", detail: "Yellow Card", team: { id: 9 }, time: { elapsed: 20 } } ] };
  assert.equal(O.seqOfFixture(f), "HAHHH", "12 H, 40 own goal listed for 9 = A, 70 H, 90 H, 90+3 H; the missed penalty is not a goal");
  f.goals.home = 5;
  assert.equal(O.seqOfFixture(f), null, "events that do not rebuild the score give no order");
});

test("the order is written only where the score cannot settle a run, and a missing column stops it once", async () => {
  const seqs = [], f = fakes([ours("Arbroath", "Queens Park", 3, 1), ours("Brechin", "Elgin", 2, 2)],
    [theirs("Arbroath", "Queens Park", 3, 1, 101), theirs("Brechin", "Elgin", 2, 2, 102)], { 101: { hc: 4, ac: 6, hsh: 9, ash: 14 }, 102: { hc: 1, ac: 2, hsh: 3, ash: 4 } });
  f.oracle.statsFor = async (ids) => ({ ok: true, stats: { 101: { hc: 4, ac: 6, hsh: 9, ash: 14 }, 102: { hc: 1, ac: 2, hsh: 3, ash: 4 } }, seqs: { 101: "HHAH", 102: "HAHA" }, quota: 400 });
  f.db.patchSeq = async (r, s) => { seqs.push([r.home, s]); return { ok: true }; };
  const out = await SF.fillStats({ db: f.db, oracle: f.oracle, log: [] }, NOW);
  assert.deepEqual(seqs, [["Arbroath", "HHAH"]], "a 3-1 needs its order; a 2-2 does not");
  assert.equal(out.filled, 2, "the corners are written either way");
  const log = [], g = fakes([ours("Arbroath", "Queens Park", 3, 1), ours("Cove", "Peterhead", 1, 4)],
    [theirs("Arbroath", "Queens Park", 3, 1, 101), theirs("Cove", "Peterhead", 1, 4, 103)], {});
  g.oracle.statsFor = async () => ({ ok: true, stats: { 101: null, 103: null }, seqs: { 101: "HHAH", 103: "AAHAA" }, quota: 400 });
  let tries = 0; g.db.patchSeq = async () => { tries++; return { ok: false, noColumn: true }; };
  await SF.fillStats({ db: g.db, oracle: g.oracle, log }, NOW);
  assert.equal(tries, 1, "no seq column: asked once, then left alone");
  assert.ok(log.some((l) => /no seq column/.test(l)));
});
