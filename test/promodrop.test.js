"use strict";
/* The daily drop (owner, 16 Oct 2026): each queued post goes out once, on its day, from its time. */
const test = require("node:test");
const assert = require("node:assert");
const { due } = require("../scripts/promodrop.js");
const q = require("../data/promo-queue.json");

test("only today's drops from their time, never one already logged", () => {
  const at = (iso) => Date.parse(iso) - 3600e3;   /* a Lagos clock time */
  assert.deepEqual(due(q, {}, at("2026-10-17T12:00:00Z")).length, 0, "before 12:30 nothing");
  assert.deepEqual(due(q, {}, at("2026-10-17T12:31:00Z")).map((d) => d.kind), ["clip"]);
  assert.deepEqual(due(q, {}, at("2026-10-17T19:05:00Z")).map((d) => d.time).sort(), ["12:30", "14:00", "14:20", "16:31", "16:32", "19:00"]);
  assert.deepEqual(due(q, { "2026-10-17 12:30": {} }, at("2026-10-17T19:05:00Z")).map((d) => d.time).sort(), ["14:00", "14:20", "16:31", "16:32", "19:00"]);
});

test("every clip has its own cover and every post keeps the rules", () => {
  for (const d of q.drops) {
    if (d.kind === "clip") { assert.ok(d.video && d.cover, d.date + " has a video and a cover"); assert.ok(d.ig, "and an Instagram caption"); }
    for (const t of [d.x, d.ig].filter(Boolean)) {
      assert.doesNotMatch(t, /\bfree\b/i, "no free"); assert.doesNotMatch(t, /—/, "no em dash"); assert.match(t, /18\+/, "18+");
    }
  }
});
