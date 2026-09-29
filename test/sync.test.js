// test/sync.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Y = require("../lib/sync.js");
const NOW = Date.UTC(2026, 8, 29, 10);
const DAY = 864e5;

const leg = { id: "f1", code: "OV_1.5", label: "Over 1.5", home: "A", away: "B", date: "2026-09-29", kickoff: null, p: 0.8, odd: 1.3 };
function slip(sid, over) {
  return Object.assign({ sid, at: "2026-09-20T10:00:00.000Z", code: null, book: "sporty", legs: [leg], odds: 1.3,
    settled: false, won: null, hits: 0, graded: 0 }, over || {});
}
function data(parts) { return Object.assign(Y.empty(), parts); }
const clean = (p) => { const r = Y.validate(p); assert.ok(r.ok, JSON.stringify(r)); return r.data; };

test("unknown keys and tampered fields never get in", () => {
  const d = clean({ v: 1, plan: "paid", email: "x@y.com", user_id: "u",
    slips: { items: { s1: Object.assign(slip("s1"), { user_id: "u2", plan: "paid", legs: [Object.assign({ evil: 1 }, leg)] }) }, tomb: {} },
    prefs: { risk: { v: "3", at: 5 }, admin: { v: "1", at: 5 } } });
  assert.strictEqual(d.plan, undefined); assert.strictEqual(d.email, undefined); assert.strictEqual(d.user_id, undefined);
  assert.strictEqual(d.slips.items.s1.user_id, undefined);
  assert.strictEqual(d.slips.items.s1.legs[0].evil, undefined);
  assert.deepStrictEqual(Object.keys(d.prefs), ["risk"]);
});

test("limits: size, slip count, legs, string length, ids", () => {
  assert.deepStrictEqual(Y.validate({ slips: { items: { s1: slip("s1", { code: "x".repeat(Y.MAX_BYTES) }) } } }), { ok: false, error: "too_big" });
  const many = {}; for (let i = 0; i <= Y.MAX_SLIPS; i++) many["s" + i] = { sid: "s" + i, legs: [] };
  assert.deepStrictEqual(Y.validate({ slips: { items: many } }), { ok: false, error: "too_big" });
  const d = clean({ slips: { items: {
    long: slip("long", { legs: new Array(Y.MAX_LEGS + 1).fill(leg) }),
    "bad id!": slip("bad id!"),
    s2: slip("s2", { code: "y".repeat(Y.MAX_STR + 1) }),
  } } });
  assert.deepStrictEqual(Object.keys(d.slips.items), ["s2"]);
  assert.strictEqual(d.slips.items.s2.code, undefined, "an over-long string is dropped");
  for (const bad of [null, [], "x", 5]) assert.deepStrictEqual(Y.validate(bad), { ok: false, error: "bad_shape" });
});

test("HTML and SQL typed by a reader are stored as plain text, unchanged", () => {
  const nasty = "<img src=x onerror=alert(1)>'; drop table users;--";
  const d = clean({ slips: { items: { s1: slip("s1", { legs: [Object.assign({}, leg, { label: nasty })] }) } } });
  assert.strictEqual(d.slips.items.s1.legs[0].label, nasty);
});

test("slips from two devices are joined, never replaced", () => {
  const m = Y.merge(data({ slips: { items: { a: slip("a") }, tomb: {} } }),
    data({ slips: { items: { b: slip("b") }, tomb: {} } }), NOW);
  assert.deepStrictEqual(Object.keys(m.slips.items).sort(), ["a", "b"]);
});

test("Review Focus 1: a save based on an old version still loses nothing", () => {
  // Server already holds A and B (B came from the other device after this tab last synced).
  const server = data({ slips: { items: { a: slip("a"), b: slip("b") }, tomb: {} } });
  // This tab still only knows A, and adds C.
  const client = data({ slips: { items: { a: slip("a"), c: slip("c") }, tomb: {} } });
  assert.deepStrictEqual(Object.keys(Y.merge(server, client, NOW).slips.items).sort(), ["a", "b", "c"]);
});

test("Review Focus 2: a slip deleted on one device stays deleted when an offline device syncs", () => {
  const server = data({ slips: { items: {}, tomb: { x: NOW - DAY } } });
  const offline = data({ slips: { items: { x: slip("x", { updatedAt: new Date(NOW).toISOString(), settled: true, won: true }) }, tomb: {} } });
  const m = Y.merge(server, offline, NOW);
  assert.strictEqual(m.slips.items.x, undefined);
  assert.ok(m.slips.tomb.x);
});

