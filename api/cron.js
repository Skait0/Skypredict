"use strict";

const { applyCache, NO_STORE } = require("../lib/cachepolicy.js");

/**
 * Called on a schedule by Vercel Cron (see vercel.json).
 *
 * It rebuilds and returns a short summary rather than the whole payload, so
 * the cron log stays readable and tells you at a glance whether the sources
 * are still healthy.
 */

const { buildPayload } = require("../lib/build.js");

/* Account housekeeping rides the same daily run (spec section 3): expired
   codes and sign-in attempts, long-ended sessions, old rate counters. Its own
   try, so a database hiccup never costs the day's build. */
async function housekeep(nowMs) {
  if (process.env.AUTH_ENABLED !== "1") return null;
  try { return await require("../lib/auth/db.js").housekeep(nowMs); } catch (e) { return false; }
}

module.exports = async (req, res) => {
  const started = Date.now();
  const cleaned = await housekeep(started);
  try {
    const payload = await buildPayload({});
    applyCache(res, NO_STORE);
    return res.status(200).json({
      housekeep: cleaned,
      ok: true,
      generated: payload.generated,
      matches: payload.matches,
      leagues: payload.leagues.length,
      fixtures: payload.fixtures.length,
      ms: Date.now() - started,
      log: payload.log,
    });
  } catch (err) {
    applyCache(res, NO_STORE);
    return res.status(500).json({
      housekeep: cleaned,
      ok: false,
      error: String(err && err.message || err),
      ms: Date.now() - started,
    });
  }
};
