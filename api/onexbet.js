"use strict";

/* GET /api/onexbet - edge-cached mirror of the Railway 1xBet fixture feed.
   Same terms as the other four books - see lib/upstream.js. */
module.exports = require("../lib/upstream.js").makeHandler("onexbet");
