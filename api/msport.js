"use strict";

/* GET /api/msport - edge-cached mirror of the Railway MSport fixture feed.
   Same terms as the other six books - see lib/upstream.js. */
module.exports = require("../lib/upstream.js").makeHandler("msport");
