# Account menu, avatars and My slips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the initials button and chunky account sheet with an avatar that opens a compact menu (Profile, My slips, Settings), and redesign the Home slips card and My slips sheet with swipe-to-delete, Undo and Clear all.

**Architecture:** The account UI moves into a new plain-ES5 file `public/account-ui.js` (like `signin.js`), driven by a small API the existing `<script id="swAccount">` block exposes on `window.swAcct`. Slips UI stays in `public/index.html` next to `SLIPS`, with one new shared pure helper for the delete-then-undo window. Sync gains three prefs; the booking proxy gains one header.

**Tech Stack:** Vanilla ES5 in `public/*.html|js`, Node 20 serverless in `api/` and `lib/`, `node --test` (`npm test`), Vercel.

**Spec:** `docs/superpowers/specs/2026-10-06-account-and-slips-design.md`. Mockups: `docs/design/account-slips/01-slips.html`, `02-account.html` (open them; they are the visual source of truth, copy their CSS values).

## Global Constraints

- Plain ES5 in everything under `public/` (tests reject `=>`, `let`, `const`, backticks, `class`).
- No raw hex colours in `public/signin.js`, `public/spell.js`, `public/account-ui.js` except `#fff`; use the site tokens (`--card`, `--card-2`, `--raise`, `--line`, `--text`, `--soft`, `--faint`, `--red`, `--red-fill`, `--red-ink`, `--green`, `--green-ink`, `--accent`, `--on-accent`, `--accent-rim`).
- One font: Plus Jakarta Sans. Numbers `font-variant-numeric:tabular-nums; font-weight:800`. No Roboto Condensed.
- Cards 12px radius, pills/buttons 99px, small boxes 8px. Hover rules only inside `@media (hover:hover)`. Focus `outline:2px solid var(--accent);outline-offset:2px`.
- Copy: sentence case, no em dashes, "Lost" never "Cut", no "Download my data" anywhere in the UI.
- The avatar never shows twice on one screen (top bar only; Profile shows it as the ringed picker tile).
- `npm test` green before every commit. After any `public/index.html` edit run `node scripts/graphify-inline.js` (the graphify shadow test fails otherwise).
- Page-weight test (`test/pageweight.test.js`) must stay under 720 KB.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Undo after sync:** delete a slip, tap Undo, then let a sync run. The slip must still be there (no tombstone was written during the Undo window). Owned by Task 6.
2. **Page hidden during the Undo window:** delete, then switch apps before 5s. The delete must be committed (not lost, not resurrected). Owned by Task 6.
3. **Unknown quota:** a reader who has not booked today, or whose counter failed open, must see no "Codes today" line rather than "0 of 10" or "10 of 10". Owned by Task 2.
4. **Bad synced prefs:** an `avatar` value that is not a free key, or a `name` with `<script>`, coming back from the server must be dropped, never rendered. Owned by Task 1 (server) and Task 4 (client guard).
5. **Swipe vs scroll:** a mostly vertical drag on a row must scroll the list and never delete. Owned by Task 6.

---

## File structure

- `lib/sync.js` (modify): `PREF_KEYS` + per-key value checks.
- `lib/bookproxy.js` (modify): `X-Sw-Quota-Limit` header.
- `public/av/*.webp` (create): 14 portraits copied from `docs/design/account-slips/av/`.
- `public/account-ui.js` (create): avatar list, menu popover, Profile view, Settings view.
- `public/index.html` (modify): head `<script src="/account-ui.js" defer>`, header (avatar, no theme toggle), `swAccount` exposes `window.swAcct` and drops `#acctSheet`, quota capture in `bookFetch`, shared `swPendingDelete` + swipe + undo toast, Home strip (replaces `renderMyResults` card), My slips sheet redesign.
- Tests (create): `test/syncprefs.test.js`, `test/quotaheader.test.js`, `test/accountui.test.js`, `test/slipdelete.test.js`, `test/slipsui.test.js`.

---

### Task 1: Sync the avatar, name and theme prefs

**Files:**
- Modify: `lib/sync.js:9` (PREF_KEYS) and the prefs block in `validate()` (around line 75)
- Modify: `public/index.html` `var PREFS={...}` inside `<script id="swAccount">` (around line 22805)
- Test: `test/syncprefs.test.js`

**Interfaces:**
- Produces: localStorage keys `sw.avatar` (string, one of the 14 keys), `sw.name` (string, 1-24 chars), `sw.theme` ("dark"|"light"); synced as prefs `avatar`, `name`, `theme`. Exported `Y.AVATARS` (array of the 14 keys, free six first) and `Y.FREE_AVATARS` (the six).

- [ ] **Step 1: Write the failing test** `test/syncprefs.test.js`

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Y = require("../lib/sync.js");

const pref = (v) => ({ v, at: 5 });
const val = (prefs) => Y.validate({ v: 1, prefs }).data.prefs;

test("avatar, name and theme sync", () => {
  const p = val({ avatar: pref("glass"), name: pref("Kayode"), theme: pref("light") });
  assert.deepStrictEqual(p, { avatar: pref("glass"), name: pref("Kayode"), theme: pref("light") });
});

test("only a free avatar is accepted for now", () => {
  assert.deepStrictEqual(Y.FREE_AVATARS, ["fire", "8bit", "2bit", "lino", "glass", "halo"]);
  assert.strictEqual(Y.AVATARS.length, 14);
  assert.deepStrictEqual(val({ avatar: pref("gold") }), {});        // locked skin
  assert.deepStrictEqual(val({ avatar: pref("../x") }), {});
});

test("a name is trimmed text, 24 chars at most, no markup", () => {
  assert.deepStrictEqual(val({ name: pref("  Ada  ") }), { name: pref("Ada") });
  assert.deepStrictEqual(val({ name: pref("x".repeat(25)) }), {});
  assert.deepStrictEqual(val({ name: pref("<b>hi</b>") }), {});
  assert.deepStrictEqual(val({ name: pref("   ") }), {});
});

test("theme is dark or light only", () => {
  assert.deepStrictEqual(val({ theme: pref("auto") }), {});
  assert.deepStrictEqual(val({ theme: pref("dark") }), { theme: pref("dark") });
});

