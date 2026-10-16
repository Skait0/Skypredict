"use strict";
/* THE PAYGATE (owner, 16 Oct 2026): 2 codes a day on a signed-in account, 20 on
   any Plus pass, prepaid Day N200 / Week N800 / Month N2,000 through Paystack,
   Founding Wizards N1,500 on their first 3 month passes, first 500 buyers.
   These drive the real gate, the real roles and the real /api/pay against
   fakes of the database and of Paystack. */
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb, fakeRes, postReq, getReq } = require("./helpers/fakes.js");
const S = require("../lib/auth/session.js");
const G = require("../lib/bookgate.js");
const R = require("../lib/roles.js");

process.env.AUTH_ENABLED = "1";
process.env.AUTH_PEPPER = process.env.AUTH_PEPPER || "p".repeat(64);
const PAY = require("../api/pay.js");

/* ------------------------------------------------------------- the gate */

function store(counts) {
  const asked = [];
  return { asked,
    async countBookings(subject) { asked.push(subject); return { ok: true, n: counts[subject] || 0 }; },
    async recordBooking() { return { ok: true }; } };
}
const at = Date.parse("2026-10-16T09:00:00Z");
const withCookie = { headers: { cookie: "sess=t", "x-sw-device": "device-abc121", "x-forwarded-for": "105.112.4.9" } };
const gateFor = (db, role) => G.makeGate({ db, deviceLimit: 2, ipLimit: 200, userLimit: 100,
  freeLimit: R.FREE_CODES, plusLimit: R.PLUS_CODES, pepper: "p", sessionCookie: "sess",
  roleOf: async () => ({ role, userId: "u1" }), now: () => at });

test("a free account gets 2 a day, counted on the account, and the refusal names the plan", async () => {
  const ok = await gateFor(store({ "u:u1": 1 }), "free")(withCookie);
  assert.deepEqual([ok.allow, ok.limit, ok.remaining, ok.plan], [true, 2, 0, "free"]);
  const db = store({ "u:u1": 2 });
  const no = await gateFor(db, "free")(withCookie);
  assert.deepEqual([no.allow, no.plan], [false, "free"]);
  assert.deepEqual(db.asked, ["u:u1"], "the account, not the device");
});

test("a Plus account gets 20 a day", async () => {
  const v = await gateFor(store({ "u:u1": 19 }), "plus")(withCookie);
  assert.deepEqual([v.allow, v.limit, v.plan], [true, 20, "plus"]);
  assert.equal((await gateFor(store({ "u:u1": 20 }), "plus")(withCookie)).allow, false);
});

test("the 429 tells a free account about Plus and a pass holder about midnight", async () => {
  const proxy = require("../lib/bookproxy.js");
  const run = async (plan, limit) => {
    const h = proxy.makeHandler({ gate: async () => ({ allow: false, counted: true, remaining: 0, limit, plan }) });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await h({ method: "POST", query: { book: "sporty" }, body: { selections: [{ eventId: "1", code: "OV_1.5" }] }, headers: {} }, res);
    return res;
  };
  const f = await run("free", 2);
  assert.equal(f.code, 429);
  assert.deepEqual([f.body.error, f.body.plan, f.body.limit], ["capped", "free", 2]);
  assert.match(f.body.message, /Plus gives you 20 a day, from ₦200/);
  assert.match((await run("plus", 20)).body.message, /today's 20 booking codes[\s\S]*after midnight/);
});

test("roleOf: an active pass is plus, an ended one is free, a grant still wins", async () => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "p@b.com" };
  const db = (sub, grant) => ({ grantFor: async () => grant || null, subscription: async () => sub });
  const future = new Date(Date.now() + 864e5).toISOString(), past = new Date(Date.now() - 1000).toISOString();
  assert.equal(await R.roleOf(db({ status: "active", current_period_end: future }), user, {}), "plus");
  assert.equal(await R.roleOf(db({ status: "active", current_period_end: past }), user, {}), "free");
  assert.equal(await R.roleOf(db(null), user, {}), "free");
  assert.equal(await R.roleOf(db({ status: "active", current_period_end: future }, { email: "p@b.com" }), user, {}), "ff");
});

/* ---------------------------------------------------------- /api/pay */

/* The database half of sql/payments.sql, in memory: apply_payment marks a
   pending row paid once, for its own amount, and stacks days on the pass. */
