"use strict";
/* GET /api/flags - what the admin has switched (lib/flags.js): which bookies
 * are paused and the notice line, for the page to show on load. Public and
 * edge-cached for a minute, so every visitor reading it costs one function
 * call a minute per region, not one per page view. A failed read answers
 * "nothing off" (lib/flags.js fails open), and the booking route checks the
 * switch for itself, so a stale copy here can only delay the banner.
 */
const F = require("../lib/flags.js");
const { applyCache, BROWSER_REVALIDATE } = require("../lib/cachepolicy.js");

const POLICY = { browser: BROWSER_REVALIDATE, cdn: "public, s-maxage=60", vercel: "public, s-maxage=60" };

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method" });
  let v;
  try { v = await F.get(); } catch (e) { v = { booksOff: [], notice: "" }; }
  applyCache(res, POLICY);
  return res.status(200).json(v);
};
