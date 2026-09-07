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
  if (tier === "device") return Number(o.deviceLimit);
  if (tier === "ip") return Number(o.ipLimit);
  return 0;
}

/* Answers {allow, counted, remaining} for lib/bookproxy.js.
 *
 * `remaining` counts the code about to be minted: six used against a cap of
 * ten leaves three after this booking, not four. A reader told "4 left" who
 * then gets nine more would be told the wrong thing twice. */
function makeGate(opts) {
  const o = opts || {};
  const now = typeof o.now === "function" ? o.now : Date.now;
  return async function gate(req) {
    const open = { allow: true, counted: false, remaining: null };
    const { subject, tier } = subjectOf(req, o.pepper);
    if (!subject) return open;
    if (isExempt(o, subject, tier)) return open;
    const limit = limitsOf(o, tier);
    if (!isFinite(limit) || limit <= 0) return open;
    const day = Q.dayOf(now());
    let used = null, why;
    try {
      const got = await o.db.countBookings(subject, day, limit);
      used = got && got.ok ? got.n : null;
      if (!(got && got.ok)) why = (got && got.why) || "no answer";
    } catch (e) {
      used = null;
      why = String((e && e.message) || e);
    }
    const d = Q.decide({ used, limit });
    /* WHY IT COULD NOT COUNT, ONLY WHEN ASKED. A limiter that fails open is
       invisible otherwise - the header reads "open" and the logs say nothing
       by design. Off unless o.debug, because a PostgREST error names our
       tables and columns and that is not for the world. */
    if (!d.counted) return o.debug && why ? Object.assign({ why }, open) : open;
    return {
      allow: d.allow,
      counted: true,
      remaining: d.allow ? Math.max(0, d.remaining - 1) : 0,
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
    const { subject, tier } = subjectOf(req, o.pepper);
    if (!subject) return;
    if (isExempt(o, subject, tier)) return;
    /* A FEATURE THAT IS OFF MUST TOUCH NOTHING. Without this the recorder
       files a row on every successful booking even with no limit configured -
       and before sql/book_quota.sql is applied that is a PostgREST error per
       booking: swallowed here, invisible to the reader, pure noise against the
       database. The gate already opens when the limit is unset; this is the
       other half of the same switch. */
    const limit = limitsOf(o, tier);
    if (!isFinite(limit) || limit <= 0) return;
    try {
      await o.db.recordBooking(subject, Q.dayOf(now()));
    } catch (e) { /* counted or not, the code has shipped */ }
  };
}

module.exports = { makeGate, makeRecorder, subjectOf, isExempt, IP_PREFIX };
