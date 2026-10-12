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

/* ?w=<site_slips id>: the list banner for one landed slip (lib/winpost.js imageUrl).
 *
 * Everything on it - rank, figures, the picks - comes from that row, read here,
 * and nothing from the query but the id. That is the point of it: a banner that
 * took its text from the URL would let anyone put any words on a picture served
 * from our domain. Not landed, below the lowest rank, not found, no database:
 * null, and the caller serves the fallback. */
async function listBanner(id) {
  const SB = require("../lib/supabase.js");
  const WIN = require("../lib/winpost.js");
  const row = await SB.siteSlipById(id);
  if (!row || row.status !== "landed") return null;
  const r = WIN.rankOf(row.total_odds);
  if (!r) return null;
  const legs = Array.isArray(row.legs) ? row.legs : [];
  return CARD.buildWinList(r.id, row.leg_count || legs.length, row.total_odds, legs.map((l) => l && l.name));
}

module.exports = async (req, res) => {
  let g = null, o = null, rk = null, w = null;
  if (req.query) { g = req.query.g; o = req.query.o; rk = req.query.r; w = req.query.w; }
  if (g == null && w == null && req.url) {
    try {
      const q = new URL(req.url, "https://x").searchParams;
      g = q.get("g"); o = q.get("o"); rk = q.get("r"); w = q.get("w");
    } catch (e) { /* fall through to the static card */ }
  }

  /* ?r=<rank> is the figures-only won-slip banner (slips without an id). */
  let png = null;
  try { png = w != null ? await listBanner(String(w)) : rk ? CARD.buildWin(String(rk), g, o) : CARD.build(g, o); }
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
     could hold it. ?w= reads a row instead, but only a landed one, and a landed
     slip is settled for good - the same id is the same picture forever. */
  applyCache(res, {
    browser: "public, max-age=31536000, immutable",
    cdn: "public, s-maxage=31536000, immutable",
    vercel: "public, s-maxage=31536000, immutable",
  });
  res.statusCode = 200;
  return res.end(png);
};
