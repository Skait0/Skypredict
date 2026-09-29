"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
const { applyAuthMeta } = require("../scripts/prebuild.js");
const realHtml = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("index.html only rewrites where the checkout is disposable, like applyOrigin/stampCard", () => {
  const m = /function injectAuthMeta\(\)\s*\{[\s\S]*?\n\}/.exec(src);
  assert.ok(m, "an injectAuthMeta function");
  assert.match(m[0], /process\.env\.VERCEL|process\.env\.SPLIT/, "only rewrites the tracked index.html where the checkout is disposable, like applyOrigin/stampCard");
});

test("the login page is written only when AUTH_ENABLED is on", () => {
  const m = /AUTH_ENABLED[\s\S]{0,80}login\.html|login\.html[\s\S]{0,80}AUTH_ENABLED/.exec(src);
  assert.ok(m, "login.html write is guarded by AUTH_ENABLED nearby in source");
});

test("applyAuthMeta actually adds the tag against the real page - the idempotency check must not be fooled by boot()'s own guard string, which is already in the page and also contains name=\"sw-auth\"", () => {
  assert.match(realHtml, /name="sw-auth"/, "sanity: the page's boot() guard already contains this substring before any injection");
  const once = applyAuthMeta(realHtml, "1");
  assert.strictEqual((once.match(/<meta name="sw-auth" content="1">/g) || []).length, 1,
    "the tag must be injected exactly once");
  const twice = applyAuthMeta(once, "1");
  assert.strictEqual((twice.match(/<meta name="sw-auth" content="1">/g) || []).length, 1,
    "re-applying must not add it a second time");
});

test("applyAuthMeta adds nothing when AUTH_ENABLED is unset", () => {
  const off = applyAuthMeta(realHtml, undefined);
  assert.strictEqual(off, realHtml);
  assert.doesNotMatch(off, /<meta name="sw-auth"/);
});
