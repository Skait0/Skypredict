"use strict";
/* The daily ladder and "My daily slip" (owner, 17 Oct 2026): x5, x10, x20, x100
   and x1000 booked once a day at 10:30 Lagos; a Wizard Pass reader picks one
   rung and one bookie and gets that code every morning. lib/ladder.js,
   api/ladder.js, sql/ladder.sql. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const L = require("../lib/ladder.js");
const API = require("../api/ladder.js");

const at = (lagosIso) => Date.parse(lagosIso + "+01:00");
const now = at("2026-10-18T10:30:00");
/* 40 games, every one with three 75%+ legs priced x1.15-1.40 at SportyBet. */
const games = Array.from({ length: 40 }, (_, i) => ({ date: "2026-10-18", home: "H" + i, away: "A" + i,
  kickoff: "2026-10-18T17:00:00Z", dc1x: 0.92, o15: 0.86, h_o05: 0.9, home_p: 0.78 }));
const pay = { fixtures: games };
const feed = games.map((f, i) => ({ id: i, home: f.home, away: f.away, ko: Date.parse(f.kickoff),
  odds: { "1X": 1.15, "OVER_1.5": 1.22, "HOME_OVER_0.5": 1.18, "1": 1.32 } }));

test("each rung reaches at least 80% of its payout inside its leg budget, or is left out", () => {
  for (const r of L.RUNGS) {
    const p = L.pickRung(pay, now, feed, r);
    if (!p) continue;
    assert.ok(p.odds >= r.x * L.SHORT, "x" + r.x + " came back x" + p.odds.toFixed(1));
    assert.ok(p.legs.length <= r.maxLegs, "x" + r.x + " used " + p.legs.length + " legs");
  }
  assert.ok(L.pickRung(pay, now, feed, L.RUNGS[0]), "x5 is there on a full day");
  const thin = { fixtures: games.slice(0, 9) };
  assert.strictEqual(L.pickRung(thin, now, feed.slice(0, 9), { x: 1000, maxLegs: 40 }), null,
    "nine games cannot make x1000, so the rung is left out rather than published short");
  assert.deepStrictEqual(L.RUNGS.map((r) => r.x), [5, 10, 20, 100, 1000]);
  assert.ok(L.RUNGS.every((r) => r.maxLegs <= 40), "40 is the smallest bookie limit");
});

test("the reader's message is plain, names the bookie and the code, and carries 18+", () => {
  const row = { rung: 100, odds: 104.3, codes: { sporty: { code: "ABC123", n: 30 }, betking: { code: "BK9", n: 28 } }, legs: new Array(30) };
  const m = L.note(row, "sporty");
  assert.strictEqual(m.push, "Your x100 slip is ready. SportyBet code: ABC123. 18+");
  assert.match(m.tg, /<code>ABC123<\/code>/);
  assert.match(L.note(row, "betking").tg, /28 of 30 games/, "a book that took fewer legs says so");
  assert.strictEqual(L.note(row, "betway"), null, "no code on that book, no message");
  for (const t of [m.push, m.tg]) { assert.match(t, /18\+/); assert.doesNotMatch(t, /—|\bfree\b|load am/i); }
});

function deps(over) {
  const store = { rows: [], sent: [], pushed: [], tg: [], minted: [] };
  const d = Object.assign({
    now: () => now,
    getLadder: async () => ({ ok: true, rows: store.rows.slice() }),
    putLadder: async (row) => { store.rows.push(row); return { ok: true }; },
    payload: async () => pay,
    feed: async () => feed,
    mint: async (p, n, f, rung) => { store.minted.push(rung.x); return { day: "2026-10-18", rung: rung.x, odds: rung.x, legs: [1, 2],
      codes: { sporty: { code: "S" + rung.x, n: 2 }, bet9ja: { code: "B" + rung.x, n: 2 } } }; },
    autopilotDue: async () => ({ ok: true, rows: [] }),
    markSent: async (uid) => { store.sent.push(uid); return true; },
    roleOf: async () => "plus",
    push: async (uid, note) => { store.pushed.push([uid, note]); return true; },
    tg: async (chat, text) => { store.tg.push([chat, text]); return true; },
  }, over);
  return { d, store };
}
function res() { const r = { code: 0, body: null, headers: {} }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; return r; }

test("10:30 books every missing rung once; 10:45 books only what is still missing", async () => {
  const { d, store } = deps();
  const one = await API.fill(now, d);
  assert.deepStrictEqual(store.minted, [5, 10, 20, 100, 1000]);
  assert.deepStrictEqual(one.minted, [5, 10, 20, 100, 1000]);
  store.minted.length = 0;
  const two = await API.fill(now, d);
  assert.deepStrictEqual(store.minted, [], "a stored rung is never booked a second time");
  assert.strictEqual(two.rows.length, 5);
});

test("only Wizard Pass readers are sent their rung, and only once something reached them", async () => {
  const rows = [{ rung: 20, odds: 21, legs: [1], codes: { sporty: { code: "S20", n: 1 } } }];
  const due = [
    { user_id: "pass-push", rung: 20, book: "sporty", push: true, tg_chat: null },
    { user_id: "pass-tg", rung: 20, book: "sporty", push: false, tg_chat: 777 },
    { user_id: "free", rung: 20, book: "sporty", push: true, tg_chat: 9 },
    { user_id: "no-rung", rung: 1000, book: "sporty", push: true },
    { user_id: "no-book", rung: 20, book: "betway", push: true },
    { user_id: "push-fails", rung: 20, book: "sporty", push: true },
  ];
  const { d, store } = deps({
    autopilotDue: async () => ({ ok: true, rows: due }),
    roleOf: async (uid) => (uid === "free" ? "free" : "plus"),
    push: async (uid, note) => { store.pushed.push([uid, note]); return uid !== "push-fails"; },
  });
  const out = await API.deliver(now, rows, d);
  assert.deepStrictEqual(store.sent.sort(), ["pass-push", "pass-tg"]);
  assert.deepStrictEqual(store.tg.map((x) => x[0]), [777], "Telegram only where the reader turned it on");
  assert.strictEqual(out.notPass, 1);
  assert.strictEqual(out.notToday, 2, "no rung today, or no code on that bookie");
  assert.ok(!store.sent.includes("push-fails"), "a send that reached nobody is tried again at 10:45");
});

