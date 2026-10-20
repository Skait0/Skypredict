"use strict";
/* The Play Store app (owner, 16 Oct 2026): a TWA of the site that sells nothing,
   because Google Play requires its own billing for anything bought in an app. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("inside the app, every way to buy the pass is gone", () => {
  const idx = read("public/index.html"), ui = read("public/account-ui.js"), pages = read("lib/pages.js");
  assert.match(idx, /src=twa\(&\|\$\)\/\.test\(location\.search\)\|\|document\.referrer\.indexOf\("android-app:\/\/"\)===0/, "the app is recognised");
  assert.match(idx, /\.sw-twa \[data-plus\],\.sw-twa \.code-plusgo\{display:none!important\}/, "no pass buttons");
  assert.match(ui, /function plus\(\)\{\s*\/\*[^*]*\*\/\s*if\(d\.documentElement\.classList\.contains\("sw-twa"\)\) return;/, "the pass panel never opens");
  assert.match(idx, /kind==="capped"&&d\.plan==="free"&&document\.documentElement\.classList\.contains\("sw-twa"\)/, "the limit message has no pitch");
  assert.match(pages, /sessionStorage\.getItem\("sw\.twa"\)==="1"\)\{ location\.replace\("\/"\)/, "the pass page sends the app home");
});

test("the site vouches for the app (Digital Asset Links)", () => {
  const al = JSON.parse(read("public/.well-known/assetlinks.json"));
  assert.equal(al[0].target.package_name, "live.soccerwizard.app");
  assert.ok(al[0].target.sha256_cert_fingerprints.length >= 1);
  assert.deepEqual(al[0].relation, ["delegate_permission/common.handle_all_urls"]);
});

/* Google Play: no "call to action to wager" in the app (owner, 20 Oct 2026). */
test("in the app no button opens a bookie's betslip; the code, Copy and a paste line stay", () => {
  const html = read("public/index.html");
  assert.ok(html.includes(".sw-twa .code-opens .code-open,.sw-twa .code-two,.sw-twa .sp-open,.sw-twa .sc-go-primary .sc-lbl>span{display:none!important}"));
  assert.ok(html.includes(".sw-twa .code-paste--twa{display:block}"));
  assert.ok(html.includes("<span class='code-paste code-paste--twa'>Paste this code into the booking code box "));
  assert.ok(!/\.sw-twa[^{]*\.code-copy[^{]*\{display:none/.test(html), "Copy is never hidden");
});

test("the built pages (Daily codes, matches) hide Load it and Download app in the app", () => {
  const P = require("../lib/pages.js");
  const src = read("lib/pages.js");
  assert.ok(src.includes(".sw-twa .ck-go,.sw-twa .code-row a,.sw-twa .tn-inst{display:none!important}"));
  assert.strictEqual(src.split("${TWA_HEAD}").length - 1, 2, "both page heads carry it");
  assert.ok(P);
});

test("the app opening runs once per app open, in the app only, and gets out of the way", () => {
  const html = read("public/index.html");
  assert.ok(html.includes('if(sessionStorage.getItem("sw.twa")==="1"&&sessionStorage.getItem("sw.open")!=="1"){'), "app only, once a session");
  assert.ok(html.includes("#swOpen{display:none}"), "hidden on the website");
  assert.ok(/document\.documentElement\.classList\.remove\("sw-open"\); if\(o\.parentNode\) o\.parentNode\.removeChild\(o\); \},1600\)/.test(html), "removed after 1.6s");
  assert.ok(html.includes('o.querySelector("img").setAttribute("src","/fw/app-open.webp")'), "the icon is fetched only in the app");
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{\n  \.sw-open #swOpen\{animation:soOut/.test(html), "reduced motion gets a plain fade");
});
