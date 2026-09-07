"use strict";
/**
 * THE WIRING, WHICH IS WHERE THIS KIND OF FEATURE ACTUALLY BREAKS.
 *
 * lib/quota.js decides, lib/supabase.js counts, lib/bookproxy.js enforces -
 * and none of that matters if api/book.js forgets to connect them. This repo
 * has shipped three bugs past green tests that proved the logic and never the
 * caller, so this file builds the real gate and drives it.
 *
 * The subject is the device where there is one, and a hashed address where
 * there is not. Both are counted, with very different ceilings: ten a day for
 * a device, and a much looser one for an address, because MTN and Airtel NAT
 * enormous numbers of subscribers behind single IPs and a tight per-address
 * cap would lock out a cell tower at a time.
 */
const test = require("node:test");
const assert = require("node:assert");
const G = require("../lib/bookgate.js");

const req = (extra) => Object.assign({
  headers: { "x-sw-device": "device-abc123", "x-forwarded-for": "105.112.4.9" },
}, extra || {});

/* A stand-in for lib/supabase.js: records what it was asked and answers with
   whatever the test wants the database to have said. */
function store(counts, opts) {
  const o = opts || {};
  const asked = [], wrote = [];
  return {
    asked, wrote,
    async countBookings(subject, day, cap) {
      asked.push({ subject, day, cap });
      if (o.throws) throw new Error("supabase down");
      if (o.fails) return { ok: false, why: "http 500", n: null };
      return { ok: true, n: counts[subject] == null ? 0 : counts[subject] };
    },
    async recordBooking(subject, day) {
      wrote.push({ subject, day });
      return { ok: true };
    },
  };
}

const DAY = "2026-09-08";
const at = Date.parse("2026-09-08T09:00:00Z");

/* ------------------------------------------------------- what it counts */

test("a device under the cap is allowed and told what is left after this one", async () => {
  /* Six used, ten allowed, and the booking about to happen is the seventh -
     so three remain, not four. The number a reader sees has to account for
     the code they are being given right now. */
  const db = store({ "device-abc123": 6 });
  const gate = G.makeGate({ db, deviceLimit: 10, now: () => at });
  const v = await gate(req());
  assert.equal(v.allow, true);
  assert.equal(v.counted, true);
  assert.equal(v.remaining, 3);
});

test("the tenth is allowed and the eleventh is refused", async () => {
  const gate = (used) => G.makeGate({ db: store({ "device-abc123": used }), deviceLimit: 10, now: () => at });
  assert.equal((await gate(9)(req())).allow, true, "the tenth code of the day");
  assert.equal((await gate(10)(req())).allow, false, "the eleventh");
  assert.equal((await gate(10)(req())).remaining, 0);
});

test("the device is counted against today in Lagos", async () => {
  const db = store({});
  /* 23:30 UTC is already tomorrow for the reader. */
  const gate = G.makeGate({ db, deviceLimit: 10, now: () => Date.parse("2026-09-07T23:30:00Z") });
  await gate(req());
  assert.equal(db.asked[0].day, "2026-09-08");
  assert.equal(db.asked[0].subject, "device-abc123");
});

/* ------------------------------------------------------ the address tier */

test("a request with no device id falls back to the hashed address", async () => {
  const db = store({});
  const gate = G.makeGate({ db, deviceLimit: 10, ipLimit: 200, pepper: "p", now: () => at });
  const v = await gate(req({ headers: { "x-forwarded-for": "105.112.4.9" } }));
  assert.equal(v.allow, true);
  assert.equal(db.asked.length, 1);
  assert.match(db.asked[0].subject, /^ip-[0-9a-f]{16}$/,
    "counted as an address bucket, and the address itself is never the key");
  assert.equal(db.asked[0].cap, 200, "against the loose ceiling, not the device cap");
});

