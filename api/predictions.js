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
// The last payload that looked healthy. A thin build must never evict it.
let lastGood = null;

/* A build "succeeds" even when the fixture feeds let us down: the only hard
   guard in buildPayload is on results (<400 throws), so if football-data's
   fixtures and SportyBet both come back empty we still produce a payload -
   with almost no games in it. Cached at s-maxage=21600 that pinned a
   four-fixture day on the site for six hours, and served it stale for up to
   twenty-four, with no way to page past tomorrow.
   A healthy day carries well over a hundred fixtures across two weeks ahead.
   Twenty is far below any real quiet spell, including an international break,
   so it separates "quiet" from "broken" without false alarms. */
const MIN_HEALTHY_FIXTURES = 20;
const FULL_CACHE = "public, s-maxage=21600, stale-while-revalidate=86400";
/* Degraded answers get minutes, not hours, so the site heals itself on the
   next build instead of staying broken until the cache expires. Long enough
   that a sustained upstream outage cannot turn every visitor into a rebuild. */
const SHORT_CACHE = "public, s-maxage=300";

function fixtureCount(p) {
  return (p && Array.isArray(p.fixtures)) ? p.fixtures.length : 0;
}
function isHealthy(p) {
  return fixtureCount(p) >= MIN_HEALTHY_FIXTURES;
}

/* What to send for a freshly built payload, and whether it is fit to keep.
   Pure so the caching rule can be tested without running a build or a server -
   this is the rule that decides how long a bad day stays on the site. */
function chooseResponse(fresh, lastGoodPayload) {
  if (isHealthy(fresh)) {
    return { body: fresh, cacheControl: FULL_CACHE, tag: "miss", store: true };
  }
  return {
    body: lastGoodPayload || fresh,
    cacheControl: SHORT_CACHE,
    tag: lastGoodPayload ? "thin-served-last-good" : "thin",
    store: false,
    thinCount: fixtureCount(fresh),
  };
}

module.exports = async (req, res) => {
  const refresh = req.query && (req.query.refresh === "1" || req.query.refresh === "true");
  const debug = req.query && req.query.debug === "1";

  try {
    if (!refresh && memo && Date.now() - memo.at < 60 * 60 * 1000) {
      res.setHeader("X-Formline-Cache", "memo");
      res.setHeader("X-Formline-Fixtures", String(fixtureCount(memo.payload)));
      res.setHeader("Cache-Control", FULL_CACHE);
      return res.status(200).json(stripLog(memo.payload, debug));
    }

    const payload = await buildPayload({});
    const out = chooseResponse(payload, lastGood);

    /* A thin build never becomes the stored copy: it must not evict good data
       from memo, and it must not be what the next hour of visitors sees. */
    if (out.store) {
      memo = { at: Date.now(), payload };
      lastGood = payload;
    } else {
      res.setHeader("X-Formline-Thin", String(out.thinCount));
    }
    res.setHeader("X-Formline-Cache", out.tag);
    res.setHeader("X-Formline-Fixtures", String(fixtureCount(out.body)));
    res.setHeader("Cache-Control", out.cacheControl);
    return res.status(200).json(stripLog(out.body, debug));
  } catch (err) {
    // Serve stale data rather than an error page if we have any.
    const fallback = (memo && memo.payload) || lastGood;
    if (fallback) {
      res.setHeader("X-Formline-Cache", "stale-after-error");
      res.setHeader("X-Formline-Fixtures", String(fixtureCount(fallback)));
      res.setHeader("Cache-Control", "public, s-maxage=600");
      return res.status(200).json(stripLog(fallback, debug));
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

/* Exposed for tests: the caching rule is the thing that decides how long a
   broken feed stays visible, so it is worth pinning down. */
module.exports.chooseResponse = chooseResponse;
module.exports.isHealthy = isHealthy;
module.exports.MIN_HEALTHY_FIXTURES = MIN_HEALTHY_FIXTURES;
module.exports.FULL_CACHE = FULL_CACHE;
module.exports.SHORT_CACHE = SHORT_CACHE;
