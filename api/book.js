"use strict";

/* POST /api/book?book=sporty|bet9ja - booking, routed through this origin so
   it reaches the browser over the same Cloudflare edge as everything else.
   See lib/bookproxy.js for the measurements and for why a 400 must survive. */

module.exports = require("../lib/bookproxy.js").makeHandler();