test("the page syncs the same three keys", () => {
  const html = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  const m = /var PREFS=\{([\s\S]*?)\};/.exec(html);
  assert.ok(m);
  assert.match(m[1], /avatar:"sw\.avatar"/);
  assert.match(m[1], /name:"sw\.name"/);
  assert.match(m[1], /theme:"sw\.theme"/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/syncprefs.test.js`
Expected: FAIL (`Y.FREE_AVATARS` undefined, prefs dropped).

- [ ] **Step 3: Implement in `lib/sync.js`**

Replace line 9 with:

```js
const PREF_KEYS = ["book", "mk", "risk", "mode", "wspodds", "bldleagues", "toponly", "scope", "legodd",
  "avatar", "name", "theme"];
/* The portraits in public/av/. The first six are free; the rest are plan skins
   and are refused until plans exist, so a hand-edited request cannot unlock one. */
const AVATARS = ["fire", "8bit", "2bit", "lino", "glass", "halo",
  "storm", "lich", "gold", "holo", "graffiti", "afro", "lowpoly", "clay"];
const FREE_AVATARS = AVATARS.slice(0, 6);
/* Per-key value rules on top of the string check: null means drop it. */
const PREF_VALUE = {
  avatar: (v) => (FREE_AVATARS.indexOf(v) >= 0 ? v : null),
  name: (v) => { const t = String(v).trim(); return t && t.length <= 24 && !/[<>]/.test(t) ? t : null; },
  theme: (v) => (v === "dark" || v === "light" ? v : null),
};
```

In `validate()`, change the prefs loop body (the line that assigns `d.prefs[k]`) to:

```js
      if (isObj(e) && typeOk(e.v, "sz") && count(e.at) != null) {
        const v = PREF_VALUE[k] && e.v !== null ? PREF_VALUE[k](e.v) : e.v;
        if (v !== null || !PREF_VALUE[k]) d.prefs[k] = { v, at: count(e.at) };
      }
```

Add `AVATARS, FREE_AVATARS` to `module.exports`.

- [ ] **Step 4: Add the keys to the page.** In `public/index.html`, inside `<script id="swAccount">`, change the `PREFS` map to:

```js
  var PREFS={book:"sw.book",mk:"sw.mk",risk:"sw.risk",mode:"sw.mode",wspodds:"sw.wspodds",
    bldleagues:"sw.bldleagues",toponly:"sw.toponly",scope:"sw.scope",legodd:"sw.legodd",
    avatar:"sw.avatar",name:"sw.name",theme:"sw.theme"};
```

- [ ] **Step 5: Run tests.** `node scripts/graphify-inline.js && npm test` - expected all pass (including the existing `test/sync.test.js` and `test/account-client.test.js`).

- [ ] **Step 6: Commit**

```bash
git add lib/sync.js public/index.html test/syncprefs.test.js
git commit -m "Sync: avatar, name and theme prefs, with value checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Today's codes, read from the booking proxy

**Files:**
- Modify: `lib/bookproxy.js` (the block that sets `X-Sw-Quota-Remaining`, around line 186)
- Modify: `public/index.html` `function bookFetch` (`.then(function(r){to.done();` line) and add `swQuota` helpers right above `function bookFetch`
- Test: `test/quotaheader.test.js`

**Interfaces:**
- Produces: `window.swQuotaToday()` returns `{used, limit}` for today's Lagos date, or `null` when unknown. `localStorage["sw.quota"] = {"day":"YYYY-MM-DD","left":n,"limit":n}`.

- [ ] **Step 1: Write the failing test** `test/quotaheader.test.js`

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const proxy = fs.readFileSync(path.join(__dirname, "..", "lib", "bookproxy.js"), "utf8");

test("the proxy tells the page its limit as well as what is left", () => {
  assert.match(proxy, /X-Sw-Quota-Limit/);
});

function load(store, nowMs) {
  const m = /\/\* SWQUOTA \*\/([\s\S]*?)\/\* \/SWQUOTA \*\//.exec(html);
  assert.ok(m, "SWQUOTA block present");
  const win = {};
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  new Function("window", "localStorage", "Date", m[1])(win, ls, { now: () => nowMs });
  return win;
}
const hdr = (o) => ({ get: (k) => (o[k.toLowerCase()] == null ? null : o[k.toLowerCase()]) });
const NOON = Date.UTC(2026, 9, 6, 11);

test("a counted booking is remembered for today, in Lagos days", () => {
  const s = {}; const w = load(s, NOON);
  w.swNoteQuota(hdr({ "x-sw-quota-remaining": "7", "x-sw-quota-limit": "10" }));
  assert.deepStrictEqual(w.swQuotaToday(), { used: 3, limit: 10 });
});

test("unknown means null, never a guess", () => {
  const s = {}; const w = load(s, NOON);
  assert.strictEqual(w.swQuotaToday(), null);
  w.swNoteQuota(hdr({}));                                         // limit off or counter down
  assert.strictEqual(w.swQuotaToday(), null);
  w.swNoteQuota(hdr({ "x-sw-quota-remaining": "x", "x-sw-quota-limit": "10" }));
  assert.strictEqual(w.swQuotaToday(), null);
});

test("yesterday's count is not today's", () => {
  const s = { "sw.quota": JSON.stringify({ day: "2026-10-05", left: 2, limit: 10 }) };
  assert.strictEqual(load(s, NOON).swQuotaToday(), null);
});

test("23:30 UTC is already tomorrow in Lagos", () => {
  const s = { "sw.quota": JSON.stringify({ day: "2026-10-06", left: 2, limit: 10 }) };
  assert.strictEqual(load(s, Date.UTC(2026, 9, 6, 23, 30)).swQuotaToday(), null);
});
```

- [ ] **Step 2: Run to verify it fails.** `node --test test/quotaheader.test.js` - FAIL (no header, no block).

- [ ] **Step 3: Proxy header.** In `lib/bookproxy.js`, change the remaining-header block to:

```js
    if (verdict && verdict.counted && typeof verdict.remaining === "number") {
      res.setHeader("X-Sw-Quota-Remaining", String(verdict.remaining));
      if (typeof verdict.limit === "number") res.setHeader("X-Sw-Quota-Limit", String(verdict.limit));
    }
```

and in `lib/bookgate.js` where the counted verdict is returned (the object with `remaining: d.allow ? Math.max(0, d.remaining - 1) : 0`), add `limit: limit,` to that object. Check `test/bookgate*.test.js` still pass; if a test deep-equals the verdict, add `limit` to its expected object.

- [ ] **Step 4: Page helpers.** In `public/index.html`, directly above `function bookFetch(`, add:

```js
/* SWQUOTA */
/* Today's free codes on this device, as the booking proxy last reported them.
   Unknown is null, never a guess: no line beats a wrong number. */
(function(){
  function lagosDay(ms){ return new Date(ms+3600000).toISOString().slice(0,10); }
  window.swNoteQuota=function(h){
    var left=Number(h&&h.get("X-Sw-Quota-Remaining")), limit=Number(h&&h.get("X-Sw-Quota-Limit"));
    if(!(h&&h.get("X-Sw-Quota-Remaining")!=null&&h.get("X-Sw-Quota-Limit")!=null)) return;
    if(!isFinite(left)||!isFinite(limit)||limit<=0||left<0) return;
    try{ localStorage.setItem("sw.quota",JSON.stringify({day:lagosDay(Date.now()),left:left,limit:limit})); }catch(e){}
  };
  window.swQuotaToday=function(){
    var q=null; try{ q=JSON.parse(localStorage.getItem("sw.quota")||"null"); }catch(e){}
    if(!q||q.day!==lagosDay(Date.now())||!(q.limit>0)) return null;
    return {used:Math.max(0,Math.min(q.limit,q.limit-q.left)),limit:q.limit};
  };
})();
/* /SWQUOTA */
```

In `bookFetch`, change `.then(function(r){to.done();` to `.then(function(r){to.done(); try{ window.swNoteQuota(r.headers); }catch(e){}`.

- [ ] **Step 5: Run tests.** `node scripts/graphify-inline.js && npm test` - all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/bookproxy.js lib/bookgate.js public/index.html test/quotaheader.test.js
git commit -m "Codes today: proxy sends its limit, the page remembers today's count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Portraits and the top-bar avatar; theme toggle leaves the header

**Files:**
- Create: `public/av/{fire,8bit,2bit,lino,glass,halo,storm,lich,gold,holo,graffiti,afro,lowpoly,clay}.webp` (copy from `docs/design/account-slips/av/`)
- Modify: `public/index.html`: header `<button class="tgl" id="tgl" ...>` (remove), the theming IIFE that wires `$("tgl")` (keep `setTheme`, drop the click wiring), `paintButton()` in `swAccount`, `#hdAccount` CSS
- Test: `test/accountui.test.js` (first tests; later tasks append)

**Interfaces:**
- Consumes: `sw.avatar` (Task 1).
- Produces: `#hdAccount` contains `<img class="ac-av" src="/av/<key>.webp" alt="">` when signed in; `window.swAvatarKey()` returns the current free key (default `"fire"`).

- [ ] **Step 1: Write the failing test** `test/accountui.test.js`

```js
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
```

- [ ] **Step 2: Run to verify it fails.** `node --test test/accountui.test.js` - FAIL.

- [ ] **Step 3: Copy the portraits.**

```bash
mkdir -p public/av && cp docs/design/account-slips/av/*.webp public/av/
```

- [ ] **Step 4: Remove the toggle.** Delete the whole `<button class="tgl" id="tgl" ...>...</button>` element from the header. In the theming block, replace

```js
(function(){
  let t=null; try{t=localStorage.getItem("sw.theme");}catch(e){}
  setTheme(t||"dark");
  $("tgl").addEventListener("click",function(){
    setTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark");});
})();
```

with

```js
(function(){
  let t=null; try{t=localStorage.getItem("sw.theme");}catch(e){}
  setTheme(t==="light"?"light":"dark");
})();
/* Settings (account-ui.js) and a synced pref both land here. */
window.swSetTheme=function(t){ setTheme(t==="light"?"light":"dark"); };
```

Search the file for any other `tglicon`/`#tgl` users (`grep -n 'tgl\b\|tglicon' public/index.html`); the `.tgl` CSS class stays (install, account and social buttons use it). Remove `const i=$("tglicon"); if(i) i.innerHTML=...;` from `setTheme`.

- [ ] **Step 5: Avatar key helper.** Directly after the `window.swSetTheme` line add:

```js
/* SWAVATAR */
window.swAvatarKey=function(){
  var FREE=["fire","8bit","2bit","lino","glass","halo"], v=null;
  try{ v=localStorage.getItem("sw.avatar"); }catch(e){}
  return FREE.indexOf(v)>=0?v:"fire";
};
/* /SWAVATAR */
```

- [ ] **Step 6: Paint the avatar.** In `swAccount`, replace the signed-in branch of `paintButton()`:

```js
    if(st.on){
      b.innerHTML='<img class="ac-av" src="/av/'+(root.swAvatarKey?root.swAvatarKey():"fire")+'.webp" alt="" width="36" height="36">';
      b.setAttribute("aria-label","Your account"); b.setAttribute("aria-haspopup","menu");
      b.classList.add("ac-on");
    } else { b.innerHTML=PERSON; b.setAttribute("aria-label","Sign in"); b.classList.remove("ac-on"); }
```

and replace the CSS line `"#hdAccount .ac-i{font-weight:800;font-size:14px;line-height:1}"+` with

```js
  css.textContent="#hdAccount.ac-on{width:36px;height:36px;border-radius:50%;padding:0;overflow:hidden;border:1.5px solid var(--accent-rim);background:var(--card-2)}"+
    "#hdAccount .ac-av{width:100%;height:100%;object-fit:cover;display:block}"+
```

Also, in `apply()` (the function that writes synced data into storage), after it writes prefs call `if(root.swSetTheme){ try{ var th=ls.getItem("sw.theme"); if(th) root.swSetTheme(th); }catch(e){} } paintButton();` so a theme or avatar chosen on another device shows up.

- [ ] **Step 7: Run tests.** `node scripts/graphify-inline.js && npm test` - all pass. If `test/account-client.test.js` asserts the block length `< 40000`, it still holds (this task adds little).

- [ ] **Step 8: Commit**

```bash
git add public/av public/index.html test/accountui.test.js
git commit -m "Header: the chosen portrait replaces the initial; theme leaves the header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: account-ui.js: the menu popover

**Files:**
- Create: `public/account-ui.js`
- Modify: `public/index.html`: `<head>` add `<script src="/account-ui.js" defer></script>` next to `signin.js`; in `swAccount` expose `root.swAcct` and route the avatar click to it; delete `build()/openSheet()/closeSheet()/loadDevices()` of `#acctSheet` and their CSS lines (`#acctSheet ...`), keeping `notice()`, `fail()`, `signedOutHere()`.
- Test: append to `test/accountui.test.js`

**Interfaces:**
- Consumes from `swAccount`: `root.swAcct = { st, req, signedOutHere, notice, sync, paintButton }` where `st.email` is the signed-in email.
- Consumes from the app: `window.swQuotaToday()`, `window.swAvatarKey()`, `SLIPS` (read via `window.swSlipCount()`, add `window.swSlipCount=function(){return SLIPS.length;};` next to `function saveSlips`), `window.openSlipsSheet` (already global).
- Produces: `window.swAccountUI = { open(), close(), profile(), settings() }`; ES5; exports `{ firstNameOf, menuHtml }` under `module.exports` for tests.

- [ ] **Step 1: Write the failing tests** (append to `test/accountui.test.js`)

```js
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
```

- [ ] **Step 2: Run to verify fail.** `node --test test/accountui.test.js` - FAIL (file missing).

- [ ] **Step 3: Create `public/account-ui.js`** with the menu (Profile and Settings are added in Tasks 5 and 7; leave `profile()`/`settings()` calling `close()` for now so nothing is a dead tap):

```js
/* The account menu, Profile and Settings. Opens from the avatar in the top
   bar (index.html swAccount). The avatar is never drawn twice on one screen,
   so the menu header carries words only. Colours are site tokens. Plain ES5. */
(function(root){
  "use strict";
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function firstNameOf(saved,email){
    var n=String(saved||"").replace(/^\s+|\s+$/g,"");
    if(n) return n;
    n=String(email||"").split("@")[0].replace(/[^A-Za-z]+/g," ").replace(/^\s+|\s+$/g,"").split(" ")[0]||"";
    return n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():"You";
  }
  var I={
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    slips:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>'
  };
  function codesHtml(q){
    if(!q) return "";
    var pct=Math.round(100*q.used/q.limit);
    return "<div class='swa-q'><div class='swa-q1'><span>Codes today</span><span><span class='swa-n'>"+q.used+"</span> of "+q.limit+"</span></div>"+
      "<div class='swa-bar'><i style='width:"+pct+"%'></i></div></div>";
  }
  function menuHtml(o){
    return "<div class='swa-id'><b>"+esc(o.name)+"</b><small>"+esc(o.email)+"</small><span class='swa-plan'>Free plan</span></div>"+
      codesHtml(o.quota)+
      "<div class='swa-list'>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='profile'>"+I.user+"Profile</button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='slips'>"+I.slips+"My slips<span class='swa-r swa-n'>"+(o.slips||0)+"</span></button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='settings'>"+I.gear+"Settings</button>"+
      "</div><div class='swa-list'>"+
        "<button class='swa-mi swa-out' type='button' role='menuitem' data-go='out'>"+I.out+"Sign out</button></div>";
  }
  var api={firstNameOf:firstNameOf,menuHtml:menuHtml,codesHtml:codesHtml,esc:esc,I:I};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  var d=root.document, menu=null, scrim=null, lastFocus=null;
  var CSS=".swa-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .18s;z-index:9980}.swa-scrim.on{opacity:1;pointer-events:auto}"+
    ".swa-menu{position:fixed;top:58px;right:12px;width:268px;max-width:calc(100vw - 24px);background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:12px;"+
      "box-shadow:0 10px 24px rgba(0,0,0,.45);z-index:9981;transform-origin:calc(100% - 22px) -8px;transform:scale(.92) translateY(-6px);opacity:0;pointer-events:none;"+
      "transition:transform .2s cubic-bezier(.23,1,.32,1),opacity .16s}.swa-menu.on{transform:none;opacity:1;pointer-events:auto}"+
    ".swa-id{padding:14px 14px 12px}.swa-id b{display:block;font-size:14.5px;font-weight:800}.swa-id small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:1px}"+
    ".swa-plan{display:block;margin-top:3px;font-size:12px;font-weight:700;color:var(--accent)}"+
    ".swa-q{margin:0 14px 14px}.swa-q1{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;font-weight:700;color:var(--soft)}"+
    ".swa-n{font-variant-numeric:tabular-nums;font-weight:800;color:var(--text)}"+
    ".swa-bar{height:4px;border-radius:2px;background:var(--raise);margin-top:8px;overflow:hidden}.swa-bar i{display:block;height:100%;background:var(--accent);border-radius:2px}"+
    ".swa-list{border-top:1px solid var(--line);padding:6px}"+
    ".swa-mi{width:100%;display:flex;align-items:center;gap:11px;padding:10px 9px;border:0;background:none;border-radius:8px;color:var(--text);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;text-align:left}"+
    ".swa-mi svg{width:18px;height:18px;color:var(--soft);flex:none}.swa-r{margin-left:auto;color:var(--faint)}.swa-out{color:var(--soft)}"+
    ".swa-mi:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"+
    "@media (hover:hover){.swa-mi:hover{background:var(--card-2)}}"+
    "@media (prefers-reduced-motion:reduce){.swa-menu,.swa-scrim{transition:none}}";
  function ensure(){
    if(menu) return;
    var st=d.createElement("style"); st.textContent=CSS; d.head.appendChild(st);
    scrim=d.createElement("div"); scrim.className="swa-scrim"; d.body.appendChild(scrim);
    menu=d.createElement("div"); menu.className="swa-menu"; menu.setAttribute("role","menu"); menu.setAttribute("aria-label","Your account");
    d.body.appendChild(menu);
    scrim.addEventListener("click",close);
    d.addEventListener("keydown",function(e){ if(e.key==="Escape"&&menu.classList.contains("on")) close(); });
    menu.addEventListener("click",function(e){
      var b=e.target.closest&&e.target.closest("[data-go]"); if(!b) return;
      var go=b.getAttribute("data-go"); close();
      if(go==="slips"&&root.openSlipsSheet) root.openSlipsSheet();
      else if(go==="profile") profile();
      else if(go==="settings") settings();
      else if(go==="out") signOut();
    });
  }
  function acct(){ return root.swAcct||{st:{email:""}}; }
  function savedName(){ try{ return root.localStorage.getItem("sw.name")||""; }catch(e){ return ""; } }
  function open(){
    ensure();
    var a=acct();
    menu.innerHTML=menuHtml({name:firstNameOf(savedName(),a.st.email),email:a.st.email,
      quota:root.swQuotaToday?root.swQuotaToday():null,slips:root.swSlipCount?root.swSlipCount():0});
    lastFocus=d.activeElement;
    scrim.classList.add("on"); menu.classList.add("on");
    var av=d.getElementById("hdAccount"); if(av) av.setAttribute("aria-expanded","true");
    var f=menu.querySelector(".swa-mi"); if(f) f.focus({preventScroll:true});
  }
  function close(){
    if(!menu||!menu.classList.contains("on")) return;
    menu.classList.remove("on"); scrim.classList.remove("on");
    var av=d.getElementById("hdAccount"); if(av) av.setAttribute("aria-expanded","false");
    if(lastFocus&&lastFocus.focus) try{ lastFocus.focus(); }catch(e){}
  }
  function toggle(){ if(menu&&menu.classList.contains("on")) close(); else open(); }
  function signOut(){
    var a=acct();
    a.req("POST","/api/auth/logout",{},function(code){
      if(code===200||code===401) a.signedOutHere(null,true); else a.notice("No connection. You are still signed in.");
    });
  }
  function profile(){ close(); }
  function settings(){ close(); }
  root.swAccountUI={open:open,close:close,toggle:toggle,profile:profile,settings:settings};
})(typeof window!=="undefined"?window:this);
```

- [ ] **Step 4: Wire it in `index.html`.** In `<head>`, next to `<script src="/signin.js" ...>` add `<script src="/account-ui.js" defer></script>`. In `swAccount`:
  - Delete `function build(){...}`, `function when(...)`, `function loadDevices(){...}`, `function openSheet(){...}`, `function closeSheet(){...}`, the `var sheet=null;` line, and every CSS line starting `"#acctSheet`.
  - In `signedOutHere`, replace `closeSheet();` with `if(root.swAccountUI) root.swAccountUI.close();`.
  - In `boot()`, replace `if(st.on) return openSheet();` with `if(st.on&&root.swAccountUI) return root.swAccountUI.toggle();`.
  - In the delete handler path that used `closeSheet()`, move the delete logic to Task 7 (Settings); for now remove it with the sheet.
  - Just before `boot()` is called, add `root.swAcct={st:st,req:req,signedOutHere:signedOutHere,notice:notice,sync:sync,paintButton:paintButton};`.
  - If a deep link `?account=1` opened the sheet, make it call `root.swAccountUI&&root.swAccountUI.settings()` instead.
- Add `window.swSlipCount=function(){return SLIPS.length;};` right after `function saveSlips(){...}`.

- [ ] **Step 5: Run tests.** `node scripts/graphify-inline.js && npm test`. Fix any `test/account-client.test.js` assertions that referenced the removed sheet functions by deleting only those assertions (the sync behaviour they cover is unchanged); keep every sync assertion.

- [ ] **Step 6: Check in a browser.** `npx serve public -l 5055` is not enough (the API is needed); instead run `vercel dev` if available, or check on a preview deploy (`git push origin HEAD:refs/heads/account-ui` gives a Vercel preview URL). Open the menu signed in: name, email, Free plan, items, Escape closes, focus returns to the avatar.

- [ ] **Step 7: Commit**

```bash
git add public/account-ui.js public/index.html test/accountui.test.js test/account-client.test.js
git commit -m "Account: avatar opens a compact menu from the top right; old sheet removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Profile view

**Files:**
- Modify: `public/account-ui.js` (add `profileHtml`, `pickerHtml`, the full-height view shell, `profile()`)
- Modify: `public/index.html` (add `window.swRecord=function(){var r=myRecord();return {built:r.built,won:r.won,settled:SLIPS.filter(function(s){return s.settled&&!isJackpotSlip(s);}).length};};` after `function myRecord`)
- Test: append to `test/accountui.test.js`

**Interfaces:**
- Consumes: `window.swRecord()` -> `{built, won, settled}`; `window.swQuotaToday()`; `swAcct.paintButton()`; localStorage `sw.avatar`, `sw.name`.
- Produces: `UI.AV_FREE`, `UI.AV_LOCKED` arrays; `UI.pickerHtml(cur)`; `UI.recordHtml(r)`; a view shell `view(title, html)` reused by Task 7.

- [ ] **Step 1: Failing tests**

```js
test("picker: six free in one row, eight locked skins, chosen one ringed", () => {
  assert.deepStrictEqual(UI.AV_FREE, ["fire", "8bit", "2bit", "lino", "glass", "halo"]);
  assert.strictEqual(UI.AV_LOCKED.length, 8);
  const h = UI.pickerHtml("glass");
  assert.strictEqual((h.match(/data-av=/g) || []).length, 6);
  assert.strictEqual((h.match(/disabled/g) || []).length, 8);
  assert.match(h, /data-av="glass" aria-pressed="true"/);
  assert.match(h, /Skins/); assert.match(h, /Unlock with plans/);
});

test("record: one card, won big, the rate only over settled slips", () => {
  const h = UI.recordHtml({ built: 24, won: 6, settled: 21 });
  assert.match(h, />6</); assert.match(h, /of 21 settled, 29%/); assert.match(h, />24</);
  assert.doesNotMatch(UI.recordHtml({ built: 0, won: 0, settled: 0 }), /NaN|Infinity/);
});

test("profile has no second avatar besides the picker tiles", () => {
  const h = UI.profileHtml({ name: "Kayode", avatar: "fire", record: { built: 1, won: 0, settled: 0 }, quota: null });
  assert.strictEqual((h.match(/\/av\//g) || []).length, 14, "only the 14 picker tiles");
  assert.match(h, /Subscription/); assert.match(h, /Free plan/); assert.doesNotMatch(h, /Codes today/);
});
```

- [ ] **Step 2: Run, verify FAIL.** `node --test test/accountui.test.js`

- [ ] **Step 3: Implement.** In `account-ui.js` before `var api=`:

```js
  var AV_FREE=["fire","8bit","2bit","lino","glass","halo"];
  var AV_LOCKED=["storm","lich","gold","holo","graffiti","afro","lowpoly","clay"];
  var AV_NAME={fire:"Fire eyes","8bit":"Arcade","2bit":"2-bit",lino:"Linocut",glass:"Stained glass",halo:"Halo",
    storm:"Storm caller",lich:"Frost lich",gold:"Gold trophy",holo:"Hologram",graffiti:"Graffiti",afro:"Afrofuturist",lowpoly:"Low-poly",clay:"Clay"};
  var LOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function pickerHtml(cur){
    return "<p class='swa-h'>Avatar</p><div class='swa-pick'>"+AV_FREE.map(function(k){
        return "<button type='button' data-av=\""+k+"\" aria-pressed=\""+(k===cur?"true":"false")+"\" aria-label=\""+AV_NAME[k]+" avatar\"><img src='/av/"+k+".webp' alt='' loading='lazy' width='44' height='44'></button>";
      }).join("")+"</div>"+
      "<p class='swa-h'>Skins<small>Unlock with plans</small></p><div class='swa-pick swa-lock'>"+AV_LOCKED.map(function(k){
        return "<button type='button' disabled aria-label=\""+AV_NAME[k]+", comes with plans\"><img src='/av/"+k+".webp' alt='' loading='lazy' width='56' height='56'>"+LOCK+"</button>";
      }).join("")+"</div>";
  }
  function recordHtml(r){
    var pct=r.settled?Math.round(100*r.won/r.settled):0;
    return "<p class='swa-h'>Your record</p><div class='swa-rec'><span class='swa-big'>"+r.won+"</span>"+
      "<span class='swa-m'><b>slips won</b><br>"+(r.settled?"of "+r.settled+" settled, "+pct+"%":"none settled yet")+"</span>"+
      "<span class='swa-side'><span class='swa-n'>"+r.built+"</span>saved</span></div>";
  }
  function subHtml(q){
    return "<p class='swa-h'>Subscription</p><div class='swa-card'><div class='swa-subtop'><span><b>Free plan</b><small>Every feature, 10 codes a day</small></span><span class='swa-soon'>More plans soon</span></div>"+
      (q?"<div class='swa-subuse'>"+codesHtml(q).replace("class='swa-q'","class='swa-q swa-q0'")+"<small>Resets at midnight</small></div>":"")+"</div>";
  }
  function profileHtml(o){
    return "<label class='swa-lbl' for='swaName'>Name on your slips</label>"+
      "<input class='swa-in' id='swaName' maxlength='24' autocomplete='nickname' value=\""+esc(o.name)+"\">"+
      pickerHtml(o.avatar)+recordHtml(o.record)+subHtml(o.quota);
  }
```

Export them: `var api={firstNameOf:firstNameOf,menuHtml:menuHtml,codesHtml:codesHtml,esc:esc,I:I,AV_FREE:AV_FREE,AV_LOCKED:AV_LOCKED,pickerHtml:pickerHtml,recordHtml:recordHtml,profileHtml:profileHtml};`

Add to `CSS` (values from the mockup):

```js
    ".swa-view{position:fixed;inset:0;z-index:9982;background:var(--bg);color:var(--text);overflow-y:auto;padding:16px 16px 40px;transform:translateX(100%);transition:transform .28s cubic-bezier(.23,1,.32,1)}"+
    ".swa-view.on{transform:none}.swa-in-wrap{max-width:520px;margin:0 auto}"+
    ".swa-back{display:flex;align-items:center;gap:4px;border:0;background:none;color:var(--soft);font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:6px 4px 6px 0}.swa-back svg{width:18px;height:18px}"+
    ".swa-t{margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-.01em}"+
    ".swa-h{font-size:13px;font-weight:700;color:var(--soft);margin:18px 2px 8px}.swa-h small{font-weight:600;color:var(--faint);margin-left:6px}"+
    ".swa-lbl{display:block;font-size:12px;font-weight:700;color:var(--faint);margin:0 0 5px}"+
    ".swa-in{width:100%;height:42px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:15px;font-weight:700;padding:0 12px;box-sizing:border-box}"+
    ".swa-pick{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.swa-pick.swa-lock{grid-template-columns:repeat(4,1fr);gap:12px;padding:0 18px}"+
    ".swa-pick button{aspect-ratio:1;border-radius:50%;border:1.5px solid transparent;background:var(--card-2);padding:0;overflow:hidden;position:relative;cursor:pointer}"+
    ".swa-pick img{width:100%;height:100%;object-fit:cover;display:block}"+
    ".swa-pick button[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-rim)}"+
    ".swa-pick button[disabled]{cursor:not-allowed}.swa-pick button[disabled] img{filter:brightness(.55) saturate(.8)}"+
    ".swa-pick button svg{position:absolute;left:50%;top:50%;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;color:#fff}"+
    ".swa-card,.swa-rec{border:1px solid var(--line);border-radius:12px;background:var(--card)}"+
    ".swa-rec{display:flex;align-items:flex-end;gap:12px;padding:14px}.swa-big{font-size:32px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;color:var(--green-ink)}"+
    ".swa-m{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--soft);line-height:1.35}.swa-m b{color:var(--text)}"+
    ".swa-side{text-align:right;font-size:12px;font-weight:600;color:var(--faint)}.swa-side .swa-n{display:block;font-size:17px}"+
    ".swa-subtop{display:flex;align-items:center;gap:12px;padding:12px}.swa-subtop b{display:block;font-size:14px;font-weight:800}"+
    ".swa-subtop small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:2px}.swa-soon{margin-left:auto;font-size:12px;font-weight:700;color:var(--faint);white-space:nowrap}"+
    ".swa-subuse{border-top:1px solid var(--line);padding:11px 12px 12px}.swa-q0{margin:0}.swa-subuse small{display:block;margin-top:6px;font-size:12px;font-weight:600;color:var(--faint)}"+
```

Add the view shell and `profile()` (replacing the stub):

```js
  var BACK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var viewEl=null;
  function view(title,html){
    ensure();
    if(!viewEl){ viewEl=d.createElement("div"); viewEl.className="swa-view"; viewEl.setAttribute("role","dialog"); viewEl.setAttribute("aria-modal","true"); d.body.appendChild(viewEl);
      d.addEventListener("keydown",function(e){ if(e.key==="Escape"&&viewEl.classList.contains("on")) closeView(); }); }
    viewEl.setAttribute("aria-label",title);
    viewEl.innerHTML="<div class='swa-in-wrap'><button class='swa-back' type='button'>"+BACK+"Back</button><h2 class='swa-t'>"+esc(title)+"</h2>"+html+"</div>";
    viewEl.querySelector(".swa-back").onclick=closeView;
    viewEl.classList.add("on"); d.documentElement.classList.add("locked");
    viewEl.querySelector(".swa-back").focus({preventScroll:true});
    return viewEl;
  }
  function closeView(){ if(!viewEl) return; viewEl.classList.remove("on"); d.documentElement.classList.remove("locked");
    var av=d.getElementById("hdAccount"); if(av) try{ av.focus(); }catch(e){} }
  function lsGet(k){ try{ return root.localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ root.localStorage.setItem(k,v); }catch(e){} }
  function profile(){
    close();
    var a=acct();
    var v=view("Profile",profileHtml({name:firstNameOf(lsGet("sw.name"),a.st.email),
      avatar:root.swAvatarKey?root.swAvatarKey():"fire",
      record:root.swRecord?root.swRecord():{built:0,won:0,settled:0},
      quota:root.swQuotaToday?root.swQuotaToday():null}));
    var nm=v.querySelector("#swaName");
    nm.addEventListener("change",function(){
      var t=nm.value.replace(/^\s+|\s+$/g,"").replace(/[<>]/g,"").slice(0,24);
      if(t){ lsSet("sw.name",t); nm.value=t; }
    });
    v.querySelectorAll("[data-av]").forEach(function(b){
      b.addEventListener("click",function(){
        lsSet("sw.avatar",b.getAttribute("data-av"));
        v.querySelectorAll("[data-av]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); });
        if(a.paintButton) a.paintButton();
      });
    });
  }
```

Export `closeView` on `root.swAccountUI` too. Storage writes are picked up by the existing `watch()` sync loop (it diffs `rawNow()`), so no explicit `sync()` call is needed. Confirm `isSyncedKey` in `swAccount` returns true for `sw.avatar` and `sw.name`; if it only checks `KEYS`, extend it to also check the `PREFS` values.

- [ ] **Step 4: Run tests.** `node scripts/graphify-inline.js && npm test` - pass.

- [ ] **Step 5: Commit**

```bash
git add public/account-ui.js public/index.html test/accountui.test.js
git commit -m "Account: Profile with name, avatar picker, plan skins teaser, record and subscription

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Delete with Undo, swipe and Clear all (shared core)

**Files:**
- Modify: `public/index.html`: add a `/* SWPEND */ ... /* /SWPEND */` block after `function clearSlips(){...}`; add `swSwipe(row, onDelete)`; add the undo toast element + CSS
- Test: `test/slipdelete.test.js`

**Interfaces:**
- Consumes: `removeSlip(sid)`, `clearSlips()` (existing; they write storage and tombstones).
- Produces: `window.swPend = { del(sid, label), clearAll(), undo(), commit(), hidden(sid) -> bool, active() -> bool }`; `function swSwipe(row, onDelete)` attaches pointer handlers to `row.querySelector(".sw-card")` inside a `.sw-swipe` wrapper; toast `#swUndo`.

- [ ] **Step 1: Failing tests** `test/slipdelete.test.js`

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function load() {
  const m = /\/\* SWPEND \*\/([\s\S]*?)\/\* \/SWPEND \*\//.exec(html);
  assert.ok(m, "SWPEND block present");
  const calls = [], timers = [];
  const env = {
    removeSlip: (sid) => calls.push("rm " + sid),
    clearSlips: () => calls.push("clear"),
    refreshSlipUI: () => calls.push("ui"),
    setTimeout: (f, ms) => { timers.push(f); return timers.length; },
    clearTimeout: () => {},
    showUndo: (msg) => calls.push("toast " + msg),
    hideUndo: () => calls.push("hide"),
  };
  const win = {};
  new Function("window", "removeSlip", "clearSlips", "refreshSlipUI", "setTimeout", "clearTimeout", "showUndo", "hideUndo", m[1])(
    win, env.removeSlip, env.clearSlips, env.refreshSlipUI, env.setTimeout, env.clearTimeout, env.showUndo, env.hideUndo);
  return { P: win.swPend, calls, fire: () => timers.splice(0).forEach((f) => f()) };
}

test("a delete only hides until the window ends; storage is untouched", () => {
  const { P, calls } = load();
  P.del("s1");
  assert.ok(P.hidden("s1"));
  assert.ok(!calls.some((c) => c.startsWith("rm")), "no removeSlip yet: a tombstone would beat Undo");
  assert.ok(calls.includes("toast Slip deleted"));
});

test("Undo restores and never touches storage", () => {
  const { P, calls, fire } = load();
  P.del("s1"); P.undo(); fire();
  assert.ok(!P.hidden("s1"));
  assert.ok(!calls.some((c) => c.startsWith("rm")));
});

test("when the window ends the delete is committed once", () => {
  const { P, calls, fire } = load();
  P.del("s1"); fire(); fire();
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("rm")), ["rm s1"]);
  assert.ok(!P.active());
});

test("a second delete commits the first at once", () => {
  const { P, calls } = load();
  P.del("s1"); P.del("s2");
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("rm")), ["rm s1"]);
  assert.ok(P.hidden("s2"));
});

test("leaving the page commits what is pending", () => {
  const { P, calls } = load();
  P.del("s1"); P.commit();
  assert.deepStrictEqual(calls.filter((c) => c.startsWith("rm")), ["rm s1"]);
});

test("clear all hides everything, then clears once", () => {
  const { P, calls, fire } = load();
  P.clearAll();
  assert.ok(P.hidden("anything"));
  assert.ok(calls.includes("toast All slips cleared"));
  fire();
  assert.deepStrictEqual(calls.filter((c) => c === "clear"), ["clear"]);
});

test("the page commits on hide and the swipe ignores vertical drags", () => {
  assert.match(html, /visibilitychange[\s\S]{0,200}swPend\.commit\(\)/);
  const sw = /function swSwipe\(row,onDelete\)\{([\s\S]*?)\n\}/.exec(html);
  assert.ok(sw, "swSwipe present");
  assert.match(sw[1], /lock=Math\.abs\(mx\)>Math\.abs\(my\)\?"x":"y"/);
  assert.match(sw[1], /if\(lock!=="x"\) return;/);
});
```

- [ ] **Step 2: Run, verify FAIL.** `node --test test/slipdelete.test.js`

- [ ] **Step 3: Implement.** After `function clearSlips(){...}` in `index.html`:

```js
/* SWPEND */
/* DELETE WAITS FOR UNDO. A removed slip gets a sync tombstone that beats every
   copy for 60 days, so "delete, then put it back" would be undone by the next
   sync. Instead a delete only hides the slip; storage is written when the 5s
   Undo window ends, when another delete starts, or when the page is hidden. */
(function(){
  var pend=null, t=null;
  function finish(){
    if(!pend) return;
    var p=pend; pend=null; if(t) clearTimeout(t); t=null; hideUndo();
    if(p.all) clearSlips(); else removeSlip(p.sid);
  }
  function start(p,msg){
    finish();
    pend=p; refreshSlipUI(); showUndo(msg);
    t=setTimeout(finish,5000);
  }
  window.swPend={
    del:function(sid){ start({sid:sid},"Slip deleted"); },
    clearAll:function(){ start({all:true},"All slips cleared"); },
    undo:function(){ if(!pend) return; pend=null; if(t) clearTimeout(t); t=null; hideUndo(); refreshSlipUI(); },
    commit:finish,
    hidden:function(sid){ return !!pend&&(pend.all||pend.sid===sid); },
    active:function(){ return !!pend; }
  };
})();
/* /SWPEND */
function showUndo(msg){
  var u=$("swUndo"); if(!u) return;
  u.querySelector(".u-msg").textContent=msg;
  u.classList.remove("on"); void u.offsetWidth; u.classList.add("on");
}
function hideUndo(){ var u=$("swUndo"); if(u) u.classList.remove("on"); }
function swSwipe(row,onDelete){
  var card=row.querySelector(".sw-card"), bin=row.querySelector(".sw-bin");
  var x0=0,y0=0,dx=0,drag=false,lock=null,t0=0,W=0,armed=false;
  card.addEventListener("pointerdown",function(e){
    if(e.target.closest("button,a,input")) return;
    drag=true; lock=null; x0=e.clientX; y0=e.clientY; dx=0; t0=Date.now(); W=card.offsetWidth;
    card.classList.remove("sw-snap","sw-peek");
  });
  card.addEventListener("pointermove",function(e){
    if(!drag) return;
    var mx=e.clientX-x0, my=e.clientY-y0;
    if(lock===null&&(Math.abs(mx)>6||Math.abs(my)>6)){ lock=Math.abs(mx)>Math.abs(my)?"x":"y"; if(lock==="x") try{ card.setPointerCapture(e.pointerId); }catch(er){} }
    if(lock!=="x") return;
    dx=Math.min(0,mx); if(dx<-W*.8) dx=-W*.8+(dx+W*.8)*.5;
    card.style.transform="translateX("+dx+"px)";
    var p=Math.min(1,-dx/(W*.45)); bin.style.setProperty("--s",(.7+.4*p).toFixed(2));
    var now=p>=1; if(now!==armed){ armed=now; bin.classList.toggle("armed",armed); if(armed&&navigator.vibrate) try{ navigator.vibrate(12); }catch(er){} }
  });
  function end(){
    if(!drag) return; drag=false;
    var v=-dx/Math.max(1,Date.now()-t0);
    if(lock==="x"&&(armed||(v>1.1&&-dx>40))){
      card.style.transform="translateX(-110%)"; card.classList.add("sw-gone");
      row.style.height=row.offsetHeight+"px";
      setTimeout(function(){ row.classList.add("sw-collapse"); },180);
      setTimeout(onDelete,430);
    } else { card.classList.add("sw-snap"); card.style.transform="translateX(0)"; bin.classList.remove("armed"); armed=false; }
  }
  card.addEventListener("pointerup",end); card.addEventListener("pointercancel",end);
}
document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="hidden"&&window.swPend) window.swPend.commit(); });
```

Add the toast element once, right after the `#slipsSheet` element closes:

```html
<div class="sw-undo" id="swUndo" role="status" aria-live="polite"><span class="u-msg"></span><button type="button" id="swUndoBtn">Undo</button><i class="u-bar"></i></div>
```

and wire it in the script once: `$("swUndoBtn").addEventListener("click",function(){ window.swPend.undo(); });`

CSS (in the main `<style>`; values from mockup 01):

```css
.sw-swipe{position:relative;margin:0 0 8px;border-radius:12px;overflow:hidden;touch-action:pan-y}
.sw-bin{position:absolute;inset:0;background:var(--red-fill);display:flex;align-items:center;justify-content:flex-end;padding-right:20px;border-radius:12px;color:#fff}
.sw-bin svg{width:22px;height:22px;transform:scale(var(--s,.7));transition:transform 120ms var(--ease-out)}
.sw-bin.armed{background:color-mix(in srgb,var(--red-fill) 70%,black)}
.sw-card{position:relative;transform:translateX(0);will-change:transform;touch-action:pan-y}
.sw-card.sw-snap{transition:transform 320ms cubic-bezier(.2,.9,.25,1)}
.sw-card.sw-gone{transition:transform 220ms ease-in,opacity 220ms;opacity:0}
.sw-card.sw-peek{animation:swPeek 1100ms var(--ease-out) 700ms 1}
@keyframes swPeek{0%{transform:none}35%{transform:translateX(-58px)}100%{transform:none}}
.sw-swipe.sw-collapse{transition:height 250ms ease,margin 250ms ease;height:0!important;margin:0}
.sw-undo{position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));max-width:440px;margin:0 auto;z-index:9970;background:var(--text);color:var(--bg);border-radius:12px;padding:11px 8px 11px 14px;display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:13px;transform:translateY(160%);transition:transform 300ms cubic-bezier(.2,.9,.25,1);overflow:hidden}
.sw-undo.on{transform:none}
.sw-undo button{border:0;background:none;color:var(--red);font:inherit;font-weight:800;cursor:pointer;padding:6px 10px}
.sw-undo .u-bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--red);transform-origin:left;transform:scaleX(0)}
.sw-undo.on .u-bar{animation:swUndoBar 5s linear forwards}
@keyframes swUndoBar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){.sw-card,.sw-undo,.sw-swipe{animation:none!important;transition:none!important}}
```

- [ ] **Step 4: Run tests.** `node scripts/graphify-inline.js && npm test` - pass.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/slipdelete.test.js
git commit -m "Slips: delete waits for a 5s Undo before touching storage; shared swipe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Settings view

**Files:**
- Modify: `public/account-ui.js` (`settingsHtml`, `settings()`, devices sub-view, delete flow)
- Test: append to `test/accountui.test.js`

**Interfaces:**
- Consumes: `window.swSetTheme(t)` (Task 3), `window.setBook(k)` (expose `window.swSetBook=function(k){setBook(k);};` and `window.swBookKey=function(){return BOOKMAKER;};` and `window.swBookMarks=function(){var o={};Object.keys(BOOKS).forEach(function(k){o[k]=BOOKS[k].mark||BOOKS[k].label;});return o;};` next to `function setBook` in index.html), `/api/account/consent`, `/api/auth/devices`, `/api/auth/devices/end`, `/api/auth/logout`, `/api/account/delete` (403 `reauth`), `swAcct.req/notice/signedOutHere`.
- Produces: `UI.settingsHtml(o)`.

- [ ] **Step 1: Failing tests**

```js
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
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement** (add before `var api=` and export `settingsHtml`):

```js
  var CHEV='<svg class="swa-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function devWords(n){ return n==null?"":(n<=1?"Just this device":"This phone and "+(n-1)+" other"+(n>2?"s":"")); }
  function settingsHtml(o){
    var books=Object.keys(o.marks||{}).map(function(k){
      return "<button type='button' data-book=\""+esc(k)+"\" aria-pressed=\""+(k===o.book?"true":"false")+"\">"+o.marks[k]+"</button>"; }).join("");
    return "<p class='swa-h'>Appearance</p><div class='swa-card'><div class='swa-set'><span class='swa-st'><b>Theme</b></span>"+
        "<div class='swa-seg'><button type='button' data-theme=\"dark\" aria-pressed=\""+(o.theme!=="light")+"\">Dark</button><button type='button' data-theme=\"light\" aria-pressed=\""+(o.theme==="light")+"\">Light</button></div></div></div>"+
      "<p class='swa-h'>Booking</p><div class='swa-card'><div class='swa-set swa-set0'><span class='swa-st'><b>Default bookmaker</b><small>Codes open here first</small></span></div><div class='swa-books'>"+books+"</div></div>"+
      "<p class='swa-h'>Notifications</p><div class='swa-card'><div class='swa-set'><span class='swa-st'><b>Picks by email</b><small>The day's picks, each morning</small></span>"+
        "<button class='swa-sw' id='swaMail' type='button' role=\"switch\" aria-checked=\""+(!!o.mail)+"\" aria-label='Picks by email'></button></div></div>"+
      "<p class='swa-h'>Account</p><div class='swa-card'><button class='swa-set swa-link' id='swaDevs' type='button'><span class='swa-st'><b>Signed-in devices</b><small>"+devWords(o.devices)+"</small></span>"+CHEV+"</button></div>"+
      "<button class='swa-outbtn' id='swaOut' type='button'>Sign out</button>"+
      "<div class='swa-fine'><button class='swa-del' id='swaDel' type='button'>Delete account</button></div>"+
      "<div id='swaDelBox' hidden><p class='swa-note'>This deletes your account and everything synced to it. It cannot be undone. Type DELETE to confirm.</p>"+
        "<input class='swa-in' id='swaDelIn' autocomplete='off' autocapitalize='characters'><button class='swa-outbtn swa-danger' id='swaDelGo' type='button'>Delete for good</button></div>"+
      "<p class='swa-msg' id='swaMsg' role='status' aria-live='polite'></p>";
  }
```

CSS additions (mockup 02 values): `.swa-set{display:flex;align-items:center;gap:12px;padding:12px;min-height:52px;width:100%;box-sizing:border-box;border:0;background:none;color:inherit;font:inherit;text-align:left}`, `.swa-set0{padding-bottom:8px}`, `.swa-st{flex:1;min-width:0}.swa-st b{display:block;font-size:13.5px;font-weight:700}.swa-st small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:1px}`, `.swa-link{cursor:pointer}.swa-chev{width:16px;height:16px;color:var(--faint)}`, `.swa-seg{display:flex;background:var(--card-2);border-radius:99px;padding:3px;gap:2px}.swa-seg button{border:0;background:none;color:var(--soft);font:inherit;font-size:12px;font-weight:700;padding:6px 12px;border-radius:99px;cursor:pointer}.swa-seg button[aria-pressed=true]{background:var(--card);color:var(--text)}`, `.swa-books{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 12px}.swa-books button{border:1px solid var(--line);background:var(--card-2);border-radius:99px;padding:7px 11px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;color:var(--text)}.swa-books button[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}`, `.swa-sw{width:42px;height:26px;border-radius:99px;border:0;background:var(--raise);position:relative;cursor:pointer;flex:none}.swa-sw:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}.swa-sw[aria-checked=true]{background:var(--green)}.swa-sw[aria-checked=true]:after{transform:translateX(16px)}`, `.swa-outbtn{width:100%;height:44px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;margin:18px 0 12px}.swa-danger{color:var(--red-ink)}`, `.swa-fine{text-align:center}.swa-del{border:0;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--red-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}`, `.swa-note,.swa-msg{font-size:13px;color:var(--soft);line-height:1.5}`, `.swa-card+.swa-card{margin-top:0}` and separators `.swa-card .swa-set+.swa-set{border-top:1px solid var(--line)}`.

`settings()` (replacing the stub):

```js
  function settings(){
    close();
    var a=acct();
    var v=view("Settings",settingsHtml({theme:lsGet("sw.theme")==="light"?"light":"dark",
      book:root.swBookKey?root.swBookKey():"sporty",marks:root.swBookMarks?root.swBookMarks():{},mail:false,devices:null}));
    function say(t){ v.querySelector("#swaMsg").textContent=t||""; }
    function fail(code,j){ if(code===0) return say("No connection. Check your data and try again.");
      if(j&&j.error==="reauth") return say("For your safety, sign in again, then delete within 10 minutes.");
      say("Something went wrong. Try again."); }
    v.querySelectorAll("[data-theme]").forEach(function(b){ b.onclick=function(){
      var t=b.getAttribute("data-theme"); if(root.swSetTheme) root.swSetTheme(t);
      v.querySelectorAll("[data-theme]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); }); }; });
    v.querySelectorAll("[data-book]").forEach(function(b){ b.onclick=function(){
      if(root.swSetBook) root.swSetBook(b.getAttribute("data-book"));
      v.querySelectorAll("[data-book]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); }); }; });
    var mail=v.querySelector("#swaMail");
    a.req("GET","/api/account/consent",null,function(code,j){ if(code===200) mail.setAttribute("aria-checked",j.on?"true":"false"); });
    mail.onclick=function(){ var on=mail.getAttribute("aria-checked")!=="true"; mail.disabled=true;
      a.req("POST","/api/account/consent",{on:on},function(code,j){ mail.disabled=false;
        if(code===200) mail.setAttribute("aria-checked",j.on?"true":"false"); else fail(code,j); }); };
    a.req("GET","/api/auth/devices",null,function(code,j){
      if(code===200&&j.devices) v.querySelector("#swaDevs small").textContent=devWords(j.devices.length); });
    v.querySelector("#swaDevs").onclick=function(){ devices(); };
    v.querySelector("#swaOut").onclick=signOut;
    v.querySelector("#swaDel").onclick=function(){ v.querySelector("#swaDelBox").hidden=false; v.querySelector("#swaDelIn").focus(); };
    v.querySelector("#swaDelGo").onclick=function(){
      if(v.querySelector("#swaDelIn").value.replace(/\s/g,"").toUpperCase()!=="DELETE") return say("Type DELETE to confirm.");
      a.req("POST","/api/account/delete",{},function(code,j){
        if(code===200){ closeView(); a.signedOutHere(null,true); a.notice("Your account is deleted."); return; }
        fail(code,j);
        if(j&&j.error==="reauth"){ var l=d.createElement("a"); l.textContent=" Sign in again"; l.href="/login?return="+encodeURIComponent("/?account=1"); v.querySelector("#swaMsg").appendChild(l); }
      });
    };
  }
  function devices(){
    var a=acct();
    var v=view("Signed-in devices","<div class='swa-card' id='swaDevList'><div class='swa-set'><span class='swa-st'><small>Loading</small></span></div></div><p class='swa-msg' id='swaMsg' role='status'></p>");
    function load(){
      a.req("GET","/api/auth/devices",null,function(code,j){
        var box=v.querySelector("#swaDevList"); if(code===401) return a.signedOutHere(j.reason);
        if(code!==200){ box.innerHTML=""; v.querySelector("#swaMsg").textContent="Something went wrong. Try again."; return; }
        box.innerHTML=(j.devices||[]).map(function(x){
          var when=""; try{ when=new Date(x.last_used_at).toLocaleDateString(undefined,{day:"numeric",month:"short"}); }catch(e){}
          return "<div class='swa-set'><span class='swa-st'><b>"+esc(x.label||"Device")+"</b><small>"+(x.current?"This device":"Last used "+esc(when))+"</small></span>"+
            (x.current?"":"<button class='swa-pillbtn' type='button' data-end=\""+esc(x.id)+"\">Sign out</button>")+"</div>"; }).join("");
        box.querySelectorAll("[data-end]").forEach(function(b){ b.onclick=function(){
          a.req("POST","/api/auth/devices/end",{id:b.getAttribute("data-end")},function(c2){ if(c2===200) load(); }); }; });
      });
    }
    load();
  }
```

Add `.swa-pillbtn{border:1px solid var(--line);background:var(--card-2);color:var(--text);border-radius:99px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}` to CSS.

Add the three `window.sw*` book helpers to `index.html` (see Interfaces).

- [ ] **Step 4: Run tests.** `node scripts/graphify-inline.js && npm test` - pass.

- [ ] **Step 5: Commit**

```bash
git add public/account-ui.js public/index.html test/accountui.test.js
git commit -m "Account: Settings with theme, default bookmaker, picks by email, devices, sign out, delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Home: Your slips strip and Recent rows

**Files:**
- Modify: `public/index.html` `function renderMyResults()` (replace its body), add `slipState(s)`, `bookMark(key)`, CSS
- Test: `test/slipsui.test.js`

**Interfaces:**
- Consumes: `SLIPS`, `swPend` (Task 6), `swSwipe` (Task 6), `slipWhen(iso)`, `esc`, `BOOKS[key].mark`, `openSlipsSheet()`.
- Produces: `function slipState(s)` -> `"run"|"lost"|"won"`; `function slipCounts()` -> `{all, run, lost, won}` (excluding pending-hidden); `window.SLFILTER` used by Task 9; `openSlipsSheet(filter)` accepts an optional filter.

- [ ] **Step 1: Failing tests** `test/slipsui.test.js`

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

function grab(name) {
  const i = html.indexOf("function " + name + "(");
  assert.ok(i >= 0, name);
  let depth = 0;
  for (let k = html.indexOf("{", i); k < html.length; k++) {
    if (html[k] === "{") depth++; else if (html[k] === "}" && --depth === 0) return html.slice(i, k + 1);
  }
}

test("states: running, lost, won", () => {
  const f = new Function(grab("slipState") + "; return slipState;")();
  assert.strictEqual(f({ settled: false }), "run");
  assert.strictEqual(f({ settled: true, won: false }), "lost");
  assert.strictEqual(f({ settled: true, won: true }), "won");
});

test("counts skip a slip that is waiting on Undo", () => {
  const f = new Function("SLIPS", "window", grab("slipState") + grab("slipCounts") + "; return slipCounts;");
  const S = [{ sid: "a", settled: false }, { sid: "b", settled: true, won: true }, { sid: "c", settled: true, won: false }];
  const w = { swPend: { hidden: (sid) => sid === "a" } };
  assert.deepStrictEqual(f(S, w)(), { all: 2, run: 0, lost: 1, won: 1 });
});

test("copy: Lost not Cut, no em dashes in the new slips UI", () => {
  const r = grab("renderMyResults") + grab("renderSlipsSheet");
  assert.doesNotMatch(r, /\bCut\b|—/);
  assert.match(r, /Lost/);
  assert.doesNotMatch(r, /-game slip · ×/, "the old one-slip summary is gone");
});
```

- [ ] **Step 2: Run, verify FAIL.** `node --test test/slipsui.test.js`

- [ ] **Step 3: Implement.** Add above `function renderMyResults`:

```js
function slipState(s){ return !s.settled?"run":(s.won?"won":"lost"); }
function slipCounts(){
  var c={all:0,run:0,lost:0,won:0};
  SLIPS.forEach(function(s){ if(window.swPend&&window.swPend.hidden(s.sid)) return; c.all++; c[slipState(s)]++; });
  return c;
}
function bookMark(k){ var B=BOOKS[k]; return B?(B.mark||esc(B.label)):""; }
var SL_PEEKED=false;
```

Replace the body of `renderMyResults()` with:

```js
function renderMyResults(){
  var host=$("myres"); if(!host) return;
  var c=slipCounts();
  if(!c.all){ host.innerHTML=""; return; }
  var rows=SLIPS.filter(function(s){ return !(window.swPend&&window.swPend.hidden(s.sid)); }).slice(0,5);
  host.innerHTML=
    "<div class='ys'><div class='ys-top'><h3>Your slips</h3><span class='ys-ct'><span class='num'>"+c.all+"</span> saved</span>"+
      "<button class='ys-all' type='button' data-ysf='all'>See all</button></div>"+
      "<div class='ys-chips'>"+
        "<button class='ys-chip run' type='button' data-ysf='run'>"+(c.run?"<span class='ys-live'></span>":"")+"<span class='num'>"+c.run+"</span>running</button>"+
        "<button class='ys-chip lost' type='button' data-ysf='lost'><span class='num'>"+c.lost+"</span>lost</button>"+
        "<button class='ys-chip won' type='button' data-ysf='won'><span class='num'>"+c.won+"</span>won</button>"+
      "</div></div>"+
    "<div class='ys-lh'><h4>Recent</h4><span class='ys-clr'></span></div>"+
    rows.map(function(s){
      return "<div class='sw-swipe' data-sid='"+esc(s.sid)+"'><div class='sw-bin'>"+BIN_SVG+"</div>"+
        "<div class='sw-card ys-row'><span class='ys-dot "+slipState(s)+"' role='img' aria-label='"+({run:"Running",lost:"Lost",won:"Won"})[slipState(s)]+"'></span>"+
        "<span class='ys-m'><span class='ys-code num'>"+esc(s.code||"No code")+"</span>"+
        "<small>"+(s.book?bookMark(s.book)+", ":"")+s.legs.length+" games, "+esc(slipWhen(s.at))+"</small></span>"+
        "<span class='ys-od num'>×"+(s.odds>=1000?Math.round(s.odds).toLocaleString():s.odds.toFixed(2))+"</span></div></div>";
    }).join("");
  host.querySelectorAll("[data-ysf]").forEach(function(b){ b.onclick=function(){ openSlipsSheet(b.getAttribute("data-ysf")); }; });
  host.querySelectorAll(".sw-swipe").forEach(function(r){ swSwipe(r,function(){ window.swPend.del(r.getAttribute("data-sid")); }); });
  clearAllControl(host.querySelector(".ys-clr"));
  if(!SL_PEEKED){ SL_PEEKED=true; var first=host.querySelector(".sw-card"); if(first) first.classList.add("sw-peek"); }
}
var BIN_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
/* Clear all asks in place: "Clear N? Keep / Clear". No confirm(). */
function clearAllControl(slot){
  if(!slot) return;
  function idle(){ slot.innerHTML="<button class='ys-clrb' type='button'>Clear all</button>"; slot.firstChild.onclick=ask; }
  function ask(){
    var n=slipCounts().all; if(!n) return;
    slot.innerHTML="<span class='ys-ask'>Clear "+n+"?<button class='ys-no' type='button'>Keep</button><button class='ys-yes' type='button'>Clear</button></span>";
    slot.querySelector(".ys-no").onclick=idle;
    var y=slot.querySelector(".ys-yes"); y.onclick=function(){ window.swPend.clearAll(); }; y.focus();
  }
  idle();
}
```

Change `openSlipsSheet()` to `function openSlipsSheet(filter){ ... if(filter) window.SLFILTER=filter; renderSlipsSheet(); ...}` (keep the gate line first; pass `filter` through the gate's resume by closing over it: `swGate("slips",null,function(){openSlipsSheet(filter);},"slips")`).

CSS (mockup 01 "home summary" + "home row" values, renamed `ys-`):

```css
.ys{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 10px 10px;margin:0 0 16px}
.ys-top{display:flex;align-items:baseline;gap:6px;margin:0 2px 9px}
.ys-top h3{margin:0;font-size:14px;font-weight:800}
.ys-ct{font-size:12px;font-weight:600;color:var(--faint)}
.ys-all{margin-left:auto;border:0;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--red-ink);cursor:pointer}
.ys-chips{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.ys-chip{display:flex;align-items:center;justify-content:center;gap:6px;height:34px;border-radius:99px;border:1px solid var(--line);background:var(--card-2);cursor:pointer;color:var(--soft);font:inherit;font-size:12px;font-weight:700}
.ys-chip .num{font-size:15px}
.ys-chip.run .num{color:var(--accent)}.ys-chip.lost .num{color:var(--red-ink)}.ys-chip.won .num{color:var(--green-ink)}
.ys-live{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:ysLive 1.6s ease-in-out infinite}
@keyframes ysLive{50%{opacity:.25}}
.ys-lh{display:flex;align-items:center;justify-content:space-between;min-height:30px;margin:0 2px 8px}
.ys-lh h4{margin:0;font-size:13px;font-weight:700;color:var(--soft)}
.ys-clrb{border:0;background:none;color:var(--faint);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:6px 0}
.ys-ask{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700}
.ys-no{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:99px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.ys-yes{border:0;background:var(--red-fill);color:#fff;border-radius:99px;padding:7px 13px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
.ys-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card);border:1px solid var(--line);border-radius:12px}
.ys-m{flex:1;min-width:0}.ys-code{display:block;font-size:14px;letter-spacing:.06em}
.ys-m small{display:block;font-size:12px;font-weight:600;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.ys-od{font-size:16px;color:var(--accent)}
.ys-dot{width:8px;height:8px;border-radius:50%;flex:none}
.ys-dot.run{background:var(--accent);animation:ysLive 1.6s ease-in-out infinite}.ys-dot.lost{background:var(--red)}.ys-dot.won{background:var(--green)}
@media (hover:hover){.ys-chip:hover{border-color:var(--grey)}.ys-clrb:hover{color:var(--red-ink)}}
```

Check that a `.num` class with `font-variant-numeric:tabular-nums;font-weight:800` exists in the main stylesheet; if not, add `.num{font-variant-numeric:tabular-nums;font-weight:800}` scoped as `.ys .num,.ys-row .num,.sl2 .num`.

- [ ] **Step 4: Run tests.** `node scripts/graphify-inline.js && npm test` - pass (update any older test that asserted the "N-game slip" summary text by changing it to assert the new strip; do not delete assertions about grading or slip storage).

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/slipsui.test.js
git commit -m "Home: Your slips strip with running, lost, won, and swipeable Recent rows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: My slips sheet redesign

**Files:**
- Modify: `public/index.html` `function renderSlipsSheet()` (replace), the `#slipsSheet` header markup (title only, no avatar), CSS for `.sl2-*`
- Test: append to `test/slipsui.test.js`

**Interfaces:**
- Consumes: `slipState`, `slipCounts`, `clearAllControl`, `swSwipe`, `swPend`, `BIN_SVG`, `bookMark`, `slipWhen`, `copyText`, `shareCode(code, legs, B)`, `shareSlip(legs, odds)`, `shareWin(sp, btn)`, the existing Rebuild (`data-slrb`) and Make it safer (`data-slsafe`) handlers, `window.SLFILTER`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Failing tests** (append)

```js
test("the sheet: filters with counts, top actions, gold code, progress, no avatar", () => {
  const r = grab("renderSlipsSheet");
  for (const w of ["All", "Running", "Lost", "Won", "Share", "Rebuild", "Copy", "Show ", "landed", "to play"]) assert.match(r, new RegExp(w), w);
  assert.match(r, /data-slsafe/, "Make it safer stays, only when running");
  assert.match(r, /swSwipe\(/); assert.match(r, /clearAllControl\(/);
  const sheet = /<div class="sheet slips-sheet" id="slipsSheet"[\s\S]*?<\/div>\s*<\/div>/.exec(html)[0];
  assert.doesNotMatch(sheet, /\/av\//);
});

test("progress words", () => {
  const f = new Function(grab("progressWords") + "; return progressWords;")();
  assert.strictEqual(f([{ res: "win" }, { res: "win" }, {}, {}]), "<b>2</b> landed, 2 to play");
  assert.strictEqual(f([{ res: "win" }, { res: "lose" }]), "<b>1</b> landed, <b>1</b> lost");
  assert.strictEqual(f([{}, {}]), "<b>0</b> landed, 2 to play");
});
```

- [ ] **Step 2: Run, verify FAIL.**

- [ ] **Step 3: Implement.** Add `progressWords` and replace `renderSlipsSheet`:

```js
function progressWords(legs){
  var w=0,l=0; legs.forEach(function(x){ if(x.res==="win") w++; else if(x.res==="lose") l++; });
  var left=legs.filter(function(x){ return x.res!=="win"&&x.res!=="lose"&&x.res!=="void"; }).length;
  return "<b>"+w+"</b> landed"+(l?", <b>"+l+"</b> lost":"")+(left?", "+left+" to play":"");
}
window.SLFILTER="all";
var SHARE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
var SAFE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>';
var RB_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/></svg>';
var MORE_SVG='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
var COPY_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
var CHEV_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
var SLOPEN=null;
function renderSlipsSheet(){
  var body=$("slipsBody"); if(!body) return;
  var c=slipCounts();
  if(!c.all){
    body.innerHTML="<div class='bld-empty'><b>No slips yet</b>Book one and it will be kept here, with its result once the games finish.</div>";
    return;
  }
  var F=window.SLFILTER||"all";
  var shown=SLIPS.filter(function(s){ return !(window.swPend&&window.swPend.hidden(s.sid))&&(F==="all"||slipState(s)===F); });
  if(SLOPEN===null) SLOPEN=(shown[0]&&shown[0].sid)||"";
  var LBL={run:"Running",lost:"Lost",won:"Won"};
  body.innerHTML=
    "<div class='sl2-filt'>"+[["all","All"],["run","Running"],["lost","Lost"],["won","Won"]].map(function(f){
      return "<button type='button' data-slf='"+f[0]+"' class='"+(F===f[0]?"on":"")+"'>"+f[1]+"<span class='num'>"+c[f[0]]+"</span></button>"; }).join("")+"</div>"+
    "<div class='ys-lh'><h4>"+shown.length+(shown.length===1?" slip":" slips")+"</h4><span class='ys-clr'></span></div>"+
    (shown.length?"":"<div class='bld-empty'><b>Nothing here</b>No "+LBL[F].toLowerCase()+" slips right now.</div>")+
    shown.map(function(sp){
      var st=slipState(sp), open=sp.sid===SLOPEN;
      var safe=sp.code&&sp.book&&BOOKS[sp.book]&&!sp.settled;
      return "<div class='sw-swipe' data-sid='"+esc(sp.sid)+"'><div class='sw-bin'>"+BIN_SVG+"</div>"+
        "<div class='sw-card sl2"+(open?" open":"")+"'>"+
        "<div class='sl2-top'><span class='sl2-st "+st+"'>"+LBL[st]+"</span>"+
          (isJackpotSlip(sp)?"<span class='sl2-st jack'>Jackpot</span>":"")+
          "<span class='sl2-meta'>"+(sp.book?bookMark(sp.book):"")+"<span>"+esc(slipWhen(sp.at))+"</span></span>"+
          "<span class='sl2-od num'>×"+(sp.odds>=1000?Math.round(sp.odds).toLocaleString():sp.odds.toFixed(2))+"</span></div>"+
        "<div class='sl2-acts'>"+
          "<button class='sl2-a share' type='button' data-slsh='"+esc(sp.sid)+"'>"+SHARE_SVG+"Share</button>"+
          (safe?"<a class='sl2-a safer' data-slsafe=\""+esc(sp.code)+"\" data-slbook=\""+esc(sp.book)+"\" href=\"/?book="+encodeURIComponent(sp.book)+"&code="+encodeURIComponent(sp.code)+"&go=safer\">"+SAFE_SVG+"Safer</a>":"")+
          "<button class='sl2-a' type='button' data-slrb='"+esc(sp.sid)+"'>"+RB_SVG+"Rebuild</button>"+
          "<button class='sl2-a more' type='button' data-slmore='"+esc(sp.sid)+"' aria-label='More'>"+MORE_SVG+"</button></div>"+
        (sp.code?"<div class='sl2-code'><span class='num'>"+esc(sp.code)+"</span><button type='button' data-slcp=\""+esc(sp.code)+"\" aria-label='Copy booking code'>"+COPY_SVG+"Copy</button></div>":"")+
        "<div class='sl2-mid'><span>"+progressWords(sp.legs)+"</span><div class='sl2-prog'>"+sp.legs.map(function(l){
          return "<i class='"+(l.res==="win"?"w":l.res==="lose"?"l":"")+"'></i>"; }).join("")+"</div></div>"+
        "<div class='sl2-legs'>"+sp.legs.map(function(l){
          var sc=(l.hg!=null&&l.ag!=null)?(" "+l.hg+"-"+l.ag):"";
          return "<div class='sl2-leg "+(l.res||"open")+"'><span class='d'></span><span class='t'>"+esc(l.home)+" v "+esc(l.away)+"</span><span class='p'>"+esc(l.label||l.code)+esc(sc)+"</span></div>"; }).join("")+"</div>"+
        "<button class='sl2-tog' type='button' data-slop='"+esc(sp.sid)+"' aria-expanded='"+open+"'><span>"+(open?"Hide games":"Show "+sp.legs.length+" games")+"</span>"+CHEV_SVG+"</button>"+
        "</div></div>";
    }).join("");
  body.querySelectorAll("[data-slf]").forEach(function(b){ b.onclick=function(){ window.SLFILTER=b.getAttribute("data-slf"); SLOPEN=null; renderSlipsSheet(); }; });
  body.querySelectorAll("[data-slop]").forEach(function(b){ b.onclick=function(){ SLOPEN=(SLOPEN===b.dataset.slop)?"":b.dataset.slop; renderSlipsSheet(); }; });
  body.querySelectorAll("[data-slsh]").forEach(function(b){ b.onclick=function(){
    var sp=SLIPS.filter(function(s){return s.sid===b.dataset.slsh;})[0]; if(!sp) return;
    if(sp.code) shareCode(sp.code,sp.legs,BOOKS[sp.book]); else shareSlip(sp.legs,sp.odds); }; });
  body.querySelectorAll("[data-slmore]").forEach(function(b){ b.onclick=function(){ slipMoreMenu(b,b.dataset.slmore); }; });
  body.querySelectorAll(".sw-swipe").forEach(function(r){ swSwipe(r,function(){ window.swPend.del(r.getAttribute("data-sid")); }); });
  clearAllControl(body.querySelector(".ys-clr"));
  wireSlipButtons(body);
}
```

Move the existing listeners for `[data-slcp]`, `[data-slrb]`, `[data-slsafe]`, `[data-slwin]` from the old `renderSlipsSheet` into `function wireSlipButtons(body){...}` unchanged. Add `slipMoreMenu(btn,sid)`: a small popover anchored to the button with "Delete" (calls `window.swPend.del(sid)`) and, when the slip is won, "Share your win" (calls `shareWin(sp,btn)`); it closes on outside tap or Escape. Use the same classes as the account menu items for look (`.swa-mi` styles copied as `.sl2-mi`). Delete the old "Clear slip history" footer and `askRemoveSlip` callers (keep `removeSlip`/`clearSlips`, Task 6 commits through them).

In the `#slipsSheet` header markup, make sure there is no avatar element (only the title "My slips" and the close button).

CSS `.sl2-*` (mockup 01 "slip card" values, prefixed):

```css
.sl2-filt{display:flex;gap:6px;margin:0 0 6px;overflow-x:auto;scrollbar-width:none}
.sl2-filt button{flex:none;padding:7px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--soft);font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.sl2-filt button.on{background:var(--red-fill);border-color:var(--red-fill);color:#fff}
.sl2-filt .num{font-weight:700;opacity:.75;margin-left:4px}
.sl2{background:var(--card);border:1px solid var(--line);border-radius:12px}
.sl2-top{display:flex;align-items:center;gap:8px;padding:12px 12px 10px}
.sl2-st{font-size:10.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;padding:4px 8px;border-radius:99px}
.sl2-st.run{color:var(--accent);background:color-mix(in srgb,var(--accent) 13%,transparent)}
.sl2-st.lost{color:var(--red-ink);background:color-mix(in srgb,var(--red) 13%,transparent)}
.sl2-st.won{color:var(--green-ink);background:color-mix(in srgb,var(--green) 13%,transparent)}
.sl2-meta{font-size:12px;font-weight:600;color:var(--faint);display:flex;gap:5px;align-items:baseline;min-width:0;white-space:nowrap;overflow:hidden}
.sl2-od{margin-left:auto;font-size:20px;color:var(--accent)}
.sl2-acts{display:flex;gap:4px;padding:0 12px 10px}
.sl2-a{display:flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 10px;border-radius:99px;border:1px solid var(--line);background:var(--card-2);color:var(--text);font:inherit;font-size:12px;font-weight:800;cursor:pointer;flex:none;text-decoration:none}
.sl2-a svg{width:15px;height:15px}
.sl2-a.share{background:var(--red-fill);border-color:var(--red-fill);color:#fff;flex:1 1 0;min-width:74px}
.sl2-a.safer{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.sl2-a.more{width:34px;padding:0}
.sl2-code{display:flex;align-items:center;gap:10px;margin:0 12px 10px;padding:7px 7px 7px 12px;border-radius:8px;background:var(--card-2)}
.sl2-code .num{font-size:18px;letter-spacing:.08em;color:var(--accent)}
.sl2-code button{margin-left:auto;display:flex;align-items:center;gap:5px;border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:99px;padding:5px 11px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.sl2-code svg{width:13px;height:13px}
.sl2-mid{display:flex;align-items:center;gap:10px;padding:0 12px 11px;color:var(--soft);font-size:12px;font-weight:600}
.sl2-mid b{color:var(--text)}
.sl2-prog{flex:1;display:flex;gap:3px}.sl2-prog i{flex:1;height:4px;border-radius:2px;background:var(--raise)}
.sl2-prog i.w{background:var(--green)}.sl2-prog i.l{background:var(--red)}
.sl2-legs{max-height:0;overflow:hidden;transition:max-height 300ms var(--ease-out)}.sl2.open .sl2-legs{max-height:1400px}
.sl2-leg{display:flex;align-items:center;gap:9px;padding:8px 12px;border-top:1px solid var(--line);font-size:12.5px}
.sl2-leg .d{width:7px;height:7px;border-radius:50%;background:var(--grey);flex:none}
.sl2-leg.win .d{background:var(--green)}.sl2-leg.lose .d{background:var(--red)}
.sl2-leg .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sl2-leg .p{color:var(--soft);font-size:12px;font-weight:600}
.sl2-tog{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;height:38px;border:0;border-top:1px solid var(--line);background:none;color:var(--soft);font:inherit;font-size:12.5px;font-weight:700;border-radius:0 0 12px 12px;cursor:pointer}
.sl2-tog svg{width:15px;height:15px;transition:transform 250ms var(--ease-out)}.sl2.open .sl2-tog svg{transform:rotate(180deg)}
@media (hover:hover){.sl2-a:not(.share):not(.safer):hover{background:var(--raise)}.sl2-tog:hover{color:var(--text)}}
```

- [ ] **Step 4: Run tests.** `node scripts/graphify-inline.js && npm test` - pass.

- [ ] **Step 5: Commit**

```bash
git add public/index.html test/slipsui.test.js
git commit -m "My slips: filters, top actions, gold code, progress, swipe delete with Undo, Clear all in place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Whole-feature check and ship gate

**Files:** none new (fixes go where the check finds them).

- [ ] **Step 1: Full suite.** `node scripts/graphify-inline.js && npm test` - all pass; `node --test test/pageweight.test.js` under 720.
- [ ] **Step 2: Design pass (owner rule).** Run the impeccable detector on the changed UI: `sh ~/.claude/skills/impeccable/scripts/impeccable detect --json public/index.html public/account-ui.js`. Fix anything new except the brand font and popover border+shadow (both deliberate).
- [ ] **Step 3: Browser pass on a Vercel preview** (`git push origin HEAD:refs/heads/account-slips`): phone 360/390/430 and desktop 1280, dark and light, signed in:
  - Avatar opens the menu from the top right; Escape and outside tap close; focus returns.
  - Profile: pick an avatar, the top bar changes at once; reload, it stays; another signed-in browser shows it after a minute.
  - Settings: theme flips and persists; default bookmaker changes the board; Picks by email toggles; devices list; delete shows the typed confirmation.
  - Home: strip counts, pills open the filtered sheet, first row nudges once, swipe deletes, Undo restores, Clear all asks in place, Undo restores all.
  - Delete then switch apps within 5s, come back: the slip is gone and stays gone after a sync.
  - Signed out: header shows the person icon and no theme toggle; nothing else changed.
- [ ] **Step 4: Screenshots to the owner** with the preview link; deploy to main only on their yes.
