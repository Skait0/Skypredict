"use strict";

/* GET /api/betking - edge-cached mirror of the Railway BetKing fixture feed.
   See lib/upstream.js for why this sits in front of it.

   Upstream answers 503 while its sweep has not run yet, which the shared
   handler treats like any other bad reply: serve the last good copy if there
   is one, never cache the failure. */

module.exports = require("../lib/upstream.js").makeHandler("betking");
