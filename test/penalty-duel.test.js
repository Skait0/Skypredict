// test/penalty-duel.test.js
"use strict";
/* DUELS (owner, 9 Oct 2026): turn by turn against a friend. Each turn is a
   dive against the shot already waiting (a real result at once), then a shot
   of your own, sealed until the other side dives. Nothing judged against a
   pretend keeper, and a sealed shot never leaves the server. */
const test = require("node:test");
const assert = require("node:assert");
const { fakeRes } = require("./helpers/fakes.js");
const { ORIGIN } = require("../lib/auth/http.js");
const P = require("../lib/penalty.js");
process.env.PENALTY_KEY = "k".repeat(32);
const { make } = require("../api/penalty.js");

const A = "aaaaaaaa-1111-4111-8111-111111111111", B = "bbbbbbbb-2222-4222-8222-222222222222", C = "cccccccc-3333-4333-8333-333333333333";
const EP = "https://fcm.googleapis.com/fcm/send/abc";

function world(opts) {
  const T = Date.parse("2026-10-09T12:00:00Z");     // 13:00 Lagos - outside quiet hours
  const t = { duels: {}, push: {}, sent: [] };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const db = {
    async rlHit() { return true; },
    async createDuel(r) { if (t.duels[r.id]) return false; t.duels[r.id] = clone(Object.assign({ b_device: null }, r)); return true; },
    async getDuel(id) { return t.duels[id] ? clone(t.duels[id]) : null; },
    async updateDuel(id, v, patch) { const d = t.duels[id]; if (!d || d.v !== v) return false; Object.assign(d, clone(patch)); return true; },
    async myDuels(dev) { return Object.values(t.duels).filter((d) => d.a_device === dev || d.b_device === dev).map(clone); },
    async h2h(d1, d2) { return Object.values(t.duels).filter((d) => d.finished_at && ((d.a_device === d1 && d.b_device === d2) || (d.a_device === d2 && d.b_device === d1))).map(clone); },
    async putPush(r) { t.push[r.device] = clone(r); return true; },
    async getPush(dev) { return t.push[dev] ? clone(t.push[dev]) : null; },
    async pushByEndpoint(ep) { return Object.values(t.push).find((p) => p.endpoint === ep) || null; },
    async setNote(dev, note, at) { if (t.push[dev]) Object.assign(t.push[dev], { note, note_at: at }); return true; },
    async dropPush(dev) { delete t.push[dev]; return true; },
  };
  const sendPush = opts && opts.noPush ? null : async (ep) => { t.sent.push(ep); return 201; };
  const handler = make({ db, now: () => T, sendPush, tips: () => ({}) });
  const H = { "x-sw-request": "1", origin: ORIGIN, "x-forwarded-for": "1.2.3.4" };
  const call = async (method, a, body, q) => { const res = fakeRes();
    await handler({ method, headers: H, query: Object.assign({ a }, q || {}), body: body || {} }, res); return res; };
  return { t, call };
}
const firm = (spot) => ({ spot, power: 0.7 });       // a clean strike: saved only by the right dive

test("a turn is a real dive then a sealed shot, and the sealed shot never leaks", async () => {
  const w = world();
  const id = (await w.call("POST", "duel_new", { device: A, name: "Tobi", char: "wizard", club: "arsenal", taunt: "fire", lvl: 4, shot: firm(0) })).json().id;
  let v = (await w.call("GET", "duel", null, { id, device: B })).json();
  assert.strictEqual(v.open, true);
  assert.strictEqual(v.mine, true, "a stranger with the link may join as B");
  assert.deepStrictEqual(v.kicks, [{ by: "a", sealed: true }], "B cannot see where A shot");
  assert.strictEqual(JSON.stringify(v).includes('"spot"'), false);
  assert.deepStrictEqual(v.a, { name: "Tobi", char: "wizard", club: "arsenal", taunt: "fire", lvl: 4 });

  // B dives the wrong way: a real goal for A, shown at once with A's real shot
  let r = (await w.call("POST", "duel_turn", { id, device: B, name: "Ada", v: v.v, dive: 2 })).json();
  assert.strictEqual(r.outcome, "goal");
  assert.deepStrictEqual({ spot: r.against.spot, kind: r.against.kind }, { spot: 0, kind: "green" });
  assert.deepStrictEqual([r.score, r.turn, r.need, r.me], [{ a: 1, b: 0 }, "b", "shot", "b"], "still B's turn: now B shoots");

  // B shoots; it is sealed and the turn passes to A, whose phone is pinged
  await w.call("POST", "duel_push", { device: A, sub: { endpoint: EP, keys: { p256dh: "p", auth: "x" } } });
  r = (await w.call("POST", "duel_turn", { id, device: B, v: r.v, shot: firm(4) })).json();
  assert.deepStrictEqual([r.turn, r.need, r.mine], ["a", "dive", false]);
  assert.deepStrictEqual(w.t.sent, [EP], "A is pinged that it is their turn");
  const note = (await w.call("GET", "note", null, { endpoint: EP })).json();
  assert.strictEqual(note.title, "Your turn vs Ada");
  assert.match(note.url, new RegExp("/penalty\\?d=" + id));

  // A reads the duel: B's shot is sealed for A too
  v = (await w.call("GET", "duel", null, { id, device: A })).json();
  assert.deepStrictEqual(v.kicks[1], { by: "b", sealed: true });
  assert.strictEqual(v.mine, true);
  // A saves it by diving the right way
  r = (await w.call("POST", "duel_turn", { id, device: A, v: v.v, dive: 4 })).json();
  assert.strictEqual(r.outcome, "save");
  assert.deepStrictEqual(r.score, { a: 1, b: 0 });
});

