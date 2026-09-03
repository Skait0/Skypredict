"use strict";

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
       bad figure, and a wrong picture should not be pinned for a year. */
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.statusCode = 200;
    return res.end(fb);
  }

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Length", png.length);
  res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  res.statusCode = 200;
  return res.end(png);
};
