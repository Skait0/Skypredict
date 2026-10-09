// test/penalty-api.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { fakeRes } = require("./helpers/fakes.js");
const { ORIGIN } = require("../lib/auth/http.js");
const P = require("../lib/penalty.js");
process.env.PENALTY_KEY = "k".repeat(32);
const { make } = require("../api/penalty.js");

const DEV1 = "11111111-1111-4111-8111-111111111111", DEV2 = "22222222-2222-4222-8222-222222222222", DEV3 = "33333333-3333-4333-8333-333333333333";
function fakeDb() {
  const t = { m: {}, plays: {}, rl: {} };
  return { t,
    async rlHit(k, w, l) { t.rl[k] = (t.rl[k] || 0) + 1; return t.rl[k] <= l; },
    async createMatch(r) { if (t.m[r.id]) return false; t.m[r.id] = Object.assign({ friend_kicks: [], kicks_n: 0, friend_device: null, friend_name: null, result: null, finished_at: null }, JSON.parse(JSON.stringify(r))); return true; },
    async getMatch(id) { return t.m[id] ? JSON.parse(JSON.stringify(t.m[id])) : null; },
    async appendKick(id, n, kicks, patch) { const m = t.m[id]; if (!m || m.kicks_n !== n) return false; Object.assign(m, patch, { friend_kicks: kicks, kicks_n: n + 1 }); return true; },
    async getPlay(d, dev) { const p = t.plays[d + dev]; return p ? JSON.parse(JSON.stringify(p)) : null; },
    async putPlay(r, prev) { const cur = t.plays[r.day + r.device]; if ((cur ? cur.shots_n : 0) !== prev) return false; t.plays[r.day + r.device] = JSON.parse(JSON.stringify(r)); return true; },
    async rankFor(day, s) { const all = Object.values(t.plays).filter((p) => p.day === day && p.score != null); return { below: all.filter((p) => p.score < s).length, total: all.length }; },
    async setPicks(id, dev, s, d) { const m = t.m[id]; if (!m || m.challenger_device !== dev || m.kicks_n !== 0) return false; m.ch_shots = s; m.ch_dives = d; return true; },
    async createRun(r) { t.runs = t.runs || {}; if (t.runs[r.id]) return false; t.runs[r.id] = JSON.parse(JSON.stringify(r)); return true; },
    async getRun(id) { return t.runs && t.runs[id] ? JSON.parse(JSON.stringify(t.runs[id])) : null; },
    async appendRun(id, n, patch) { const r = t.runs && t.runs[id]; if (!r || r.kicks_n !== n) return false; Object.assign(r, JSON.parse(JSON.stringify(patch))); return true; },
    async board(since) { return Object.values(t.runs || {}).filter((r) => r.streak > 0 && (!since || r.created_at >= new Date(since).toISOString())).sort((a, b) => b.streak - a.streak || (a.created_at < b.created_at ? -1 : 1)); },
    async mine(dev) { return Object.values(t.m).filter((m) => m.challenger_device === dev && m.finished_at).map((m) => ({ id: m.id, friend_name: m.friend_name, result: m.result, finished_at: m.finished_at })); },
  };
}
function world() {
  let T = Date.parse("2026-10-08T10:00:00Z");
  const db = fakeDb();
  const handler = make({ db, now: () => T, tips: () => ({ home: "PSV", away: "Heerenveen", tip: "Over 1.5", pct: 82, league: "Eredivisie" }) });
  const H = { "x-sw-request": "1", origin: ORIGIN, "x-forwarded-for": "1.2.3.4" };
  const call = async (method, a, body, q) => { const res = fakeRes();
    await handler({ method, headers: H, query: Object.assign({ a }, q || {}), body: body || {} }, res); return res; };
  return { db, call, advance: (ms) => { T += ms; } };
}
const shots = (spots, power) => spots.map((s) => ({ spot: s, power }));
async function create(w) {
  const r = await w.call("POST", "create", { name: "Tobi", device: DEV1,
    shots: shots([0, 1, 2, 3, 4, 5, 0, 1], 0.7), dives: [5, 5, 5, 5, 5, 5, 5, 5] });
  assert.strictEqual(r.code, 200, r.body); return r.json().id;
}

