"use strict";
/* GET /api/bigodds - today's Big odds of the day, for the daily codes card.
 * Minted by the social engine at 11:00 Lagos on a good day (lib/bigodds.js);
 * absent on other days, which the card treats as "nothing to show". */
const { applyCache, BROWSER_REVALIDATE } = require("../lib/cachepolicy.js");

/* Five minutes at the edge, on all three tiers (lib/cachepolicy.js): the row
   appears once a day and never changes after, and every home-page view asks. */
const POLICY = { browser: BROWSER_REVALIDATE, cdn: "public, s-maxage=300", vercel: "public, s-maxage=300" };

/* Nothing for the home page since 22 Oct 2026: big_odds now holds the safer x20 (lib/safer20.js),
   which is a social post, and the owner wants no second tile on the home page ("this is going to
   populate the home page"). The card already draws nothing when big is null. */
module.exports = async function handler(req, res) {
  applyCache(res, POLICY);
  return res.status(200).json({ ok: true, big: null });
};
