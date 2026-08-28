"use strict";

const test = require("node:test");
const assert = require("node:assert");

/* The store writes a `model` snapshot into a column that is newer than the
   tables. The code shipping before the migration is run is the normal case,
   not an edge one, so the behaviour when the column is missing is worth
   pinning down: the snapshot may be dropped, the row may not.
   Losing a snapshot costs a page some numbers. Losing the row costs a result
   nothing downstream can recover - by then the live feed has forgotten the
   match ever happened. */

process.env.SUPABASE_URL = "https://x.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const DB = require("../lib/supabase.js");

const ROWS = [{
  match_date: "2026-08-27", home: "A", away: "B",
  home_norm: "a", away_norm: "b", league: "FA Cup",
  hg: 2, ag: 1, tip: "Over 1.5", hit: true,
  model: { home_p: 0.43, o15: 0.75 },
}];

/* PostgREST's actual shape of complaint for a column it cannot see. */
const NO_COLUMN = { message: "Could not find the 'model' column of 'results' in the schema cache", code: "PGRST204" };

function stub(handler) {
  const seen = [];
  global.fetch = async (url, opt) => {
    const body = JSON.parse(opt.body);
    seen.push({ url: String(url), body });
    const r = handler(seen.length, body);
    return {
      ok: r.ok, status: r.ok ? 201 : 400,
      text: async () => JSON.stringify(r.body || []),
      json: async () => r.body || [],
    };
  };
  return seen;
}

test("the snapshot is sent when the column is there", async () => {
  const seen = stub(() => ({ ok: true, body: [{}] }));
  const out = await DB.insertResults(ROWS);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(seen.length, 1, "should not retry a write that worked");
  assert.deepStrictEqual(seen[0].body[0].model, { home_p: 0.43, o15: 0.75 });
});

test("a missing column drops the snapshot and still writes the result", async () => {
  const seen = stub((n) => n === 1
    ? { ok: false, body: NO_COLUMN }
    : { ok: true, body: [{}] });
  const out = await DB.insertResults(ROWS);
  assert.strictEqual(out.ok, true, "the row must land: " + out.why);
  assert.strictEqual(seen.length, 2, "should retry once");
  assert.ok(!("model" in seen[1].body[0]), "retry must not carry model");
  /* Everything that matters about the result is still on the retry. */
  assert.strictEqual(seen[1].body[0].hg, 2);
  assert.strictEqual(seen[1].body[0].tip, "Over 1.5");
  assert.strictEqual(seen[1].body[0].hit, true);
});

/* A retry loop that fires on any failure would double every write during an
   outage, and mask the real error behind a second identical one. */
test("an unrelated failure is not retried", async () => {
  const seen = stub(() => ({ ok: false, body: { message: "permission denied for table results" } }));
  const out = await DB.insertResults(ROWS);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(seen.length, 1);
  assert.match(String(out.why), /permission denied/);
});

test("the working rows behave the same way", async () => {
  const rows = [{ match_key: "k", match_date: "2026-08-27", home: "A", away: "B",
                  home_norm: "a", away_norm: "b", hg: 1, ag: 0, tip: "Over 1.5",
                  model: { o15: 0.75 } }];
  const seen = stub((n) => n === 1
    ? { ok: false, body: { message: "Could not find the 'model' column of 'live_seen' in the schema cache" } }
    : { ok: true, body: [] });
  const out = await DB.upsertLiveSeen(rows);
  assert.strictEqual(out.ok, true);
  assert.strictEqual(seen.length, 2);
  assert.ok(!("model" in seen[1].body[0]));
  assert.strictEqual(seen[1].body[0].hg, 1);
});
