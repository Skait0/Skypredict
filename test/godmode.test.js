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
    { booksOff: ["sporty", "bet9ja"], notice: "Slow tonight", maint: false, maintMsg: "", pause: {} });
  assert.deepStrictEqual(F.clean(null), { booksOff: [], notice: "", maint: false, maintMsg: "", pause: {} });
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
    fill: async (id, patch) => Object.assign(wins[id], patch),    results: async () => [{ match_date: "2026-10-15", home: "Freiburg", away: "Jablonec", hg: 3, ag: 2 }],
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
  assert.deepStrictEqual(r.json(), { booksOff: ["bet9ja"], notice: "Bet9ja is down", maint: false, maintMsg: "", pause: {} });
  assert.deepStrictEqual((await w.call(get(w.boss, "flags"))).json(), { booksOff: ["bet9ja"], notice: "Bet9ja is down", maint: false, maintMsg: "", pause: {} });
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
  assert.deepStrictEqual(r, { sent: ["x", "fb"], already: ["tg"], failed: [], why: {} }, "Telegram already had it");
  assert.match(w.posts[0].text, /3 games/);
  assert.match(w.posts[1].text, /⚽ Iberia \+2 handicap\n⚽ Over 1\.5 goals \(Freiburg v Jablonec\)/, "Facebook lists every game, read back from the bookie");
  assert.strictEqual(w.wins[51].untracked, 0, "the row now holds every leg, so the banner shows them too");
  assert.deepStrictEqual((await w.call(post(w.boss, "postwin", { id: "51" }))).json().sent, [], "never twice");
  const UI = require("../public/account-ui.js");
  assert.match(UI.hitsHtml([{ id: 51, status: "landed", code: "Z13XFH", book: "sporty", total_odds: 60, leg_count: 14, legs: [],
    share: { img: "i", x: "c", tg: "c" } }]), /data-postwin='51'>Post to our channels</);
  assert.match(UI.hitsHtml([{ id: 51, status: "landed", code: "Z", book: "sporty", total_odds: 60, legs: [] }]), /class='swa-set swa-hit'/,
    "the buttons wrap under the text instead of squeezing it");
  assert.match(UI.hitsHtml([{ id: 51, status: "landed", code: "Z", book: "sporty", total_odds: 60, legs: [], share: { img: "i", x: "c", tg: "c" } }]),
    /data-postwin='51'>Post to our channels<\/button><small class='swa-postmsg' role='status'/, "the result shows under the button");
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

test("the admin list says when a win landed, what it paid and where it was posted (owner, 18 Oct 2026)", () => {
  const UI = require("../public/account-ui.js");
  const base = { id: 73, status: "landed", code: "Z13XFH", book: "sporty", total_odds: 121.88, leg_count: 14, legs: [],
    settled_at: "2026-10-16T21:05:00Z", paid: { odds: 14.02, pushed: 3, won: 11, games: 14 }, share: { img: "i", x: "c", tg: "c" } };
  const some = UI.hitsHtml([Object.assign({ posted: [{ ch: "tg", at: "2026-10-18T20:40:00Z" }] }, base)]);
  assert.match(some, /×14\.02 paid/); assert.match(some, /11 won, 3 voided \(stake back\)\. Booked at ×121\.88/);
  assert.match(some, /Posted: Telegram /); assert.match(some, />Post to the rest</);
  assert.match(some, /\d{1,2}:\d{2}/, "a time, not only a day");
  const none = UI.hitsHtml([Object.assign({ posted: [] }, base)]);
  assert.match(none, /Waiting for your OK/); assert.match(none, />Post to our channels</);
  const all = UI.hitsHtml([Object.assign({ posted: ["tg", "x", "fb"].map((ch) => ({ ch, at: "2026-10-18T20:40:00Z" })) }, base)]);
  assert.doesNotMatch(all, /data-postwin=/, "nothing left to post"); assert.match(all, /✓ Shared/);
});

test("fix a game by hand: the slip's status follows the legs (owner, 18 Oct 2026)", async () => {
  const w = await world();
  /* world() has no fixleg row; build one through the same deps */
  const account = require("../api/account.js");
  const rows = { 61: { id: 61, book: "sporty", code: "FIX1", status: "landed", total_odds: 20, leg_count: 2, created_at: "2026-10-12T10:00:00Z",
    legs: [{ name: "A", verdict: "won", odds: 4 }, { name: "B", verdict: "won", odds: 5 }] } };
  const log = [];
  const slips = { hits: async () => ({ ok: true, rows: [] }), byId: async (id) => rows[id] || null,
    fill: async (id, patch) => Object.assign(rows[id], patch), read: async () => null, results: async () => [] };
  const h = account.make({ db: w.db, now: () => Date.UTC(2026, 9, 13, 10), env: { SW_ADMIN_EMAILS: "boss@x.com" }, slips,
    audit: { log: async (r) => { log.push(r); return true; }, list: async () => ({ ok: true, rows: [] }) } });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  assert.strictEqual((await call(post(w.plain, "fixleg", { id: "61", i: 0, verdict: "lost" }))).code, 403);
  assert.strictEqual((await call(post(w.boss, "fixleg", { id: "61", i: 0, verdict: "maybe" }))).code, 400);
  assert.strictEqual((await call(post(w.boss, "fixleg", { id: "61", i: 5, verdict: "won" }))).code, 400);
  let r = (await call(post(w.boss, "fixleg", { id: "61", i: 1, verdict: "void" }))).json();
  assert.strictEqual(r.status, "landed"); assert.strictEqual(r.paid.odds, 4, "a voided leg pays odds 1");
  assert.strictEqual(rows[61].legs[1].byHand, true);
  r = (await call(post(w.boss, "fixleg", { id: "61", i: 0, verdict: "lost" }))).json();
  assert.strictEqual(r.status, "lost"); assert.strictEqual(rows[61].status, "lost");
  assert.strictEqual(log.filter((x) => x.action === "fixleg").length, 2, "every fix is in the audit log");
});