test("create stores the picks and never returns them", async () => {
  const w = world(); const id = await create(w);
  const m = await w.call("GET", "match", null, { id });
  const j = m.json();
  assert.strictEqual(j.challenger, "Tobi");
  assert.ok(!("ch_shots" in j) && !("ch_dives" in j) && !/"spot"/.test(m.body), "no pick leaks");
});

test("create refuses bad picks and bad names", async () => {
  const w = world();
  const bad = await w.call("POST", "create", { name: "Tobi", device: DEV1, shots: shots([0, 1, 2], 0.7), dives: [1, 2, 3] });
  assert.strictEqual(bad.code, 400);
  const noName = await w.call("POST", "create", { name: "😤", device: DEV1, shots: shots([0, 1, 2, 3, 4, 5, 0, 1], 0.7), dives: [0, 0, 0, 0, 0, 0, 0, 0] });
  assert.strictEqual(noName.code, 400);
});

test("kicks alternate shot then dive, and a dive reveals only the shot just taken", async () => {
  const w = world(); const id = await create(w);
  const s1 = await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  assert.strictEqual(s1.json().outcome, "goal");                     // challenger dived 5
  const wrong = await w.call("POST", "kick", { id, device: DEV2, kind: "shot", spot: 0, power: 0.7 });
  assert.strictEqual(wrong.code, 409); assert.strictEqual(wrong.json().error, "turn");
  const d1 = await w.call("POST", "kick", { id, device: DEV2, kind: "dive", spot: 0 });
  assert.deepStrictEqual([d1.json().outcome, d1.json().against.spot], ["save", 0]);
  assert.ok(!/"spot":1/.test(d1.body), "the next shot is not revealed");
});

test("a second phone cannot kick in a challenge someone else started", async () => {
  const w = world(); const id = await create(w);
  await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  const other = await w.call("POST", "kick", { id, device: DEV3, name: "Bola", kind: "dive", spot: 0 });
  assert.strictEqual(other.code, 409); assert.strictEqual(other.json().error, "taken");
});

test("a raced kick is refused, not counted twice", async () => {
  const w = world(); const id = await create(w);
  const [a, b] = await Promise.all([
    w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 }),
    w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 })]);
  assert.deepStrictEqual([a.code, b.code].sort(), [200, 409]);
  assert.strictEqual(w.db.t.m[id].friend_kicks.length, 1);
});

test("an unstarted challenge expires after 24h; a started one can be finished", async () => {
  const w = world(); const id = await create(w);
  const id2 = await create(w);
  await w.call("POST", "kick", { id: id2, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  w.advance(25 * 3600e3);
  assert.strictEqual((await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 })).code, 410);
  assert.strictEqual((await w.call("POST", "kick", { id: id2, device: DEV2, kind: "dive", spot: 3 })).code, 200);
});

test("a finished challenge records the result for the challenger", async () => {
  const w = world(); const id = await create(w);
  // Friend scores everything (challenger always dives 5, friend shoots 0); friend saves nothing.
  let r;
  for (let i = 0; i < 5; i++) {
    r = await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
    if (r.json().state.done) break;
    r = await w.call("POST", "kick", { id, device: DEV2, kind: "dive", spot: 4 });
    if (r.json().state.done) break;
  }
  assert.strictEqual(r.json().state.done, true);
  const mine = await w.call("GET", "mine", null, { device: DEV1 });
  assert.strictEqual(mine.json().results[0].friend, "Ada");
});

test("daily: shots in order, scored once per device per day, dives never sent", async () => {
  const w = world();
  const dives = P.dailyDives(process.env.PENALTY_KEY, "2026-10-08");
  let r;
  for (let i = 0; i < 5; i++) {
    r = await w.call("POST", "daily", { device: DEV1, i, spot: (dives[i] + 2) % 6, power: 0.7 });
    assert.strictEqual(r.code, 200, r.body);
    assert.ok(!("dive" in r.json()) || i === 4);
  }
  assert.strictEqual(r.json().done, true);
  assert.strictEqual(typeof r.json().score, "number");
  const again = await w.call("POST", "daily", { device: DEV1, i: 0, spot: 0, power: 0.7 });
  assert.strictEqual(again.code, 409, "a finished day cannot be replayed");
  const skip = await w.call("POST", "daily", { device: DEV2, i: 1, spot: 0, power: 0.7 });
  assert.strictEqual(skip.code, 409, "shot 1 before shot 0 is refused");
});

