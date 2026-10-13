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
const S = require("../lib/auth/session.js");
const R = require("../lib/roles.js");
const AUTHDB = require("../lib/auth/db.js");

const opts = {
  db: DB,
  deviceLimit: Number(process.env.SW_DEVICE_BOOK_LIMIT || 0),
  /* Loose on purpose: MTN and Airtel NAT very large numbers of subscribers
     behind one address, so this ceiling is here to stop a script, not a
     person. */
  ipLimit: Number(process.env.SW_IP_BOOK_LIMIT || 0),
  pepper: process.env.SW_QUOTA_PEPPER || "",
  /* Our own devices, comma separated. A bypass key rather than a convenience:
     anyone holding one of these ids books without limit, so keep them long,
     random and unpublished, and rotate by changing this variable. */
  exempt: String(process.env.SW_QUOTA_EXEMPT || "").split(","),
  /* Signed-in readers: admin books free of any count, Family & friends are
     counted per account (u:<id>) against 100 a day. Anyone else, or any
     failure here, takes the device/address path above. */
  userLimit: 100,
  sessionCookie: S.COOKIE,
  roleOf: async (req) => {
    const s = await S.readSession(AUTHDB, req, Date.now());
    if (s.state !== "ok") return null;
    const u = await AUTHDB.userById(s.userId);
    return u ? { role: await R.roleOf(AUTHDB, u, process.env), userId: u.id } : null;
  },
  /* Temporary, for diagnosing a quota that reports "open". Unset it again
     once the answer is known - it puts database errors in a response header. */
  debug: process.env.SW_QUOTA_DEBUG === "1",
};

module.exports = require("../lib/bookproxy.js").makeHandler({
  /* The admin's per-bookie switch (lib/flags.js); fails open. */
  isOff: require("../lib/flags.js").isOff,
  gate: GATE.makeGate(opts),
  record: GATE.makeRecorder(opts),
  /* Every minted code into site_slips, for grading and the admin's hits list
     (lib/slipwatch.js, sql/site_slips.sql). */
  save: async (req, s) => {
    /* Ours only: a code the reader brought in is not a Soccerwizard slip (lib/slipwatch.js). */
    if (require("../lib/slipwatch.js").isReaderSrc(GATE.srcOf(req))) return;
    const w = await GATE.whoOf(opts, req);
    await DB.putSiteSlip({ book: s.book, code: s.code, who: w.who, subject: w.subject, src: GATE.srcOf(req),
      leg_count: s.legCount, total_odds: s.odds });
  },
});
