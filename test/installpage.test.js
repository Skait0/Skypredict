"use strict";
/* /install - the step-by-step install page (owner, 29 Sep 2026). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const P = require("../lib/pages.js");
const ROOT = path.join(__dirname, "..");

test("the page covers every browser a reader here uses, and carries its own card", () => {
  const h = P.renderInstall();
  for (const w of ["chrome", "samsung", "iphone", "opera", "computer"])
    assert.match(h, new RegExp('data-way="' + w + '"'), w);
  assert.match(h, /og-install\.png/, "its own share card");
  assert.match(h, /og:image:width" content="1200"/);
  assert.match(h, /rel="manifest"/, "Chrome only offers Install on a page that links the manifest");
  assert.match(h, /serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(h, /Add page to<\/b>, then <b>Home screen/, "Samsung's own menu, not Chrome's 3 dots");
  const js = h.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(js), "the page script parses");
  assert.ok(fs.statSync(path.join(ROOT, "public", "og-install.png")).size > 10000, "the card exists");
});

test("every other page keeps the shared card", () => {
  assert.match(P.renderPrivacy("2026-09-29"), /og-card\.png/);
});

test("the build writes it, the footer links it, and the home page's fallback opens it", () => {
  assert.match(fs.readFileSync(path.join(ROOT, "scripts", "prebuild.js"), "utf8"), /\["\/install", \(\) => P\.renderInstall\(\)\]/);
  assert.match(P.pageFooter(), /href="\/install"/);
  const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(src, /function installGuide\(\)\{\s*try\{ location\.href="\/install"; \}/);
  assert.doesNotMatch(src, /swToast\(installHint\(\),'ok','ins'\);\s*\n\s*\}\s*\n/, "no vanishing toast as the last word");
});

test("an install icon sits in the top bar, only where the app is not installed", () => {
  /* Owner, 29 Sep 2026: "can we put an icon at the top where its more visible?" */
  const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
  assert.match(src, /<a class="tgl hsoc hsoc-inst" id="hdInstall" href="\/install"[^>]*hidden>/,
    "home: starts hidden until the page knows");
  assert.match(src, /hd\.hidden = _standalone \|\| _installed;/, "home: follows the install answer, not 'Not now'");
  assert.match(P.renderConvertPage(), /class="tn-inst" href="\/install"/, "static pages carry it too");
  assert.doesNotMatch(P.renderInstall(), /class="tn-inst"/, "but not the install page itself");
});

test("inside the app the install links are gone, and an installed phone is told so", () => {
  assert.match(P.pageFooter(), /class="fl-inst" href="\/install"/);
  assert.match(P.renderPrivacy("2026-09-29"), /@media \(display-mode: standalone\)\{\.fl-inst,\.tn-inst\{display:none!important\}\}/);
  const h = P.renderInstall();
  assert.match(h, /id="instHave" hidden><b>Already installed on this phone\.<\/b>/);
  assert.match(h, /getInstalledRelatedApps\(\)\.then\(function\(x\)\{\s*if\(!x\|\|!x\.length\) return;\s*d\.getElementById\("instHave"\)\.hidden=false;/);
});
