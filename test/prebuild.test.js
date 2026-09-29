"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");

test("index.html only carries the sw-auth meta when AUTH_ENABLED is on, injected where index.html is already rewritten", () => {
  const m = /function injectAuthMeta\(\)\s*\{[\s\S]*?\n\}/.exec(src);
  assert.ok(m, "an injectAuthMeta function");
  assert.match(m[0], /AUTH_ENABLED/, "gated on AUTH_ENABLED");
  assert.match(m[0], /sw-auth/, "writes the sw-auth meta tag");
  assert.match(m[0], /process\.env\.VERCEL|process\.env\.SPLIT/, "only rewrites the tracked index.html where the checkout is disposable, like applyOrigin/stampCard");
});

test("the login page is written only when AUTH_ENABLED is on", () => {
  const m = /AUTH_ENABLED[\s\S]{0,80}login\.html|login\.html[\s\S]{0,80}AUTH_ENABLED/.exec(src);
  assert.ok(m, "login.html write is guarded by AUTH_ENABLED nearby in source");
});
