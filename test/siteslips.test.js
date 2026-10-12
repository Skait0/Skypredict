"use strict";

/**
 * EVERY BOOKED SLIP IS KEPT, AND THE OWNER SEES THE ONES THAT LAND (owner, 12 Oct 2026:
 * "save all slips that is generated via our platform and when any ones hits, i will see
 * it in the admin"). Saved at the one route every booking passes through, graded by the
 * same grader as "Follow my slip", listed on the admin page; a hit at x50 or more pings
 * the owner on Telegram once.
 */

const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/bookproxy.js");
const W = require("../lib/slipwatch.js");

function fakeRes() {
  const r = { code: null, sent: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.sent = b; return r; };
  return r;
}
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });
const upstream = (status, body) => { global.fetch = async () => ({ ok: true, status, json: async () => body, text: async () => JSON.stringify(body) }); };
const book = (h, sel, b) => { const res = fakeRes(); return h({ method: "POST", body: { selections: sel }, query: { book: b || "sporty" } }, res).then(() => res); };
const SEL = [{ eventId: "sr:match:1", prediction: "1X" }, { eventId: "sr:match:2", prediction: "OVER_1.5" }];

/* ------------------------------------------------------------ saving */

test("a minted code is saved with its book, code and leg count", async () => {
  const saved = [];
  const h = P.makeHandler({ save: async (req, s) => { saved.push(s); } });
  upstream(200, { success: true, booking_code: "AB12CD", odds: 3.4 });
  const res = await book(h, SEL);
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(saved, [{ book: "sporty", code: "AB12CD", legCount: 2, odds: 3.4 }]);
});

test("the other books' `code` field is read too", async () => {
  const saved = [];
  const h = P.makeHandler({ save: async (req, s) => { saved.push(s); } });
  upstream(200, { success: true, code: "9JA77X" });
  await book(h, SEL, "bet9ja");
  assert.deepStrictEqual(saved.map((s) => [s.book, s.code, s.odds]), [["bet9ja", "9JA77X", null]]);
});

test("a refused slip is not saved", async () => {
  const saved = [];
  const h = P.makeHandler({ save: async (req, s) => { saved.push(s); } });
  upstream(400, { success: false, unbookable: [{ eventId: "sr:match:1" }] });
  const res = await book(h, SEL);
  assert.strictEqual(res.code, 400);
  assert.strictEqual(saved.length, 0);
});

test("a saver that throws never costs the reader their code", async () => {
  const h = P.makeHandler({ save: async () => { throw new Error("db down"); } });
  upstream(200, { success: true, booking_code: "ZZ99ZZ" });
  const res = await book(h, SEL);
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.sent.booking_code, "ZZ99ZZ");
});

/* ------------------------------------------------------------ grading */

const leg = (home, away, grade) => ({ date: "2026-10-12", home, away, code: "X", grade, name: home + " pick", ko: "2026-10-12T14:00:00Z" });
const R = (home, away, hg, ag) => ({ date: "2026-10-12", home, away, hg, ag });

test("all legs won and nothing untracked is a hit", () => {
  const s = { legs: [leg("A", "B", "Home win"), leg("C", "D", "Over 1.5")], seen: {}, untracked: 0 };
  const v = W.grade(s, [R("A", "B", 2, 0), R("C", "D", 1, 1)], Date.UTC(2026, 9, 12, 20));
  assert.strictEqual(v.status, "landed");
});

test("a lost leg settles the slip as lost at once, without waiting for the rest", () => {
  const s = { legs: [leg("A", "B", "Home win"), leg("C", "D", "Over 1.5")], seen: {}, untracked: 0 };
  assert.strictEqual(W.grade(s, [R("A", "B", 0, 1)], Date.UTC(2026, 9, 12, 20)).status, "lost");
});

test("every gradable leg won but some could not be graded: needs a manual check, never a guessed hit", () => {
  const s = { legs: [leg("A", "B", "Home win")], seen: {}, untracked: 2 };
  assert.strictEqual(W.grade(s, [R("A", "B", 3, 1)], Date.UTC(2026, 9, 12, 20)).status, "check");
});

test("results still coming is still open", () => {
  const s = { legs: [leg("A", "B", "Home win"), leg("C", "D", "Over 1.5")], seen: {}, untracked: 0 };
  const v = W.grade(s, [R("A", "B", 2, 0)], Date.UTC(2026, 9, 12, 20));
  assert.strictEqual(v.status, "open");
  assert.deepStrictEqual(v.seen, { 0: "won" });
});

test("a slip whose results never came is closed as stale after three days", () => {
  const s = { legs: [leg("A", "B", "Home win")], seen: {}, untracked: 0, last_kickoff: "2026-10-12T14:00:00Z" };
  assert.strictEqual(W.grade(s, [], Date.UTC(2026, 9, 16)).status, "stale");
});

