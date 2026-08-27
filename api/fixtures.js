"use strict";

/* GET /api/fixtures - edge-cached mirror of the Railway SportyBet fixture
   feed. See lib/upstream.js for why this sits in front of it. */

module.exports = require("../lib/upstream.js").makeHandler("fixtures");
