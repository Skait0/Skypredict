"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const PUB = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");

test("every portrait ships, small", () => {
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
  const run = (v) => { const w = {}; new Function("window", "localStorage", m[1])(w, { getItem: (x) => (x === "sw.avatar" ? v : null) }); return w.swAvatarKey(); };
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

test("picker: free gets six, 19 locked skins, owner three and personal never shown; chosen one ringed", () => {
  assert.deepStrictEqual(UI.AV_FREE, ["fire", "8bit", "2bit", "lino", "glass", "halo"]);
  const h = UI.pickerHtml("glass", "free");
  assert.strictEqual((h.match(/data-av=/g) || []).length, 6);
  assert.strictEqual((h.match(/disabled/g) || []).length, 19);
  for (const k of UI.AV_PERSONAL) assert.doesNotMatch(h, new RegExp("/av/" + k + "\\."), k);
  assert.match(h, /data-av="glass" aria-pressed="true"/);
  assert.match(h, /Skins/); assert.match(h, /Unlock with plans/);
  for (const k of UI.AV_OWNER) assert.doesNotMatch(h, new RegExp("/av/" + k + "\."), k);
  assert.strictEqual(UI.pickerHtml("glass"), h, "no role reads as free");
});

test("picker: ff picks all 25, admin all 28, a future paid role gets the skins, no locked row", () => {
  const ff = UI.pickerHtml("gold", "ff"), ad = UI.pickerHtml("lich", "admin"), pro = UI.pickerHtml("gold", "pro");
  assert.strictEqual((ff.match(/data-av=/g) || []).length, 25);
  assert.strictEqual((ad.match(/data-av=/g) || []).length, 28);
  assert.strictEqual(pro, ff);
  for (const h of [ff, ad]) for (const k of UI.AV_PERSONAL) assert.doesNotMatch(h, new RegExp("/av/" + k + "\\."), k);
  for (const h of [ff, ad]) { assert.doesNotMatch(h, /disabled|Unlock with plans/); }
  for (const k of UI.AV_OWNER) assert.doesNotMatch(ff, new RegExp("/av/" + k + "\."), k);
  assert.match(ad, /data-av="lich" aria-pressed="true"/);
});

test("client avatar lists match lib/roles.js, in page and in account-ui", () => {
  const R = require("../lib/roles.js");
  assert.deepStrictEqual(UI.AV_FF, R.FF_AVATARS);
  assert.deepStrictEqual(UI.AV_OWNER.slice().sort(), R.OWNER_AVATARS.slice().sort());
  const m = /\/\* SWAVATAR \*\/([\s\S]*?)\/\* \/SWAVATAR \*\//.exec(html)[1];
  const allowed = (role) => require("../lib/sync.js").AVATARS.filter((k) => {
    const w = {}; new Function("window", "localStorage", m)(w, { getItem: (x) => (x === "sw.role" ? role : x === "sw.personal" ? null : k) });
    return w.swAvatarKey() === k;
  }).sort();
  assert.deepStrictEqual(allowed(null), R.avatarsFor("free").sort());
  assert.deepStrictEqual(allowed("ff"), R.avatarsFor("ff").sort());
  assert.deepStrictEqual(allowed("admin"), R.avatarsFor("admin").sort());
});

test("personal portrait: only where /api/me granted it, on any role, picker and page agree", () => {
  const m = /\/\* SWAVATAR \*\/([\s\S]*?)\/\* \/SWAVATAR \*\//.exec(html)[1];
  const key = (role, personal) => { const w = {};
    new Function("window", "localStorage", m)(w, { getItem: (x) => (x === "sw.role" ? role : x === "sw.personal" ? personal : "dread") });
    return w.swAvatarKey(); };
  for (const r of [null, "ff", "admin"]) {
    assert.strictEqual(key(r, null), "fire", String(r));
    assert.strictEqual(key(r, "dread"), "dread", String(r));
  }
  assert.strictEqual(key("admin", "storm,bogus"), "fire", "only personal keys count");
  const fr = UI.pickerHtml("dread", "free", "dread"), ff = UI.pickerHtml("dread", "ff", "dread");
  assert.strictEqual((fr.match(/data-av=/g) || []).length, 7);
  assert.strictEqual((ff.match(/data-av=/g) || []).length, 26);
  for (const h of [fr, ff]) assert.match(h, /data-av="dread" aria-pressed="true"/);
  assert.doesNotMatch(UI.pickerHtml("x", "free", "storm"), /data-av="storm"/);
});

test("picker rows: no portrait alone on the last row", () => {
  const cols = (h) => { const c = /grid-template-columns:repeat\((\d+)/.exec(h.split("swa-lock")[0]); return c ? +c[1] : 6; };
  for (const [role, p] of [["free"], ["free", "dread"], ["ff"], ["ff", "dread"], ["admin"]]) {
    const h = UI.pickerHtml("fire", role, p), n = (h.match(/data-av=/g) || []).length;
    assert.notStrictEqual(n % cols(h), 1, role + " " + n);
  }
  assert.notStrictEqual(UI.AV_FF.length - UI.AV_FREE.length, 5 * 4 + 1); // locked row is 5 a row
});

test("menu: plan label from the account, Admin item only for admin, admin codes say no limit", () => {
  const base = { name: "A", email: "a@b.c", quota: null, slips: 0 };
  const fr = UI.menuHtml(base);
  const ff = UI.menuHtml(Object.assign({}, base, { role: "ff", plan: "Family & friends", quota: { used: 4, limit: 100 } }));
  const ad = UI.menuHtml(Object.assign({}, base, { role: "admin", plan: "Admin" }));
  assert.doesNotMatch(fr, /data-go='admin'/); assert.doesNotMatch(ff, /data-go='admin'/);
  assert.match(ad, /data-go='admin'/); assert.match(ad, />Admin</);
  assert.match(ff, /Family &amp; friends/); assert.match(ff, /4<\/span> of 100/);
  assert.match(ad, /swa-plan swa-gold'>Admin/); assert.match(ad, /No limit/); assert.doesNotMatch(ad, /swa-bar/);
});

test("subscription card follows the plan", () => {
  const p = (role, plan) => UI.profileHtml({ name: "A", avatar: "fire", role, plan, record: { built: 0, won: 0, settled: 0 }, quota: null });
  assert.match(p("ff", "Family & friends"), /100 codes a day/);
  assert.doesNotMatch(p("ff", "Family & friends"), /More plans soon/);
  assert.match(p("admin", "Admin"), /No limit/);
  assert.match(p(undefined, undefined), /Free plan[\s\S]*10 codes a day[\s\S]*More plans soon/);
});

test("admin view: form, rows with since and Remove, emails escaped", () => {
  const h = UI.adminHtml([{ email: "<b>x\"@y.z", created_at: "2026-10-01T10:00:00Z" }]);
  assert.match(h, /Give Family &amp; friends/);
  assert.match(h, /since /); assert.match(h, /Remove/);
  assert.doesNotMatch(h, /<b>x/); assert.match(h, /&lt;b&gt;x&quot;@y\.z/);
  assert.match(UI.adminHtml([]), /No one yet/);
  for (const e of ['req("GET","/api/account/grants"', 'req("POST","/api/account/grant"', 'req("POST","/api/account/revoke"'])
    assert.ok(src.includes(e), e);
});

test("record: one card, won big, the rate only over settled slips", () => {
  const h = UI.recordHtml({ built: 24, won: 6, settled: 21 });
  assert.match(h, />6</); assert.match(h, /of 21 settled, 29%/); assert.match(h, />24</);
  assert.doesNotMatch(UI.recordHtml({ built: 0, won: 0, settled: 0 }), /NaN|Infinity/);
});

test("profile has no second avatar besides the picker tiles", () => {
  const h = UI.profileHtml({ name: "Kayode", avatar: "fire", record: { built: 1, won: 0, settled: 0 }, quota: null });
  assert.strictEqual((h.match(/\/av\//g) || []).length, 25, "only the 6 free tiles and 19 locked skins");
  assert.match(h, /Subscription/); assert.match(h, /Free plan/); assert.doesNotMatch(h, /Codes today/);
});

test("isSyncedKey also covers PREFS keys, so a name saved in another tab reloads", () => {
  assert.match(html, /function isSyncedKey\([^)]*\)\{[^\n]*PREFS/);
});

test("settings: appearance, booking, notifications, account; nothing that lies", () => {
  const h = UI.settingsHtml({ theme: "dark", book: "sporty", marks: { sporty: "<span class='sbm'>SportyBet</span>", bet9ja: "bet9ja" }, mail: true, devices: 2 });
  for (const w of ["Appearance", "Booking", "Notifications", "Account", "Default bookmaker", "Picks by email", "Signed-in devices", "Sign out", "Delete account"])
    assert.match(h, new RegExp(w), w);
  assert.match(h, /data-theme="dark" aria-pressed="true"/);
  assert.doesNotMatch(h, /Auto|Slip results|Download/);
  assert.match(h, /role="switch" aria-checked="true"/);
  assert.match(h, /This phone and 1 other/);
  assert.match(h, /data-book="sporty" aria-pressed="true"/);
});

test("devices wording", () => {
  assert.match(UI.settingsHtml({ theme: "dark", book: "sporty", marks: {}, mail: false, devices: 1 }), /Just this device/);
  assert.match(UI.settingsHtml({ theme: "dark", book: "sporty", marks: {}, mail: false, devices: null }), /Signed-in devices/);
});

test("account-ui talks to /api/account/consent with GET and POST", () => {
  const s = fs.readFileSync(path.join(PUB, "account-ui.js"), "utf8");
  assert.match(s, /req\("GET","\/api\/account\/consent"/);
  assert.match(s, /req\("POST","\/api\/account\/consent"/);
});

test("closed full-screen views are hidden from keyboard and screen readers; blank name restores", () => {
  const s = fs.readFileSync(path.join(PUB, "account-ui.js"), "utf8");
  assert.match(s, /\.swa-view\{[^}]*visibility:hidden/);
  assert.match(s, /\.swa-view\.on\{[^}]*visibility:visible/);
  assert.match(s, /else nm\.value=firstNameOf/);
});

test("index.html exposes the book helpers", () => {
  for (const w of ["swSetBook", "swBookKey", "swBookMarks"]) assert.match(html, new RegExp("window\." + w + "="));
});

test("signing out closes the full-screen view too; delete 401 signs out; sign out everywhere exists", () => {
  const f = html.slice(html.indexOf("function signedOutHere("));
  assert.ok(f.slice(0, f.indexOf("function schedule")).includes("swAccountUI.closeView()"));
  assert.ok(src.includes("\"/api/auth/logout-all\""));
  assert.ok(src.includes("if(code===401) return a.signedOutHere(j&&j.reason)"));
});
