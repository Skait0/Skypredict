"use strict";
/* A device with many big slips must still sync (owner, 19 Oct 2026: "the avatar doesnt sync
   across devices" - 355 KB of slips against a 256 KB post limit: every sync answered 413). */
const test = require("node:test");
const assert = require("node:assert");
const Y = require("../lib/sync.js");

test("a 355 KB post from a heavy slip history is accepted", () => {
  const legs = Array.from({ length: 49 }, (_, i) => ({ id: "f" + i, code: "1X", p: 0.61242010, home: "Home team " + i, away: "Away team " + i, odds: 1.31, res: "win", date: "2026-10-17" }));
  const items = {};
  for (let i = 0; i < 49; i++) items["s" + String(i).padStart(12, "a")] = { at: "2026-10-17T07:01:35.701Z", sid: "s" + i, book: "sporty", code: "CODE" + i, hits: 0, legs, won: null };
  const p = Y.empty(); p.slips.items = items;
  const size = Buffer.byteLength(JSON.stringify(p));
  assert.ok(size > 300000, "the case that failed: " + size);
  assert.notStrictEqual(Y.validate(p).error, "too_big");
  assert.ok(Y.MAX_BYTES >= 1048576, "a post may be as big as the row we keep");
});
