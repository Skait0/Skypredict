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

/* The Simulated Reality League runs simulated versions of the very card we
   publish, all night, in short cycles. If one were ever paired to a real
   fixture its invented scoreline would land in the record as a result. */
test("a simulated match is never paired to a real fixture", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood", away: "Boston Utd", league: "Simulated Reality League",
             homeScore: 5, awayScore: 5, minute: 88, status: "H2" }],
  });
  const res = await run();
  assert.strictEqual(res._j.observed, 0);
  assert.strictEqual(res._j.simulatedIgnored, 1);
  assert.strictEqual(calls.upserted.length, 0);
});

test("the SRL suffix on club names is caught too, not just the league", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood SRL", away: "Boston Utd SRL", league: "Premier League",
             homeScore: 5, awayScore: 5, minute: 88, status: "H2" }],
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

/* A match page shows the probability spread and both sides' form. Once the
   game is played the fixture leaves the board and takes those with it, and for
   a cup tie the build can never re-derive them - a cup has no league in the
   model's index. The snapshot taken while the match was still a fixture is the
   only copy that will ever exist, so it has to survive both hops. */
const MODEL = { home_p: 0.43, draw_p: 0.27, away_p: 0.30, o15: 0.75, o25: 0.5,
                lh: 1.49, la: 1.2, score: "1-1", form_home: ["W", "L"] };

test("the model's numbers are stored with the match while it is on", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood", away: "Boston Utd", homeScore: 1, awayScore: 0,
             minute: 70, status: "H2" }],
    payloadBody: payload({
      fixtures: [Object.assign({
        date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
        league: "England Conference National", tip: "Over 1.5", tip_p: 0.82,
        kickoff: new Date(OLD).toISOString(),
      }, MODEL)],
    }),
  });
  await run();
  assert.deepStrictEqual(calls.upserted[0].model, MODEL);
});

test("they travel from the working row into the result", async () => {
  const calls = install({
    live: [],
    stored: [{
      match_key: "m1", match_date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
      home_norm: "boreham-wood", away_norm: "boston-utd", league: "FA Cup",
      tip: "Over 1.5", tip_p: 0.82, kickoff: new Date(OLD).toISOString(),
      hg: 2, ag: 1, minute: 88, status: "H2", last_seen: RECENT, model: MODEL,
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.finalised, 1);
  assert.deepStrictEqual(calls.inserted[0].model, MODEL);
});

/* A fixture with no numbers must not write an empty object that looks like a
   snapshot to everything downstream. */
test("a fixture carrying no numbers stores null, not an empty snapshot", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood", away: "Boston Utd", homeScore: 0, awayScore: 0,
             minute: 30, status: "H1" }],
  });
  await run();
  assert.strictEqual(calls.upserted[0].model, null);
});

/* Counts said a row was stuck without saying which or why, and the answer was
   only reachable through the database. */
test("a held row explains itself in the response", async () => {
  install({
    live: [],
    stored: [{
      match_key: "h1", match_date: "2026-08-27",
      home: "Dalian Yingbo", away: "Beijing Guoan",
      home_norm: "dalian-yingbo", away_norm: "beijing-guoan",
      league: "China Super League", tip: "Over 1.5",
      kickoff: new Date(OLD).toISOString(),
      hg: 0, ag: 1, minute: 55, status: "H2", last_seen: RECENT,
    }],
  });
  const res = await run();
  assert.strictEqual(res._j.held.notLate, 1);
  const why = res._j.heldWhy.join(" ");
  assert.match(why, /Dalian Yingbo v Beijing Guoan/);
  assert.match(why, /China Super League/);
  assert.match(why, /55'/);
  assert.match(why, /before the 80th minute/);
});

/* A match in play cannot be one that kicks off later. Seen in the wild: our
   Liga MX fixture carried a kick-off five hours in the future while the live
   feed showed that pairing at the 85th minute. Either the kick-off was wrong
   or two different games shared both club names, and the sweep cannot tell
   which - so it must not write either down. */
test("a fixture that has not kicked off yet is never paired to a live match", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood", away: "Boston Utd", homeScore: 1, awayScore: 0,
             minute: 85, status: "H2" }],
    payloadBody: payload({
      fixtures: [{
        date: "2026-08-29", home: "Boreham Wood", away: "Boston Utd",
        league: "Mexico Liga MX", tip: "Over 1.5", tip_p: 0.8,
        kickoff: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
      }],
    }),
  });
  const res = await run();
  assert.strictEqual(res._j.observed, 0);
  assert.strictEqual(res._j.notYet, 1);
  assert.match(res._j.notYetWhy[0], /kicks off in \d+m/);
  assert.strictEqual(calls.upserted.length, 0, "nothing may be written down");
});

/* The guard must not swallow ordinary matches: a feed a few minutes ahead of
   our clock is normal, and a game already under way is the whole point. */
test("a match already under way is still observed", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood", away: "Boston Utd", homeScore: 1, awayScore: 0,
             minute: 85, status: "H2" }],
    payloadBody: payload({
      fixtures: [{
        date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
        league: "England Conference National", tip: "Over 1.5", tip_p: 0.8,
        kickoff: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      }],
    }),
  });
  const res = await run();
  assert.strictEqual(res._j.observed, 1);
  assert.strictEqual(res._j.notYet, 0);
  assert.strictEqual(calls.upserted.length, 1);
});

test("a kick-off a few minutes ahead of our clock is tolerated", async () => {
  const calls = install({
    live: [{ home: "Boreham Wood", away: "Boston Utd", homeScore: 0, awayScore: 0,
             minute: 3, status: "H1" }],
    payloadBody: payload({
      fixtures: [{
        date: "2026-08-27", home: "Boreham Wood", away: "Boston Utd",
        league: "England Conference National", tip: "Over 1.5", tip_p: 0.8,
        kickoff: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }],
    }),
  });
  const res = await run();
  assert.strictEqual(res._j.notYet, 0, "ten minutes ahead is a clock skew, not an impossibility");
  assert.strictEqual(calls.upserted.length, 1);
});