function world(opts) {
  const o = opts || {};
  let T = Date.UTC(2026, 9, 16, 10);
  const clock = () => T;
  const db = fakeDb(clock);
  const pays = {}, subs = {};
  db.REF_RE = /^sw_[0-9a-f]{20}$/;
  db.grantFor = async () => null;
  db.insertPayment = async (r) => { pays[r.reference] = Object.assign({ status: "pending" }, r); return pays[r.reference]; };
  db.paymentByRef = async (ref) => pays[ref] ? Object.assign({}, pays[ref]) : null;
  db.subscription = async (uid) => subs[uid] || null;
  db.applyPayment = async (ref, amount) => {
    const p = pays[ref];
    if (!p || p.status !== "pending" || p.amount_kobo !== amount) return null;
    p.status = "paid";
    const cur = subs[p.user_id] ? Date.parse(subs[p.user_id].current_period_end) : 0;
    const end = new Date(Math.max(T, cur) + p.days * 864e5).toISOString();
    subs[p.user_id] = { plan: p.pass, status: "active", current_period_end: end };
    return end;
  };
  db.founderOffer = async (uid) => {
    const paid = Object.values(pays).filter((p) => p.founder && p.status === "paid");
    return { taken: (o.taken || 0) + new Set(paid.map((p) => p.user_id)).size, mine: paid.filter((p) => p.user_id === uid).length };
  };
  const ps = { inits: [], status: {}, amount: {},
    async init(b) { this.inits.push(b); return o.initFails ? null : { authorization_url: "https://checkout.paystack.com/x" + b.reference.slice(-4) }; },
    async verify(ref) { return { status: this.status[ref] || "abandoned", currency: "NGN", amount: this.amount[ref] != null ? this.amount[ref] : (pays[ref] && pays[ref].amount_kobo) }; } };
  const h = PAY.make({ db, now: clock, paystack: ps, env: { PAYSTACK_SECRET_KEY: "sk_test_x" } });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const w = { db, ps, pays, subs, call, advance(ms) { T += ms; } };
  w.user = async (email) => {
    const u = await db.createUser({ email });
    const s = await S.startSession(db, u.id, "Chrome/129 Android", clock());
    return { id: u.id, cookie: S.COOKIE + "=" + s.token };
  };
  w.start = async (u, pass) => (await call(Object.assign(postReq("pay", { pass }, { cookie: u.cookie }), { query: { action: "start" } }))).json();
  w.verify = async (u, ref) => (await call(Object.assign(getReq("pay", {}, { cookie: u.cookie }), { query: { action: "verify", ref } }))).json();
  w.hook = async (ref) => call({ method: "POST", query: { action: "webhook" }, headers: {}, body: { event: "charge.success", data: { reference: ref } } });
  return w;
}

test("prices: day 200, week 800, month 2,000; the founder month 1,500", () => {
  assert.deepEqual([PAY.priceOf("day"), PAY.priceOf("week"), PAY.priceOf("month")], [20000, 80000, 200000]);
  assert.equal(PAY.priceOf("month", { taken: 0, mine: 0 }), 150000);
  assert.equal(PAY.priceOf("week", { taken: 0, mine: 0 }), 80000, "founder price is the month pass only");
  assert.equal(PAY.priceOf("month", { taken: 500, mine: 0 }), 200000, "seats gone");
  assert.equal(PAY.priceOf("month", { taken: 500, mine: 2 }), 150000, "a founder keeps it past the 500th buyer");
  assert.equal(PAY.priceOf("month", { taken: 10, mine: 3 }), 200000, "after 3 founder months, the normal price");
});

