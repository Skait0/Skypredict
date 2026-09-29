"use strict";
/* The small, sharp tools every auth module shares. Kept in one place so a
   token, a hash or a comparison is made exactly one way. */
const crypto = require("crypto");

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/;

function randomToken() { return crypto.randomBytes(32).toString("base64url"); }
function sha256hex(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function hmacHex(key, s) { return crypto.createHmac("sha256", String(key)).update(String(s)).digest("hex"); }

/* Equal-time comparison of two hex digests. A length mismatch or non-hex
   input is simply "not equal" - never a throw an attacker could time. */
function sameHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b) || a.length !== b.length || a.length % 2) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function normEmail(s) {
  if (typeof s !== "string") return null;
  const e = s.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/* "Chrome on Android" - enough for a reader to recognise their own device in
   "Your devices", never the raw user agent. */
function deviceLabel(ua) {
  const u = String(ua || "");
  if (!u) return "Unknown device";
  const os = /iPhone/.test(u) ? "iPhone" : /iPad/.test(u) ? "iPad" : /Android/.test(u) ? "Android"
    : /Windows/.test(u) ? "Windows" : /Mac OS X/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux" : "";
  const br = /SamsungBrowser/.test(u) ? "Samsung Internet" : /Edg\//.test(u) ? "Edge"
    : /OPR\/|Opera/.test(u) ? "Opera" : /Firefox|FxiOS/.test(u) ? "Firefox"
    : /CriOS|Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "";
  const label = br && os ? br + " on " + os : br || os || "Unknown device";
  return label.slice(0, 40);
}

module.exports = { randomToken, sha256hex, hmacHex, sameHex, normEmail, deviceLabel, TOKEN_RE, UUID_RE };
