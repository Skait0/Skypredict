"use strict";
/* The door checks every account route shares. A state change must be a POST
   from our own origin carrying X-SW-Request - a header a cross-site form or
   image cannot send - so a forged request from another site is refused before
   any work is done. Spec section 5. */
const { sha256hex } = require("./crypto.js");

const ORIGIN = (process.env.SITE_ORIGIN || "https://www.soccerwizard.live").replace(/\/+$/, "");
const enabled = () => process.env.AUTH_ENABLED === "1";

function guardPost(req) {
  if (req.method !== "POST") return { status: 405, error: "method" };
  const h = req.headers || {};
  if (h["x-sw-request"] !== "1" || h.origin !== ORIGIN) return { status: 403, error: "forbidden" };
  return null;
}

async function readJson(req, maxBytes) {
  let b = req.body;
  if (typeof b === "string") { if (b.length > maxBytes) return null; try { b = JSON.parse(b); } catch (e) { return null; } }
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  return JSON.stringify(b).length > maxBytes ? null : b;
}

/* Where a sign-in may send the reader afterwards: our own paths only. */
function safeReturn(p) {
  if (typeof p !== "string" || p.length > 200) return "/";
  if (!/^\/(?![\/\\])[A-Za-z0-9\-._~\/?=&]*$/.test(p)) return "/";
  return p;
}

function ipKey(req) {
  const xf = String(((req.headers || {})["x-forwarded-for"]) || "").split(",")[0].trim();
  return sha256hex((process.env.AUTH_PEPPER || "") + ":ip:" + xf).slice(0, 32);
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function baseHeaders(res, cookies) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (cookies && cookies.length) res.setHeader("Set-Cookie", cookies);
}
function sendJson(res, status, obj, cookies) {
  baseHeaders(res, cookies);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).end(JSON.stringify(obj));
}
function sendHtml(res, status, heading, line, cookies) {
  baseHeaders(res, cookies);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(status).end("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\">" +
    "<title>" + esc(heading) + " | Soccerwizard</title><style>body{font-family:system-ui,sans-serif;background:#0D0D0F;" +
    "color:#F2F1F0;display:grid;place-items:center;min-height:90vh;margin:0;padding:24px;text-align:center}" +
    "a{color:#F2B84B;font-weight:700}</style></head><body><main><h1>" + esc(heading) + "</h1><p>" + esc(line) +
    "</p><p><a href=\"/\">Back to Soccerwizard</a></p></main></body></html>");
}
function redirect(res, location, cookies) {
  baseHeaders(res, cookies);
  res.setHeader("Location", location);
  res.status(302).end();
}
const notFound = (res) => sendJson(res, 404, { error: "not_found" });

module.exports = { ORIGIN, enabled, guardPost, readJson, safeReturn, ipKey, sendJson, sendHtml, redirect, notFound };