test("start: signed in only, a pending row for our price, Paystack's url back", async () => {
  const w = world();
  const anon = await w.call(Object.assign(postReq("pay", { pass: "week" }), { query: { action: "start" } }));
  assert.equal(anon.code, 401);
  const u = await w.user("a@b.com");
  assert.equal((await w.call(Object.assign(postReq("pay", { pass: "year" }, { cookie: u.cookie }), { query: { action: "start" } }))).code, 400);
  const j = await w.start(u, "month");
  assert.match(j.url, /^https:\/\/checkout\.paystack\.com\//);
  const row = w.pays[j.reference];
  assert.deepEqual([row.user_id, row.pass, row.days, row.amount_kobo, row.founder, row.status], [u.id, "month", 30, 150000, true, "pending"]);
  assert.deepEqual([w.ps.inits[0].amount, w.ps.inits[0].email, w.ps.inits[0].currency], [150000, "a@b.com", "NGN"]);
  assert.match(w.ps.inits[0].callback_url, /\/\?paid=sw_[0-9a-f]{20}$/);
});

test("a cross-site POST to start is refused before anything is written", async () => {
  const w = world();
  const u = await w.user("a@b.com");
  const r = await w.call(Object.assign(postReq("pay", { pass: "day" }, { cookie: u.cookie, origin: "https://evil.example" }), { query: { action: "start" } }));
  assert.equal(r.code, 403);
  assert.equal(Object.keys(w.pays).length, 0);
});

test("paid once: the webhook and the return page both settle, the pass is credited once", async () => {
  const w = world();
  const u = await w.user("a@b.com");
  const { reference } = await w.start(u, "week");
  assert.deepEqual(await w.verify(u, reference), { paid: false, until: null }, "not paid yet");
  w.ps.status[reference] = "success";
  assert.equal((await w.hook(reference)).code, 200);
  const first = w.subs[u.id].current_period_end;
  await w.hook(reference);                       /* Paystack retries */
  const v = await w.verify(u, reference);        /* and the page asks too */
  assert.deepEqual([v.paid, v.until], [true, first]);
  assert.equal(Date.parse(first) - Date.UTC(2026, 9, 16, 10), 7 * 864e5);
  assert.equal(await R.roleOf(w.db, { id: u.id, email: "a@b.com" }, {}), "plus");
});

test("passes stack on the days left; nothing is credited for the wrong amount or a stranger's ref", async () => {
  const w = world();
  const u = await w.user("a@b.com"), x = await w.user("x@b.com");
  const a = await w.start(u, "day");
  w.ps.status[a.reference] = "success"; await w.hook(a.reference);
  const b = await w.start(u, "week");
  w.ps.status[b.reference] = "success"; await w.verify(u, b.reference);
  assert.equal(Date.parse(w.subs[u.id].current_period_end) - Date.UTC(2026, 9, 16, 10), 8 * 864e5);
  const c = await w.start(u, "month");
  w.ps.status[c.reference] = "success"; w.ps.amount[c.reference] = 100;   /* paid N1 for a month */
  await w.hook(c.reference);
  assert.equal(w.pays[c.reference].status, "pending");
  assert.equal((await w.call(Object.assign(getReq("pay", {}, { cookie: x.cookie }), { query: { action: "verify", ref: a.reference } }))).code, 404);
});

test("the webhook ignores what is not a charge on one of our references", async () => {
  const w = world();
  for (const body of [{ event: "transfer.success", data: { reference: "sw_" + "a".repeat(20) } },
    { event: "charge.success", data: { reference: "../../etc" } }, {}])
    assert.equal((await w.call({ method: "POST", query: { action: "webhook" }, headers: {}, body })).code, 200);
  assert.equal(Object.keys(w.subs).length, 0);
});

test("founders: after 3 founder months the price goes back to 2,000", async () => {
  const w = world();
  const u = await w.user("f@b.com");
  for (let i = 0; i < 3; i++) {
    const j = await w.start(u, "month");
    assert.equal(w.pays[j.reference].amount_kobo, 150000);
    w.ps.status[j.reference] = "success"; await w.hook(j.reference);
  }
  const j = await w.start(u, "month");
  assert.deepEqual([w.pays[j.reference].amount_kobo, w.pays[j.reference].founder], [200000, false]);
});

test("offer: prices for the page, and seats left", async () => {
  const w = world({ taken: 120 });
  const r = (await w.call(Object.assign(getReq("pay", {}), { query: { action: "offer" } }))).json();
  assert.deepEqual(r.passes.map((p) => [p.pass, p.naira, p.full]), [["day", 200, 200], ["week", 800, 800], ["month", 1500, 2000]]);
  assert.deepEqual(r.founder, { open: true, seatsLeft: 380, monthsLeft: 3 });
});

test("no secret key, no paygate: every action is a 404", async () => {
  const h = PAY.make({ db: fakeDb(() => 0), env: {} });
  const r = fakeRes(); await h(Object.assign(getReq("pay", {}), { query: { action: "offer" } }), r);
  assert.equal(r.code, 404);
});

test("Paystack down at start: a 502, and the page can try again", async () => {
  const w = world({ initFails: true });
  const u = await w.user("a@b.com");
  const r = await w.call(Object.assign(postReq("pay", { pass: "day" }, { cookie: u.cookie }), { query: { action: "start" } }));
  assert.equal(r.code, 502);
});

test("the bot gives 2 codes a day and points past them to Plus, never 'unlimited'", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "api", "tg.js"), "utf8");
  assert.match(src, /const CONVERT_CAP = 2;/);
  assert.match(src, /20 codes a day, from ₦200/);
  assert.doesNotMatch(src, /no daily limit|"Unlimited/);
});
