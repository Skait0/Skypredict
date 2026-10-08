// test/penalty-db.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Module = require("module");

/* Swap lib/supabase.js for a recorder before loading the module under test. */
const calls = [];
let reply = { ok: true, body: [] };
const fake = { call: async (p, init) => { calls.push({ p, init }); return typeof reply === "function" ? reply(p, init) : reply; },
  headers: (x) => Object.assign({ apikey: "k" }, x || {}) };
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (/supabase\.js$/.test(req)) return fake;
  return real.apply(this, arguments);
};
const D = require("../lib/penaltydb.js");
Module._load = real;

test("appendKick only writes where kicks_n still equals n", async () => {
  calls.length = 0; reply = { ok: true, body: [{ id: "ABCDEF" }] };
  assert.strictEqual(await D.appendKick("ABCDEF", 3, ["goal"], { friend_name: "Ada" }), true);
  assert.match(calls[0].p, /^penalty_matches\?id=eq\.ABCDEF&kicks_n=eq\.3$/);
  assert.strictEqual(calls[0].init.method, "PATCH");
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual([body.kicks_n, body.friend_name], [4, "Ada"]);
  reply = { ok: true, body: [] };
  assert.strictEqual(await D.appendKick("ABCDEF", 3, [], {}), false, "nothing updated = lost the race");
});

test("getMatch refuses an id that is not six board characters, without a request", async () => {
  calls.length = 0;
  assert.strictEqual(await D.getMatch("abc'); drop"), null);
  assert.strictEqual(calls.length, 0);
});

test("rankFor counts below and total", async () => {
  const seen = [];
  D._count = async (q) => { seen.push(q); return /score=lt\.4/.test(q) ? 7 : 10; };
  assert.deepStrictEqual(await D.rankFor("2026-10-08", 4), { below: 7, total: 10 });
  assert.ok(seen.every((q) => /day=eq\.2026-10-08&score=not\.is\.null/.test(q)));
});

test("putPlay inserts the first shot and updates later ones only from the expected length", async () => {
  calls.length = 0; reply = { ok: true, body: [{ day: "2026-10-08" }] };
  await D.putPlay({ day: "2026-10-08", device: "11111111-1111-4111-8111-111111111111", shots: [{}], shots_n: 1 }, 0);
  assert.strictEqual(calls[0].init.method, "POST");
  await D.putPlay({ day: "2026-10-08", device: "11111111-1111-4111-8111-111111111111", shots: [{}, {}], shots_n: 2 }, 1);
  assert.strictEqual(calls[1].init.method, "PATCH");
  assert.match(calls[1].p, /shots_n=eq\.1/);
});
