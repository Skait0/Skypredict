"use strict";

/* Sending empty pushes (13 Oct 2026). Moved here from scripts/pushcode.js when
 * the daily-code announcement became the 9am pick of the day, sent by Vercel
 * cron (api/push.js?a=morning) instead of the mint workflow. GitHub had no
 * Supabase secrets and the deploy wait timed out, so that send never reached a
 * single reader. Also used for "your slip landed" (api/tgfollow.js).
 *
 * The push carries no payload. The service worker asks /api/push?a=note what
 * to show.
 */

const { jwtFor } = require("./vapid.js");
const DB = require("./supabase.js");

async function sendAll(subs, deps) {
  const fetchImpl = deps.fetchImpl || fetch;
  const out = { sent: 0, failed: 0, dead: [] };
  const queue = subs.slice();
  async function worker() {
    for (;;) {
      const s = queue.shift();
      if (!s) return;
      try {
        const r = await fetchImpl(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: "vapid t=" + deps.jwt(s.endpoint) + ", k=" + deps.publicKey,
            TTL: "3600",
            Urgency: "normal",
          },
          /* A push service holding the socket open must not eat the whole run. */
          signal: AbortSignal.timeout(10000),
        });
        if (r.status === 404 || r.status === 410) out.dead.push(s.endpoint);
        else if (r.ok) out.sent++;
        else out.failed++;                 /* 429 and 5xx: the next push retries */
      } catch (e) {
        /* Including the abort. A timeout says nothing about the subscription,
           so the row stays. */
        out.failed++;
      }
    }
  }
  await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(worker));
  return out;
}

/* Sign with the env keys, send, and drop what the push service says is gone.
   Null when the keys are not set here. */
async function pushTo(rows, deps) {
  deps = deps || {};
  const priv = process.env.VAPID_PRIVATE_KEY, pub = process.env.VAPID_PUBLIC_KEY;
  if (!priv || !pub) return null;
  /* One JWT per push service, not per subscriber: the audience is the origin. */
  const cache = new Map();
  const jwt = (endpoint) => {
    const aud = new URL(endpoint).origin;
    if (!cache.has(aud)) cache.set(aud, jwtFor(endpoint, { privateKeyB64: priv }));
    return cache.get(aud);
  };
  const out = await sendAll(rows, { jwt, publicKey: pub, fetchImpl: deps.fetchImpl });
  let dropped = 0;
  if (out.dead.length) dropped = (await (deps.drop || DB.dropPushSubs)(out.dead)).dropped || 0;
  return { sent: out.sent, failed: out.failed, dropped };
}

module.exports = { sendAll, pushTo };
