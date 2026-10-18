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
    markSent: async (uid, day) => { (String(day).startsWith("ended:") ? (store.ended = store.ended || []) : store.sent).push(uid); return true; },
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
  assert.deepStrictEqual(store.minted, [10, 20, 100, 1000, 5], "the open x5 is booked after the locked rungs");
  assert.deepStrictEqual(one.minted, [10, 20, 100, 1000, 5]);
  store.minted.length = 0;
  const two = await API.fill(now, d);
  assert.deepStrictEqual(store.minted, [], "a stored rung is never booked a second time");
  assert.strictEqual(two.rows.length, 5);
});

/* Owner, 18 Oct 2026: every rung stacked the same safest-first games, so the open x5
   gave away most of the locked x10. x5 and Big odds are now picked around them. */
test("the open x5 and Big odds share no game with the locked x10 and x20", async () => {
  const BIG = require("../lib/bigodds.js");
  const games = (p) => new Set(p.legs.map((l) => l.home + "|" + l.away));
  const row = (x) => { const p = L.pickRung(pay, now, feed, L.RUNGS.find((r) => r.x === x));
    return { rung: x, legs: p.legs.map((l) => ({ home: l.home, away: l.away })) }; };
  const locked = [row(10), row(20)];
  const shut = new Set([].concat(...locked.map((r) => r.legs.map((l) => l.home + "|" + l.away))));
  const before = games(L.pickRung(pay, now, feed, L.RUNGS[0]));
  assert.ok([...before].every((g) => shut.has(g)), "without the locked rows, x5 is the first games of x10 (the leak)");
  const x5 = L.pickRung(pay, now, feed, L.RUNGS[0], locked);
  assert.ok(x5 && x5.odds >= 5 * L.SHORT);
  assert.ok([...games(x5)].every((g) => !shut.has(g)), "x5 keeps out every x10 and x20 game");
  const big = BIG.pick(pay, now, feed, { skip: L.openSkips(locked)[0] });
  assert.ok(big && [...games(big)].every((g) => !shut.has(g)), "Big odds keeps them out too");
  /* Owner, 18 Oct 2026: "keep out x5 too" - Big odds had been x5's games plus 4. */
  const withX5 = locked.concat([{ rung: 5, legs: x5.legs.map((l) => ({ home: l.home, away: l.away })) }]);
  const big2 = BIG.pick(pay, now, feed, { skip: L.bigSkips(withX5)[0] });
  assert.ok(big2 && [...games(big2)].every((g) => !shut.has(g) && !games(x5).has(g)), "Big odds keeps out x5, x10 and x20");
  assert.deepStrictEqual(L.bigSkips(withX5).map((s) => s.size), [games(x5).size + shut.size, games(x5).size + locked[0].legs.length, locked[0].legs.length]);
  /* 20 games: x20 takes 16, too few left, so x5 falls back to keeping out x10's only. */
  const small = { fixtures: pay.fixtures.slice(0, 20) }, sf = feed.slice(0, 20);
  const r10 = L.pickRung(small, now, sf, L.RUNGS[1]), r20 = L.pickRung(small, now, sf, L.RUNGS[2]);
  const lk = [{ rung: 10, legs: r10.legs }, { rung: 20, legs: r20.legs }];
  const fb = L.pickRung(small, now, sf, L.RUNGS[0], lk);
  assert.ok(fb && fb.legs.every((l) => !r10.legs.some((m) => m.home === l.home)), "fallback still keeps x10 out");
  assert.strictEqual(L.pickRung({ fixtures: pay.fixtures.slice(0, 12) }, now, feed.slice(0, 12), L.RUNGS[0],
    [{ rung: 10, legs: L.pickRung({ fixtures: pay.fixtures.slice(0, 12) }, now, feed.slice(0, 12), L.RUNGS[1]).legs }]), null,
    "nothing left once x10 is out: no x5 that day rather than a leak");
  /* fill hands x5 the locked rows booked before it. */
  const { d } = deps({ mint: async (p, n, f, rung, rows) => { if (rung.x === 5) d.seen = rows.map((r) => r.rung);
    return { rung: rung.x, odds: rung.x, legs: [], codes: { sporty: { code: "S", n: 1 } } }; } });
  await API.fill(now, d);
  assert.deepStrictEqual(d.seen, [10, 20, 100, 1000]);
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
  assert.deepStrictEqual(store.tg.map((x) => x[0]), [777, 9], "Telegram only where the reader turned it on");
  assert.strictEqual(out.notPass, 1);
  assert.strictEqual(out.notToday, 2, "no rung today, or no code on that bookie");
  assert.ok(!store.sent.includes("push-fails"), "a send that reached nobody is tried again at 10:45");
});

