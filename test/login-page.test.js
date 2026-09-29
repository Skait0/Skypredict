"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

const html = P.renderLogin({ siteKey: "0x4AAAAAAAtest_Key-1" });
// Only the login script: the shared page shell may carry other inline scripts.
const script = (html.match(/<script>([\s\S]*?)<\/script>/g) || []).filter((s) => s.includes("lgGoogle")).join("\n");

test("the page offers Google and the email code, with the right keyboard for the code", () => {
  assert.match(html, /id="lgGoogle"/);
  assert.match(html, /id="lgEmail"[^>]*type="email"/);
  assert.match(html, /id="lgCode"[^>]*inputmode="numeric"/);
  assert.match(html, /id="lgCode"[^>]*autocomplete="one-time-code"/);
  assert.match(html, /data-sitekey="0x4AAAAAAAtest_Key-1"/);
  assert.match(html, /<script src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js" async defer><\/script>/);
});

test("it is never indexed and carries no secret", () => {
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /TURNSTILE_SECRET|GOOGLE_CLIENT_SECRET|AUTH_PEPPER|RESEND_API_KEY|service_role/);
});

test("a site key that is not a plain key is dropped, not injected", () => {
  assert.doesNotMatch(P.renderLogin({ siteKey: '"><script>alert(1)</script>' }), /alert\(1\)/);
});

test("the script is ES5, sends the CSRF header, and knows every error", () => {
  assert.doesNotMatch(script, /=>|\blet\s|\bconst\s|`/);
  assert.match(script, /X-SW-Request/);
  for (const e of ["bad_email", "bot", "slow_down", "send_failed", "wrong", "dead", "expired", "used"]) assert.match(script, new RegExp('"' + e + '"'), e);
  assert.match(script, /FBAN\|FBAV\|Instagram\|Twitter/, "in-app browsers detected");
});

test("the script does not contain the cross-browser handoff route", () => {
  assert.doesNotMatch(script, /\/api\/auth\/handoff/);
});

test("the installed iPhone app gets its own flag", () => {
  assert.match(html, /id="lgIosApp"/);
});

test("the return target uses the same allowlist as safeReturn, not just a leading-slash check", () => {
  assert.ok(script.indexOf('if(ret.length>200||!/^\\/(?![\\/\\\\])[A-Za-z0-9\\-._~\\/?=&]*$/.test(ret)) ret="/";') !== -1,
    "expected the safeReturn allowlist regex in the login script");
});
