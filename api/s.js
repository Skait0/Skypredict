"use strict";

/* GET /s?p=... - render a slip somebody built and shared.
 *
 * A function rather than a generated page, because the match pages under /m/
 * are baked at build time from our own board and a reader's slip obviously
 * cannot be. It also has to be server-rendered so the link preview on X and
 * WhatsApp says what the slip is; a client-rendered page would preview as the
 * generic site card, and the preview is most of the reason anyone clicks.
 *
 * The payload is whatever was in the URL, so it is treated as hostile: decode
 * validates every field and refuses the whole slip rather than repairing part
 * of it. See lib/sliplink.js.
 */

const SL = require("../lib/sliplink.js");

/* The record is the credibility line at the bottom of the page. It is nice to
   have and must never hold the page up: a shared slip that will not render
   because our own stats endpoint is slow is a worse failure than one that
   renders without them. */
async function payload(req) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (!host) return null;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch("https://" + host + "/predictions.json", { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  let p = req.query && req.query.p;
  /* Vercel populates req.query, but parse the URL too so the function is
     runnable anywhere and a missing query object is not a 500. */
  if (!p && req.url) {
    try { p = new URL(req.url, "https://x").searchParams.get("p"); } catch (e) { p = null; }
  }

  const got = SL.decode(p);
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (!got.ok) {
    /* Do not cache a refusal: the usual cause is a link truncated in a chat
       app, and the next person may paste it whole. */
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 400;
    return res.end(SL.renderError(got.why));
  }

  const j = await payload(req);
  const results = j && Array.isArray(j.results) ? j.results : null;
  const rec = j && j.record && j.record.total ? j.record : null;
  /* Grade whatever has finished. A leg with no result, or a market a final
     score cannot settle, stays null and renders as not settled - never as a
     loss. */
  const legs = results ? SL.gradeLegs(got.legs, results) : got.legs;

  /* A settled slip will never change again, so it can sit on the edge for a
     week. One still playing must not: the verdicts on it are the whole point
     and a day-old copy would show a finished game as unplayed. Slips get
     shared in bursts, so even the short window does real work. */
  const done = SL.verdict(legs).settled;
  res.setHeader("Cache-Control", done
    ? "public, s-maxage=604800, stale-while-revalidate=604800"
    : "public, s-maxage=300, stale-while-revalidate=3600");
  res.statusCode = 200;
  res.end(SL.renderPage(legs, rec, "/s"));
};
