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
    { booksOff: ["sporty", "bet9ja"], notice: "Slow tonight" });
  assert.deepStrictEqual(F.clean(null), { booksOff: [], notice: "" });
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
  const slips = { hits: async () => ({ ok: true, rows: [] }),
    settle: async (id, to) => { if (ledger[id] !== "check") return { ok: true, changed: false }; ledger[id] = to; return { ok: true, changed: true }; } };
  const h = account.make({ db, now: clock, env: { SW_ADMIN_EMAILS: "boss@x.com" }, flags, admin, slips });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const user = async (email) => {
    const u = await db.createUser({ email });
    return { id: u.id, cookie: S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token };
  };
  const boss = await user("boss@x.com"), mum = await user("mum@home.com"), plain = await user("a@b.com");
  return { db, call, boss, mum, plain, stored: () => stored, ledger };
}
const get = (who, action, query) => Object.assign(getReq("account", {}, { cookie: who.cookie }), { query: Object.assign({ action }, query || {}) });
const post = (who, action, body) => Object.assign(postReq("account", body, { cookie: who.cookie }), { query: { action } });

test("every god-mode action is admin only", async () => {
  const w = await world();
  for (const a of ["flags", "stats", "lookup"]) assert.strictEqual((await w.call(get(w.plain, a, { email: "a@b.com" }))).code, 403, a);
  for (const a of ["setflags", "signout"]) assert.strictEqual((await w.call(post(w.plain, a, { booksOff: ["sporty"], email: "boss@x.com" }))).code, 403, a);
  assert.deepStrictEqual(w.stored().booksOff, [], "a refused setflags wrote nothing");
});

test("admin pauses a bookie and sets a notice", async () => {
  const w = await world();
  const r = await w.call(post(w.boss, "setflags", { booksOff: ["bet9ja", "x"], notice: "Bet9ja is down" }));
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.json(), { booksOff: ["bet9ja"], notice: "Bet9ja is down" });
  assert.deepStrictEqual((await w.call(get(w.boss, "flags"))).json(), { booksOff: ["bet9ja"], notice: "Bet9ja is down" });
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