test("the graded copy of a slip wins; otherwise the later edit", () => {
  const graded = slip("a", { settled: true, won: true, hits: 1, graded: 1 });
  const newer = slip("a", { updatedAt: "2026-09-28T10:00:00.000Z" });
  assert.strictEqual(Y.merge(data({ slips: { items: { a: graded }, tomb: {} } }), data({ slips: { items: { a: newer }, tomb: {} } }), NOW).slips.items.a.settled, true);
  const older = slip("a", { odds: 2 });
  assert.strictEqual(Y.merge(data({ slips: { items: { a: older }, tomb: {} } }), data({ slips: { items: { a: newer }, tomb: {} } }), NOW).slips.items.a.updatedAt, newer.updatedAt);
});

test("the same booking code saved on two devices is one slip", () => {
  const m = Y.merge(data({ slips: { items: { a: slip("a", { code: "AB12CD" }) }, tomb: {} } }),
    data({ slips: { items: { b: slip("b", { code: "AB12CD", settled: true }) }, tomb: {} } }), NOW);
  assert.deepStrictEqual(Object.keys(m.slips.items), ["b"]);
});

test("followed matches and leagues: unfollow wins over an older follow, a later follow wins back", () => {
  const s = data({ livefav: { items: { m1: 100 }, tomb: {} }, leaguefav: { items: {}, tomb: { "Spain La Liga 1": 300 } } });
  const c = data({ livefav: { items: {}, tomb: { m1: 200 } }, leaguefav: { items: { "Spain La Liga 1": 400 }, tomb: {} } });
  const m = Y.merge(s, c, NOW);
  assert.deepStrictEqual(m.livefav.items, {});
  assert.deepStrictEqual(m.leaguefav.items, { "Spain La Liga 1": 400 });
});

test("prefs merge key by key; My slip is last write wins", () => {
  const s = data({ prefs: { risk: { v: "2", at: 10 }, book: { v: "bet9ja", at: 50 } }, myslip: { items: [{ id: "f1", code: "1" }], at: 10 } });
  const c = data({ prefs: { risk: { v: "4", at: 20 }, book: { v: "sporty", at: 40 } }, myslip: { items: [{ id: "f2", code: "2" }], at: 20 } });
  const m = Y.merge(s, c, NOW);
  assert.deepStrictEqual(m.prefs, { risk: { v: "4", at: 20 }, book: { v: "bet9ja", at: 50 } });
  assert.deepStrictEqual(m.myslip.items, [{ id: "f2", code: "2" }]);
});

test("tombstones older than 60 days are forgotten", () => {
  const m = Y.merge(data({ slips: { items: {}, tomb: { old: NOW - 61 * DAY, fresh: NOW - DAY } } }), Y.empty(), NOW);
  assert.deepStrictEqual(Object.keys(m.slips.tomb), ["fresh"]);
});

test("merging is idempotent", () => {
  const s = data({ slips: { items: { a: slip("a"), b: slip("b", { code: "Q1" }) }, tomb: { z: NOW - DAY } },
    livefav: { items: { m1: 1 }, tomb: { m2: 2 } }, prefs: { risk: { v: "3", at: 3 } }, myslip: { items: [{ id: "f", code: "c" }], at: 9 } });
  const c = data({ slips: { items: { c: slip("c") }, tomb: {} }, leaguefav: { items: { L: 5 }, tomb: {} } });
  const once = Y.merge(s, c, NOW);
  assert.deepStrictEqual(Y.merge(once, once, NOW), once);
  assert.deepStrictEqual(Y.merge(once, c, NOW), once);
});

test("past 1000 slips the oldest graded fold into the record, and stay gone", () => {
  const items = {};
  for (let i = 0; i < Y.MAX_SLIPS; i++) {
    const sid = "g" + String(i).padStart(4, "0");
    items[sid] = slip(sid, { at: new Date(NOW - (Y.MAX_SLIPS - i) * 60e3).toISOString(), settled: true, won: i === 0 });
  }
  const m = Y.merge(data({ slips: { items, tomb: {} } }),
    data({ slips: { items: { n1: slip("n1", { at: new Date(NOW).toISOString() }) }, tomb: {} } }), NOW);
  assert.strictEqual(Object.keys(m.slips.items).length, Y.MAX_SLIPS);
  assert.strictEqual(m.slips.items.g0000, undefined, "oldest folded");
  assert.deepStrictEqual(m.record, { n: 1, won: 1 });
  assert.ok(m.slips.tomb.g0000, "a folded slip cannot come back and be counted twice");
  assert.deepStrictEqual(Y.merge(m, m, NOW), m);
});

test("no server copy yet: the first sign-in keeps everything on the device", () => {
  const c = data({ slips: { items: { a: slip("a") }, tomb: {} }, prefs: { risk: { v: "3", at: 1 } } });
  assert.deepStrictEqual(Y.merge(null, c, NOW), c);
});