test("the address ceiling is far above the device cap", async () => {
  /* The NAT rule. One address is a whole cell tower here, so its ceiling
     exists to stop a script, not a person. */
  const db = store({});
  const gate = G.makeGate({ db, deviceLimit: 10, ipLimit: 200, pepper: "p", now: () => at });
  await gate(req({ headers: { "x-forwarded-for": "105.112.4.9" } }));
  assert.ok(db.asked[0].cap > 10 * 10, "got " + db.asked[0].cap);
});

test("a device id spares the shared address from being counted at all", async () => {
  /* Otherwise every reader on one carrier NAT would burn the same ceiling. */
  const db = store({ "device-abc123": 1 });
  const gate = G.makeGate({ db, deviceLimit: 10, ipLimit: 200, pepper: "p", now: () => at });
  await gate(req());
  assert.equal(db.asked.length, 1, "one lookup");
  assert.equal(db.asked[0].subject, "device-abc123", "and it is the device");
});

/* --------------------------------------------------------- failing open */

test("a database error allows the booking and says it did not count", async () => {
  const gate = G.makeGate({ db: store({}, { fails: true }), deviceLimit: 10, now: () => at });
  const v = await gate(req());
  assert.equal(v.allow, true);
  assert.equal(v.counted, false);
});

test("a database that throws allows the booking", async () => {
  const gate = G.makeGate({ db: store({}, { throws: true }), deviceLimit: 10, now: () => at });
  const v = await gate(req());
  assert.equal(v.allow, true, "our outage must not become the reader's");
});

test("no subject at all - no device, no address - is allowed", async () => {
  /* Nothing to key on. Refusing here would block anything our own health
     checks or a stripped proxy sent through. */
  const db = store({});
  const gate = G.makeGate({ db, deviceLimit: 10, ipLimit: 200, now: () => at });
  const v = await gate({ headers: {} });
  assert.equal(v.allow, true);
  assert.equal(v.counted, false);
  assert.equal(db.asked.length, 0, "and nothing is queried");
});

test("a limit of zero means the quota is switched off, not that nobody may book", async () => {
  /* An unset environment variable must never lock the site out of booking. */
  const gate = G.makeGate({ db: store({ "device-abc123": 999 }), deviceLimit: 0, now: () => at });
  const v = await gate(req());
  assert.equal(v.allow, true);
});

/* ------------------------------------------------------------ recording */

test("recording files the same subject the gate counted", async () => {
  const db = store({ "device-abc123": 2 });
  const opts = { db, deviceLimit: 10, ipLimit: 200, pepper: "p", now: () => at };
  await G.makeGate(opts)(req());
  await G.makeRecorder(opts)(req());
  assert.deepEqual(db.wrote, [{ subject: "device-abc123", day: DAY }]);
});

test("recording an address-only request files the address bucket", async () => {
  const db = store({});
  const opts = { db, deviceLimit: 10, ipLimit: 200, pepper: "p", now: () => at };
  await G.makeRecorder(opts)(req({ headers: { "x-forwarded-for": "105.112.4.9" } }));
  assert.match(db.wrote[0].subject, /^ip-[0-9a-f]{16}$/);
});

test("a request with nothing to key on writes no row", async () => {
  const db = store({});
  await G.makeRecorder({ db, deviceLimit: 10, now: () => at })({ headers: {} });
  assert.equal(db.wrote.length, 0);
});

test("with the quota switched off, nothing is written either", async () => {
  /* DORMANT HAS TO MEAN DORMANT. The gate already opens when no limit is set,
     but the recorder was still filing a row on every successful booking - and
     before sql/book_quota.sql is applied that is a PostgREST error per
     booking: swallowed, invisible to the reader, and pure noise against the
     database. A feature that is off must touch nothing. */
  const db = store({});
  await G.makeRecorder({ db, deviceLimit: 0, ipLimit: 0, now: () => at })(req());
  assert.equal(db.wrote.length, 0, "no limit configured means no bookkeeping");
});

test("a device with a limit is still recorded", async () => {
  const db = store({});
  await G.makeRecorder({ db, deviceLimit: 10, now: () => at })(req());
  assert.equal(db.wrote.length, 1);
});

