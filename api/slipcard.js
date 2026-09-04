"use strict";

const { applyCache, BROWSER_REVALIDATE } = require("../lib/cachepolicy.js");

/* GET /api/slipcard?g=<games>&o=<odds> - the link-preview image for a slip.
 *
 * Composited per request from baked parts, because the numbers belong to the
 * slip and a file on disk cannot carry them. See lib/slipcard.js for how, and
 * scripts/mkslipcard.js for what was baked.
 *
 * The answer depends on nothing but the two numbers in the query, so it is
 * immutable: the same slip asked for twice is the same picture, and the
 * crawlers that fetch these ask repeatedly.
 *
 * A figure that cannot be drawn correctly is not drawn at all - the static
 * site card is served instead. A link with the wrong picture is worse than a
 * link with a generic one, and it goes out on somebody else's timeline where
 * nobody can fix it.
 */

const fs = require("fs");
const path = require("path");

const CARD = require("../lib/slipcard.js");

/* Read once. The fallback is the site's own card, already on disk. */
let FALLBACK = null;
function fallback() {
  if (FALLBACK === null) {
    try { FALLBACK = fs.readFileSync(path.join(__dirname, "..", "public", "og-card.png")); }
    catch (e) { FALLBACK = false; }
  }
  return FALLBACK;
}

module.exports = (req, res) => {
  let g = null, o = null;
  if (req.query) { g = req.query.g; o = req.query.o; }
  if (g == null && req.url) {
    try {
      const q = new URL(req.url, "https://x").searchParams;
      g = q.get("g"); o = q.get("o");
    } catch (e) { /* fall through to the static card */ }
  }

  let png = null;
  try { png = CARD.build(g, o); }
  catch (e) { png = null; }

  if (!png) {
    const fb = fallback();
    if (!fb) { res.statusCode = 404; return res.end("no card"); }
    res.setHeader("Content-Type", "image/png");
    /* Short, because the reason it fell back may be a bad link rather than a
       bad figure, and a wrong picture should not be pinned for a year - least
       of all in Cloudflare, which no deploy can purge. */
    applyCache(res, {
      browser: BROWSER_REVALIDATE,
      cdn: "public, s-maxage=60",
      vercel: "public, s-maxage=240",
    });
    res.statusCode = 200;
    return res.end(fb);
  }

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Length", png.length);
  /* Immutable in the strict sense: the card is drawn from the payload in the
     query string, so this URL can only ever mean this image. That is the one
     case where every tier gets the full year - and it matters here more than
     anywhere, because a share card is fetched by every crawler and reader who
     sees the link, and each of those was a Vercel egress before Cloudflare
     could hold it. */
  applyCache(res, {
    browser: "public, max-age=31536000, immutable",
    cdn: "public, s-maxage=31536000, immutable",
    vercel: "public, s-maxage=31536000, immutable",
  });
  res.statusCode = 200;
  return res.end(png);
};