test("daily: a go started before Lagos midnight finishes against that day's keeper", async () => {
  const w = world();
  w.advance(Date.parse("2026-10-08T22:59:00Z") - Date.parse("2026-10-08T10:00:00Z"));
  const r0 = await w.call("POST", "daily", { device: DEV1, i: 0, spot: 0, power: 0.7 });
  w.advance(120e3);                                                  // now 23:01Z = 9 Oct in Lagos
  const r1 = await w.call("POST", "daily", { device: DEV1, i: 1, spot: 0, power: 0.7, day: r0.json().day });
  assert.strictEqual(r1.code, 200);
  assert.strictEqual(r1.json().day, "2026-10-08");
});

test("POST without the site's header or origin is refused", async () => {
  const w = world(); const res = fakeRes();
  await make({ db: w.db, now: Date.now })({ method: "POST", headers: {}, query: { a: "create" }, body: {} }, res);
  assert.strictEqual(res.code, 403);
});

test("tips returns the pick of the day summary", async () => {
  const w = world();
  assert.deepStrictEqual((await w.call("GET", "tips")).json(), { home: "PSV", away: "Heerenveen", tip: "Over 1.5", pct: 82, league: "Eredivisie" });
});

/* Final review, 8 Oct 2026. */
test("match tells the opener their side, never echoing a device", async () => {
  const w = world(); const id = await create(w);
  await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  const as = async (d) => (await w.call("GET", "match", null, { id, device: d }));
  const ch = await as(DEV1), fr = await as(DEV2), other = await as(DEV3), none = await w.call("GET", "match", null, { id });
  assert.deepStrictEqual([ch.json().role, fr.json().role, other.json().role, none.json().role], ["challenger", "friend", null, null]);
  for (const r of [ch, fr, other]) assert.ok(!r.body.includes(DEV1) && !r.body.includes(DEV2), "no device in the answer");
});

test("dailystate says where a go stands so a reload or lost answer resumes, never sending dives", async () => {
  const w = world();
  const fresh = (await w.call("GET", "dailystate", null, { device: DEV1 })).json();
  assert.deepStrictEqual([fresh.at, fresh.outcomes, fresh.score], [0, [], null]);
  const r0 = await w.call("POST", "daily", { device: DEV1, i: 0, spot: 0, power: 0.7 });
  const r1 = await w.call("POST", "daily", { device: DEV1, i: 1, spot: 1, power: 0.7, day: r0.json().day });
  const st = await w.call("GET", "dailystate", null, { device: DEV1 });
  assert.deepStrictEqual([st.json().at, st.json().outcomes, st.json().day], [2, [r0.json().outcome, r1.json().outcome], "2026-10-08"]);
  assert.ok(!/"spot"|dive/.test(st.body), "no shot detail or dive in the state");
  const lost = await w.call("POST", "daily", { device: DEV1, i: 1, spot: 1, power: 0.7, day: "2026-10-08" });
  assert.strictEqual(lost.code, 409);
  assert.strictEqual(lost.json().at, 2, "a replayed shot is told where the go really is");
});

test("tips carry today's wizard slip code, or the latest one before today, never a future one", () => {
  const { pickCode } = require("../api/penalty.js");
  const map = { "2026-10-07": { legs: [1, 2], odds: 3.1, codes: { sporty: "A" } }, "2026-10-08": { legs: [1, 2, 3], odds: 4.2, codes: { sporty: "B" } }, "2026-10-09": { legs: [1], odds: 2, codes: { sporty: "C" } } };
  assert.deepStrictEqual(pickCode(map, "2026-10-08"), { date: "2026-10-08", games: 3, odds: 4.2, codes: { sporty: "B" } });
  assert.strictEqual(pickCode(map, "2026-10-10").date, "2026-10-09");
  assert.strictEqual(pickCode({ "2026-10-09": map["2026-10-09"] }, "2026-10-08"), null);
});