test("a lapsed pass hears once that it ended, then nothing until it renews", async () => {
  const rows = [{ rung: 20, odds: 21, legs: [1], codes: { sporty: { code: "S20", n: 1 } } }];
  const due = [
    { user_id: "lapsed", rung: 20, book: "sporty", push: true, tg_chat: 9, last_sent_day: "2026-10-17" },
    { user_id: "told", rung: 20, book: "sporty", push: true, tg_chat: 8, last_sent_day: "ended:2026-10-17" },
  ];
  const { d, store } = deps({ autopilotDue: async () => ({ ok: true, rows: due }), roleOf: async () => "free" });
  const out = await API.deliver(now, rows, d);
  assert.strictEqual(out.notPass, 2);
  assert.deepStrictEqual(store.ended, ["lapsed"], "marked so the 10:45 retry and tomorrow stay silent");
  assert.deepStrictEqual(store.sent, [], "a lapsed reader is never marked as sent today");
  assert.deepStrictEqual(store.tg.map((x) => x[0]), [9]);
  assert.ok(!store.tg[0][1].includes("S20") && !store.pushed[0][1].includes("S20"), "no code goes to a lapsed pass");
  for (const t of [store.pushed[0][1], store.tg[0][1]]) { assert.match(t, /ended/); assert.match(t, /18\+/); assert.doesNotMatch(t, /—|bfreeb|load am/i); }
  const { d: d2, store: s2 } = deps({ autopilotDue: async () => ({ ok: true, rows: [Object.assign({}, due[1])] }) });
  await API.deliver(now, rows, d2);
  assert.deepStrictEqual(s2.sent, ["told"], "a renewed pass gets its code again");
});

test("only x5 shows its code without a pass; ?mine=1 opens every rung for a pass", async () => {
  const day = [5, 10, 1000].map((x) => ({ day: "2026-10-18", rung: x, odds: x, legs: [1, 2, 3],
    codes: { sporty: { code: "S" + x, n: 3 }, bet9ja: { code: "B" + x, n: 2 } } }));
  const run = async (query, role) => {
    const { d } = deps({ getLadder: async () => ({ ok: true, rows: day }), roleOfReq: async () => role });
    const r = res(); await API.make(d)({ query, headers: {} }, r); return r;
  };
  const pub = await run({}, "plus");
  assert.match(JSON.stringify(pub.body.rungs[0]), /S5/, "x5 is open to everyone");
  for (const r of pub.body.rungs.slice(1)) {
    assert.doesNotMatch(JSON.stringify(r), /S10|B10|S1000|B1000/, "no code leaves for a locked rung");
    assert.strictEqual(r.locked, true); assert.strictEqual(r.games, 3); assert.deepStrictEqual(r.legs, []);
    assert.strictEqual(r.codes.bet9ja.n, 2, "the panel can still say how many games on each book");
  }
  const free = await run({ mine: "1" }, "free");
  assert.doesNotMatch(JSON.stringify(free.body), /S10|S1000/);
  assert.strictEqual(free.headers["Cache-Control"], "private, no-store");
  const pass = await run({ mine: "1" }, "plus");
  assert.match(JSON.stringify(pass.body), /S10.*S1000/);
  assert.strictEqual(pass.headers["Cache-Control"], "private, no-store", "a pass reply is never cached at the edge");
});

