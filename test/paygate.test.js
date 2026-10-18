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

test("the 429 tells a free account about the Wizard Pass and a pass holder about midnight", async () => {
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
  assert.match(f.body.message, /Wizard Pass gives you 20 codes a day, from ₦200/);
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
  const inbox = [];
  const msgs = { add: async (rows) => { inbox.push(...rows); return rows; } };
  const h = PAY.make({ db, now: clock, paystack: ps, msgs, env: { PAYSTACK_SECRET_KEY: "sk_test_x" } });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const w = { db, ps, pays, subs, call, inbox, advance(ms) { T += ms; } };
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
  assert.deepEqual(await w.verify(u, reference), { paid: false, until: null, pass: "week" }, "not paid yet");
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
  assert.match(src, /pricing\.js"\)\.pitch\(Date\.now\(\)\)/, "the offer line follows the date (lib/pricing.js)");
  assert.doesNotMatch(src, /no daily limit|"Unlimited/);
});

test("an exempt phone signed in is counted, even when the account lookup fails (owner, 16 Oct 2026)", async () => {
  const db = store({ "device-abc121": 10 });
  const base = { db, deviceLimit: 10, ipLimit: 200, userLimit: 100, freeLimit: 2, plusLimit: 20, pepper: "p",
    sessionCookie: "sess", exempt: ["device-abc121"], now: () => at, roleTimeoutMs: 20 };
  for (const roleOf of [async () => { throw new Error("db down"); }, () => new Promise(() => {})]) {
    const v = await G.makeGate(Object.assign({}, base, { roleOf }))(withCookie);
    assert.equal(v.allow, false, "the device's own count, not its exemption");
  }
  const signedOut = { headers: { "x-sw-device": "device-abc121", "x-forwarded-for": "105.112.4.9" } };
  assert.equal((await G.makeGate(Object.assign({}, base, { roleOf: async () => null }))(signedOut)).counted, false,
    "signed out, our own test phone is still exempt");
});

test("the booking route asks who you are once per booking, not three times", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "api", "book.js"), "utf8");
  assert.match(src, /req\._swRole \|\| \(req\._swRole =/);
});

test("the first founder pass brings the crest and a thank-you, once; nothing else does", async () => {
  /* Owner, 16 Oct 2026: the Founding Wizard honour, in their inbox. */
  const w = world();
  const u = await w.user("first@b.com");
  const week = await w.start(u, "week");
  w.ps.status[week.reference] = "success";
  await w.hook(week.reference);
  assert.equal(w.inbox.length, 0, "a normal pass sends no welcome");
  const m1 = await w.start(u, "month");
  w.ps.status[m1.reference] = "success";
  await w.hook(m1.reference);
  await w.hook(m1.reference);                     /* Paystack retries */
  await w.verify(u, m1.reference);                /* and the return page lands too */
  assert.equal(w.inbox.length, 1, "one welcome, however many times the payment is reported");
  assert.equal(w.inbox[0].user_id, u.id);
  assert.match(w.inbox[0].body, /src="\/fw\/crest\.webp"/);
  assert.match(w.inbox[0].body, /Welcome, Founding Wizard/);
  const m2 = await w.start(u, "month");
  w.ps.status[m2.reference] = "success";
  await w.hook(m2.reference);
  assert.equal(w.inbox.length, 1, "their second founder month is not a second welcome");
});

/* ----------------------------------- new prices from 1 Nov 2026 (lib/pricing.js) */
/* Owner, 18 Oct 2026: today's prices and 20 a day for everybody until 1 Nov, then by
   itself Day N500, Week N1,500, Month N4,000, each unlimited codes with a stated fair-use
   limit of 100 a day; no N200 plan after the switch ("take off the 200"). Founding Wizards
   stay N1,500 for 3 months. */
const PR = require("../lib/pricing.js");
const SWITCH = PR.SWITCH_AT;

