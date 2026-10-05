"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

test("with accounts off, the privacy page is unchanged in substance", () => {
  const h = P.renderPrivacy("29 September 2026", false);
  assert.match(h, /There is no account/);
  assert.doesNotMatch(h, /If you sign in/);
});

test("with accounts on, it says what is kept, who sees it, for how long, and how to delete it", () => {
  const h = P.renderPrivacy("29 September 2026", true);
  assert.doesNotMatch(h, /There is no account/);
  for (const needle of [/If you sign in/, /email address/, /Google/, /devices/, /hashed|scrambled/, /IP address/,
    /Supabase/, /Resend/, /Cloudflare Turnstile/, /30 days/, /Download my data/, /Delete account/]) assert.match(h, needle);
});

test("terms gain an accounts section only when accounts exist", () => {
  assert.doesNotMatch(P.renderTerms("x", false), /<h2>Accounts<\/h2>/);
  const t = P.renderTerms("x", true);
  assert.match(t, /<h2>Accounts<\/h2>/);
  assert.match(t, /3 devices/);
});

test("privacy explains marketing email: opt-in only, how to stop, what is kept", () => {
  const h = P.renderPrivacy("29 September 2026", true);
  assert.match(h, /Picks by email/);
  assert.match(h, /only if you tick/i);
  assert.match(h, /unsubscribe/i);
});
