"use strict";

/* GET /api/live - edge-cached mirror of the Railway live-scores feed.
   See lib/upstream.js for why this sits in front of it. */

module.exports = require("../lib/upstream.js").makeHandler("live");
