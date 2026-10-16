"use strict";

/**
 * The free-period quota, assembled.
 *
 * lib/quota.js decides, lib/supabase.js counts, lib/bookproxy.js enforces.
 * This is the one file that knows about all three, and the only one api/book.js
 * has to require. Every dependency is injected so the whole thing can be driven
 * in a test without a database or a clock.
 *
 * WHO IS COUNTED, AND AGAINST WHAT.
 *
 *   a device id      ten a day        the intended subject
 *   a hashed address a loose ceiling  there to stop scripts, not people
 *   neither          not counted      nothing to key on, so it books
 *
 * The address tier is deliberately slack. MTN and Airtel NAT very large
 * numbers of subscribers behind single addresses, so a per-address cap tight
 * enough to matter to one reader would lock out a cell tower's worth of them
 * at once. A device id therefore SPARES the address bucket: a reader who
 * carries an id is counted only as themselves, and the shared bucket is left
 * for the requests that have nothing else to be keyed on.
 *
 * Everything fails open. A quota is a cost control; a reader who loses a
 * booking because Supabase was unreachable has been charged for our outage.
 */

const Q = require("./quota.js");

/* The address bucket is prefixed so a hashed address can never collide with a
   device id, and so a row is readable at a glance in the table. */
const IP_PREFIX = "ip-";

function subjectOf(req, pepper) {
  const device = Q.deviceIdOf(req);
  if (device) return { subject: device, tier: "device" };
  const ip = Q.clientKeyOf(req, pepper);
  if (ip) return { subject: IP_PREFIX + ip, tier: "ip" };
  return { subject: null, tier: "none" };
}

/* OUR OWN DEVICES, WHICH MUST NOT EAT THE ALLOWANCE WE ARE MEASURING.
 *
 * Demos, screenshots and a phone being tested against the live site showed up
 * in the very first usage report as real demand. An exempt device is not
 * counted and writes no rows, so it is invisible to both the cap and the
 * numbers.
 *
 * The list is a SHARED SECRET. Anyone holding an exempt id books without
 * limit, which is why they are long random tokens rather than "my-phone", and
 * why rotating one is a matter of changing SW_QUOTA_EXEMPT and redeploying.
 * Exact match only - a prefix would make every id starting with ours a skeleton
 * key. */
function isExempt(opts, subject, tier) {
  if (tier !== "device") return false;          /* never exempt a shared address */
  const list = (opts && opts.exempt) || [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (id && id === subject) return true;
  }
  return false;
}

function limitsOf(opts, tier) {
  const o = opts || {};
  if (tier === "user") return Number(o.userLimit);
  if (tier === "plus") return Number(o.plusLimit);
  if (tier === "free") return Number(o.freeLimit);
  if (tier === "device") return Number(o.deviceLimit);
  if (tier === "ip") return Number(o.ipLimit);
  return 0;
}

/* SIGNED-IN ROLE, BEST EFFORT. Only looked up when the request carries the
   session cookie (o.sessionCookie), so a cookie-less booking costs nothing
   extra. Any throw or a slow answer (o.roleTimeoutMs, default 4000; 1500 lost the
   race to five reads on 16 Oct 2026 and the paygate with it) returns
   null, i.e. today's device/IP path: a role lookup must never fail a booking.
   Returns {admin:true} | {subject:"u:<id>", tier:"user"|"plus"|"free"} | null.
   "u:" cannot collide with a device id's "ip-" prefix, and a device id is never
   "u:...". PAYGATE (16 Oct 2026): every signed-in reader is counted as
   themselves - Family & friends 100, Plus 20, free 2 - so a pass follows the
   account across devices. A tier whose limit is unset keeps the device path. */
const hasSession = (o, req) => !!o.sessionCookie &&
  String(((req && req.headers) || {}).cookie || "").indexOf(o.sessionCookie + "=") >= 0;
