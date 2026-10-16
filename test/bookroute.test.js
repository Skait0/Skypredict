"use strict";
/**
 * /api/book END TO END, THROUGH THE REAL WIRING.
 *
 * Every other file in this feature is driven with something injected. This one
 * requires the route exactly as Vercel does and lets it build its own gate out
 * of lib/bookgate.js, lib/quota.js and lib/supabase.js, with only `fetch`
 * replaced - so a route that forgot to connect them fails here and nowhere
 * else.
 *
 * The environment is set before the require because lib/supabase.js reads it
 * at module load. Node's test runner gives each file its own process, so this
 * cannot leak into another suite.
 */
process.env.SUPABASE_URL = "https://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-for-tests";
process.env.SW_DEVICE_BOOK_LIMIT = "10";
process.env.SW_IP_BOOK_LIMIT = "200";
process.env.SW_QUOTA_PEPPER = "test-pepper";

const test = require("node:test");
const assert = require("node:assert");
const handler = require("../api/book.js");

/* THE TRIAL (16 Oct 2026) refuses a signed-out booking outright, so these
   carry a session cookie whose lookup finds nothing - the one case that still
   takes the device count, which is what most of this file is about. */
const post = (extra) => Object.assign({
  method: "POST",
  query: { book: "sporty" },
  headers: { "x-sw-device": "device-abc123", "x-forwarded-for": "105.112.4.9",
             cookie: "__Host-sw_session=x" },
  body: { selections: [{ eventId: "1", prediction: "1X" }] },
}, extra || {});

function res() {
  const o = { headers: {}, code: 0, body: null };
  const self = {
    setHeader(k, v) { o.headers[k] = v; },
    status(c) { o.code = c; return self; },
    json(b) { o.body = b; return o; },
    end(b) { o.body = b; return o; },
    _o: o,
  };
  return self;
}

/* One fetch stub for both upstreams, routed on the URL: Supabase answers the
   count and swallows the insert, Railway answers the booking. Everything it
   saw is returned so the test can assert what was and was not called. */
async function run(opts, fn) {
  const o = opts || {};
  const seen = { counts: 0, inserts: 0, deletes: 0, bookings: 0, slips: 0 };
  const real = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    /* The slip ledger (lib/slipwatch.js): every minted code is saved once. */
    if (u.includes("site_slips")) { seen.slips++; return { ok: true, status: 201, text: async () => "" }; }
    /* The admin's switches (lib/flags.js): nothing paused. */
    if (u.includes("site_flags")) { seen.flags = (seen.flags || 0) + 1; return { ok: true, status: 200, text: async () => "[]" }; }
    if (u.includes("book_quota")) {
      /* The gate holds a place first and reads its id back (?select=id), then
         counts up to that id, so the count includes its own row. */
      if ((init && init.method) === "POST") {
        seen.inserts++;
        const id = (o.used || 0) + 1;
        return { ok: true, status: 201, text: async () => (u.includes("select=id") ? JSON.stringify([{ id }]) : "") };
      }
      if ((init && init.method) === "DELETE") { seen.deletes++; return { ok: true, status: 204, text: async () => "" }; }
      seen.counts++;
      const n = (o.used == null ? 0 : o.used) + (u.includes("id=lte.") ? 1 : 0);
      const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
      return { ok: true, status: 200, text: async () => JSON.stringify(rows) };
    }
    seen.bookings++;
    const body = o.upstream || { success: true, code: "MS0LJY" };
    const status = o.upstreamStatus || 200;
    return {
      ok: status >= 200 && status < 300, status,
      text: async () => JSON.stringify(body),
      json: async () => body,
      headers: { get: () => "application/json" },
    };
  };
  try { return { out: await fn(), seen }; } finally { global.fetch = real; }
}

test("the route is a handler, wired and requirable exactly as Vercel loads it", () => {
  assert.equal(typeof handler, "function");
});

test("signed out, the trial refuses before the bookmaker or the count is asked", async () => {
  const r = res();
  const { seen } = await run({ used: 0 }, () => handler(post({
    headers: { "x-sw-device": "device-abc123", "x-forwarded-for": "105.112.4.9" } }), r));
  assert.equal(r._o.code, 429);
  assert.equal(r._o.body.plan, "guest");
  assert.match(r._o.body.message, /Sign in/);
  assert.equal(seen.bookings, 0);
  assert.equal(seen.inserts, 0);
});

test("a device that has booked ten times today is refused", async () => {
  const r = res();
  const { seen } = await run({ used: 10 }, () => handler(post(), r));
  assert.equal(r._o.code, 429, "the eleventh code of the day");
  assert.equal(seen.bookings, 0, "and the bookmaker is never called for it");
  assert.equal(seen.counts, 1, "one count query decided it");
});

test("a device under the cap books, and the booking is recorded", async () => {
  const r = res();
  const { seen } = await run({ used: 3 }, () => handler(post(), r));
  assert.equal(r._o.code, 200);
  assert.equal(r._o.body.code, "MS0LJY", "the code reaches the reader");
  assert.equal(seen.bookings, 1);
  assert.equal(seen.inserts, 1, "one row for one booking");
  assert.equal(seen.slips, 1, "and the slip itself is kept for grading");
});

test("what is left counts the code just issued", async () => {
  const r = res();
  await run({ used: 6 }, () => handler(post(), r));
  assert.equal(r._o.headers["X-Sw-Quota-Remaining"], "3",
    "six used, this is the seventh, three left after it");
});

test("a rejected slip is not recorded, so a retry costs nothing", async () => {
  const r = res();
  const { seen } = await run({
    used: 3, upstreamStatus: 400,
    upstream: { success: false, unbookable: [{ eventId: "1" }] },
  }, () => handler(post(), r));
  assert.equal(r._o.code, 400, "the rejection passes through with its list");
  assert.ok(r._o.body.unbookable);
  assert.equal(seen.inserts - seen.deletes, 0, "its held place is given back");
});

test("a Supabase outage does not stop anyone booking", async () => {
  /* The rule the whole feature is built on, asserted where it matters. */
  const r = res();
  const real = global.fetch;
  let bookings = 0;
  global.fetch = async (url) => {
    if (String(url).includes("/rest/v1/")) throw new Error("supabase down");   /* quota and slip ledger alike */
    bookings++;
    const body = { success: true, code: "MS0LJY" };
    return { ok: true, status: 200, text: async () => JSON.stringify(body),
             json: async () => body, headers: { get: () => "application/json" } };
  };
  try { await handler(post(), r); } finally { global.fetch = real; }
  assert.equal(r._o.code, 200, "our outage must not become the reader's");
  assert.equal(bookings, 1);
});