test("only the player whose turn it is moves, once per turn, and a third phone is turned away", async () => {
  const w = world();
  const id = (await w.call("POST", "duel_new", { device: A, name: "Tobi", shot: firm(0) })).json().id;
  assert.strictEqual((await w.call("POST", "duel_turn", { id, device: A, v: 1, dive: 0 })).code, 409, "A cannot dive their own shot");
  assert.strictEqual((await w.call("POST", "duel_turn", { id, device: B, v: 1, dive: 1 })).code, 400, "joining needs a name");
  assert.strictEqual((await w.call("POST", "duel_turn", { id, device: B, name: "Ada", v: 1, shot: firm(1) })).code, 400, "B must dive first");
  assert.strictEqual((await w.call("POST", "duel_turn", { id, device: B, name: "Ada", v: 1, dive: 1 })).code, 200);
  const twice = await w.call("POST", "duel_turn", { id, device: B, name: "Ada", v: 1, dive: 1 });
  assert.strictEqual(twice.code, 409, "a stale v (a double tap) cannot land twice");
  assert.strictEqual(twice.json().v, 2, "and is told where the duel stands");
  assert.strictEqual((await w.call("POST", "duel_turn", { id, device: C, name: "Bola", v: 2, shot: firm(2) })).code, 409, "taken");
  assert.strictEqual((await w.call("GET", "duel", null, { id, device: C })).json().mine, false);
});

test("a whole duel plays to a result, both phones hear it, and the rivalry is counted", async () => {
  const w = world();
  await w.call("POST", "duel_push", { device: B, sub: { endpoint: EP + "b", keys: { p256dh: "p", auth: "x" } } });
  for (let game = 0; game < 2; game++) {
    // A always scores (B dives wrong), B always misses (A dives right): A wins 3-0 early
    let r = (await w.call("POST", "duel_new", { device: A, name: "Tobi", shot: firm(0) })).json();
    const id = r.id;
    let v = 1;
    for (let guard = 0; guard < 40; guard++) {
      const s = (await w.call("GET", "duel", null, { id, device: A })).json();
      if (s.done) break;
      const dev = s.turn === "a" ? A : B, body = { id, device: dev, name: "Ada", v: s.v };
      if (s.need === "dive") body.dive = s.turn === "a" ? 2 : 1; else body.shot = firm(s.turn === "a" ? 0 : 2);
      r = (await w.call("POST", "duel_turn", body)).json();
      v = r.v;
    }
    assert.deepStrictEqual([r.done, r.winner, r.score], [true, "a", { a: 3, b: 0 }], "decided once B cannot catch up");
  }
  const note = (await w.call("GET", "note", null, { endpoint: EP + "b" })).json();
  assert.strictEqual(note.title, "Tobi beat you 3-0");
  const seen = (await w.call("GET", "duel", null, { id: Object.keys(w.t.duels)[0], device: B })).json();
  assert.deepStrictEqual(seen.h2h, { you: 0, them: 2, draws: 0 }, "told from B's side");
  const list = (await w.call("GET", "duels", null, { device: B })).json().duels;
  assert.strictEqual(list.length, 2);
  assert.deepStrictEqual([list[0].opp, list[0].done, list[0].won, list[0].you, list[0].them], ["Tobi", true, false, 0, 3]);
});

test("no push key, no ping - and the turn still lands", async () => {
  const w = world({ noPush: true });
  const id = (await w.call("POST", "duel_new", { device: A, name: "Tobi", shot: firm(0) })).json().id;
  await w.call("POST", "duel_push", { device: B, sub: { endpoint: EP, keys: { p256dh: "p", auth: "x" } } });
  assert.strictEqual((await w.call("POST", "duel_turn", { id, device: B, name: "Ada", v: 1, dive: 1 })).code, 200);
  assert.deepStrictEqual((await w.call("GET", "pushkey")).json(), {}, "the page offers no pings when the server cannot send them");
});

test("a push subscription must be a real push service", async () => {
  const w = world();
  assert.strictEqual((await w.call("POST", "duel_push", { device: A, sub: { endpoint: "https://evil.example/x", keys: { p256dh: "p", auth: "x" } } })).code, 400);
  assert.deepStrictEqual((await w.call("GET", "note", null, { endpoint: "https://evil.example/x" })).json(), {});
});

test("duelState: a sealed shot waits for a dive; regulation can end early", () => {
  assert.deepStrictEqual(P.duelState([]), { score: { a: 0, b: 0 }, done: false, winner: null, turn: "a", need: "shot", outcomes: [] });
  const k = [{ spot: 0, power: 0.7, dive: 1, outcome: "goal" }, { spot: 1, power: 0.7 }];
  assert.deepStrictEqual([P.duelState(k).turn, P.duelState(k).need], ["a", "dive"]);
});