test("the reason a count failed is available for diagnosis, off by default", async () => {
  /* A limiter that fails open is invisible without this: the header says
     "open" and the logs deliberately say nothing. Off unless asked for,
     because a PostgREST error names our tables and columns. */
  const db = store({}, { fails: true });
  const quiet = await G.makeGate({ db, deviceLimit: 10, now: () => at })(req());
  assert.equal(quiet.why, undefined, "nothing leaks by default");

  const loud = await G.makeGate({ db, deviceLimit: 10, now: () => at, debug: true })(req());
  assert.match(String(loud.why), /http 500/, "the database's own words, when asked");
});

test("a healthy count carries no reason at all", async () => {
  const v = await G.makeGate({ db: store({ "device-abc123": 1 }), deviceLimit: 10, now: () => at, debug: true })(req());
  assert.equal(v.why, undefined);
});

/* ------------------------------------------------------------- exemption */

/* Our own devices. Demos, screenshots and a phone being tested against the
   real site should not eat the allowance we are trying to measure - the first
   usage report was already polluted by them.
 *
 * The list is a shared secret: anyone holding an exempt id books without limit,
 * which is why the ids are long random tokens rather than "tobi-phone", and
 * why rotating them is a matter of changing one environment variable. */

test("an exempt device is never counted", async () => {
  const db = store({ "device-abc123": 99 });
  const gate = G.makeGate({ db, deviceLimit: 10, exempt: ["device-abc123"], now: () => at });
  const v = await gate(req());
  assert.equal(v.allow, true, "ninety-nine bookings and still allowed");
  assert.equal(db.asked.length, 0, "and the database is never even asked");
});

test("an exempt device writes no rows", async () => {
  /* Otherwise our own testing shows up in the usage report as real demand. */
  const db = store({});
  await G.makeRecorder({ db, deviceLimit: 10, exempt: ["device-abc123"], now: () => at })(req());
  assert.equal(db.wrote.length, 0);
});

test("exemption is an exact match, not a prefix", async () => {
  const db = store({ "device-abc123": 99 });
  const gate = G.makeGate({ db, deviceLimit: 10, exempt: ["device-abc"], now: () => at });
  const v = await gate(req());
  assert.equal(v.allow, false, "a near-miss id must be capped like anyone else");
});

test("an empty list exempts nobody", async () => {
  /* The variable being unset must not read as "everyone is exempt". */
  for (const list of [[], null, undefined, [""], ["  "]]) {
    const db = store({ "device-abc123": 99 });
    const v = await G.makeGate({ db, deviceLimit: 10, exempt: list, now: () => at })(req());
    assert.equal(v.allow, false, "exempt=" + JSON.stringify(list) + " must not open the gate");
  }
});

test("spacing in the list is forgiven", async () => {
  /* It is typed into a Vercel form by a human. */
  const db = store({ "device-abc123": 99 });
  const v = await G.makeGate({ db, deviceLimit: 10, exempt: [" device-abc123 "], now: () => at })(req());
  assert.equal(v.allow, true);
});

test("an address bucket can never be exempted, whatever the list says", async () => {
  /* The exemption is for one device we own, not for every reader sharing a
     carrier NAT - exempting a bucket would hand a whole cell tower unlimited
     booking. Earlier this test listed a DEVICE id and sent a request with no
     device header, so the entry could never have matched and removing the
     tier guard changed nothing: it passed while proving nothing. Caught by
     mutation. It now learns the real bucket key and tries to exempt that. */
  const noDevice = { headers: { "x-forwarded-for": "105.112.4.9" } };
  const first = store({});
  await G.makeGate({ db: first, deviceLimit: 10, ipLimit: 200, pepper: "p", now: () => at })(noDevice);
  const bucket = first.asked[0].subject;
  assert.match(bucket, /^ip-/, "the subject a shared address lands on");

  const db = store({ [bucket]: 999 });
  const v = await G.makeGate({ db, deviceLimit: 10, ipLimit: 200, exempt: [bucket],
                              pepper: "p", now: () => at })(noDevice);
  assert.equal(v.allow, false,
    "an address over its ceiling stays capped even when its bucket is listed");
});
