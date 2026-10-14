"use strict";
/* Owner, 14 Oct 2026: "i just checked a family and friends account and it has
   admin access!" The server refused every admin call (403 in the logs), but the
   bottom bar's Admin tab, decided once at page load, stayed on screen after the
   device switched from the admin account to another one, and it opened the
   admin page. The tab is now redrawn whenever the saved role changes, and
   nothing opens the admin page unless the role is admin. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "..", "public", "account-ui.js"), "utf8");
function grab(s, name) {
  const i = s.search(new RegExp("(?:^|\\n)\\s*function " + name + "\\s*\\(", "m"));
  if (i < 0) throw new Error("not found: " + name);
  let d = 0, k = s.indexOf("{", i);
  for (; k < s.length; k++) { if (s[k] === "{") d++; else if (s[k] === "}") { d--; if (!d) break; } }
  return s.slice(i, k + 1);
}

function page(role, live) {
  const store = { "sw.role": role };
  const els = { "bt-admin": { hidden: false, listeners: [], setAttribute() {}, addEventListener(e, f) { this.listeners.push(f); } }, btAdminN: null, hdAccount: null };
  const calls = { admin: 0, closeView: 0, hits: 0 };
  /* swAdminLive: the server said admin in this page view (saveRole). */
  const win = { swAdminLive: live === undefined ? role === "admin" : live };
  const ctx = {
    window: win, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    $: (id) => els[id] || null,
    swAcct: { st: { on: true }, req: () => { calls.hits++; } },
    swAccountUI: { admin: () => { calls.admin++; }, closeView: () => { calls.closeView++; } },
    swMsg: { adminUnread: () => 0 },
  };
  Object.assign(win, ctx);
  const start = src.indexOf("var adminHitsN=0;");
  const end = src.indexOf("});", src.indexOf('if($("bt-admin")) $("bt-admin").addEventListener("click"')) + 3;
  new Function(...Object.keys(ctx), src.slice(start, end))(...Object.values(ctx));
  return { store, els, calls, win, click: () => els["bt-admin"].listeners.forEach((f) => f()) };
}

test("switching from the admin to another account on this device takes the Admin tab away at once", () => {
  const P = page("admin");
  P.win.swRoleChanged();
  assert.strictEqual(P.els["bt-admin"].hidden, false, "the admin sees it");
  P.store["sw.role"] = "ff";            // what saveRole writes for the new account
  P.win.swAdminLive = false;
  P.win.swRoleChanged();
  assert.strictEqual(P.els["bt-admin"].hidden, true, "gone as soon as the role is not admin");
  assert.strictEqual(P.calls.closeView, 1, "an admin page left open is closed");
});

test("a stale Admin tab cannot open the admin page", () => {
  const P = page("ff");
  P.click();
  assert.strictEqual(P.calls.admin, 0, "the click does nothing for anyone but the admin");
  assert.strictEqual(P.els["bt-admin"].hidden, true);
  const A = page("admin");
  A.click();
  assert.strictEqual(A.calls.admin, 1, "the admin still gets in");
});

test("'admin' saved on a device is not enough: only the server's word in this page view shows it", () => {
  /* The separate-device case: storage said admin, the server never did. */
  const P = page("admin", false);
  P.win.swRoleChanged();
  assert.strictEqual(P.els["bt-admin"].hidden, true, "no Admin tab from storage alone");
  P.click();
  assert.strictEqual(P.calls.admin, 0, "and it cannot open the page");
  assert.strictEqual(P.calls.hits, 0, "no admin request is even made");
  assert.match(grab(src, "saveRole"), /root\.swAdminLive=!!\(me&&me\.role==="admin"\);/);
  assert.match(ui, /function role\(\)\{ var r=lsGet\("sw\.role"\)\|\|"free"; return r==="admin"&&root\.swAdminLive!==true\?"free":r; \}/);
  assert.match(fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8"),
    /function isAdmin\(\)\{ if\(root\.swAdminLive!==true\) return false;/);
});

test("the hidden Admin tab is really hidden on phones (the cause, 14 Oct 2026)", () => {
  /* .btab{display:flex} in the phone styles beat the hidden attribute, so the
     tab showed for every user, signed in or not. Measured: before, display
     flex at 78px wide for a signed-out visitor; after, display none. */
  assert.match(src, /\.btab\{flex:1;display:flex;[\s\S]{0,400}?\.btab\[hidden\]\{display:none!important\}/);
  assert.match(src, /<button class="btab" id="bt-admin" type="button" aria-label="Admin" hidden>/, "it starts hidden");
});

test("saveRole tells the page, and the account sheet's own Admin refuses other roles", () => {
  assert.match(grab(src, "saveRole"), /root\.swRoleChanged\(\)/);
  assert.match(grab(ui, "admin"), /if\(role\(\)!=="admin"\) return;/);
  /* The real gate: admin comes only from SW_ADMIN_EMAILS on the server. */
  assert.match(fs.readFileSync(path.join(__dirname, "..", "lib", "roles.js"), "utf8"), /if \(admins\.includes\(email\)\) return "admin";/);
});
