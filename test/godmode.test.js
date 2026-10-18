"use strict";
/* The admin's god mode (owner, 13 Oct 2026): per-bookie kill switches and a
   notice line (lib/flags.js), numbers, and reader lookup with sign-out. */
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb, fakeRes, postReq, getReq } = require("./helpers/fakes.js");
const S = require("../lib/auth/session.js");
const F = require("../lib/flags.js");
const { makeHandler } = require("../lib/bookproxy.js");

process.env.AUTH_ENABLED = "1";
process.env.AUTH_PEPPER = "p".repeat(64);
const account = require("../api/account.js");

/* ------------------------------------------------------------ the switches */

test("only known bookies and one clean notice line survive", () => {
  assert.deepStrictEqual(F.clean({ booksOff: ["SPORTY", "sporty", "nope", "bet9ja"], notice: "  Slow\n tonight  " }),
    { booksOff: ["sporty", "bet9ja"], notice: "Slow tonight", maint: false, maintMsg: "" });
  assert.deepStrictEqual(F.clean(null), { booksOff: [], notice: "", maint: false, maintMsg: "" });
  assert.strictEqual(F.clean({ notice: "x".repeat(500) }).notice.length, F.NOTICE_MAX);
});

/* bookproxy answers through res.status().json(), unlike the auth routes. */
function bookRes() {
  const r = { code: null, sent: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.sent = b; return r; };
  return r;
}
function bookReq() {
  return { method: "POST", query: { book: "sporty" }, headers: {}, body: { selections: [{ eventId: "1", prediction: "1" }] } };
}

test("a paused bookie is refused with book_off before the quota counts it", async () => {
  let gated = false;
  const h = makeHandler({ isOff: async (b) => b === "sporty", gate: async () => { gated = true; return { allow: true, counted: true }; } });
  const r = bookRes();
  await h(bookReq(), r);
  assert.strictEqual(r.code, 503);
  assert.strictEqual(r.sent.error, "book_off");
  assert.strictEqual(gated, false, "a refused booking must not spend the reader's allowance");
});

test("a switch that cannot be read fails open and booking goes on", async () => {
  /* The gate answering "blocked" proves the request got past the switch. */
  const h = makeHandler({ isOff: async () => { throw new Error("db down"); },
    gate: async () => ({ allow: false, counted: true }) });
  const r = bookRes();
  await h(bookReq(), r);
  assert.strictEqual(r.code, 429);
});

test("the page turns book_off into a message, not a retry", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(src, /if\(d&&d\.error==="book_off"\)\{ d\._kind="off"; return d; \}/);
  assert.match(src, /if\(kind==="off"\)/);
  assert.match(src, /fetch\("\/api\/flags"\)/, "the notice line is never read");
});

/* --------------------------------------------------------- the admin API */

async function world() {
  const clock = () => Date.UTC(2026, 9, 13, 10);
  const db = fakeDb(clock);
  const grants = new Set(["mum@home.com"]);
  db.grantFor = async (e) => (grants.has(e) ? { email: e } : null);
  let stored = { booksOff: [], notice: "" };
  const flags = { get: async () => stored, set: async (v) => (stored = F.clean(v)), _reset: () => {} };
  const admin = { stats: async () => ({ ok: true, stats: { users: 3, codesToday: 7, books: [] } }),
    slipsOf: async () => [{ book: "sporty", code: "ABC", status: "open", created_at: new Date(clock()).toISOString() }] };
  const ledger = { 41: "check", 42: "landed" };
  const wins = { 51: { id: 51, book: "sporty", code: "Z13XFH", status: "landed", total_odds: 60, leg_count: 3, untracked: 2, legs: [{ name: "Riga or draw" }] },
    52: { id: 52, book: "sporty", code: "SMALL1", status: "landed", total_odds: 3, leg_count: 3, legs: [] } };
  const posts = [], postedKeys = new Set(["win|51|tg"]);
  const slips = { hits: async () => ({ ok: true, rows: [] }),
    byId: async (id) => wins[id] || null,
    postWin: async (ch, text, img) => { posts.push({ ch, text, img }); return true; },
    wasPosted: async (k) => postedKeys.has(k), logPost: async (row) => { postedKeys.add(row.key); },
    read: async () => [{ home: "Riga", away: "Kairat", prediction: "1X" }, { home: "St. Truiden", away: "Iberia", prediction: "AH_2_-2" },
      { home: "Freiburg", away: "Jablonec", prediction: "OVER_1.5" }],
    fill: async (id, patch) => Object.assign(wins[id], patch),
    settle: async (id, to) => { if (ledger[id] !== "check") return { ok: true, changed: false }; ledger[id] = to; return { ok: true, changed: true }; } };
  const log = [];
  const audit = { log: async (row) => { log.push(row); return true; }, list: async () => ({ ok: true, rows: log.slice().reverse() }) };
  const h = account.make({ db, now: clock, env: { SW_ADMIN_EMAILS: "boss@x.com" }, flags, admin, slips, audit });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const user = async (email) => {
    const u = await db.createUser({ email });
    return { id: u.id, cookie: S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token };
  };
  const boss = await user("boss@x.com"), mum = await user("mum@home.com"), plain = await user("a@b.com");
  return { db, call, boss, mum, plain, stored: () => stored, ledger, log, posts, wins };
}
const get = (who, action, query) => Object.assign(getReq("account", {}, { cookie: who.cookie }), { query: Object.assign({ action }, query || {}) });
const post = (who, action, body) => Object.assign(postReq("account", body, { cookie: who.cookie }), { query: { action } });

