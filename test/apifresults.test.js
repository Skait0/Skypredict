"use strict";
/* lib/apifresults.js: final scores stated by API-Football, ahead of the
   watched guess (25 Sep 2026). Driven through fakes - nothing here reaches
   API-Football or Supabase. */
const test = require("node:test");
const assert = require("node:assert");
const AR = require("../lib/apifresults.js");
const O = require("../lib/oracle.js");
const G = require("../lib/grade.js");
const K = require("../lib/key.js");

const NOW = Date.parse("2026-09-26T20:00:00Z");
const fx = (home, away, kickoff, tip) => ({ date: kickoff.slice(0, 10), home, away, kickoff, tip: tip || "Home win", tip_p: 0.6, league: "x" });

function fakes(stored, day, opts) {
  const inserted = [], verified = [], asked = [];
  const db = {
    recentResults: async () => ({ ok: true, rows: stored || [] }),
    insertResults: async (rows) => { inserted.push(...rows); return { ok: true, inserted: rows.length }; },
    verifyResult: async (row) => { verified.push(row); return { ok: true }; },
  };
  const oracle = {
    configured: () => true,
    findMatch: O.findMatch,
    resultsFor: async (d) => { asked.push(d); return { ok: true, rows: day, quota: (opts && opts.quota) || 5000 }; },
  };
  return { db, oracle, inserted, verified, asked };
}
function run(f, fixtures, served) {
  return AR.finalScores({ fixtures, served: served || new Set(), oracle: f.oracle, db: f.db,
    grade: G.gradeLabel, key: K.fixtureKey, slug: K.slug, modelOf: () => null, log: [] }, NOW);
}

test("a finished published game is banked from the stated score, as a verified result", async () => {
  const f = fakes([], [{ home: "Ayr Utd", away: "Stenhousemuir", hg: 2, ag: 0, status: "FT", id: 1 }]);
  const out = await run(f, [fx("Ayr United", "Stenhousemuir", "2026-09-26T14:00:00Z")]);
  assert.equal(out.inserted, 1);
  const r = f.inserted[0];
  assert.deepEqual([r.hg, r.ag, r.hit, r.source], [2, 0, true, "oracle"]);
});

test("a watched guess is corrected in place, never duplicated", async () => {
  const stored = [{ match_date: "2026-09-26", home: "Ayr United", away: "Stenhousemuir", hg: 1, ag: 0, source: "sweep" }];
  const f = fakes(stored, [{ home: "Ayr Utd", away: "Stenhousemuir", hg: 1, ag: 1, status: "FT", id: 1 }]);
  const out = await run(f, [fx("Ayr United", "Stenhousemuir", "2026-09-26T14:00:00Z")]);
  assert.equal(f.inserted.length, 0);
  assert.equal(out.corrected, 1);
  assert.deepEqual([f.verified[0].hg, f.verified[0].ag, f.verified[0].hit], [1, 1, false]);
});

test("a game already verified, or graded by the build, costs no request", async () => {
  const stored = [{ match_date: "2026-09-26", home: "Ayr United", away: "Stenhousemuir", hg: 2, ag: 0, source: "oracle" }];
  const f = fakes(stored, []);
  await run(f, [fx("Ayr United", "Stenhousemuir", "2026-09-26T14:00:00Z")]);
  assert.equal(f.asked.length, 0, "verified already");
  const g = fakes([], []);
  await run(g, [fx("Raith", "Livingston", "2026-09-26T14:00:00Z")], new Set([K.fixtureKey("2026-09-26", "Raith", "Livingston")]));
  assert.equal(g.asked.length, 0, "the build already graded it");
});

test("a game still on, or not yet long enough gone, is not asked about", async () => {
  const f = fakes([], []);
  await run(f, [fx("Ayr United", "Stenhousemuir", "2026-09-26T19:00:00Z")]);   // 60 minutes ago
  assert.equal(f.asked.length, 0);
});

test("a tip a final score cannot settle is left for the build, and an unmatched game is not guessed", async () => {
  const f = fakes([], [{ home: "Ayr Utd", away: "Stenhousemuir", hg: 2, ag: 0, status: "FT", id: 1 }]);
  const out = await run(f, [
    fx("Ayr United", "Stenhousemuir", "2026-09-26T14:00:00Z", "Goal in 1st half"),
    fx("Nobody", "Anywhere", "2026-09-26T14:00:00Z"),
  ]);
  assert.equal(f.inserted.length, 0);
  assert.equal(out.ungradeable, 1);
  assert.equal(out.unmatched, 1);
});

test("below the quota floor it stops asking", async () => {
  const f = fakes([], [], { quota: 10 });
  await run(f, [fx("A", "B", "2026-09-26T14:00:00Z"), fx("C", "D", "2026-09-25T14:00:00Z")]);
  assert.equal(f.asked.length, 1, "one date asked, then the floor stops it");
});