/* ---------------------------------------------------------------- link first and ranked (owner, 9 Oct 2026) */
test("a challenge can go out before its picks: the friend waits, the picks land once, then it plays", async () => {
  const w = world();
  const r = await w.call("POST", "create", { name: "Tobi", device: DEV1 });
  assert.strictEqual(r.code, 200); const id = r.json().id;
  assert.strictEqual((await w.call("GET", "match", null, { id, device: DEV2 })).json().pending, true);
  assert.strictEqual((await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 })).json().error, "pending");
  assert.strictEqual((await w.call("POST", "picks", { id, device: DEV2, shots: shots([0, 1, 2, 3, 4, 5, 0, 1], 0.7), dives: [5, 5, 5, 5, 5, 5, 5, 5] })).code, 409, "only the challenger");
  assert.strictEqual((await w.call("POST", "picks", { id, device: DEV1, shots: shots([0, 1, 2], 0.7), dives: [5] })).code, 400);
  assert.strictEqual((await w.call("POST", "picks", { id, device: DEV1, shots: shots([0, 1, 2, 3, 4, 5, 0, 1], 0.7), dives: [5, 5, 5, 5, 5, 5, 5, 5] })).code, 200);
  assert.strictEqual((await w.call("POST", "picks", { id, device: DEV1, shots: shots([0, 1, 2, 3, 4, 5, 0, 1], 0.7), dives: [0, 0, 0, 0, 0, 0, 0, 0] })).code, 409, "once");
  assert.strictEqual((await w.call("GET", "match", null, { id, device: DEV2 })).json().pending, false);
  const k = await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  assert.strictEqual(k.code, 200); assert.strictEqual(k.json().outcome, "goal");
});

test("ranked: the server judges every kick against a keeper the page cannot know; a miss ends the run", async () => {
  const w = world(), key = "k".repeat(32);
  let r = await w.call("POST", "ranked", { device: DEV1, name: "Tobi", i: 0, spot: 2, power: 0.7 });
  assert.strictEqual(r.code, 200); let j = r.json(); const run = j.run;
  const expect = (i, spot, streak) => P.judge({ spot, power: 0.7 }, P.rankedDive(key, run, i, spot, streak));
  assert.strictEqual(j.outcome, expect(0, 2, 0));
  let i = 0, streak = 0;
  while (j.alive) { streak = j.streak; i++; const spot = i % 6;
    r = await w.call("POST", "ranked", { device: DEV1, run, i, spot, power: 0.7 }); j = r.json();
    assert.strictEqual(j.outcome, expect(i, spot, streak)); if (i > 400) break; }
  assert.strictEqual(j.alive, false);
  const again = await w.call("POST", "ranked", { device: DEV1, run, i: i + 1, spot: 0, power: 0.7 });
  assert.strictEqual(again.code, 409, "a finished run takes no more kicks");
  const other = await w.call("POST", "ranked", { device: DEV2, run, i: i + 1, spot: 0, power: 0.7 });
  assert.strictEqual(other.code, 404, "nobody else's device can kick it");
  assert.strictEqual((await w.call("POST", "ranked", { device: DEV1, i: 0, spot: 0, power: 0.7 })).code, 400, "a run needs a name");
});

test("ranked: the board keeps each device's best, longest first, and says where you stand", async () => {
  const w = world();
  w.db.t.runs = { A: { id: "AAAAAA", device: DEV1, name: "Tobi", streak: 4, created_at: "2026-10-08T09:00:00.000Z" },
    B: { id: "BBBBBB", device: DEV1, name: "Tobi", streak: 9, created_at: "2026-10-08T09:30:00.000Z" },
    C: { id: "CCCCCC", device: DEV2, name: "Ada", streak: 7, created_at: "2026-10-08T08:00:00.000Z" },
    D: { id: "DDDDDD", device: DEV3, name: "Old", streak: 30, created_at: "2026-09-01T08:00:00.000Z" } };
  const today = (await w.call("GET", "board", null, { period: "today", device: DEV2 })).json();
  assert.deepStrictEqual(today.top.map((x) => [x.name, x.streak]), [["Tobi", 9], ["Ada", 7]]);
  assert.deepStrictEqual(today.me, { rank: 2, streak: 7 });
  const all = (await w.call("GET", "board", null, { period: "all" })).json();
  assert.strictEqual(all.top[0].name, "Old");
  assert.strictEqual((await w.call("GET", "board", null, { period: "ever" })).code, 400);
});

