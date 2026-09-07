"use strict";

/**
 * How many booking codes one device may mint in a day.
 *
 * The pure half of the free-period limit: which day it is, who is asking, and
 * whether they may. Nothing here talks to a database or a request pipeline, so
 * every rule below is testable without either.
 *
 * WHY THE DEVICE AND NOT THE ADDRESS. MTN and Airtel put very large numbers of
 * subscribers behind single NAT addresses, so a ten-a-day cap keyed on IP would
 * lock out a cell tower at a time while a script on a VPS carried on. The
 * device id is the subject; the address is a second, far looser ceiling whose
 * job is to stop scripts rather than people.
 *
 * WHY IT FAILS OPEN. Everything here answers "allow" when it cannot tell. A
 * quota is a cost control, not a correctness boundary, and a reader who loses
 * a booking because our counter was unreachable has been charged for our
 * outage. Losing count is the cheaper failure.
 */

const crypto = require("crypto");

/* Lagos, where the readers are, and where "today" has to be measured.
   Nigeria is UTC+1 all year and has never observed daylight saving, so this is
   a constant rather than a timezone database lookup. */
const LAGOS_OFFSET_MS = 3600000;

function dayOf(now) {
  const t = typeof now === "number" && isFinite(now) ? now : Date.now();
  return new Date(t + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/* The browser mints this and we never trust it. It reaches a database key, so
   the shape is checked and the contents are never interpreted. Absent is not
   an error - plenty of clients will not send one - it just means we cannot
   count this device, and decide() treats that as allow. */
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

function deviceIdOf(req) {
  const h = (req && req.headers) || {};
  const raw = h["x-sw-device"];
  if (typeof raw !== "string") return null;
  return DEVICE_RE.test(raw) ? raw : null;
}

/* The address, as a bucket key and nothing else.
 *
 * Hashed with a pepper because the whole IPv4 space is small enough to
 * enumerate: an unpeppered digest of an address is the address. The digest is
 * truncated because this only has to separate buckets, not resist collision
 * attacks - and a shorter key is a smaller thing to leak. */
function clientKeyOf(req, pepper) {
  const h = (req && req.headers) || {};
  const chain = h["x-forwarded-for"];
  if (typeof chain !== "string" || !chain.trim()) return null;
  /* First entry is the client; everything after it is a proxy that must not
     change which bucket the client lands in. */
  const ip = chain.split(",")[0].trim();
  if (!ip) return null;
  return crypto.createHash("sha256")
    .update(String(pepper == null ? "" : pepper) + "|" + ip)
    .digest("hex").slice(0, 16);
}

/* May this request through, and how much is left after it.
 *
 * `counted: false` is the honest answer for "we do not know" - an unreadable
 * counter or a limit that is switched off. The caller uses it to decide
 * whether the number is worth telling the reader. */
function decide(state) {
  const s = state || {};
  const limit = Number(s.limit);
  if (!isFinite(limit) || limit <= 0) {
    return { allow: true, counted: false, remaining: null };
  }
  /* Checked before the cast, because Number(null) is 0 and null here means
     "the counter did not answer" - reading that as zero used would turn an
     outage into a silent full allowance and, worse, report it as counted. */
  const used = s.used == null ? NaN : Number(s.used);
  if (!isFinite(used)) {
    return { allow: true, counted: false, remaining: null };
  }
  return {
    allow: used < limit,
    counted: true,
    /* Two requests can race past the same count, so used may exceed the
       limit. A reader is told zero, never a negative number. */
    remaining: Math.max(0, limit - used),
  };
}

module.exports = { dayOf, deviceIdOf, clientKeyOf, decide, LAGOS_OFFSET_MS };
