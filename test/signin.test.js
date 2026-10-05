"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "signin.js"), "utf8");
const S = require("../public/signin.js");

test("signin.js is ES5 and uses no raw colours but white", () => {
  assert.doesNotMatch(src, /=>|\blet\s|\bconst\s|`|\bclass\s/);
  const hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => !/^#fff$/i.test(h));
  assert.deepStrictEqual(hex, []);
});

test("copy is exact", () => {
  assert.strictEqual(S.WORDING, "Email me the wizard's best picks. Unsubscribe any time.");
  assert.deepStrictEqual(S.HEAD, { book: "book this slip", build: "build a slip", slips: "see your slips" });
  assert.match(src, /Free\. Your slips follow you to every phone and laptop\./);
});

test("every POST carries the CSRF header and the opt-in rides on sign-in, not on send", () => {
  assert.match(src, /X-SW-Request/);
  assert.match(src, /\/api\/auth\/google\/onetap/);
  assert.match(src, /\/api\/auth\/email\/verify"[^;]*optin/);
  assert.match(src, /\/api\/auth\/google\/prepare"[^;]*optin/);
  assert.doesNotMatch(src, /\/api\/auth\/email\/send"[^;]*optin/);
});

test("in-app browsers and the installed iPhone app get email first", () => {
  const ua = "Mozilla/5.0 (iPhone) Twitter for iPhone";
  assert.deepStrictEqual(S.env(ua, false), { inapp: true, iosApp: false, standalone: false });
  assert.deepStrictEqual(S.env("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari", true), { inapp: false, iosApp: true, standalone: true });
  assert.strictEqual(S.env("Mozilla/5.0 (Linux; Android 14) Chrome/120", false).inapp, false);
  assert.strictEqual(S.env("Mozilla/5.0 (Linux; Android 14; wv) Chrome/120", false).inapp, true);
});

test("every server error has words", () => {
  assert.match(S.errText(0, {}), /No connection/);
  assert.match(S.errText(401, { error: "google_failed" }), /Google sign-in didn't finish/);
  assert.match(S.errText(503, { error: "google_down" }), /Google is slow right now/);
  assert.match(S.errText(429, { error: "slow_down", minutes: 15 }), /15 minutes/);
  assert.match(S.errText(400, { error: "wrong", left: 1 }), /1 try left/);
  for (const e of ["bad_email", "bot", "send_failed", "dead", "expired", "used"]) assert.ok(S.errText(400, { error: e }).length > 10, e);
});

test("tokens fall back to the static pages' names", () => {
  assert.match(S.TOKENS, /--si-act:var\(--red-fill,var\(--brand\)\)/);
  assert.match(S.TOKENS, /--si-odds:var\(--win,var\(--accent\)\)/);
  assert.match(S.TOKENS, /--si-card2:var\(--card-2,var\(--card2\)\)/);
});
