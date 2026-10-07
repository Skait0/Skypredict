"use strict";
/**
 * Owner, 7 Oct 2026: "i dont like that the defauly wizard shows first and
 * after a while, the selected wizard shows on the avatar."
 *
 * The header avatar is painted from the inline account script as soon as
 * /api/me answers; swAvatarKey, which knows the chosen portrait, is defined in
 * the deferred app bundle. When /api/me won that race the button showed
 * "fire" until the next repaint. paintButton now waits for the bundle.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("swAvatarKey lives in the deferred bundle, not in the inline account script", () => {
  /* If this ever moves inline, the wait below is no longer needed - and this
     test says so instead of leaving a guard nobody can explain. */
  const acct = src.indexOf('<script id="swAccount">');
  assert.ok(acct > 0, "inline account script found");
  assert.ok(src.indexOf("window.swAvatarKey=function") < acct, "swAvatarKey defined before (in the app script), not in #swAccount");
});

test("the header avatar waits for swAvatarKey instead of painting fire", () => {
  const i = src.indexOf("function paintButton(){");
  assert.ok(i > 0);
  const body = src.slice(i, i + 1400);
  const wait = body.indexOf("if(st.on&&!root.swAvatarKey&&d.readyState!==\"complete\"&&!st.avWait)");
  const show = body.indexOf("b.hidden=false;");
  assert.ok(wait > 0, "the wait is there");
  assert.ok(wait < show, "and it runs before the button is shown");
  assert.match(body, /d\.addEventListener\("DOMContentLoaded",paintButton\); root\.addEventListener\("load",paintButton\);/);
});
