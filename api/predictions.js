"use strict";

/**
 * GET /api/predictions
 *
 * Returns the prediction payload the site renders.
 *
 * THIS ROUTE DOES NOT BUILD. It reads the file `prebuild` baked at deploy
 * time and serves it. That is the whole design, and it is worth saying loudly
 * because the previous version did build, and the cost of that was measured
 * rather than guessed:
 *
 *   577 invocations in 12 hours, 8 HOURS of active CPU, a 100% error rate,
 *   every one of them "Vercel Runtime Timeout Error: Task timed out after
 *   60 seconds" - and 47,000 requests to football-data.co.uk, about 94,000
 *   a day, from builds that were killed before they could finish.
 *
 * The old comment here said "nobody ever waits for a build", and that was
 * true right up until a build stopped fitting inside 60 seconds. Then three
 * things compounded:
 *
 *   1. A 504 is never cached, so the next visitor started another build.
 *   2. The client retries up to three times, and the freshness path fires for
 *      every visitor once the baked file is six hours old - most of the day.
 *   3. The careful error handling below could not help. All of it assumed a
 *      failure THROWS. A timeout does not throw; the runtime kills the
 *      invocation, so the catch block never ran once.
 *
 * Nobody saw any of it: the static /predictions.json served fine throughout,
 * so the site looked healthy while this burned money and hammered a free,
 * volunteer-run dataset the whole model is fitted on. Getting blocked there
 * would break the site properly.
 *
 * So: building happens where it has time and no audience - in `prebuild` at
 * deploy, and once a day in /api/cron. This route is a reader. If the baked
 * file is missing it says so in milliseconds rather than spending a minute
 * discovering it.
 */

const fs = require("fs");
const path = require("path");

/* Where prebuild puts it. Listed in vercel.json under includeFiles so the
   function bundle actually carries it - without that this route deploys
   perfectly and 503s on every request. */
const BAKED = path.join(process.cwd(), "public", "predictions.json");

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

/* What to send for a payload, and whether it is fit to keep. Pure so the
   caching rule can be tested without a filesystem or a server - this is the
   rule that decides how long a bad day stays on the site. */
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

/* Read once per warm container. The file cannot change under a running
   container - a new deploy makes new containers - so re-reading it per
   request would be pure waste. mtime is carried so a stale bundle is
   visible in the response headers rather than having to be inferred. */
let cached = null;
function readBaked() {
  if (cached) return cached;
  const raw = fs.readFileSync(BAKED, "utf8");
  const payload = JSON.parse(raw);
  const { log, ...rest } = payload;
  cached = { payload: rest, bytes: raw.length };
  return cached;
}

module.exports = async (req, res) => {
  try {
    const { payload, bytes } = readBaked();
    const out = chooseResponse(payload, null);
    res.setHeader("X-Formline-Cache", "baked");
    res.setHeader("X-Formline-Fixtures", String(fixtureCount(out.body)));
    res.setHeader("X-Formline-Bytes", String(bytes));
    if (!out.store) res.setHeader("X-Formline-Thin", String(out.thinCount));
    res.setHeader("Cache-Control", out.cacheControl);
    return res.status(200).json(out.body);
  } catch (err) {
    /* No baked file, or it is not JSON. Both mean the deploy is wrong, and
       neither is fixable from inside a request - so this is fast, loud and
       uncached rather than an attempt to paper over it by building. The
       client falls back to /predictions.json from the CDN, which is the same
       file and is what it reads first anyway. */
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({
      error: "no baked payload",
      detail: String((err && err.message) || err),
    });
  }
};

/* Exposed for tests: the caching rule is the thing that decides how long a
   broken feed stays visible, so it is worth pinning down. */
module.exports.chooseResponse = chooseResponse;
module.exports.isHealthy = isHealthy;
module.exports.MIN_HEALTHY_FIXTURES = MIN_HEALTHY_FIXTURES;
module.exports.FULL_CACHE = FULL_CACHE;
module.exports.SHORT_CACHE = SHORT_CACHE;
module.exports.BAKED = BAKED;
