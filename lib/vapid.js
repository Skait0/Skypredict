"use strict";

/* VAPID: proving to a push service that this push came from us.
 *
 * There is no payload, so there is no encryption here. An empty push needs one
 * signed ES256 JWT and nothing else, which is the only reason this repo can do
 * web push with zero dependencies. If a payload is ever added, AES128-GCM and
 * the reader's p256dh/auth keys come with it, and this file stops being 60
 * lines.
 */

const crypto = require("crypto");
const { LAGOS_OFFSET_MS } = require("./quota.js");

/* The four push services a real browser subscribes to. The endpoint arrives
   from the reader's browser through an unauthenticated route, so without this
   list we would be POSTing daily to any URL a stranger cared to submit. */
const HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
];

function allowedEndpoint(url) {
  let u;
  try { u = new URL(String(url || "")); } catch (e) { return false; }
  if (u.protocol !== "https:") return false;
  /* Suffix match on a dot boundary. A plain endsWith would accept
     fcm.googleapis.com.evil.example, and a plain includes would accept
     anything at all. */
  return HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
}

function b64url(buf) { return Buffer.from(buf).toString("base64url"); }

function jwtFor(endpoint, opts) {
  opts = opts || {};
  const now = Math.floor((opts.nowMs === undefined ? Date.now() : opts.nowMs) / 1000);
  const ttl = opts.ttlSec || 12 * 3600;          /* well inside the 24h cap */
  const head = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64url(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: now + ttl,
    sub: opts.subject || "mailto:tobi@soccerwizard.live",
  }));
  const key = crypto.createPrivateKey({
    key: Buffer.from(opts.privateKeyB64, "base64"), format: "der", type: "pkcs8",
  });
  /* ieee-p1363 is raw r||s. The default is DER, which every push service
     rejects with a bare 401. */
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body),
    { key, dsaEncoding: "ieee-p1363" });
  return head + "." + body + "." + b64url(sig);
}

/* 22:00-06:00 Lagos. The mint lands around midday UTC, so on a normal day this
   decides nothing. It exists for the day GitHub's queue slips or somebody runs
   workflow_dispatch at night: the failure mode is waking people up, and that
   is a failure you only get to make once. */
function quietHours(nowMs) {
  const h = new Date((nowMs === undefined ? Date.now() : nowMs) + LAGOS_OFFSET_MS).getUTCHours();
  return h >= 22 || h < 6;
}

module.exports = { HOSTS, allowedEndpoint, jwtFor, quietHours };
