"use strict";
/* 23 Oct 2026, Sentry "TypeError: Load failed" at sync: the keepalive POST /api/me sent when the
   page is hidden had only a try/catch, which cannot catch a rejected promise, so an iPhone losing
   the network on the way out reported it. The next load reconciles, so the failure is dropped. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8").replace(/\r\n/g, "\n");

test("the hidden-page keepalive sync never leaves a rejected fetch unhandled", () => {
  const at = HTML.indexOf("keepalive:true,credentials:\"same-origin\"");
  assert.ok(at > 0, "keepalive sync fetch not found");
  const call = HTML.slice(at, HTML.indexOf("}catch(e){}", at));
  assert.match(call, /\)\.catch\(function\(\)\{\}\);\s*$/);
});
