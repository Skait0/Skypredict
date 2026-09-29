// test/security-headers.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const cfg = require("../vercel.json");

const site = (cfg.headers || []).find((h) => h.source === "/(.*)" && !h.has);
const get = (k) => site && (site.headers.find((h) => h.key === k) || {}).value;

test("every page carries the security headers", () => {
  assert.ok(site, "a header block for /(.*) without a host condition");
  assert.strictEqual(get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  assert.strictEqual(get("X-Content-Type-Options"), "nosniff");
  assert.strictEqual(get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.strictEqual(get("X-Frame-Options"), "DENY");
  assert.match(get("Permissions-Policy"), /camera=\(\)/);
  assert.match(get("Permissions-Policy"), /microphone=\(\)/);
  assert.match(get("Permissions-Policy"), /geolocation=\(\)/);
});

test("the CSP starts in report-only mode, reports to Sentry, and forbids framing", () => {
  const csp = get("Content-Security-Policy-Report-Only");
  assert.ok(csp);
  assert.strictEqual(get("Content-Security-Policy"), undefined, "not enforced until reports are clean (spec section 12)");
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /form-action 'self' https:\/\/accounts\.google\.com/);
  assert.match(csp, /report-uri https:\/\/o\d+\.ingest\.de\.sentry\.io\/api\/\d+\/security\/\?sentry_key=[0-9a-f]+/);
});

test("the account routes are wired and never open to other origins", () => {
  const rw = cfg.rewrites.map((r) => r.source + " -> " + r.destination);
  assert.ok(rw.includes("/api/auth/:path* -> /api/auth?route=:path*"));
  assert.ok(rw.includes("/api/account/:action -> /api/account?action=:action"));
  for (const f of ["api/auth.js", "api/me.js", "api/account.js"]) assert.ok(cfg.functions[f], f);
  assert.doesNotMatch(JSON.stringify(cfg), /Access-Control-Allow-Origin/i);
});