test("every god-mode action is admin only", async () => {
  const w = await world();
  for (const a of ["flags", "stats", "lookup", "alerts"]) assert.strictEqual((await w.call(get(w.plain, a, { email: "a@b.com" }))).code, 403, a);
  for (const a of ["setflags", "signout"]) assert.strictEqual((await w.call(post(w.plain, a, { booksOff: ["sporty"], email: "boss@x.com" }))).code, 403, a);
  assert.deepStrictEqual(w.stored().booksOff, [], "a refused setflags wrote nothing");
});

test("admin pauses a bookie and sets a notice", async () => {
  const w = await world();
  const r = await w.call(post(w.boss, "setflags", { booksOff: ["bet9ja", "x"], notice: "Bet9ja is down" }));
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.json(), { booksOff: ["bet9ja"], notice: "Bet9ja is down", maint: false, maintMsg: "" });
  assert.deepStrictEqual((await w.call(get(w.boss, "flags"))).json(), { booksOff: ["bet9ja"], notice: "Bet9ja is down", maint: false, maintMsg: "" });
});

test("admin reads the numbers", async () => {
  const w = await world();
  assert.strictEqual((await w.call(get(w.boss, "stats"))).json().codesToday, 7);
});

test("lookup shows plan, devices and codes, and says when there is no account", async () => {
  const w = await world();
  const r = (await w.call(get(w.boss, "lookup", { email: " MUM@home.com " }))).json();
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.role, "ff");
  assert.strictEqual(r.devices.length, 1);
  assert.strictEqual(r.codes[0].code, "ABC");
  const plain = (await w.call(get(w.boss, "lookup", { email: "a@b.com" }))).json();
  assert.strictEqual(plain.codes, null, "free readers are counted by device, not account");
  assert.deepStrictEqual((await w.call(get(w.boss, "lookup", { email: "new@x.com" }))).json(), { found: false, email: "new@x.com", ff: false });
  assert.strictEqual((await w.call(get(w.boss, "lookup", { email: "nope" }))).code, 400);
});

test("sign out everywhere ends the reader's sessions but never the admin's own", async () => {
  const w = await world();
  assert.strictEqual((await w.call(post(w.boss, "signout", { email: "boss@x.com" }))).code, 400);
  assert.strictEqual((await w.call(post(w.boss, "signout", { email: "a@b.com" }))).code, 200);
  assert.strictEqual((await w.db.liveSessions(w.plain.id, new Date(Date.UTC(2026, 9, 13, 10)).toISOString())).length, 0);
  assert.strictEqual((await w.call(post(w.boss, "signout", { email: "ghost@x.com" }))).code, 404);
});

test("a check slip is settled by the admin once, and only a check slip", async () => {
  const w = await world();
  assert.strictEqual((await w.call(post(w.plain, "settle", { id: "41", status: "landed" }))).code, 403);
  assert.strictEqual((await w.call(post(w.boss, "settle", { id: "41", status: "won" }))).code, 400);
  assert.strictEqual((await w.call(post(w.boss, "settle", { id: "41; drop", status: "landed" }))).code, 400);
  assert.strictEqual((await w.call(post(w.boss, "settle", { id: "41", status: "landed" }))).code, 200);
  assert.strictEqual(w.ledger[41], "landed");
  assert.strictEqual((await w.call(post(w.boss, "settle", { id: "41", status: "lost" }))).code, 409, "a settled slip cannot be flipped");
  assert.strictEqual((await w.call(post(w.boss, "settle", { id: "42", status: "lost" }))).code, 409);
});

test("a landed win is posted to our channels by the admin, once per channel", async () => {
  /* owner, 18 Oct 2026: "shouldnt there be a button to enable me push to our channels" */
  const w = await world();
  assert.strictEqual((await w.call(post(w.plain, "postwin", { id: "51" }))).code, 403);
  assert.strictEqual((await w.call(post(w.boss, "postwin", { id: "x" }))).code, 400);
  assert.strictEqual((await w.call(post(w.boss, "postwin", { id: "99" }))).code, 404);
  assert.strictEqual((await w.call(post(w.boss, "postwin", { id: "52" }))).code, 409, "under x5 is not a win post");
  const r = (await w.call(post(w.boss, "postwin", { id: "51" }))).json();
  assert.deepStrictEqual(r, { sent: ["x", "fb"], already: ["tg"], failed: [] }, "Telegram already had it");
  assert.match(w.posts[0].text, /3 games/);
  assert.match(w.posts[1].text, /✅ Iberia \+2 handicap\n✅ Over 1\.5 goals \(Freiburg v Jablonec\)/, "Facebook lists every game, read back from the bookie");
  assert.strictEqual(w.wins[51].untracked, 0, "the row now holds every leg, so the banner shows them too");
  assert.deepStrictEqual((await w.call(post(w.boss, "postwin", { id: "51" }))).json().sent, [], "never twice");
  const UI = require("../public/account-ui.js");
  assert.match(UI.hitsHtml([{ id: 51, status: "landed", code: "Z13XFH", book: "sporty", total_odds: 60, leg_count: 14, legs: [],
    share: { img: "i", x: "c", tg: "c" } }]), /data-postwin='51'>Post to our channels</);
});

