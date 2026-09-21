"use strict";

/* GET /api/betpawa - edge-cached mirror of the Railway Betpawa fixture feed.
   See lib/upstream.js for why this sits in front of it.

   Upstream answers 503 while its first sweep has not run yet, which the shared
   handler treats like any other bad reply: serve the last good copy if there
   is one, never cache the failure. */

module.exports = require("../lib/upstream.js").makeHandler("betpawa");