test("league (owner, 9 Oct 2026): promotion is instant, relegation waits for Monday, the table is your division", async () => {
  const w = world();  // world clock: 2026-10-08 (a Thursday), Lagos week from Mon 2026-10-05
  w.db.t.runs = {
    A: { device: DEV1, name: "Tobi", streak: 7, created_at: "2026-09-30T10:00:00.000Z" },   // last week: Champions tier
    B: { device: DEV1, name: "Tobi", streak: 2, created_at: "2026-10-07T10:00:00.000Z" },   // this week only 2
    C: { device: DEV2, name: "Ada", streak: 6, created_at: "2026-10-07T11:00:00.000Z" },    // promoted to Champions this week
    D: { device: DEV3, name: "Bola", streak: 4, created_at: "2026-10-07T12:00:00.000Z" },   // NPFL
  };
  const me = (await w.call("GET", "board", null, { period: "league", device: DEV1 })).json();
  assert.strictEqual(me.division.name, "Champions League", "last week's tier holds until Monday");
  assert.deepStrictEqual(me.top.map((x) => x.name), ["Ada", "Tobi"]);
  assert.deepStrictEqual(me.division.next, { name: "Legend", at: 10, need: 8 });
  const bola = (await w.call("GET", "board", null, { period: "league", device: DEV3 })).json();
  assert.strictEqual(bola.division.name, "NPFL");
  assert.deepStrictEqual(bola.top.map((x) => x.name), ["Bola"]);
  assert.strictEqual(P.divisionOf(0, 0), 0); assert.strictEqual(P.divisionOf(0, 3), 1); assert.strictEqual(P.divisionOf(12, 0), 3);
});

test("club wars (owner, 9 Oct 2026): a run carries its club, every goal this week counts for it", async () => {
  const w = world();
  const r = await w.call("POST", "ranked", { device: DEV1, name: "Tobi", club: "enyimba", i: 0, spot: 2, power: 0.7 });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(Object.values(w.db.t.runs)[0].club, "enyimba", "the club is stored on the run");
  await w.call("POST", "ranked", { device: DEV2, name: "Ada", club: "<script>", i: 0, spot: 2, power: 0.7 });
  assert.strictEqual(Object.values(w.db.t.runs)[1].club, null, "an unknown club is not stored");
  w.db.t.runs = {
    A: { device: DEV1, name: "Tobi", club: "arsenal", streak: 4, created_at: "2026-10-07T10:00:00.000Z" },
    B: { device: DEV1, name: "Tobi", club: "arsenal", streak: 3, created_at: "2026-10-08T09:00:00.000Z" },
    C: { device: DEV2, name: "Ada", club: "enyimba", streak: 6, created_at: "2026-10-07T11:00:00.000Z" },
    D: { device: DEV3, name: "Old", club: "enyimba", streak: 30, created_at: "2026-09-30T08:00:00.000Z" },
    E: { device: DEV3, name: "Bola", club: null, streak: 5, created_at: "2026-10-07T12:00:00.000Z" },
  };
  const c = (await w.call("GET", "board", null, { period: "clubs", device: DEV1 })).json();
  assert.deepStrictEqual(c.top, [{ club: "arsenal", goals: 7, players: 1 }, { club: "enyimba", goals: 6, players: 1 }],
    "sum of this week's goals; last week and clubless runs left out");
  assert.strictEqual(c.mine, "arsenal");
  const today = (await w.call("GET", "board", null, { period: "today" })).json();
  assert.strictEqual(today.top[0].club, "arsenal", "the badge travels with the name");
});
