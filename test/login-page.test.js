"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

const html = P.renderLogin({ siteKey: "0x4AAAAAAAtest_Key-1", gcid: "123-abc.apps.googleusercontent.com" });

test("the page mounts the shared sign-in sheet full-page, with its keys", () => {
  assert.match(html, /<div id="swLogin"><\/div>/);
  assert.match(html, /<script src="\/spell\.js" defer><\/script>/);
  assert.match(html, /<script src="\/signin\.js" defer><\/script>/);
  assert.match(html, /<meta name="sw-ts" content="0x4AAAAAAAtest_Key-1">/);
  assert.match(html, /<meta name="sw-gcid" content="123-abc\.apps\.googleusercontent\.com">/);
  assert.match(html, /swSignIn\.open\(\{action:"slips",page:true/);
});

test("it is never indexed and carries no secret", () => {
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /TURNSTILE_SECRET|GOOGLE_CLIENT_SECRET|AUTH_PEPPER|RESEND_API_KEY|service_role/);
});

test("keys that are not plain keys are dropped, not injected", () => {
  const bad = P.renderLogin({ siteKey: '"><script>alert(1)</script>', gcid: '"><b>' });
  assert.doesNotMatch(bad, /alert\(1\)|sw-gcid|sw-ts/);   // the page shell has its own <b>, so check the metas are absent instead
});

test("after sign-in it goes back to a same-site return path only", () => {
  assert.match(html, /return=/);
  assert.match(html, /\^\\\/\(\?!\[\\\/\\\\\]\)/);    // the same safe-return regex the old page used
});