test("the /booking-codes day page shows the ladder: x5 with its codes, the rest Wizard Pass only", () => {
  const P = require("../lib/pages.js");
  const rows = [5, 100].map((x) => L.locked({ day: "2026-10-18", rung: x, odds: x * 1.07, legs: [1, 2, 3, 4],
    codes: { sporty: { code: "SP" + x, n: 4 }, bet9ja: { code: "BN" + x, n: 3 } } }));
  const entry = { date: "2026-10-18", codes: { sporty: "DAY1" }, legs: [{ home: "A", away: "B", tip: "1", date: "2026-10-18" }] };
  const html = P.renderCodesDay(entry, () => null, rows);
  assert.match(html, /x5 booking code/);
  assert.match(html, /SP5/); assert.match(html, /BN5/);
  assert.match(html, /x100 booking code/);
  assert.doesNotMatch(html, /SP100|BN100/, "a locked rung's code never reaches the static page");
  assert.match(html, /Wizard Pass only/);
  assert.doesNotMatch(P.renderCodesDay(entry, () => null), /Pick your odds/, "no ladder that day, no section");
  const build = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.match(build, /L\.locked\(r\)/, "the build locks the rows before rendering");
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

test("wired: two crons at 10:30 and 10:45 Lagos, Big odds books its own slip, the panel uses it", () => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const runs = v.crons.filter((c) => c.path === "/api/ladder?a=run").map((c) => c.schedule).sort();
  assert.deepStrictEqual(runs, ["30 9 * * *", "45 9 * * *"]);
  assert.ok(v.functions["api/ladder.js"].maxDuration >= 120);
  const social = fs.readFileSync(path.join(__dirname, "..", "api", "social.js"), "utf8");
  assert.doesNotMatch(social, /rung === 10/, "Big odds of the day never posts the ladder's x10, which is Wizard Pass only");
  assert.match(social, /BIG\.mint\(pay, now, L\.bigSkips\(/, "and is picked around the locked rungs' games and x5");
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  /* The panel's fetch, run: signed in asks ?mine=1 whatever sw.role says; signing in
     or a new pass asks again (saveRole calls swLadderSync). */
  const src = page.slice(page.indexOf("var LADDER_P=null"), page.indexOf("var LADDER={rows:null"));
  const sync = /window\.swLadderSync=function\(\)\{.*\};/.exec(page)[0];
  assert.match(page, /if\(root\.swLadderSync\) try\{ root\.swLadderSync\(\); \}catch\(e\)\{\}/);
  const asked = [], store = {};
  const win = { swAcct: { st: { on: false } } };
  const ctx = { window: win, LADDER: {}, paintLadder: () => {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    fetch: (u) => { asked.push(u); return Promise.resolve({ json: () => ({ rungs: [] }) }); } };
  require("vm").runInNewContext(src + sync + ";this.rows=ladderRows;", ctx);
  ctx.rows();
  win.swAcct.st.on = true; win.swLadderSync();
  store["sw.role"] = "plus"; win.swLadderSync();
  win.swLadderSync();
  assert.deepStrictEqual(asked, ["/api/ladder", "/api/ladder?mine=1", "/api/ladder?mine=1"],
    "signed out: public read; signed in with no role cached: ?mine=1; new pass: asked again; nothing changed: no fetch");
  assert.match(page, /class='lad-r'/);
  assert.match(page, /id="ladder"/, "the Ready-made slips panel sits under the offer");
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

/* Owner, 17 Oct 2026: "no banner should show without sign up". The admin's notice
   line is drawn only while the account says signed in, and goes on sign-out. */
test("the admin's notice line shows only to signed-in readers", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(page, /var on=!!\(window\.swAcct&&window\.swAcct\.st&&window\.swAcct\.st\.on\);/);
  assert.match(page, /if\(on&&!seen\(\)&&!el\.parentNode\) top\.insertAdjacentElement\("afterend",el\);/);
  assert.doesNotMatch(page, /window\.swNoticeCheck=function\(\)\{[^\n]*\}\;\n    top\.insertAdjacentElement/, "never drawn unconditionally");
  assert.match(page, /if\(root\.swNoticeSync\) try\{ root\.swNoticeSync\(\); \}catch\(e\)\{\}/, "sign-in and sign-out redraw it");
});

/* Owner, 17 Oct 2026: Bankers at x2k previewed "40 games, x476", then Conjure gave
   x2k. The preview sliced at 40 while the build allowed 50 for Bankers. */
test("the Wizard's preview and its build use one leg cap", () => {
  const page = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const RULE = "(isJackpotOdds(T)||bankersOn())?JACKPOT_LEG_CAP:40";
  assert.ok(page.includes("var T=WSP.odds, cap=" + RULE + ","), "the build");
  assert.ok(page.includes(".slice(0," + RULE.replace("(T)", "(WSP.odds)") + ");"), "the preview caps legs exactly as the build does");
  assert.ok(!page.includes(".slice(0,isJackpotOdds(WSP.odds)?JACKPOT_LEG_CAP:40)"), "no private 40-leg cap left in the preview");
});

test("a rung with a lost game is marked lost, locked or not (owner, 18 Oct 2026)", async () => {
  const leg = (home, code) => ({ home, away: home + " FC", code });
  const day = [{ day: "2026-10-18", rung: 5, odds: 5, legs: [leg("Alpha", "1"), leg("Beta", "OVER_1.5")], codes: { sporty: { code: "S5", n: 2 } } },
    { day: "2026-10-18", rung: 10, odds: 10, legs: [leg("Gamma", "1X")], codes: { sporty: { code: "S10", n: 1 } } }];
  const results = [{ match_date: "2026-10-18", home: "Alpha", away: "Alpha FC", hg: 0, ag: 1 },
    { match_date: "2026-10-18", home: "Gamma", away: "Gamma FC", hg: 1, ag: 1 }];
  const { d } = deps({ getLadder: async () => ({ ok: true, rows: day }), results: async () => results });
  const r = res(); await API.make(d)({ query: {}, headers: {} }, r);
  assert.deepStrictEqual(r.body.rungs.map((x) => x.lost), [true, false], "Alpha lost the x5; Gamma's draw keeps the x10's 1X alive");
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(src, /rows=all\.filter\(function\(r\)\{ return !r\.lost; \}\)/, "the page greys a lost rung out");
});
