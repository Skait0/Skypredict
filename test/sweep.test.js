"use strict";

const test = require("node:test");
const assert = require("node:assert");

/* The sweep is stubbed at its two edges - the feeds it reads and the store it
   writes - so the logic in between can be exercised without a network or a
   database. Both matter: the observe half has to pair a feed's spelling of a
   club to ours, and the finalise half decides whether a score is final, which
   is the one judgement here that can put a wrong row in the record. */
const DB = require("../lib/supabase.js");
process.env.SWEEP_KEY = "k";

const KICK = "2026-08-27T18:45:00.000Z";
const OLD = Date.now() - 3 * 3600 * 1000;       // kicked off three hours ago
const RECENT = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // seen 10m ago

function payload(extra) {
  return Object.assign({
    fixtures: [{
      date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
      league: "England Conference National", tip: "Over 1.5", tip_p: 0.82,
      kickoff: new Date(OLD).toISOString(),
    }],
    results: [],
  }, extra || {});
}

function install({ live, stored, payloadBody }) {
  const calls = { inserted: [], upserted: [], deleted: [] };
  global.fetch = async (url) => {
    const u = String(url);
    const body = u.indexOf("/api/live") >= 0
      ? { matches: live || [] }
      : (payloadBody || payload());
    return { ok: true, json: async () => body };
  };
  DB.configured = () => true;
  DB.listLiveSeen = async () => ({ ok: true, rows: stored || [] });
  DB.upsertLiveSeen = async (rows) => { calls.upserted = rows; return { ok: true, n: rows.length }; };
  DB.insertResults = async (rows) => { calls.inserted = rows; return { ok: true, inserted: rows.length }; };
  DB.deleteLiveSeen = async (keys) => { calls.deleted = keys; return { ok: true, n: keys.length }; };
  return calls;
}

function run(url) {
  const handler = require("../api/record-sweep.js");
  const res = { _s: 200, _j: null, setHeader() {}, status(c) { this._s = c; return this; },
                json(b) { this._j = b; return this; } };
  return handler({ headers: { host: "x.test", "x-sweep-key": "k" }, url: url || "/api/record-sweep" }, res)
    .then(() => res);
}

test("a caller without the key gets nothing", async () => {
  install({});
  const handler = require("../api/record-sweep.js");
  const res = { _s: 200, _j: null, setHeader() {}, status(c) { this._s = c; return this; },
                json(b) { this._j = b; return this; } };
  await handler({ headers: { host: "x.test" }, url: "/" }, res);
  assert.strictEqual(res._s, 401);
});

test("a live match is paired to our fixture despite a different spelling", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood FC", away: "Boston Utd", homeScore: 2, awayScore: 1,
             minute: 74, status: "H2" }],
  });
  const res = await run();
  assert.strictEqual(res._j.observed, 1);
  assert.strictEqual(calls.upserted.length, 1);
  assert.strictEqual(calls.upserted[0].hg, 2);
  assert.strictEqual(calls.upserted[0].minute, 74);
});

test("a match that has gone, seen late, is graded at its last score", async () => {
  const calls = install({
    live: [],
    stored: [{
      match_key: "2026-08-27|boreham-wood|boston-utd",
      match_date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
      home_norm: "boreham-wood", away_norm: "boston-utd", league: "England Conference National",
      tip: "Over 1.5", tip_p: 0.82, kickoff: new Date(OLD).toISOString(),
      hg: 2, ag: 1, minute: 88, status: "H2", last_seen: RECENT,
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.finalised, 1);
  assert.strictEqual(calls.inserted.length, 1);
  assert.strictEqual(calls.inserted[0].hit, true);       // 3 goals clears Over 1.5
  assert.strictEqual(calls.inserted[0].source, "sweep");
  // and the working row is cleared once it has been banked
  assert.deepStrictEqual(calls.deleted, ["2026-08-27|boreham-wood|boston-utd"]);
});

/* The guard. A match that disappears mid-game disappeared for some other
   reason, and for a cup tie nothing downstream will ever correct a wrong row. */
test("a match that vanished at 62 minutes is not treated as finished", async () => {
  const calls = install({
    live: [],
    stored: [{
      match_key: "k1", match_date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
      home_norm: "boreham-wood", away_norm: "boston-utd", league: "",
      tip: "Over 1.5", kickoff: new Date(OLD).toISOString(),
      hg: 1, ag: 0, minute: 62, status: "H2", last_seen: RECENT,
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.finalised, 0);
  assert.strictEqual(res._j.held.notLate, 1);
  assert.strictEqual(calls.inserted.length, 0);
});

test("a match still inside its own 90 minutes is left alone", async () => {
  install({
    live: [],
    stored: [{
      match_key: "k2", match_date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
      home_norm: "boreham-wood", away_norm: "boston-utd", league: "",
      tip: "Over 1.5", kickoff: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      hg: 1, ag: 0, minute: 85, status: "H2", last_seen: RECENT,
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.finalised, 0);
  assert.strictEqual(res._j.held.tooSoon, 1);
});

test("a match seen this moment is still on, not gone", async () => {
  install({
    live: [],
    stored: [{
      match_key: "k3", match_date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
      home_norm: "boreham-wood", away_norm: "boston-utd", league: "",
      tip: "Over 1.5", kickoff: new Date(OLD).toISOString(),
      hg: 1, ag: 0, minute: 90, status: "H2", last_seen: new Date().toISOString(),
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.finalised, 0);
  assert.strictEqual(res._j.held.stillOn, 1);
});

test("a tip we cannot settle from a final score is never stored as a miss", async () => {
  const calls = install({
    live: [],
    stored: [{
      match_key: "k4", match_date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
      home_norm: "boreham-wood", away_norm: "boston-utd", league: "",
      tip: "First half goal", kickoff: new Date(OLD).toISOString(),
      hg: 2, ag: 1, minute: 90, status: "H2", last_seen: RECENT,
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.finalised, 0);
  assert.strictEqual(res._j.held.ungradeable, 1);
  assert.strictEqual(calls.inserted.length, 0);
});

test("a fixture the build has already graded is not re-recorded", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood", away: "Boston Utd", homeScore: 2, awayScore: 1,
             minute: 88, status: "H2" }],
    payloadBody: payload({
      results: [{ date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
                  hg: 2, ag: 1, tip: "Over 1.5", hit: true }],
    }),
  });
  const res = await run();
  assert.strictEqual(res._j.observed, 0);
  assert.strictEqual(calls.upserted.length, 0);
});

test("a row nobody ever resolved is expired rather than kept forever", async () => {
  const calls = install({
    live: [],
    stored: [{
      match_key: "k5", match_date: "2026-08-20", home: "A", away: "B",
      home_norm: "a", away_norm: "b", league: "", tip: "Over 1.5",
      kickoff: new Date(Date.now() - 40 * 3600 * 1000).toISOString(),
      hg: 0, ag: 0, minute: 30, status: "H1",
      last_seen: new Date(Date.now() - 30 * 3600 * 1000).toISOString(),
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.expired, 1);
  assert.deepStrictEqual(calls.deleted, ["k5"]);
});
