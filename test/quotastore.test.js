"use strict";
/**
 * WHERE THE COUNT LIVES.
 *
 * One row per booking in `book_quota`, counted per subject per Lagos day.
 * A row per booking rather than a counter column on purpose: an insert is
 * atomic over PostgREST without a stored procedure, whereas "read, add one,
 * write" over HTTP is a race with no lock around it. Counting rows costs one
 * indexed query against a table that never holds more than a day's traffic.
 *
 * The count is capped in the query. Nothing here needs to know that a device
 * booked four hundred times - it needs to know whether it passed ten - and an
 * unbounded select on the busiest route is how a rate limiter becomes the
 * outage it was meant to prevent.
 *
 * Every failure answers `ok: false` with a null count, never zero. Zero means
 * "counted, and it was none"; null means "we could not tell", and only the
 * second one is allowed to open the gate. Conflating them would turn a
 * Supabase outage into an unlimited free-for-all that reported itself as
 * normal.
 */
process.env.SUPABASE_URL = "https://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key-for-tests";

const test = require("node:test");
const assert = require("node:assert");
const DB = require("../lib/supabase.js");

/* Records what our code asked the database for, and answers with what the
   test wants back. Restored after every call - a leaked global fetch would
   poison whatever ran next. */
async function withFetch(reply, fn) {
  const real = global.fetch;
  const seen = [];
  global.fetch = async (url, init) => {
    seen.push({ url: String(url), init: init || {} });
    return reply(String(url), init || {});
  };
  try { return { out: await fn(), seen }; }
  finally { global.fetch = real; }
}

const okJson = (body) => async () => ({
  ok: true, status: 200, text: async () => JSON.stringify(body),
});

/* ------------------------------------------------------------- counting */

test("counting asks for this subject on this day and nothing else", async () => {
  const { out, seen } = await withFetch(okJson([{ id: 1 }, { id: 2 }, { id: 3 }]),
    () => DB.countBookings("dev-abc", "2026-09-08", 10));
  assert.equal(out.ok, true);
  assert.equal(out.n, 3, "three rows means three bookings");
  assert.equal(seen.length, 1, "one query, not one per row");
  const url = seen[0].url;
  assert.match(url, /book_quota/);
  assert.match(url, /subject=eq\.dev-abc/);
  assert.match(url, /day=eq\.2026-09-08/);
});

test("the count is capped, so a runaway subject cannot pull a huge result", async () => {
  const { seen } = await withFetch(okJson([]),
    () => DB.countBookings("dev-abc", "2026-09-08", 10));
  assert.match(seen[0].url, /limit=1[01]\b/,
    "the query must carry a limit at or just past the cap; got " + seen[0].url);
});

test("no rows is a count of zero, which is a real answer", async () => {
  const { out } = await withFetch(okJson([]), () => DB.countBookings("dev-abc", "2026-09-08", 10));
  assert.equal(out.ok, true);
  assert.equal(out.n, 0);
});

test("a database error is not a count of zero", async () => {
  /* The distinction the whole design rests on. */
  const fail = async () => ({ ok: false, status: 500, text: async () => "boom" });
  const { out } = await withFetch(fail, () => DB.countBookings("dev-abc", "2026-09-08", 10));
  assert.equal(out.ok, false);
  assert.equal(out.n, null, "null means unknown; zero would mean a fresh allowance");
});

test("a network failure is not a count of zero either", async () => {
  const throws = async () => { throw new Error("ECONNRESET"); };
  const { out } = await withFetch(throws, () => DB.countBookings("dev-abc", "2026-09-08", 10));
  assert.equal(out.ok, false);
  assert.equal(out.n, null);
});

test("a subject that is not a plain token is refused before any query runs", async () => {
  /* It reaches a URL filter, so its shape is checked here rather than trusted
     from the caller. */
  for (const bad of ["", "  ", "a b", "a,b", "x".repeat(80), null]) {
    const { out, seen } = await withFetch(okJson([]),
      () => DB.countBookings(bad, "2026-09-08", 10));
    assert.equal(out.ok, false, JSON.stringify(bad));
    assert.equal(seen.length, 0, "nothing may be sent for " + JSON.stringify(bad));
  }
});

/* -------------------------------------------------------------- writing */

test("a booking is recorded as one row", async () => {
  const { out, seen } = await withFetch(okJson(null),
    () => DB.recordBooking("dev-abc", "2026-09-08"));
  assert.equal(out.ok, true);
  assert.equal(seen[0].init.method, "POST");
  const body = JSON.parse(seen[0].init.body);
  assert.ok(Array.isArray(body) && body.length === 1, "one row per booking");
  assert.equal(body[0].subject, "dev-abc");
  assert.equal(body[0].day, "2026-09-08");
});

test("a failed write is reported, not swallowed", async () => {
  const fail = async () => ({ ok: false, status: 500, text: async () => "boom" });
  const { out } = await withFetch(fail, () => DB.recordBooking("dev-abc", "2026-09-08"));
  assert.equal(out.ok, false);
  assert.ok(out.why, "the caller gets a reason it can log");
});

/* -------------------------------------------------------------- the key */

test("the count query is authenticated", async () => {
  /* SHIPPED BROKEN WITHOUT THIS. call() adds no headers of its own - every
     caller supplies them - and countBookings passed none, so the GET went out
     with no apikey and PostgREST answered:
       http 401 No API key found in request
     The gate failed open exactly as designed, which is why nothing looked
     wrong from the outside. The first version of this file asserted the URL
     and never the headers. */
  const { seen } = await withFetch(okJson([]),
    () => DB.countBookings("dev-abc", "2026-09-08", 10));
  const h = (seen[0].init && seen[0].init.headers) || {};
  assert.ok(h.apikey, "PostgREST needs an apikey header");
  assert.match(String(h.Authorization || ""), /^Bearer /, "and a bearer token");
});

test("the write is authenticated too", async () => {
  const { seen } = await withFetch(okJson(null),
    () => DB.recordBooking("dev-abc", "2026-09-08"));
  const h = (seen[0].init && seen[0].init.headers) || {};
  assert.ok(h.apikey);
  assert.match(String(h.Authorization || ""), /^Bearer /);
});
