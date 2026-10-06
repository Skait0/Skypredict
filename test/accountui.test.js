"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const PUB = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");

test("all 14 portraits ship, small", () => {
  for (const k of require("../lib/sync.js").AVATARS) {
    const f = path.join(PUB, "av", k + ".webp");
    assert.ok(fs.existsSync(f), k);
    assert.ok(fs.statSync(f).size < 20000, k + " under 20 KB");
  }
});

test("the header has no theme toggle and draws the avatar, not an initial", () => {
  assert.doesNotMatch(html, /id="tgl"/);
  assert.doesNotMatch(html, /\$\("tgl"\)/);
  assert.match(html, /function setTheme\(t\)/);                    // Settings still calls it
  const acct = /<script id="swAccount">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.match(acct, /ac-av/);
  assert.doesNotMatch(acct, /charAt\(0\)\|\|"\?"\)\.toUpperCase\(\)/);
});

test("swAvatarKey falls back to fire for anything not free", () => {
  const m = /\/\* SWAVATAR \*\/([\s\S]*?)\/\* \/SWAVATAR \*\//.exec(html);
  assert.ok(m);
  const run = (v) => { const w = {}; new Function("window", "localStorage", m[1])(w, { getItem: () => v }); return w.swAvatarKey(); };
  assert.strictEqual(run(null), "fire");
  assert.strictEqual(run("glass"), "glass");
  assert.strictEqual(run("gold"), "fire");
  assert.strictEqual(run('"><img'), "fire");
});

const UI = require("../public/account-ui.js");
const src = fs.readFileSync(path.join(PUB, "account-ui.js"), "utf8");

test("account-ui.js is ES5 and uses only tokens", () => {
  assert.doesNotMatch(src, /=>|\blet\s|\bconst\s|`|\bclass\s/);
  const hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => !/^#fff$/i.test(h));
  assert.deepStrictEqual(hex, []);
  assert.doesNotMatch(src, /Roboto|Download my data|—/);
});

test("the menu: name, email, plan, codes, four items, and no avatar", () => {
  const h = UI.menuHtml({ name: "Kayode", email: "k@x.ng", quota: { used: 3, limit: 10 }, slips: 24 });
  assert.match(h, /Kayode/); assert.match(h, /k@x\.ng/); assert.match(h, /Free plan/);
  assert.match(h, /3<\/span> of 10/);
  for (const w of ["Profile", "My slips", "Settings", "Sign out"]) assert.match(h, new RegExp(w));
  assert.doesNotMatch(h, /\/av\//, "the avatar is in the top bar right above; never twice");
});

test("unknown codes: no codes line at all", () => {
  assert.doesNotMatch(UI.menuHtml({ name: "A", email: "a@b.c", quota: null, slips: 0 }), /Codes today/);
});

test("names are escaped", () => {
  assert.doesNotMatch(UI.menuHtml({ name: "<img>", email: "a@b.c", quota: null, slips: 0 }), /<img>/);
});

test("first name from the email when none is saved", () => {
  assert.strictEqual(UI.firstNameOf("", "kayode.adebayo@gmail.com"), "Kayode");
  assert.strictEqual(UI.firstNameOf("Ada", "x@y.z"), "Ada");
  assert.strictEqual(UI.firstNameOf("", "123@y.z"), "You");
});

test("the page loads it and the old sheet is gone", () => {
  assert.match(html, /<script src="\/account-ui\.js" defer><\/script>/);
  assert.doesNotMatch(html, /acctSheet|Download my data/);
});