test("pause switches are kept for one Lagos day only", () => {
  const F = require("../lib/flags.js");
  const f = F.clean({ pause: { wins: "2026-10-19", ladder: "tomorrow", bigodds: "2026-10-19" } });
  assert.deepStrictEqual(f.pause, { wins: "2026-10-19" }, "Big odds has no switch since 22 Oct 2026");
  assert.strictEqual(F.pausedOn(f, "wins", "2026-10-19"), true);
  const UI = require("../public/account-ui.js");
  assert.match(UI.pauseHtml({ pause: {} }), /data-pause='wins' aria-checked='false'/);
});

test("feed alarms: board, results, ladder, a bookie gone quiet", () => {
  const A = require("../lib/alarms.js");
  const now = Date.parse("2026-10-19T13:00:00Z");
  const quiet = A.alarms({ now, hour: 14, payload: { generatedAt: "2026-10-19T09:00:00Z", degradedSources: 0 }, ladder: [{ rung: 5 }], ladderPaused: false,
    stats: { books: [{ book: "sporty", today: 40, lastHour: 9, last: "2026-10-19T12:50:00Z" }] } });
  assert.deepStrictEqual(quiet, [], "a healthy afternoon raises nothing");
  const bad = A.alarms({ now, hour: 14, payload: { generatedAt: "2026-10-19T02:00:00Z", degradedSources: 3 }, ladder: [], ladderPaused: false,
    stats: { books: [{ book: "sporty", today: 40, lastHour: 9, last: "2026-10-19T12:50:00Z" }, { book: "bet9ja", today: 12, lastHour: 0, last: "2026-10-19T10:30:00Z" }] } });
  assert.deepStrictEqual(bad.map((a) => a.id), ["board", "results", "ladder", "book-bet9ja"]);
  assert.strictEqual(A.alarms({ now, hour: 14, ladder: [], ladderPaused: true }).length, 0, "a paused ladder is not an alarm");
  const fs = require("fs"), path = require("path");
  const social = fs.readFileSync(path.join(__dirname, "..", "api", "social.js"), "utf8");
  assert.match(social, /"alarm\|" \+ a\.id \+ "\|" \+ day/, "once a day per alarm");
  assert.match(social, /!paused\("wins"\)/); assert.doesNotMatch(social, /kind: "bigodds"/, "Big odds of the day stopped (22 Oct 2026)");
});

test("the code inspector reads any code with our number and the result", async () => {
  const w = await world();
  const account = require("../api/account.js");
  const slips = { hits: async () => ({ ok: true, rows: [] }),
    read: async (book, code) => (code === "GOOD1" ? [{ home: "Alpha", away: "Beta", prediction: "1", odds: 1.8, kickoff: "2026-10-12T15:00:00Z" }] : null),
    results: async () => [{ match_date: "2026-10-12", home: "Alpha", away: "Beta", hg: 2, ag: 0 }],
    board: async () => ({ fixtures: [{ home: "Alpha", away: "Beta", kickoff: "2026-10-12T15:00:00Z", home_p: 0.6, draw_p: 0.25, away_p: 0.15 }] }) };
  const h = account.make({ db: w.db, now: () => Date.UTC(2026, 9, 13, 10), env: { SW_ADMIN_EMAILS: "boss@x.com" }, slips });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  assert.strictEqual((await call(get(w.plain, "inspect", { book: "sporty", code: "GOOD1" }))).code, 403);
  assert.strictEqual((await call(get(w.boss, "inspect", { book: "nope", code: "GOOD1" }))).code, 400);
  assert.strictEqual((await call(get(w.boss, "inspect", { book: "sporty", code: "BAD99" }))).code, 404);
  const r = (await call(get(w.boss, "inspect", { book: "sporty", code: "GOOD1" }))).json();
  assert.strictEqual(r.legs.length, 1); assert.strictEqual(r.legs[0].verdict, "won"); assert.strictEqual(r.legs[0].score, "2-0");
  assert.ok(r.legs[0].our > 50 && r.legs[0].our < 70, "our blended number: " + r.legs[0].our);
});

test("Check and Inspect settle a game our results never got on the bookie's own score (23 Oct 2026, K4MXX4)", () => {
  const DET2 = require("../lib/slipdetail.js");
  const legs = [{ home: "Vitoria SC Guimaraes", away: "Maritimo Madeira", prediction: "MIX_X_OV_2.5", odds: 1.37, kickoff: "", eventId: "sr:match:72530980", srId: "72530980" }];
  assert.strictEqual(DET2.detail(legs, [])[0].verdict, null, "our results alone: no final score");
  const scores = { 72530980: { home: "Vitoria SC Guimaraes", away: "Maritimo Madeira", hg: 5, ag: 0, hth: 1, hta: 0, start: Date.UTC(2026, 9, 23, 19, 45) } };
  const d = DET2.detail(legs, DET2.bookRows(legs, scores));
  assert.strictEqual(d[0].verdict, "won");
  assert.strictEqual(d[0].score, "5-0");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "api", "account.js"), "utf8");
  assert.strictEqual((src.match(/DET\.bookRows\(legs, got\)/g) || []).length, 2, "slipdetail and inspect both use it");
});