test("every clipboard write on the site catches its refusal", () => {
  /* Sentry, 13 Oct 2026: NotAllowedError from an uncaught writeText. */
  const fs = require("fs"), path = require("path");
  const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const ui = read("public/account-ui.js"), pages = read("lib/pages.js");
  assert.ok(ui.includes("},show); else show();"), "the admin share fallback lets a refused copy go");
  assert.ok(!pages.includes('writeText(b.dataset.t).then(function(){b.textContent="Copied";});'),
    "the /x page copy button lets a refused copy go");
  assert.ok(pages.includes('function(){b.textContent="Select and copy";}'));
});

/* --------------------------------------------- one slip, leg by leg (Check) */

test("every leg is named, scored and settled where a score settles it", () => {
  const DET = require("../lib/slipdetail.js");
  const ko = "2026-10-12T18:00:00Z";
  const legs = [
    /* Not on our board, but the results sweep has it: an Over 2.5 is settled, not "cannot grade". */
    { home: "Lens", away: "Sporting Lisbon", kickoff: ko, prediction: "OVER_2.5", odds: 1.7 },
    { home: "Arsenal", away: "Lille", kickoff: ko, prediction: "1X", odds: 1.2 },
    { home: "Arsenal", away: "Lille", kickoff: ko, prediction: "CORNERS_OV_9.5", odds: 1.8 },
    { home: "Nowhere FC", away: "Ghost Utd", kickoff: ko, prediction: "OVER_1.5", odds: 1.3 },
  ];
  const results = [
    { match_date: "2026-10-12", home: "Lens", away: "Sp Lisbon", hg: 2, ag: 1 },
    { match_date: "2026-10-12", home: "Arsenal", away: "Lille", hg: 0, ag: 1, hc: 6, ac: 5 },
  ];
  const d = DET.detail(legs, results);
  assert.strictEqual(d[0].verdict, "won");
  assert.strictEqual(d[0].pick, "Over 2.5 goals");
  assert.strictEqual(d[0].score, "2-1");
  assert.strictEqual(d[1].verdict, "lost", "Arsenal or draw, 0-1 is an away win");
  assert.strictEqual(d[2].verdict, "won", "corners over 9.5 on 6-5 is settled from the stats now (lib/legrade.js)");
  assert.strictEqual(d[2].pick, "Corners over 9.5");
  assert.strictEqual(d[3].verdict, null);
  assert.match(d[3].why, /No final score/);
});

test("slipdetail is admin only and reads the slip back", async () => {
  const w = await world();
  assert.strictEqual((await w.call(get(w.plain, "slipdetail", { id: "41" }))).code, 403);
  assert.strictEqual((await w.call(get(w.boss, "slipdetail", { id: "x" }))).code, 400);
});

/* ------------------------------------------------------------ the audit log */

test("every admin change and every reader lookup is logged with who did it", async () => {
  const w = await world();
  await w.call(post(w.boss, "setflags", { booksOff: ["sporty"], notice: "" }));
  await w.call(get(w.boss, "lookup", { email: "a@b.com" }));
  await w.call(post(w.boss, "signout", { email: "a@b.com" }));
  await w.call(post(w.boss, "settle", { id: "41", status: "lost" }));
  await w.call(get(w.boss, "stats"));                       /* reading the numbers is not logged */
  assert.deepStrictEqual(w.log.map((r) => [r.action, r.target]),
    [["setflags", null], ["lookup", "a@b.com"], ["signout", "a@b.com"], ["settle", "slip 41"]]);
  assert.ok(w.log.every((r) => r.admin_email === "boss@x.com" && r.at));
  assert.deepStrictEqual(w.log[0].detail.after.booksOff, ["sporty"]);
  assert.deepStrictEqual(w.log[0].detail.before.booksOff, []);
  const got = (await w.call(get(w.boss, "audit"))).json().log;
  assert.strictEqual(got[0].action, "settle", "newest first");
  assert.strictEqual((await w.call(get(w.mum, "audit"))).code, 403, "Family & friends cannot read it");
});

test("a refused or failed admin action is not logged as done", async () => {
  const w = await world();
  await w.call(post(w.plain, "setflags", { booksOff: ["sporty"] }));
  await w.call(post(w.boss, "settle", { id: "42", status: "lost" }));   /* not a check slip: 409 */
  assert.deepStrictEqual(w.log, []);
});
