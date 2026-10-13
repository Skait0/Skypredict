"use strict";

/* POST /api/push            - "send me the pick of the day"
 * DELETE /api/push          - "stop"
 * GET /api/push?a=note      - what the service worker shows for an empty push
 * GET /api/push?a=morning   - the 9am send (Vercel cron only)
 *
 * This route is unauthenticated and has to assume every caller is hostile. The
 * endpoint is allowlisted to the four real push services, because otherwise a
 * stranger hands us a URL and we POST to it from our own infrastructure every
 * morning. A subscription is linked to an account only when the reader is
 * signed in (sql/push_notes.sql), for "your slip landed".
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
const MAX_BODY = 12000;         /* same cap and shape as api/share.js's readBody */

/* Same pattern as api/share.js: stream and cap the raw body BEFORE JSON.parse,
   because per-field length checks in parse() run only after the whole body is
   already in memory - too late to bound an unauthenticated route. */
function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    if (req.body.length > MAX_BODY) return Promise.resolve(null);
    return Promise.resolve(req.body);
  }
  return new Promise((resolve) => {
    let s = "", over = false;
    req.on("data", (d) => {
      s += d;
      if (s.length > MAX_BODY) { over = true; req.destroy(); }
    });
    req.on("end", () => resolve(over ? null : s));
    req.on("error", () => resolve(null));
  });
}

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
    const body = await readBody(req);
    if (body === null) return res.status(400).json({ ok: false, why: "body too large" });
    const got = parse(body, { keysNeeded: false });
    /* An unsubscribe with a rubbish endpoint deletes nothing, and saying so is
       more useful than pretending it worked. */
    if (!got.ok) return res.status(400).json({ ok: false, why: got.why });
    const out = await DB.dropPushSubs([got.row.endpoint]);
    return res.status(out.ok ? 200 : 503).json({ ok: !!out.ok });
  }

  if (req.method === "GET") {
    const a = String((req.query || {}).a || "");
    if (a === "note") {
      const ep = String((req.query || {}).endpoint || "");
      if (!allowedEndpoint(ep)) return res.status(200).json({});
      return res.status(200).json(await noteFor(ep, Date.now()));
    }
    if (a === "morning") {
      if (!require("../lib/cronauth.js").allowed(req)) return res.status(401).json({ ok: false });
      const list = await DB.listPushSubs();
      if (!list.ok) return res.status(503).json({ ok: false, why: list.why });
      const out = await require("../lib/pushsend.js").pushTo(list.rows);
      return res.status(200).json(Object.assign({ ok: !!out, subs: list.rows.length }, out || { why: "no VAPID keys" }));
    }
    return res.status(405).json({ ok: false, why: "method" });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, why: "method" });

  const body = await readBody(req);
  if (body === null) return res.status(400).json({ ok: false, why: "body too large" });
  const got = parse(body);
  if (!got.ok) return res.status(400).json({ ok: false, why: got.why });
  const user = await userOf(req);
  const out = await DB.putPushSub(user ? Object.assign({ user_id: user }, got.row) : got.row);
  return res.status(out.ok ? 200 : 503).json({ ok: !!out.ok });
};

/* Signed in: the subscription is linked to the account, for "your slip
   landed". Any failure here just stores it unlinked. */
async function userOf(req) {
  if (process.env.AUTH_ENABLED !== "1") return null;
  try {
    const s = await require("../lib/auth/session.js").readSession(require("../lib/auth/db.js"), req, Date.now());
    return s.state === "ok" ? s.userId : null;
  } catch (e) { return null; }
}

/* What the worker shows for an empty push: this reader's own line if one is
   waiting (a slip landed overnight is held until the 9am push), else today's
   pick of the day. */
async function noteFor(endpoint, now) {
  const mine = await DB.takePushNote(endpoint);
  if (mine && mine.note && now - Date.parse(mine.note_at) < 24 * 3600e3) return mine.note;
  return potdNote(now);
}

function potdNote(now, data) {
  const { LAGOS_OFFSET_MS } = require("../lib/quota.js");
  const today = new Date(now + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
  let d = data;
  try { d = d || require("../public/predictions.json"); } catch (e) { d = {}; }
  /* The board may have been built yesterday, so today's pick can be potdNext. */
  const p = [d.potd, d.potdNext].find((x) => x && x.date === today);
  const f = p && (d.fixtures || []).find((x) => x.home === p.home && x.away === p.away && x.date === p.date);
  if (!f) return { title: "Today's picks are up 🧙", body: "Free picks and booking codes, ready to load.", url: "/" };
  return { title: "Pick of the day 🧙🔥", body: f.home + " vs " + f.away + " · " + f.tip + (f.ko ? " · " + f.ko : ""), url: "/" };
}

module.exports.parse = parse;
module.exports.potdNote = potdNote;
