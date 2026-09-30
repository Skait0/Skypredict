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
  const all = (cfg.headers || []).filter((h) => h.source === "/(.*)" && !h.has).flatMap((h) => h.headers);
  const cspBlock = cfg.headers.find((h) => h.headers.some((x) => x.key === "Content-Security-Policy-Report-Only"));
  const csp = cspBlock && cspBlock.headers.find((x) => x.key === "Content-Security-Policy-Report-Only").value;
  assert.ok(csp);
  assert.ok(!all.some((x) => x.key === "Content-Security-Policy"), "not enforced until reports are clean (spec section 12)");
  // Vercel's preview bot is not a visitor; its reports were pure noise.
  const skip = new RegExp("^(?:" + cspBlock.missing[0].value + ")$");
  assert.ok(skip.test("soccerwizard-2o5xqgi7q-soccerwizard.vercel.app"));
  assert.ok(!skip.test("www.soccerwizard.live") && !skip.test("skypredict-theta.vercel.app"));
  // Google Translate must keep working once the CSP is enforced.
  assert.match(csp, /connect-src[^;]*https:\/\/translate\.googleapis\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/translate\.googleapis\.com/);
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

function allCspValues() {
  const out = [];
  for (const h of cfg.headers || []) for (const x of h.headers || []) if (x.key.startsWith("Content-Security-Policy")) out.push(x.value);
  return out;
}

test("CSP lets Google Identity Services load its script, frame, style and calls", () => {
  assert.ok(allCspValues().length);
  for (const csp of allCspValues()) {
    assert.match(csp, /script-src[^;]*https:\/\/accounts\.google\.com\/gsi\/client/);
    assert.match(csp, /frame-src[^;]*https:\/\/accounts\.google\.com\/gsi\//);
    assert.match(csp, /connect-src[^;]*https:\/\/accounts\.google\.com\/gsi\//);
    assert.match(csp, /style-src[^;]*https:\/\/accounts\.google\.com\/gsi\/style/);
  }
});
