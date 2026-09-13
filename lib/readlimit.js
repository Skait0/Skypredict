"use strict";

/**
 * A sliding window, for reads rather than bookings.
 *
 * WHY A READ NEEDS A LIMIT AT ALL. /api/slip mints nothing and costs no
 * bookmaker goodwill per call, which is why it is not behind lib/bookgate.js -
 * charging a reader a booking code to look at a slip they already hold would
 * be absurd. But every call is still a request Railway makes to SportyBet or
 * Bet9ja in our name, and the one thing this project has already been punished
 * for is too many of those at once: Bet9ja block-paged the whole datacentre in
 * August. A script walking the code space would look exactly like that again.
 *
 * WHAT THIS IS NOT. The counter lives in the instance's memory, so it is per
 * Vercel lambda and it resets when one is recycled - a determined flood spread
 * across cold starts is not stopped here. That is deliberate: the alternative
 * is a database round trip on every read, which would cost more than the read
 * it is protecting. This stops a loop in somebody's terminal, which is the
 * thing that actually happens.
 * ponytail: per-instance window; move the counter to lib/supabase.js only if a
 * spread-out flood ever shows up in the logs.
 *
 * Everything is injected so it can be driven by a fake clock in a test, and
 * everything fails open: no subject, no limit, or a limit that is switched off
 * all mean "allow".
 */

/* The map would otherwise grow one entry per address seen, forever. A lambda
   is short-lived enough that this ceiling is never reached in practice - it is
   here so that "in practice" is not the only thing holding the memory down. */
const MAX_SUBJECTS = 5000;

function makeLimiter(opts) {
  const o = opts || {};
  const limit = Number(o.limit);
  const windowMs = Number(o.windowMs) > 0 ? Number(o.windowMs) : 60000;
  const now = typeof o.now === "function" ? o.now : Date.now;
  const hits = new Map();

  return function take(subject) {
    if (!subject || !isFinite(limit) || limit <= 0) {
      return { allow: true, remaining: null, retryAfter: 0 };
    }
    const t = now(), cut = t - windowMs;

    if (hits.size > MAX_SUBJECTS) {
      for (const [k, v] of hits) {
        if (!v.length || v[v.length - 1] <= cut) hits.delete(k);
      }
    }

    const kept = (hits.get(subject) || []).filter((x) => x > cut);
    if (kept.length >= limit) {
      hits.set(subject, kept);
      /* When the oldest call in the window falls out of it, rounded up so a
         client that obeys the header is never told to come back too early. */
      return {
        allow: false, remaining: 0,
        retryAfter: Math.max(1, Math.ceil((kept[0] + windowMs - t) / 1000)),
      };
    }
    kept.push(t);
    hits.set(subject, kept);
    return { allow: true, remaining: limit - kept.length, retryAfter: 0 };
  };
}

module.exports = { makeLimiter, MAX_SUBJECTS };
