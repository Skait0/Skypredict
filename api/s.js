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
async function record(req) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (!host) return null;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch("https://" + host + "/predictions.json", { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.record && j.record.total ? j.record : null;
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

  /* The page is a pure function of the URL, so it can sit on the edge for a
     long time. Slips get shared in bursts and every reader of one post hits
     the same URL. */
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.statusCode = 200;
  res.end(SL.renderPage(got.legs, await record(req), "/s"));
};
