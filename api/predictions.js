"use strict";

/**
 * GET /api/predictions
 *
 * Returns the prediction payload the site renders.
 *
 * Caching is what makes this viable. Building means downloading roughly
 * sixty CSVs and fitting the model, so it must not happen per visitor. The
 * Cache-Control header lets Vercel's CDN serve a stored copy for six hours,
 * and stale-while-revalidate means that once it expires the next visitor
 * still gets the old copy instantly while a fresh one is built behind them.
 * Nobody ever waits for a build.
 *
 * The cron job hits this with ?refresh=1 each morning so the first real
 * visitor of the day already has warm data.
 */

const { buildPayload } = require("../lib/build.js");

// Survives between invocations while a container stays warm. Not a real
// cache, just a cheap guard against two builds running back to back.
let memo = null;

module.exports = async (req, res) => {
  const refresh = req.query && (req.query.refresh === "1" || req.query.refresh === "true");
  const debug = req.query && req.query.debug === "1";

  try {
    if (!refresh && memo && Date.now() - memo.at < 60 * 60 * 1000) {
      res.setHeader("X-Formline-Cache", "memo");
      res.setHeader("Cache-Control",
        "public, s-maxage=21600, stale-while-revalidate=86400");
      return res.status(200).json(stripLog(memo.payload, debug));
    }

    const payload = await buildPayload({});
    memo = { at: Date.now(), payload };

    res.setHeader("X-Formline-Cache", "miss");
    res.setHeader("Cache-Control",
      "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(stripLog(payload, debug));
  } catch (err) {
    // Serve stale data rather than an error page if we have any.
    if (memo) {
      res.setHeader("X-Formline-Cache", "stale-after-error");
      res.setHeader("Cache-Control", "public, s-maxage=600");
      return res.status(200).json(stripLog(memo.payload, debug));
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: String(err && err.message || err) });
  }
};

function stripLog(payload, debug) {
  if (debug) return payload;
  const { log, ...rest } = payload;
  return rest;
}