/* ------------------------------------------------------------ the 10-minute pass */

function world(over) {
  const rows = over.rows;
  const patches = [], pings = [];
  const deps = Object.assign({
    newSlips: async () => rows.filter((r) => r.status === "new"),
    openSlips: async () => rows.filter((r) => r.status === "open"),
    patch: async (id, p) => { patches.push([id, p]); Object.assign(rows.find((r) => r.id === id), p); return true; },
    readCode: async () => [{ eventId: "e1", prediction: "1", home: "A", away: "B", odds: 2.5 }, { eventId: "e2", prediction: "OVER_1.5", home: "C", away: "D", odds: 1.4 }],
    fixtures: async () => [],
    track: (legs) => legs.map((l) => leg(l.home, l.away, l.prediction === "1" ? "Home win" : "Over 1.5")),
    results: async () => [],
    ping: async (text) => { pings.push(text); return true; },
    now: () => Date.UTC(2026, 9, 12, 20),
    pingAt: 50,
  }, over.deps || {});
  return { rows, patches, pings, deps };
}

test("a new slip is read back once and becomes open with its legs and real total odds", async () => {
  const w = world({ rows: [{ id: 1, status: "new", book: "sporty", code: "AB12CD", leg_count: 2, total_odds: null }] });
  await W.tick(w.deps);
  const r = w.rows[0];
  assert.strictEqual(r.status, "open");
  assert.strictEqual(r.legs.length, 2);
  assert.strictEqual(r.untracked, 0);
  assert.strictEqual(Number(r.total_odds), 3.5);
});

test("a code that can no longer be read is marked unreadable, not retried forever", async () => {
  const w = world({ rows: [{ id: 1, status: "new", book: "sporty", code: "GONE01" }], deps: { readCode: async () => null } });
  await W.tick(w.deps);
  assert.strictEqual(w.rows[0].status, "unreadable");
});

test("a big hit pings the owner once; a small hit only lands on the admin page", async () => {
  const big = { id: 1, status: "open", book: "sporty", code: "BIG001", total_odds: 120.5, legs: [leg("A", "B", "Home win")], seen: {}, untracked: 0, notified: false };
  const small = { id: 2, status: "open", book: "bet9ja", code: "SML001", total_odds: 4.2, legs: [leg("A", "B", "Home win")], seen: {}, untracked: 0, notified: false };
  const w = world({ rows: [big, small], deps: { results: async () => [R("A", "B", 1, 0)] } });
  await W.tick(w.deps);
  assert.strictEqual(big.status, "landed");
  assert.strictEqual(small.status, "landed");
  assert.strictEqual(w.pings.length, 1);
  assert.match(w.pings[0], /BIG001/);
  assert.strictEqual(big.notified, true);
  await W.tick(w.deps);
  assert.strictEqual(w.pings.length, 1, "never twice");
});

test("no owner chat configured: hits still land, nothing is sent", async () => {
  const s = { id: 1, status: "open", book: "sporty", code: "BIG002", total_odds: 300, legs: [leg("A", "B", "Home win")], seen: {}, untracked: 0, notified: false };
  const w = world({ rows: [s], deps: { ping: null, results: async () => [R("A", "B", 1, 0)] } });
  await W.tick(w.deps);
  assert.strictEqual(s.status, "landed");
});

/* ------------------------------------------------------------ the admin list */

test("only the admin can read the hits", async () => {
  process.env.AUTH_ENABLED = "1";
  process.env.AUTH_PEPPER = "p".repeat(64);
  const { fakeDb, fakeRes: fr, getReq } = require("./helpers/fakes.js");
  const S = require("../lib/auth/session.js");
  const account = require("../api/account.js");
  const clock = () => Date.UTC(2026, 9, 12, 10);
  const db = fakeDb(clock);
  const hits = [{ book: "sporty", code: "BIG001", status: "landed", total_odds: 120.5, leg_count: 9, settled_at: "2026-10-12T21:00:00Z" }];
  const h = account.make({ db, now: clock, env: { SW_ADMIN_EMAILS: "boss@x.com" }, slips: { hits: async () => ({ ok: true, rows: hits }) } });
  const cookie = async (email) => S.COOKIE + "=" + (await S.startSession(db, (await db.createUser({ email })).id, "Chrome", clock())).token;
  const ask = async (c) => { const r = fr(); const q = Object.assign(getReq("account", {}, { cookie: c }), { query: { action: "hits" } }); await h(q, r); return r; };
  assert.strictEqual((await ask(await cookie("a@b.com"))).code, 403);
  const ok = await ask(await cookie("boss@x.com"));
  assert.strictEqual(ok.code, 200);
  assert.deepStrictEqual(ok.json().hits.map((x) => x.code), ["BIG001"]);
});
