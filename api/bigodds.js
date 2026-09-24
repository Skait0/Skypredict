"use strict";
/* GET /api/bigodds - today's Big odds of the day, for the daily codes card.
 * Minted by the social engine at 11:00 Lagos on a good day (lib/bigodds.js);
 * absent on other days, which the card treats as "nothing to show". */
const SB = require("../lib/supabase.js");
const S = require("../lib/social.js");
const { applyCache, BROWSER_REVALIDATE } = require("../lib/cachepolicy.js");

/* Five minutes at the edge, on all three tiers (lib/cachepolicy.js): the row
   appears once a day and never changes after, and every home-page view asks. */
const POLICY = { browser: BROWSER_REVALIDATE, cdn: "public, s-maxage=300", vercel: "public, s-maxage=300" };

module.exports = async function handler(req, res) {
  const got = await SB.getBigOdds(S.dayOf(Date.now()));
  applyCache(res, POLICY);
  if (!got.ok || !got.row) return res.status(200).json({ ok: true, big: null });
  return res.status(200).json({ ok: true, big: got.row });
};
