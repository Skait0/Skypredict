"use strict";
/* Maintenance mode and Cloudflare's error page (owner, 13 Oct 2026: "dont you
   think we should have maintenance page or something?" ... "lets do them"). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const F = require("../lib/flags.js");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("the switch survives cleaning; anything but true is off", () => {
  assert.deepStrictEqual(F.clean({ maint: true, maintMsg: "  Back  by 8pm " }),
    { booksOff: [], notice: "", maint: true, maintMsg: "Back by 8pm", pause: {} });
  assert.strictEqual(F.clean({ maint: "yes" }).maint, false);
  assert.strictEqual(F.clean({ maintMsg: "x".repeat(500) }).maintMsg.length, F.MAINT_MAX);
});

test("maintenance stops every bookie at the booking route", () => {
  assert.match(read("lib/flags.js"), /return f\.maint \|\| f\.booksOff\.includes/);
});

test("saving a bookie switch or the notice never clears maintenance", () => {
  assert.match(read("public/account-ui.js"), /a\.req\("POST","\/api\/account\/setflags",Object\.assign\(\{\},flags,next\)/);
});

test("readers get the page; the admin keeps the site with a line saying so", () => {
  const html = read("public/index.html");
  assert.match(html, /if\(f&&f\.maint\) swMaint\(f\.maintMsg\);/);
  const i = html.indexOf("function swMaint(");
  const fn = html.slice(i, html.indexOf("\n}\n", i));
  assert.match(fn, /localStorage\.getItem\("sw\.role"\)==="admin"/);
  assert.match(fn, /textContent=msg\|\|/, "the admin's message is text, never HTML");
});

test("Cloudflare's page stands alone: nothing loaded from the site, and the token is there", () => {
  const down = read("public/down.html");
  assert.ok(down.includes("::CLOUDFLARE_ERROR_500S_BOX::"));
  assert.doesNotMatch(down, /<(img|script|link)\b/i, "when the site is down, nothing of it loads");
  assert.match(down, /<meta name="robots" content="noindex">/);
});