test("the cron route needs the cron secret; the public read is cached at the edge", async () => {
  const { d } = deps();
  const h = API.make(d);
  const r1 = res(); await h({ query: { a: "run" }, headers: {} }, r1);
  assert.strictEqual(r1.code, 401);
  const r2 = res(); await h({ query: {}, headers: {} }, r2);
  assert.strictEqual(r2.code, 200);
  assert.ok(Array.isArray(r2.body.rungs));
});

test("wired: two crons at 10:30 and 10:45 Lagos, Big odds reuses the x10, the card and the panel use it", () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const runs = v.crons.filter((c) => c.path === "/api/ladder?a=run").map((c) => c.schedule).sort();
  assert.deepStrictEqual(runs, ["30 9 * * *", "45 9 * * *"]);
  assert.ok(v.functions["api/ladder.js"].maxDuration >= 120);
  const social = fs.readFileSync(path.join(__dirname, "..", "api", "social.js"), "utf8");
  assert.match(social, /r\.rung === 10/, "Big odds of the day takes the ladder's x10 when it is there");
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(page, /fetch\("\/api\/ladder"\)/);
  assert.match(page, /class='ck-rung'/);
  const ui = fs.readFileSync(path.join(__dirname, "..", "public", "account-ui.js"), "utf8");
  assert.match(ui, /\/api\/account\/setautopilot/);
  assert.match(ui, /sw-twa/, "the Play app pitches nothing");
  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "ladder.sql"), "utf8");
  assert.match(sql, /enable row level security/g);
});

/* The account side: reading is open to any signed-in reader (the panel says what a
   pass would give), changing it needs Wizard Pass, and only real rungs and books go in. */
test("My daily slip: only a Wizard Pass reader can set it, to a real rung and bookie", async () => {
  process.env.AUTH_ENABLED = "1";
  process.env.AUTH_PEPPER = "p".repeat(64);
  const { fakeDb, fakeRes, postReq, getReq } = require("./helpers/fakes.js");
  const S = require("../lib/auth/session.js");
  const account = require("../api/account.js");
  const clock = () => Date.UTC(2026, 9, 17, 10);
  const db = fakeDb(clock);
  db.grantFor = async (email) => (email === "pass@x.com" ? { email } : null);
  const saved = {};
  const autopilot = { get: async (uid) => ({ ok: true, row: saved[uid] || null }),
    put: async (uid, set) => { if (set.rung === null) delete saved[uid]; else saved[uid] = Object.assign({}, saved[uid], set); return { ok: true }; } };
  const h = account.make({ db, now: clock, env: {}, autopilot });
  const user = async (email) => { const u = await db.createUser({ email });
    return { id: u.id, cookie: S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token }; };
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const get = (who) => Object.assign(getReq("account", {}, { cookie: who.cookie }), { query: { action: "autopilot" } });
  const post = (who, body) => Object.assign(postReq("account", body, { cookie: who.cookie }), { query: { action: "setautopilot" } });
  const pass = await user("pass@x.com"), free = await user("free@x.com");

  const r0 = await call(get(free));
  assert.strictEqual(r0.code, 200);
  assert.strictEqual(r0.json().pass, false);
  assert.strictEqual((await call(post(free, { rung: 100, book: "sporty" }))).code, 403, "no pass, no daily slip");
  assert.strictEqual((await call(post(pass, { rung: 50, book: "sporty" }))).code, 400, "x50 is not a rung");
  assert.strictEqual((await call(post(pass, { rung: 100, book: "nairabet" }))).code, 400, "only our six bookies");
  const ok = await call(post(pass, { rung: 100, book: "betking", push: true }));
  assert.strictEqual(ok.code, 200);
  assert.deepStrictEqual([ok.json().rung, ok.json().book, ok.json().pass], [100, "betking", true]);
  const off = await call(post(pass, { rung: null }));
  assert.strictEqual(off.json().rung, null, "Off removes it");
});

test("a rung that SportyBet booked short of 80% of its payout is not stored under that name", async () => {
  const BIG = require("../lib/bigodds.js");
  const real = BIG.bookAll;
  try {
    BIG.bookAll = async (picked) => ({ legs: picked.legs.slice(0, 3), odds: 3.1, codes: { sporty: { code: "SHORT", n: 3 } } });
    assert.strictEqual(await L.mintRung(pay, now, feed, { x: 5, maxLegs: 8 }), null, "x3.1 is not x5");
    BIG.bookAll = async (picked) => ({ legs: picked.legs, odds: 4.6, codes: { sporty: { code: "OK5", n: picked.legs.length } } });
    const row = await L.mintRung(pay, now, feed, { x: 5, maxLegs: 8 });
    assert.ok(row && row.rung === 5 && row.codes.sporty.code === "OK5" && row.day === "2026-10-18");
  } finally { BIG.bookAll = real; }
});