test("pricing: today's table until 1 Nov 00:00 Lagos, then the new one", () => {
  assert.equal(new Date(SWITCH).toISOString(), "2026-10-31T23:00:00.000Z");
  assert.deepEqual(Object.keys(PR.passesAt(SWITCH - 1)), ["day", "week", "month"]);
  assert.deepEqual(["day", "week", "month"].map((k) => PR.codesFor(k, SWITCH - 1)), [20, 20, 20]);
  assert.deepEqual(["day", "week", "month"].map((k) => PR.codesFor(k, SWITCH)), [100, 100, 100], "unlimited, fair use 100");
  assert.ok(["day", "week", "month"].every((k) => PR.passesAt(SWITCH)[k].unlimited));
  assert.deepEqual(Object.keys(PR.passesAt(SWITCH)), ["day", "week", "month"], "no N200 plan after the switch");
  assert.deepEqual(["day", "week", "month"].map((k) => PR.passesAt(SWITCH)[k].kobo), [50000, 150000, 400000]);
  assert.equal(PR.codesFor("gift-of-old", SWITCH), 100, "an unknown plan gets the Day allowance");
});

test("the gate gives a pass its codes a day by the date: 20 now, the fair-use 100 from 1 Nov", async () => {
  const gate = (plan, t) => G.makeGate({ db: store({ "u:u1": 0 }), userLimit: 100, freeLimit: R.FREE_CODES, trial: true,
    plusLimit: (p, tt) => R.codeLimitFor("plus", p, tt), pepper: "p", sessionCookie: "sess",
    roleOf: async () => ({ role: "plus", plan, userId: "u1" }), now: () => t });
  assert.equal((await gate("month", SWITCH - 1)(withCookie)).limit, 20, "nobody moves up before 1 Nov");
  assert.deepEqual(await Promise.all(["day", "week", "month"].map(async (p) => (await gate(p, SWITCH)(withCookie)).limit)), [100, 100, 100]);
});

test("the offer: before 1 Nov today's prices with the new ones to strike through, then the new ones", async () => {
  const w = world();
  const before = (await w.call(Object.assign(getReq("pay", {}), { query: { action: "offer" } }))).json();
  assert.deepEqual(before.passes.map((p) => [p.pass, p.naira, p.next, p.codes]),
    [["day", 200, 500, 20], ["week", 800, 1500, 20], ["month", 1500, 4000, 20]], "the founder month still shows N1,500");
  assert.ok(before.switchAt);
  const u = await w.user("a@b.com");
  assert.equal((await w.call(Object.assign(postReq("pay", { pass: "starter" }, { cookie: u.cookie }), { query: { action: "start" } }))).code, 400,
    "there is no Starter to buy");
  w.advance(SWITCH - Date.UTC(2026, 9, 16, 10));
  const after = (await w.call(Object.assign(getReq("pay", {}), { query: { action: "offer" } }))).json();
  assert.deepEqual(after.passes.map((p) => [p.pass, p.naira, p.next, p.codes]),
    [["day", 500, null, 100], ["week", 1500, null, 100], ["month", 1500, null, 100]]);
  assert.ok(after.passes.every((p) => p.unlimited));
  assert.equal(after.switchAt, null);
});

test("from 1 Nov a N1,500 Week pass is no founder, and there is no N200 plan to buy", async () => {
  const w = world();
  w.advance(SWITCH - Date.UTC(2026, 9, 16, 10));
  const u = await w.user("a@b.com");
  assert.equal((await w.call(Object.assign(postReq("pay", { pass: "starter" }, { cookie: u.cookie }), { query: { action: "start" } }))).code, 400);
  const x = await w.user("x@b.com");
  const wk = await w.start(x, "week");
  assert.deepEqual([w.pays[wk.reference].amount_kobo, w.pays[wk.reference].founder], [150000, false]);
  w.ps.status[wk.reference] = "success"; await w.hook(wk.reference);
  assert.equal(w.inbox.length, 0, "the founder welcome follows the flag, not the amount");
});