async function roleSubject(o, req) {
  if (typeof o.roleOf !== "function") return null;
  if (o.sessionCookie && !hasSession(o, req)) return null;
  let timer;
  try {
    const r = await Promise.race([
      Promise.resolve(o.roleOf(req)),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), o.roleTimeoutMs || 4000); }),
    ]);
    if (r && r.role === "admin") return { admin: true };
    if (r && r.role === "ff" && r.userId) return { subject: "u:" + r.userId, tier: "user" };
    const tier = r && r.role === "plus" ? "plus" : "free";
    if (r && r.userId && Number(o[tier + "Limit"]) > 0) return { subject: "u:" + r.userId, tier };
  } catch (e) { /* fall back to device/IP */ } finally { clearTimeout(timer); }
  return null;
}

async function releaseHeld(o, ids) {
  for (const id of [].concat(ids)) {
    try { if (typeof o.db.releaseBooking === "function") await o.db.releaseBooking(id); }
    catch (e) { /* a lost release costs the reader one code, never the booking */ }
  }
}

/* Gives back the places a booking held when the booking did not mint a code. */
function makeRelease(opts) {
  const o = opts || {};
  return async function release(req) {
    if (!req || req._swHeld == null) return;
    const ids = req._swHeld;
    req._swHeld = null;
    await releaseHeld(o, ids);
  };
}

/* Holds a row for `subject` today, then counts its rows over `countDay` up to
   that row: the hold is in place before the count is read, so two bookings
   sent together cannot share one count (lib/supabase.js holdBooking). A hold
   that fails falls back to counting alone. Answers {used, why, held}; used is
   null when the count could not be read. */
async function countHeld(o, subject, day, countDay, limit, src) {
  let held = null;
  try {
    if (typeof o.db.holdBooking === "function") {
      const h = await o.db.holdBooking(subject, day, src);
      if (h && h.ok) held = h.id;
    }
    const got = await o.db.countBookings(subject, countDay, limit, held == null ? undefined : held);
    if (got && got.ok) return { used: got.n - (held == null ? 0 : 1), held };   /* not our own hold */
    return { used: null, why: (got && got.why) || "no answer", held };
  } catch (e) {
    return { used: null, why: String((e && e.message) || e), held };
  }
}

/* Answers {allow, counted, remaining} for lib/bookproxy.js.
 *
 * `remaining` counts the code about to be minted: six used against a cap of
 * ten leaves three after this booking, not four. A reader told "4 left" who
 * then gets nine more would be told the wrong thing twice.
 *
 * THE TRIAL (owner, 16 Oct 2026, o.trial). Two codes a day was the whole need
 * of a casual punter, so nobody paid, and fifteen Gmail accounts on one phone
 * were thirty codes a day. With o.trial on:
 *   - signed out books nothing: the device id is whatever the browser sends,
 *     so a fresh one per request was ten codes each, unlimited;
 *   - a free account gets o.freeLimit codes for its lifetime, not per day;
 *   - and so does the phone ("t-" + device id), however many accounts sign
 *     in on it. Clearing the browser gets a new phone id; that is the ceiling
 *     of this without phone numbers, and it costs two codes a go. */
