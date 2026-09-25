"use strict";
/* GET /api/results?since=YYYY-MM-DD - final scores the sweep has banked since
 * that day, straight from Supabase.
 *
 * WHY: My slips grades from DATA.results, which is baked at build time, and a
 * rebuild used to follow the GitHub sweep - which ran every 4-5 hours, so a
 * won ticket sat "running" long after its last game (reported 24 Sep, "I won
 * some tickets and they haven't updated"). The sweep now runs every ten
 * minutes from Vercel cron (api/tgfollow.js); this lets the page read what it
 * banks without waiting for a build. Two minutes at the edge.
 */
const SB = require("../lib/supabase.js");
const { applyCache, BROWSER_REVALIDATE } = require("../lib/cachepolicy.js");

const POLICY = { browser: BROWSER_REVALIDATE, cdn: "public, s-maxage=120", vercel: "public, s-maxage=120" };

module.exports = async function handler(req, res) {
  const q = String((req.query && req.query.since) || "");
  const floor = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(q) && q > floor ? q : floor;
  const got = await SB.recentResults(since);
  if (!got.ok) { res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ ok: false, results: [] }); }
  applyCache(res, POLICY);
  const results = got.rows.filter((r) => r.hg != null && r.ag != null)
    .map((r) => {
      const o = { date: r.match_date, home: r.home, away: r.away, hg: r.hg, ag: r.ag };
      /* Corners and shots (lib/statsfill.js), only when they are real counts:
         null is "not filled yet" and -1 "none to be had", and both mean the
         page must not settle a corners or shots leg on them. */
      for (const k of ["hc", "ac", "hsh", "ash"]) if (Number.isFinite(r[k]) && r[k] >= 0) o[k] = r[k];
      return o;
    });
  return res.status(200).json({ ok: true, results });
};
