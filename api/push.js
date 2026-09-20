"use strict";

/* POST /api/push   - "tell me when the day's code is up"
 * DELETE /api/push - "stop"
 *
 * There are no accounts here, so this route is unauthenticated and has to
 * assume every caller is hostile. Two things follow from that. The endpoint is
 * allowlisted to the four real push services, because otherwise a stranger
 * hands us a URL and we POST to it from our own infrastructure every morning.
 * And nothing personal is stored: a push subscription is an opaque endpoint,
 * not an identity.
 *
 * Unsubscribing has to actually work. One DELETE, the row is gone, no account
 * to log into and nothing to email. That is the whole reason it is a route and
 * not a support address.
 */

const { applyCache, NO_STORE } = require("../lib/cachepolicy.js");
const { allowedEndpoint } = require("../lib/vapid.js");
const DB = require("../lib/supabase.js");

const MAX_ENDPOINT = 1024;      /* real ones are ~200 chars */
const MAX_KEY = 256;

function parse(body, opts) {
  let o = body;
  if (typeof o === "string") {
    try { o = JSON.parse(o); } catch (e) { return { ok: false, why: "not json" }; }
  }
  if (!o || typeof o !== "object") return { ok: false, why: "not json" };
  const endpoint = String(o.endpoint || "");
  if (endpoint.length > MAX_ENDPOINT) return { ok: false, why: "endpoint too long" };
  if (!allowedEndpoint(endpoint)) return { ok: false, why: "not a push service" };
  /* An unsubscribe arrives after the browser has already thrown the keys away,
     and the row is keyed on endpoint regardless. */
  if (opts && opts.keysNeeded === false) return { ok: true, row: { endpoint } };
  const keys = o.keys || {};
  const p256dh = String(keys.p256dh || "");
  const auth = String(keys.auth || "");
  if (!p256dh || !auth) return { ok: false, why: "no keys" };
  if (p256dh.length > MAX_KEY || auth.length > MAX_KEY) return { ok: false, why: "keys too long" };
  return { ok: true, row: { endpoint, p256dh, auth } };
}

module.exports = async function handler(req, res) {
  applyCache(res, NO_STORE);

  if (req.method === "DELETE") {
    const got = parse(req.body, { keysNeeded: false });
    /* An unsubscribe with a rubbish endpoint deletes nothing, and saying so is
       more useful than pretending it worked. */
    if (!got.ok) return res.status(400).json({ ok: false, why: got.why });
    const out = await DB.dropPushSubs([got.row.endpoint]);
    return res.status(out.ok ? 200 : 503).json({ ok: !!out.ok });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, why: "method" });

  const got = parse(req.body);
  if (!got.ok) return res.status(400).json({ ok: false, why: got.why });
  got.row.ua = req.headers && req.headers["user-agent"];
  const out = await DB.putPushSub(got.row);
  return res.status(out.ok ? 200 : 503).json({ ok: !!out.ok });
};

module.exports.parse = parse;
