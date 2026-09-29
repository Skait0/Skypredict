"use strict";
/* Continue with Google: authorization code + PKCE, finished server to server.
   The ID token reaches us in the body of our own TLS call to Google's token
   endpoint, so (OIDC Core 3.1.3.7) its signature need not be re-checked; every
   claim is. Spec section 4.1. */
const crypto = require("crypto");
const { normEmail } = require("./crypto.js");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const challenge = (verifier) => crypto.createHash("sha256").update(String(verifier)).digest("base64url");

function authUrl(o) {
  const q = new URLSearchParams({
    response_type: "code", client_id: o.clientId, redirect_uri: o.redirectUri, scope: "openid email",
    state: o.state, nonce: o.nonce, code_challenge: challenge(o.verifier), code_challenge_method: "S256",
    prompt: "select_account",
  });
  return AUTH_URL + "?" + q.toString();
}

async function exchangeCode(o) {
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: o.code, code_verifier: o.verifier,
        client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri }).toString(),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.id_token === "string" ? j.id_token : null;
  } catch (e) { return null; }
}

function decodePayload(jwt) {
  const p = String(jwt == null ? "" : jwt).split(".");
  if (p.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(p[1])) return null;
  try {
    const o = JSON.parse(Buffer.from(p[1], "base64url").toString("utf8"));
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch (e) { return null; }
}

function checkClaims(c, o) {
  if (!c) return { ok: false, why: "no_token" };
  if (!ISSUERS.includes(c.iss)) return { ok: false, why: "iss" };
  const audOk = c.aud === o.clientId || (Array.isArray(c.aud) && c.aud.includes(o.clientId) && c.azp === o.clientId);
  if (!audOk) return { ok: false, why: "aud" };
  const now = Math.floor(o.nowMs / 1000);
  if (typeof c.exp !== "number" || c.exp <= now) return { ok: false, why: "exp" };
  if (typeof c.iat !== "number" || c.iat > now + 60) return { ok: false, why: "iat" };
  if (typeof c.nonce !== "string" || c.nonce !== o.nonce) return { ok: false, why: "nonce" };
  if (c.email_verified !== true && c.email_verified !== "true") return { ok: false, why: "unverified" };
  if (typeof c.sub !== "string" || !c.sub || c.sub.length > 255) return { ok: false, why: "sub" };
  const email = normEmail(c.email);
  if (!email) return { ok: false, why: "email" };
  return { ok: true, sub: c.sub, email };
}

module.exports = { challenge, authUrl, exchangeCode, decodePayload, checkClaims };
