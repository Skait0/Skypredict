"use strict";

/* POST /api/book?book=sporty|bet9ja - booking, routed through this origin so
   it reaches the browser over the same Cloudflare edge as everything else.
   See lib/bookproxy.js for the measurements and for why a 400 must survive.

   THE FREE-PERIOD QUOTA HANGS OFF THIS ROUTE AND NOWHERE ELSE. Slip building
   is free client-side compute; the booking call is what costs - Railway CPU on
   a $5 plan, and bookmaker goodwill that has been spent once already. See
   lib/bookgate.js for who is counted and lib/quota.js for the rules.

   Every limit is read from the environment, and an unset variable switches its
   tier off rather than closing it. A deploy that loses SW_DEVICE_BOOK_LIMIT
   gets the old, unlimited behaviour - never a site that cannot book. */

const DB = require("../lib/supabase.js");
const GATE = require("../lib/bookgate.js");

const opts = {
  db: DB,
  deviceLimit: Number(process.env.SW_DEVICE_BOOK_LIMIT || 0),
  /* Loose on purpose: MTN and Airtel NAT very large numbers of subscribers
     behind one address, so this ceiling is here to stop a script, not a
     person. */
  ipLimit: Number(process.env.SW_IP_BOOK_LIMIT || 0),
  pepper: process.env.SW_QUOTA_PEPPER || "",
  /* Temporary, for diagnosing a quota that reports "open". Unset it again
     once the answer is known - it puts database errors in a response header. */
  debug: process.env.SW_QUOTA_DEBUG === "1",
};

module.exports = require("../lib/bookproxy.js").makeHandler({
  gate: GATE.makeGate(opts),
  record: GATE.makeRecorder(opts),
});
