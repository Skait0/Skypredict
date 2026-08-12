"use strict";

/**
 * Called on a schedule by Vercel Cron (see vercel.json).
 *
 * It rebuilds and returns a short summary rather than the whole payload, so
 * the cron log stays readable and tells you at a glance whether the sources
 * are still healthy.
 */

const { buildPayload } = require("../lib/build.js");

module.exports = async (req, res) => {
  const started = Date.now();
  try {
    const payload = await buildPayload({});
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ok: true,
      generated: payload.generated,
      matches: payload.matches,
      leagues: payload.leagues.length,
      fixtures: payload.fixtures.length,
      ms: Date.now() - started,
      log: payload.log,
    });
  } catch (err) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(500).json({
      ok: false,
      error: String(err && err.message || err),
      ms: Date.now() - started,
    });
  }
};
