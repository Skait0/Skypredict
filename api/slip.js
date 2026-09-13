"use strict";

/* GET /api/slip?book=sporty|bet9ja&code=XXXX - the legs behind a booking code.
 *
 * Reading, not booking. The distinction is the whole reason this is a separate
 * route rather than another mode of /api/book: booking mints something at the
 * bookmaker and is rationed for it (see lib/bookgate.js), while this costs one
 * GET and creates nothing. Putting it behind the booking quota would charge a
 * reader a booking code to look at a slip they already hold.
 *
 * Not cached. Two readers pasting the same code a minute apart can legitimately
 * get different answers - the bookmaker drops events from a coupon on its own
 * schedule - and a stored copy of somebody's slip is not a thing this edge
 * should be holding anyway.
 */

const { UPSTREAM } = require("../lib/upstream.js");

/* Checked here as well as upstream. A malformed code cannot become a useful
   request, so there is no reason to spend a Railway round trip discovering
   that - and this route takes a string straight off the address bar. */
const CODE_RE = /^[A-Za-z0-9]{4,16}$/;
const BOOKS = ["sporty", "bet9ja"];

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "GET only" });
  }
  const book = String((req.query && req.query.book) || "sporty").toLowerCase();
  const code = String((req.query && req.query.code) || "").trim();

  if (!BOOKS.includes(book)) {
    return res.status(400).json({ success: false, error: "unknown bookmaker" });
  }
  if (!CODE_RE.test(code)) {
    return res.status(400).json({ success: false, error: "that is not a booking code" });
  }

  /* Longer than a feed's, because this one waits on the bookmaker rather than
     on our own cache - the same reason lib/bookproxy.js gives itself room. */
  const ctrl = new AbortController();
  const t = setTimeout(() => { try { ctrl.abort(); } catch (e) { /* already done */ } }, 12000);
  try {
    const up = await fetch(
      UPSTREAM + "/api/slip?book=" + encodeURIComponent(book) +
        "&code=" + encodeURIComponent(code),
      { signal: ctrl.signal, headers: { Accept: "application/json" } });
    const text = await up.text();
    let body;
    try { body = JSON.parse(text); }
    catch (e) {
      return res.status(502).json({ success: false,
        error: "the reader sent no JSON (http " + up.status + ")" });
    }
    res.setHeader("Cache-Control", "no-store");
    /* Status passed through, not flattened. A 404 here means "no slip behind
       that code", which the page says out loud, and turning it into a 502
       would make a typo look like an outage. */
    return res.status(up.status).json(body);
  } catch (e) {
    return res.status(504).json({ success: false,
      error: "couldn't reach the booking service" });
  } finally {
    clearTimeout(t);
  }
};
