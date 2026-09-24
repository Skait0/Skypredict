"use strict";
/* Who may run the timed jobs (api/tgfollow.js, api/social.js). One copy, so
   the two cannot drift apart - they already had (code review, 24 Sep).

   Vercel cron sends `Authorization: Bearer $CRON_SECRET`; the sweep key works
   too, for running a job by hand. The user-agent fallback exists only for a
   deployment without CRON_SECRET, because anyone can send that header. */
function allowed(req) {
  const h = (req && req.headers) || {};
  const cron = process.env.CRON_SECRET || "", sweep = process.env.SWEEP_KEY || "";
  if (sweep && h["x-sweep-key"] === sweep) return true;
  if (cron) return h.authorization === "Bearer " + cron;
  return /^vercel-cron\//.test(String(h["user-agent"] || ""));
}
module.exports = { allowed };
