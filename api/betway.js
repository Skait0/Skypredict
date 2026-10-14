"use strict";

/* GET /api/betway - edge-cached mirror of the Railway Betway fixture feed.
   Same terms as the other five books - see lib/upstream.js. */
module.exports = require("../lib/upstream.js").makeHandler("betway");