function makeGate(opts) {
  const o = opts || {};
  const now = typeof o.now === "function" ? o.now : Date.now;
  return async function gate(req) {
    const open = { allow: true, counted: false, remaining: null };
    const rs = await roleSubject(o, req);
    if (rs && rs.admin) return open;
    const { subject, tier } = rs || subjectOf(req, o.pepper);
    /* AN EXEMPT DEVICE IS EXEMPT ONLY SIGNED OUT (owner, 16 Oct 2026: "i just generated
       unlimited tickets with my other account"). Signed in, the account decides; a
       lookup that failed falls to the device's count, never to the device's pass. */
    if (subject && !hasSession(o, req) && isExempt(o, subject, tier)) return open;
    /* Signed out, with the trial on: sign in first. A session whose role lookup
       failed is not refused here - it keeps the device count below. */
    if (o.trial && !rs && !hasSession(o, req)) {
      return { allow: false, counted: true, remaining: 0, limit: Number(o.freeLimit) || 0, plan: "guest" };
    }
    if (!subject) return open;
    const limit = limitsOf(o, tier);
    if (!isFinite(limit) || limit <= 0) return open;
    const day = Q.dayOf(now());
    const trial = !!o.trial && tier === "free";
    const countDay = trial ? Q.ALL_DAYS : day;
    const src = srcOf(req);
    const acct = await countHeld(o, subject, day, countDay, limit, src);
    const device = trial ? Q.deviceIdOf(req) : null;
    const phone = device ? await countHeld(o, "t-" + device, day, countDay, limit, src) : null;
    /* The account's count decides whether we could count at all; the phone's
       only ever adds to it (a phone count we could not read is skipped). */
    const used = acct.used == null ? null
      : Math.max(acct.used, phone && phone.used != null ? phone.used : 0);
    const d = Q.decide({ used, limit });
    /* Kept on the request: the recorder skips a held booking, and a booking
       that is refused, or that fails at the bookmaker, gives the places back. */
    const held = [acct.held, phone && phone.held].filter((id) => id != null);
    if (held.length) {
      if (d.counted && d.allow) req._swHeld = held;
      else await releaseHeld(o, held);
    }
    /* WHY IT COULD NOT COUNT, ONLY WHEN ASKED. A limiter that fails open is
       invisible otherwise - the header reads "open" and the logs say nothing
       by design. Off unless o.debug, because a PostgREST error names our
       tables and columns and that is not for the world. */
    if (!d.counted) return o.debug && acct.why ? Object.assign({ why: acct.why }, open) : open;
    return {
      allow: d.allow,
      counted: true,
      remaining: d.allow ? Math.max(0, d.remaining - 1) : 0,
      limit: limit,
      plan: tier,       /* the 429 says "get Plus" to free, "after midnight" to the rest */
      trial: trial || undefined,
    };
  };
}

/* Files a booking that actually worked. Never throws at the caller: a row we
   failed to write is a number we lose, and lib/bookproxy.js has already sent
   the reader their code by the time this runs. */
function makeRecorder(opts) {
  const o = opts || {};
  const now = typeof o.now === "function" ? o.now : Date.now;
  return async function record(req) {
    if (req && req._swHeld != null) return;   /* the gate's holds are the rows */
    const rs = await roleSubject(o, req);
    if (rs && rs.admin) return;
    const { subject, tier } = rs || subjectOf(req, o.pepper);
    if (!subject) return;
    if (!hasSession(o, req) && isExempt(o, subject, tier)) return;
    /* A FEATURE THAT IS OFF MUST TOUCH NOTHING. Without this the recorder
       files a row on every successful booking even with no limit configured -
       and before sql/book_quota.sql is applied that is a PostgREST error per
       booking: swallowed here, invisible to the reader, pure noise against the
       database. The gate already opens when the limit is unset; this is the
       other half of the same switch. */
    const limit = limitsOf(o, tier);
    if (!isFinite(limit) || limit <= 0) return;
    try {
      await o.db.recordBooking(subject, Q.dayOf(now()), srcOf(req));
    } catch (e) { /* counted or not, the code has shipped */ }
  };
}

/* Who booked it, for the slip ledger (lib/slipwatch.js): every booking, admin and
   exempt devices included, since the owner wants to see them all. Same identities
   as the quota; never throws. */
async function whoOf(opts, req) {
  try {
    const rs = await roleSubject(opts || {}, req);
    if (rs && rs.admin) return { who: "admin", subject: null };
    if (rs) return { who: "user", subject: rs.subject };
    const s = subjectOf(req, (opts || {}).pepper);
    return { who: s.tier, subject: s.subject };
  } catch (e) { return { who: "none", subject: null }; }
}

/* Which surface booked it, from bookFetch's &src=. Only a short lowercase
   word is kept - it is echoed into logs and a database column, and nothing a
   caller types should reach either as it came. Anything else is "other";
   nothing at all is null. */
function srcOf(req) {
  const raw = String((req && req.query && req.query.src) || "");
  return /^[a-z]{1,16}$/.test(raw) ? raw : (raw ? "other" : null);
}

module.exports = { makeGate, makeRecorder, makeRelease,subjectOf, isExempt, srcOf, whoOf, IP_PREFIX };
