# Soft Wall + One Tap + Opt-in + Tactics Spell: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-out readers who tap Book, Build or My slips get a sign-in sheet. It offers Google One Tap, an email code and an unticked marketing opt-in. After sign-in, the Tactics Spell plays while the account loads, then the action they tapped runs.

**Architecture:**
- Server side:
  - `api/auth.js` gains three routes: `google/nonce`, `google/onetap` (verified with Google's public keys in `lib/auth/google.js`) and `unsub`.
  - The opt-in flag rides on every sign-in route into a new `email_consent` table, through `lib/auth/consent.js`.
- Client side, two new plain-ES5 files served from `public/`:
  - `signin.js` is the sheet.
  - `spell.js` is the loader.
- `public/index.html` gets a `swGate()` in its swAccount block, and the four entry points call it.
- `/login` mounts the same sheet full-page.

**Tech Stack:**
- Node (Vercel functions) using the built-in `crypto`. No new dependencies.
- Plain ES5 in the browser.
- Supabase through PostgREST (`lib/supabase.js` `call`).
- `node --test` for the suite.

**Spec:** `docs/superpowers/specs/2026-09-30-signin-wall-design.md`. The colour reference is `docs/design/signin-loaders/09-signin-flow-site-colours.html`, and the sheet states are in `10-signin-sheet-site-colours.html`.

## Global Constraints

- The browser code in `public/signin.js` and `public/spell.js` is ES5: no `=>`, `let`, `const`, template literals or classes. It runs on old Android browsers.
- No hex colours in `public/signin.js` or `public/spell.js` except `#fff`. Colours come from site tokens with `var(--new, var(--static-page-name))` fallbacks (Task 7 has the table).
- Red means brand and action, gold means odds and wins, greys mean structure. Green is not used.
- Every POST route except `unsub` goes through `H.guardPost` (the `X-SW-Request` header plus a same-origin check).
- With `AUTH_ENABLED` off, nothing changes: `swGate` returns true and the auth routes return 404.
- Opt-in wording, exactly: `Email me the wizard's best picks. Unsubscribe any time.`
- Headlines, exactly: `Sign in to book this slip` / `Sign in to build a slip` / `Sign in to see your slips`. Subline: `Free. Your slips follow you to every phone and laptop.`
  - The spec also listed "save this slip". In the code, a slip is only saved as a side effect of booking (`rememberSlip`, called after a code comes back). So there is no separate save tap to gate, and "book" covers it. This is a deliberate difference from the spec.
- Loader limits: at least 1.8s from submit to goal; after 20s show `Still working… check your connection` with a Retry button; hold "You're in" for 900ms after the goal.
- After any change to `public/index.html`, run `node scripts/graphify-inline.js` before `npm test`, or the two shadow tests fail.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never deploy with `vercel --prod` from this machine: untracked junk would ship. Push to a branch for the preview.

## Review Focus

1. **A reader taps Book before `/api/me` has answered on page load.** They must never be walled by mistake. `swGate` returns true until the account state is known. (Test in Task 8.)
2. **The sign-in script fails to load** (network, CSP or an ad blocker). The site must still book as before. `swGate` returns true when `window.swSignIn` is missing. (Test in Task 8.)
3. **A One Tap credential is replayed or posted twice** (double tap, back button). The second post must fail cleanly with 401, and there must be no second session. (Test in Task 3.)
4. **The opt-in box is left unticked.** Nothing may be written to `email_consent`, on every path: One Tap, email code and Google redirect. (Test in Task 3.)
5. **An unsubscribe link is opened by a mail scanner doing GET, or by a one-click POST without our header.** Both must revoke, and a forged token must not. (Test in Task 4.)

---

## File structure

| File | Status | Responsibility |
| ---- | ------ | -------------- |
| `sql/accounts.sql` | modify | `email_consent` table, and an `optin` column on `auth_attempts` |
| `lib/auth/db.js` | modify | `consentFor`, `upsertConsent`, `revokeConsent`; `optin` in ATT_COLS |
| `test/helpers/fakes.js` | modify | fake versions of the three consent functions |
| `lib/auth/consent.js` | create | wording constant, `record()`, `unsubToken()`, `unsubUrl()` |
| `lib/auth/google.js` | modify | `verifyIdToken()` using Google's public keys; `checkClaims` also returns `name` |
| `api/auth.js` | modify | `google/nonce`, `google/onetap` and `unsub` routes; optin on `email/verify` and `google/prepare`/`callback` |
| `api/account.js` | modify | `consent` action (GET/POST); export includes consent |
| `vercel.json` | modify | Google Identity Services hosts in the CSP |
| `scripts/prebuild.js` | modify | `sw-gcid` and `sw-ts` metas next to `sw-auth` |
| `public/spell.js` | create | the Tactics Spell loader |
| `public/signin.js` | create | the sign-in sheet: One Tap, redirect fallback, email code, opt-in, in-app handling |
| `public/index.html` | modify | `--ball`/`--ball-ink` tokens, script tags, `swGate`, resume after redirect, `gateDetail`, five gated entry points, "Picks by email" row |
| `lib/pages.js` | modify | `/login` mounts the sheet full-page |
| `public/privacy.html` source (in `lib/pages.js` or `public/privacy.html`) | modify | marketing email paragraph |
| `docs/accounts-runbook.md` | modify | owner steps: JavaScript origin, SQL, device pass |

---

### Task 1: Consent storage (SQL, db, fakes)

**Files:**
- Modify: `sql/accounts.sql` (append after the `subscriptions` table, before the functions)
- Modify: `lib/auth/db.js:68` (ATT_COLS) and the exports at `lib/auth/db.js:144`
- Modify: `test/helpers/fakes.js:9` (state) and `:15-63` (db object)
- Test: `test/auth-schema.test.js`, `test/auth-db.test.js`

**Interfaces:**
- Produces:
  - `db.consentFor(userId) -> Promise<{granted_at, wording, source, revoked_at} | null>`
  - `db.upsertConsent(userId, {granted_at, wording, source}) -> Promise<boolean>`, which always sets `revoked_at: null`
  - `db.revokeConsent(userId, nowIso) -> Promise<boolean>`
  - `auth_attempts.optin boolean`
  - the fake DB keeps rows in `t.consent[userId]`

- [ ] **Step 1: Write the failing schema test.** Append to `test/auth-schema.test.js`:

```js
test("email consent: its own table, RLS on, gone with the user, and an optin flag on attempts", () => {
  assert.match(sql, /create table if not exists public\.email_consent \(/);
  assert.match(sql, /alter table public\.email_consent enable row level security;/);
  assert.match(sql, /create table if not exists public\.email_consent[\s\S]*?user_id uuid primary key references public\.users\(id\) on delete cascade/);
  for (const col of ["granted_at timestamptz not null", "wording text not null", "source text not null", "revoked_at timestamptz"])
    assert.match(sql, new RegExp("email_consent[\\s\\S]*?" + col.replace(/[()]/g, "\\$&")), col);
  assert.match(sql, /alter table public\.auth_attempts add column if not exists optin boolean not null default false;/);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/auth-schema.test.js`. Expected: FAIL on `email_consent`.

- [ ] **Step 3: Add the SQL.** Append to `sql/accounts.sql` after the `subscriptions` block:

```sql
-- Marketing email consent: a row only when the reader ticked the box.
-- wording is the exact text they saw; revoked_at is set by unsubscribe.
create table if not exists public.email_consent (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted_at timestamptz not null,
  wording text not null,
  source text not null,
  revoked_at timestamptz
);
alter table public.email_consent enable row level security;

-- The Google redirect flow carries the opt-in tick across the round trip.
alter table public.auth_attempts add column if not exists optin boolean not null default false;
```

Also add `"email_consent"` to the `TABLES` array at the top of `test/auth-schema.test.js`, so the RLS and no-policy test covers it.

- [ ] **Step 4: Run it and confirm it passes.** Run `node --test test/auth-schema.test.js`. Expected: PASS.

- [ ] **Step 5: Write the failing db test.** Append to `test/auth-db.test.js`. Follow that file's pattern: it stubs `global.fetch` and records the request. Read the top of the file for the exact helper name, and use it the same way the `deleteUser` test does:

```js
test("consent: upsert merges on user_id and clears revoked_at; revoke patches only that user", async () => {
  const calls = [];
  const restore = stubFetch(calls, () => ({ ok: true, status: 201, json: async () => [], text: async () => "" }));
  try {
    const id = "00000000-0000-4000-8000-000000000001";
    assert.strictEqual(await db.upsertConsent(id, { granted_at: "2026-09-30T10:00:00.000Z", wording: "W", source: "email-code" }), true);
    assert.match(calls[0].url, /email_consent\?on_conflict=user_id$/);
    assert.match(calls[0].init.headers.Prefer, /resolution=merge-duplicates/);
    assert.deepStrictEqual(JSON.parse(calls[0].init.body),
      { user_id: id, revoked_at: null, granted_at: "2026-09-30T10:00:00.000Z", wording: "W", source: "email-code" });
    await db.revokeConsent(id, "2026-10-01T00:00:00.000Z");
    assert.match(calls[1].url, new RegExp("email_consent\\?user_id=eq\\." + id));
    assert.strictEqual(await db.upsertConsent("not-a-uuid", {}), false);
  } finally { restore(); }
});
```

If `test/auth-db.test.js` names its fetch stub differently, use its name. Do not add a second stub helper.

- [ ] **Step 6: Run it and confirm it fails.** Run `node --test test/auth-db.test.js`. Expected: FAIL, `db.upsertConsent is not a function`.

- [ ] **Step 7: Implement the db functions.** In `lib/auth/db.js`, append `,optin` to ATT_COLS:

```js
const ATT_COLS = "select=id,state_hash,code_verifier,nonce,return_to,created_at,expires_at,started_at,consumed_at,optin";
```

Then add, before `module.exports`:

```js
const consentFor = (userId) => okId(userId) ? one("email_consent?user_id=eq." + userId + "&select=granted_at,wording,source,revoked_at") : Promise.resolve(null);
async function upsertConsent(userId, row) {
  if (!okId(userId)) return false;
  const r = await call("email_consent?on_conflict=user_id", { method: "POST",
    headers: JSONH({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(Object.assign({ user_id: userId, revoked_at: null }, row)) });
  return r.ok;
}
const revokeConsent = (userId, nowIso) => okId(userId) ? patch("email_consent?user_id=eq." + userId, { revoked_at: nowIso }) : Promise.resolve(false);
```

Add `consentFor, upsertConsent, revokeConsent` to `module.exports`.

- [ ] **Step 8: Add the fakes.** In `test/helpers/fakes.js`, add `consent: {}` to the `t` object on line 9, and add these to `db`:

```js
    async consentFor(uid) { return t.consent[uid] ? copy(t.consent[uid]) : null; },
    async upsertConsent(uid, row) { t.consent[uid] = Object.assign({ revoked_at: null }, row); return true; },
    async revokeConsent(uid, iso) { if (t.consent[uid]) t.consent[uid].revoked_at = iso; return true; },
```

In the fake `deleteUser`, add `delete t.consent[uid];`.

- [ ] **Step 9: Run and commit.** Run `node --test test/auth-schema.test.js test/auth-db.test.js`. Expected: PASS.

```bash
git add sql/accounts.sql lib/auth/db.js test/helpers/fakes.js test/auth-schema.test.js test/auth-db.test.js
git commit -m "Accounts: email_consent table and optin flag on sign-in attempts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Verify Google ID tokens ourselves

**Files:**
- Modify: `lib/auth/google.js`
- Test: `test/auth-google.test.js`

**Interfaces:**
- Produces:
  - `google.verifyIdToken(jwt, {clientId, nonce, nowMs, fetch?}) -> Promise<{ok:true, sub, email, name} | {ok:false, why}>`. `why` is one of: `shape`, `alg`, `keys`, `kid`, `sig`, or any `checkClaims` reason.
  - `google._resetKeys()` for tests.
  - `checkClaims` now also returns `name`: the `given_name` claim trimmed to 40 characters, or `""`.

- [ ] **Step 1: Write the failing tests.** Append to `test/auth-google.test.js`:

```js
const crypto = require("crypto");
function keyPair(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { kid, privateKey, jwk: Object.assign(publicKey.export({ format: "jwk" }), { kid, alg: "RS256", use: "sig" }) };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(k, claims, header) {
  const h = b64(Object.assign({ alg: "RS256", kid: k.kid, typ: "JWT" }, header || {})), p = b64(claims);
  return h + "." + p + "." + crypto.sign("RSA-SHA256", Buffer.from(h + "." + p), k.privateKey).toString("base64url");
}
const NOW = Date.UTC(2026, 8, 30, 12);
const good = (o) => Object.assign({ iss: "https://accounts.google.com", aud: "cid", sub: "g-9", email: "Tunde.A@gmail.com",
  email_verified: true, given_name: "Tunde", nonce: "n1", iat: NOW / 1000 - 5, exp: NOW / 1000 + 3600 }, o || {});
function certs(keys, counter) {
  return async () => { if (counter) counter.n++; return { ok: true, headers: { get: () => "public, max-age=3600" }, json: async () => ({ keys: keys.map((k) => k.jwk) }) }; };
}

test("verifyIdToken: a Google-signed token with our audience and nonce passes, and gives a first name", async () => {
  G._resetKeys();
  const k = keyPair("k1");
  const r = await G.verifyIdToken(sign(k, good()), { clientId: "cid", nonce: "n1", nowMs: NOW, fetch: certs([k]) });
  assert.deepStrictEqual(r, { ok: true, sub: "g-9", email: "tunde.a@gmail.com", name: "Tunde" });
});

test("verifyIdToken refuses: wrong key, tampered body, wrong aud, wrong nonce, expired, alg none, HS256", async () => {
  G._resetKeys();
  const k = keyPair("k1"), other = keyPair("k1");
  const o = { clientId: "cid", nonce: "n1", nowMs: NOW, fetch: certs([k]) };
  assert.strictEqual((await G.verifyIdToken(sign(other, good()), o)).why, "sig");
  const t = sign(k, good()).split("."); t[1] = b64(good({ email: "evil@x.com" }));
  assert.strictEqual((await G.verifyIdToken(t.join("."), o)).why, "sig");
  assert.strictEqual((await G.verifyIdToken(sign(k, good({ aud: "other" })), o)).why, "aud");
  assert.strictEqual((await G.verifyIdToken(sign(k, good({ nonce: "n2" })), o)).why, "nonce");
  assert.strictEqual((await G.verifyIdToken(sign(k, good({ exp: NOW / 1000 - 1 })), o)).why, "exp");
  assert.strictEqual((await G.verifyIdToken(b64({ alg: "none", kid: "k1" }) + "." + b64(good()) + ".", o)).why, "alg");
  assert.strictEqual((await G.verifyIdToken(sign(k, good(), { alg: "HS256" }), o)).why, "alg");
  assert.strictEqual((await G.verifyIdToken("garbage", o)).why, "shape");
});

test("verifyIdToken caches Google's keys and refetches once for a new kid", async () => {
  G._resetKeys();
  const k1 = keyPair("k1"), k2 = keyPair("k2"), n = { n: 0 };
  let set = [k1];
  const fetch = async () => certs(set, n)();
  const o = { clientId: "cid", nonce: "n1", nowMs: NOW, fetch };
  assert.ok((await G.verifyIdToken(sign(k1, good()), o)).ok);
  assert.ok((await G.verifyIdToken(sign(k1, good()), o)).ok);
  assert.strictEqual(n.n, 1, "second call used the cache");
  set = [k1, k2];
  assert.ok((await G.verifyIdToken(sign(k2, good()), o)).ok, "rotated key found after one refetch");
  assert.strictEqual(n.n, 2);
  assert.strictEqual((await G.verifyIdToken(sign(keyPair("k3"), good()), o)).why, "kid");
});

test("verifyIdToken says keys when Google's key endpoint is down", async () => {
  G._resetKeys();
  const r = await G.verifyIdToken(sign(keyPair("k1"), good()), { clientId: "cid", nonce: "n1", nowMs: NOW, fetch: async () => { throw new Error("down"); } });
  assert.deepStrictEqual(r, { ok: false, why: "keys" });
});
```

If the file imports the module under another name than `G`, use that name.

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/auth-google.test.js`. Expected: FAIL, `G._resetKeys is not a function`.

- [ ] **Step 3: Implement.** In `lib/auth/google.js`:

First, update the header comment: keep the first paragraph, then add:

```js
/* One Tap hands the ID token to the browser, not to us, so for that path
   (verifyIdToken) the RS256 signature IS checked, against Google's
   published keys, before any claim is trusted. */
```

In `checkClaims`, replace the final `return` with:

```js
  const name = typeof c.given_name === "string" ? c.given_name.trim().slice(0, 40) : "";
  return { ok: true, sub: c.sub, email, name };
```

Add, above `module.exports`:

```js
const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
let KEYS = { byKid: {}, until: 0 };
function _resetKeys() { KEYS = { byKid: {}, until: 0 }; }

async function loadKeys(fetchFn, nowMs) {
  const f = fetchFn || fetch;
  const r = await f(CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!r || !r.ok) throw new Error("certs " + (r && r.status));
  const j = await r.json();
  const byKid = {};
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])) if (k && k.kid && k.kty === "RSA") byKid[k.kid] = k;
  const m = /max-age=(\d+)/.exec(String((r.headers && r.headers.get && r.headers.get("cache-control")) || ""));
  KEYS = { byKid, until: nowMs + Math.min(86400, m ? +m[1] : 3600) * 1000 };
}

async function keyFor(kid, o) {
  if (KEYS.until > o.nowMs && KEYS.byKid[kid]) return KEYS.byKid[kid];
  await loadKeys(o.fetch, o.nowMs);                     // expired cache, or a kid we have not seen: fetch once
  return KEYS.byKid[kid] || null;
}

async function verifyIdToken(jwt, o) {
  const p = String(jwt == null ? "" : jwt).split(".");
  if (p.length !== 3 || !p.every((s, i) => i === 2 ? /^[A-Za-z0-9_-]*$/.test(s) : /^[A-Za-z0-9_-]+$/.test(s))) return { ok: false, why: "shape" };
  let head;
  try { head = JSON.parse(Buffer.from(p[0], "base64url").toString("utf8")); } catch (e) { return { ok: false, why: "shape" }; }
  if (!head || head.alg !== "RS256" || typeof head.kid !== "string") return { ok: false, why: "alg" };
  let jwk;
  try { jwk = await keyFor(head.kid, o); } catch (e) { return { ok: false, why: "keys" }; }
  if (!jwk) return { ok: false, why: "kid" };
  let good = false;
  try {
    good = crypto.verify("RSA-SHA256", Buffer.from(p[0] + "." + p[1]),
      crypto.createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(p[2], "base64url"));
  } catch (e) { good = false; }
  if (!good) return { ok: false, why: "sig" };
  return checkClaims(decodePayload(jwt), { clientId: o.clientId, nonce: o.nonce, nowMs: o.nowMs });
}
```

Export them:

```js
module.exports = { challenge, authUrl, exchangeCode, decodePayload, checkClaims, verifyIdToken, _resetKeys };
```

- [ ] **Step 4: Run all Google and auth tests.** Run `node --test test/auth-google.test.js test/auth-api.test.js`. Expected: PASS. The existing callback tests still pass: `name` is an extra field.

- [ ] **Step 5: Commit.**

```bash
git add lib/auth/google.js test/auth-google.test.js
git commit -m "Google: verify One Tap ID tokens against Google's published keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One Tap routes, and opt-in on every sign-in path

**Files:**
- Create: `lib/auth/consent.js`
- Modify: `api/auth.js`
- Test: `test/auth-api.test.js`, new `test/auth-consent.test.js`

**Interfaces:**
- Consumes:
  - `db.consentFor/upsertConsent/revokeConsent` (Task 1)
  - `google.verifyIdToken` (Task 2)
- Produces:
  - `consent.WORDING` (string)
  - `consent.record(db, userId, optin, source, nowMs) -> Promise<void>`
  - `consent.unsubToken(pepper, userId) -> string` (22 chars)
  - `consent.unsubUrl(pepper, userId) -> string`
  - `POST /api/auth/google/nonce` answers `{nonce_id, nonce}`
  - `POST /api/auth/google/onetap` with `{credential, nonce_id, optin}` answers `{ok:true, first, name}`, `401 {error:"google_failed"}`, `503 {error:"google_down"}` or `429`
  - `POST /api/auth/email/verify` now accepts `optin` and answers `{ok:true, first, name:""}`
  - `POST /api/auth/google/prepare` now accepts `optin`

- [ ] **Step 1: Write the consent module test.** Create `test/auth-consent.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb } = require("./helpers/fakes.js");
const K = require("../lib/auth/consent.js");

test("the wording is the exact checkbox text", () => {
  assert.strictEqual(K.WORDING, "Email me the wizard's best picks. Unsubscribe any time.");
});

test("record writes only on a real true, never overwrites a live consent, and re-grants after unsubscribe", async () => {
  let T = Date.UTC(2026, 8, 30, 10); const db = fakeDb(() => T);
  const id = "00000000-0000-4000-8000-000000000001";
  for (const v of [false, "true", 1, null, undefined]) await K.record(db, id, v, "email-code", T);
  assert.strictEqual(db.t.consent[id], undefined, "only boolean true counts");
  await K.record(db, id, true, "email-code", T);
  const first = db.t.consent[id].granted_at;
  T += 60e3; await K.record(db, id, true, "google-onetap", T);
  assert.strictEqual(db.t.consent[id].granted_at, first, "a live consent is left alone");
  assert.strictEqual(db.t.consent[id].source, "email-code");
  await db.revokeConsent(id, new Date(T).toISOString());
  T += 60e3; await K.record(db, id, true, "google-onetap", T);
  assert.strictEqual(db.t.consent[id].revoked_at, null);
  assert.strictEqual(db.t.consent[id].source, "google-onetap");
  assert.strictEqual(db.t.consent[id].wording, K.WORDING);
});

test("unsubscribe tokens are per user, fixed length, and the URL carries both", () => {
  const p = "p".repeat(64), a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
  assert.strictEqual(K.unsubToken(p, a).length, 22);
  assert.notStrictEqual(K.unsubToken(p, a), K.unsubToken(p, b));
  assert.strictEqual(K.unsubToken(p, a), K.unsubToken(p, a));
  assert.match(K.unsubUrl(p, a), new RegExp("/api/auth/unsub\\?u=" + a + "&t=" + K.unsubToken(p, a) + "$"));
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/auth-consent.test.js`. Expected: FAIL, `Cannot find module '../lib/auth/consent.js'`.

- [ ] **Step 3: Create `lib/auth/consent.js`.**

```js
"use strict";
/* Marketing email consent. A row exists only because a reader ticked the
   box; the wording saved is the server's own copy of the checkbox text,
   never the client's. Unsubscribe links carry an HMAC of the user id, so
   they work without signing in and cannot be forged. Spec section 7. */
const crypto = require("crypto");
const { ORIGIN } = require("./http.js");

const WORDING = "Email me the wizard's best picks. Unsubscribe any time.";

async function record(db, userId, optin, source, nowMs) {
  if (optin !== true) return;
  const cur = await db.consentFor(userId);
  if (cur && !cur.revoked_at) return;                     // already opted in: keep the original record
  await db.upsertConsent(userId, { granted_at: new Date(nowMs).toISOString(), wording: WORDING, source });
}

const unsubToken = (pepper, userId) =>
  crypto.createHmac("sha256", String(pepper)).update("unsub:" + userId).digest("base64url").slice(0, 22);
const unsubUrl = (pepper, userId) => ORIGIN + "/api/auth/unsub?u=" + userId + "&t=" + unsubToken(pepper, userId);

module.exports = { WORDING, record, unsubToken, unsubUrl };
```

- [ ] **Step 4: Run it and confirm it passes.** Run `node --test test/auth-consent.test.js`. Expected: PASS.

- [ ] **Step 5: Write the failing route tests.** In `test/auth-api.test.js`:
  - In `world()`, add `verifyIdToken: async (jwt, o) => w.verify(jwt, o)` to the `google` override object.
  - Add `verify: async () => ({ ok: false, why: "sig" })` to `w`.
  - Append:

```js
async function oneTap(w, body, h) {
  const n = (await w.call(postReq("google/nonce", {}, h))).json();
  w.verify = async (jwt, o) => jwt === "good" && o.nonce === n.nonce && o.clientId === "cid"
    ? { ok: true, sub: "g-7", email: "tunde.a@gmail.com", name: "Tunde" } : { ok: false, why: "sig" };
  return w.call(postReq("google/onetap", Object.assign({ credential: "good", nonce_id: n.nonce_id }, body || {}), h));
}

test("One Tap: a nonce, a verified token, a session, first-time flag and a first name", async () => {
  const w = world();
  const r = await oneTap(w);
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.json(), { ok: true, first: true, name: "Tunde" });
  assert.ok(sessionCookie(r));
  assert.strictEqual(w.db.t.users[0].google_sub, "g-7");
  const again = await oneTap(w);
  assert.strictEqual(again.json().first, false, "second sign-in is not first");
});

test("Review Focus 3: the same One Tap nonce cannot be used twice", async () => {
  const w = world();
  const n = (await w.call(postReq("google/nonce", {}))).json();
  w.verify = async (jwt, o) => o.nonce === n.nonce ? { ok: true, sub: "g-7", email: "t@x.com", name: "" } : { ok: false, why: "nonce" };
  const b = { credential: "good", nonce_id: n.nonce_id };
  assert.strictEqual((await w.call(postReq("google/onetap", b))).code, 200);
  const second = await w.call(postReq("google/onetap", b));
  assert.strictEqual(second.code, 401);
  assert.deepStrictEqual(second.json(), { error: "google_failed" });
  assert.strictEqual(w.db.t.sessions.length, 1);
});

test("One Tap refuses a bad token, an unknown or expired nonce, a redirect-flow attempt id, and reports Google down", async () => {
  const w = world();
  const n = (await w.call(postReq("google/nonce", {}))).json();
  w.verify = async () => ({ ok: false, why: "sig" });
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: n.nonce_id }))).code, 401);
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: "00000000-0000-4000-8000-999999999999" }))).code, 401);
  const prep = await w.call(postReq("google/prepare", {}));
  const aid = new URL("https://x" + prep.json().start).searchParams.get("a");
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: aid }))).code, 401, "a redirect attempt is not a One Tap nonce");
  const n2 = (await w.call(postReq("google/nonce", {}))).json();
  w.advance(11 * 60e3);
  w.verify = async () => ({ ok: true, sub: "s", email: "a@b.com", name: "" });
  assert.strictEqual((await w.call(postReq("google/onetap", { credential: "x", nonce_id: n2.nonce_id }))).code, 401, "expired nonce");
  const n3 = (await w.call(postReq("google/nonce", {}))).json();
  w.verify = async () => ({ ok: false, why: "keys" });
  const down = await w.call(postReq("google/onetap", { credential: "x", nonce_id: n3.nonce_id }));
  assert.strictEqual(down.code, 503);
  assert.deepStrictEqual(down.json(), { error: "google_down" });
});

test("One Tap links an existing email account instead of making a second one", async () => {
  const w = world();
  await emailSignIn(w, "tunde.a@gmail.com");
  const r = await oneTap(w);
  assert.strictEqual(r.json().first, false);
  assert.strictEqual(w.db.t.users.length, 1);
  assert.strictEqual(w.db.t.users[0].google_sub, "g-7");
});

test("Review Focus 4: an unticked box writes no consent on any path; a ticked one does, with its source", async () => {
  const w = world();
  await oneTap(w, { optin: false });
  await emailSignIn(w, "b@x.com");
  const g = await googleStart(w);
  await w.call(getReq("google/callback", { state: g.state, code: "c" }, { cookie: g.start.cookies()[0].split(";")[0] }));
  assert.deepStrictEqual(w.db.t.consent, {});

  const w2 = world();
  await oneTap(w2, { optin: true });
  const uid = w2.db.t.users[0].id;
  assert.strictEqual(w2.db.t.consent[uid].source, "google-onetap");

  const w3 = world();
  await w3.call(postReq("email/send", { email: "c@x.com", turnstile: "ok" }));
  await w3.call(postReq("email/verify", { email: "c@x.com", code: w3.sent[0].c, optin: true }));
  assert.strictEqual(w3.db.t.consent[w3.db.t.users[0].id].source, "email-code");

  const w4 = world();
  const prep = await w4.call(postReq("google/prepare", { optin: true }));
  const start = await w4.call(getReq("google/start", { a: new URL("https://x" + prep.json().start).searchParams.get("a") }));
  const loc = new URL(start.headers.location), a = w4.db.t.attempts[0];
  w4.claims = { iss: "https://accounts.google.com", aud: "cid", sub: "g-2", email: "d@x.com", email_verified: true,
    nonce: a.nonce, iat: w4.clock() / 1000, exp: w4.clock() / 1000 + 3600 };
  await w4.call(getReq("google/callback", { state: loc.searchParams.get("state"), code: "c" }, { cookie: start.cookies()[0].split(";")[0] }));
  assert.strictEqual(w4.db.t.consent[w4.db.t.users[0].id].source, "google-redirect");
});

test("email/verify now says whether the account is new", async () => {
  const w = world();
  assert.deepStrictEqual((await emailSignIn(w, "e@x.com")).json(), { ok: true, first: true, name: "" });
  assert.deepStrictEqual((await emailSignIn(w, "e@x.com")).json(), { ok: true, first: false, name: "" });
});
```

The `googleStart` cookie handling mirrors the existing callback tests. If those tests read the OAuth cookie another way, copy their way.

- [ ] **Step 6: Run them and confirm they fail.** Run `node --test test/auth-api.test.js`. Expected: FAIL, 404 on `google/nonce`.

- [ ] **Step 7: Implement in `api/auth.js`.**

Add after the other requires:

```js
const K = require("../lib/auth/consent.js");
```

Change `POST_ROUTES`:

```js
const POST_ROUTES = new Set(["google/prepare", "google/nonce", "google/onetap", "email/send", "email/verify", "logout", "logout-all", "devices/end"]);
const ONETAP = "onetap";   // code_verifier marker: this attempt row is a One Tap nonce, not a redirect flow
```

Pull the user lookup out of `google/callback` into a helper inside `make()`, next to `findOrCreateByEmail`:

```js
  async function userFromClaims(claims) {
    let user = await db.userBySub(claims.sub), existed = !!user;
    if (!user) {
      const r = await findOrCreateByEmail(claims.email);
      if (!r) throw new Error("user create failed");
      user = r.user; existed = r.existed;
      if (!user.google_sub) await db.linkGoogle(user.id, claims.sub);
    }
    return { user, existed };
  }
```

In `google/callback`, replace the block from `let user = ...` to the `signIn` line with:

```js
      const { user, existed } = await userFromClaims(claims);
      const s = await signIn(req, user, existed, uaOf(req), t);
      await K.record(db, user.id, a.optin === true, "google-redirect", t);
```

In `google/prepare`, add `optin: body.optin === true,` to the `insertAttempt` row.

In `email/verify`, replace the last two lines with:

```js
      const s = await signIn(req, r.user, r.existed, uaOf(req), t);
      await K.record(db, r.user.id, body.optin === true, "email-code", t);
      return H.sendJson(res, 200, { ok: true, first: !r.existed, name: "" }, [s.cookie]);
```

Add two routes to `routes`:

```js
    "google/nonce": async (req, res, t) => {
      if (!(await db.rlHit("gn:" + H.ipKey(req), 3600, 60))) return H.sendJson(res, 429, { error: "slow_down", minutes: 60 });
      const id = crypto.randomUUID(), nonce = C.randomToken();
      const row = await db.insertAttempt({ id, nonce, state_hash: C.sha256hex("onetap:" + id + ":" + nonce),
        code_verifier: ONETAP, return_to: "/", expires_at: iso(t + ATTEMPT_MS) });
      if (!row) throw new Error("attempt insert failed");
      return H.sendJson(res, 200, { nonce_id: id, nonce });
    },

    "google/onetap": async (req, res, t) => {
      if (!(await db.rlHit("gp:" + H.ipKey(req), 3600, 30))) return H.sendJson(res, 429, { error: "slow_down", minutes: 60 });
      const body = (await H.readJson(req, 8192)) || {};
      const failed = () => H.sendJson(res, 401, { error: "google_failed" });
      const a = await db.attemptById(String(body.nonce_id || ""));
      if (!a || a.code_verifier !== ONETAP || a.consumed_at || Date.parse(a.expires_at) <= t) return failed();
      if (!(await db.consumeAttempt(a.id, iso(t)))) return failed();          // one credential, one use
      const claims = await google.verifyIdToken(String(body.credential || ""), { clientId: process.env.GOOGLE_CLIENT_ID, nonce: a.nonce, nowMs: t });
      if (!claims.ok) {
        if (claims.why === "keys") { await report(new Error("Google certs unreachable"), { route: "google/onetap" }); return H.sendJson(res, 503, { error: "google_down" }); }
        return failed();
      }
      const { user, existed } = await userFromClaims(claims);
      const s = await signIn(req, user, existed, uaOf(req), t);
      await K.record(db, user.id, body.optin === true, "google-onetap", t);
      return H.sendJson(res, 200, { ok: true, first: !existed, name: claims.name || "" }, [s.cookie]);
    },
```

- [ ] **Step 8: Run all auth tests.** Run `node --test test/auth-api.test.js test/auth-consent.test.js`. Expected: PASS, including every earlier auth test.

- [ ] **Step 9: Commit.**

```bash
git add lib/auth/consent.js api/auth.js test/auth-api.test.js test/auth-consent.test.js
git commit -m "Auth: Google One Tap sign-in and a recorded email opt-in on every path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Unsubscribe, and consent in the account API

**Files:**
- Modify: `api/auth.js` (the `unsub` route and handler dispatch)
- Modify: `api/account.js`
- Test: `test/auth-api.test.js`, and the existing account API test file (find it with `grep -l "api/account.js" test/*.js`)

**Interfaces:**
- Consumes: `consent.unsubToken`, `consent.record` (Task 3), and the db consent functions (Task 1).
- Produces:
  - `GET|POST /api/auth/unsub?u=&t=`: HTML 200 for a good token, 400 for a bad one
  - `GET /api/account/consent` answers `{on:boolean}`
  - `POST /api/account/consent {on}` answers `{on}`
  - export gains `email_consent`

- [ ] **Step 1: Write the failing tests.** Append to `test/auth-api.test.js`:

```js
const K = require("../lib/auth/consent.js");
test("Review Focus 5: unsubscribe works by GET or by a bare POST, and only with the right token", async () => {
  const w = world();
  await oneTap(w, { optin: true });
  const uid = w.db.t.users[0].id, tok = K.unsubToken(process.env.AUTH_PEPPER, uid);
  const bad = await w.call({ method: "GET", query: { route: "unsub", u: uid, t: "x".repeat(22) }, headers: {} });
  assert.strictEqual(bad.code, 400);
  assert.strictEqual(w.db.t.consent[uid].revoked_at, null);
  const ok = await w.call({ method: "GET", query: { route: "unsub", u: uid, t: tok }, headers: {} });
  assert.strictEqual(ok.code, 200);
  assert.match(ok.body, /You're unsubscribed/);
  assert.ok(w.db.t.consent[uid].revoked_at);
  w.db.t.consent[uid].revoked_at = null;
  const post = await w.call({ method: "POST", query: { route: "unsub", u: uid, t: tok }, headers: {}, body: "List-Unsubscribe=One-Click" });
  assert.strictEqual(post.code, 200, "one-click POST from a mail client carries no X-SW-Request");
  assert.ok(w.db.t.consent[uid].revoked_at);
});
```

Append to the account API test file, using its existing world and helpers:

```js
test("consent: read, turn on, turn off; export shows it; signed out gets 401", async () => {
  // sign in the way the other tests in this file do, giving `cookie` and `uid`
  const get1 = await call({ method: "GET", query: { action: "consent" }, headers: { cookie } });
  assert.deepStrictEqual(get1.json(), { on: false });
  const on = await call(post("consent", { on: true }, cookie));
  assert.deepStrictEqual(on.json(), { on: true });
  assert.strictEqual(db.t.consent[uid].source, "account");
  const ex = await call({ method: "GET", query: { action: "export" }, headers: { cookie } });
  assert.strictEqual(ex.json().email_consent.source, "account");
  const off = await call(post("consent", { on: false }, cookie));
  assert.deepStrictEqual(off.json(), { on: false });
  assert.ok(db.t.consent[uid].revoked_at);
  assert.strictEqual((await call({ method: "GET", query: { action: "consent" }, headers: {} })).code, 401);
});
```

Map `call`, `post`, `cookie`, `uid` and `db` to the names that file already uses.

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/auth-api.test.js` and the account test file. Expected: FAIL. `unsub` currently gets 404, and so does `consent`.

- [ ] **Step 3: Implement `unsub` in `api/auth.js`.** At the top of the handler, right after the route is resolved and before the POST_ROUTES check:

```js
    if (route === "unsub") {
      if (req.method !== "GET" && req.method !== "POST") return H.sendJson(res, 405, { error: "method" });
      if (pepper().length < 32) return H.sendJson(res, 503, { error: "not_configured" });
      /* A mail client's one-click POST has no X-SW-Request header and no
         cookie; the HMAC token is the whole check, so no guardPost here. */
      try {
        const q = req.query || {}, u = String(q.u || ""), tok = String(q.t || "");
        const good = /^[0-9a-f-]{36}$/.test(u) && tok.length === 22 && C.sameHex(
          Buffer.from(tok).toString("hex"), Buffer.from(K.unsubToken(pepper(), u)).toString("hex"));
        if (!good) return H.sendHtml(res, 400, "Link not valid", "This unsubscribe link is not valid. Open the latest email from us and try its link.");
        await db.revokeConsent(u, iso(now()));
        return H.sendHtml(res, 200, "You're unsubscribed", "No more picks by email. You can turn them back on from your account.");
      } catch (e) { await report(e, { route }); return H.sendJson(res, 500, { error: "server" }); }
    }
```

Also add `"unsub"` as a key in `routes`, mapping to `null`. The existing `hasOwnProperty` check comes before this block, so the route must exist as a key. Place the `unsub` block after that check.

- [ ] **Step 4: Implement `consent` in `api/account.js`.** Add `const K = require("../lib/auth/consent.js");`.

Extend the action dispatch:

```js
    else if (action === "consent") { if (req.method === "POST") { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); } else if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" }); }
```

Inside `try`, after the session check:

```js
      if (action === "consent") {
        if (req.method === "POST") {
          const body = (await H.readJson(req, 256)) || {};
          if (body.on === true) await K.record(db, s.userId, true, "account", t);
          else await db.revokeConsent(s.userId, new Date(t).toISOString());
        }
        const c = await db.consentFor(s.userId);
        return H.sendJson(res, 200, { on: !!(c && !c.revoked_at) });
      }
```

In the export object, add `email_consent: await db.consentFor(s.userId),`.

- [ ] **Step 5: Run and commit.** Run `node --test test/auth-api.test.js` and the account test file. Expected: PASS.

```bash
git add api/auth.js api/account.js test/
git commit -m "Accounts: one-click unsubscribe and a picks-by-email switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: CSP hosts and build-time metas

**Files:**
- Modify: `vercel.json` (every CSP header value)
- Modify: `scripts/prebuild.js` (`applyAuthMeta`, `injectAuthMeta`)
- Test: `test/security-headers.test.js`, `test/prebuild.test.js`

**Interfaces:**
- Produces:
  - `applyAuthMeta(html, authEnabled, keys)`, where `keys = {gcid, ts}`, adds `<meta name="sw-gcid" content="...">` and `<meta name="sw-ts" content="...">` after `sw-auth`
  - pages read them with `document.querySelector('meta[name="sw-gcid"]')`

- [ ] **Step 1: Write the failing tests.** Append to `test/security-headers.test.js`, using its way of reading the CSP values:

```js
test("CSP lets Google Identity Services load its script, frame, style and calls", () => {
  for (const csp of allCspValues()) {
    assert.match(csp, /script-src[^;]*https:\/\/accounts\.google\.com\/gsi\/client/);
    assert.match(csp, /frame-src[^;]*https:\/\/accounts\.google\.com\/gsi\//);
    assert.match(csp, /connect-src[^;]*https:\/\/accounts\.google\.com\/gsi\//);
    assert.match(csp, /style-src[^;]*https:\/\/accounts\.google\.com\/gsi\/style/);
  }
});
```

`allCspValues()` stands for however that file gathers the CSP strings. Write a small local helper if there is none: parse `vercel.json`, walk `headers[].headers[]`, and keep the values whose key starts with `Content-Security-Policy`.

Append to `test/prebuild.test.js`:

```js
test("applyAuthMeta adds the Google client id and Turnstile site key metas, and drops unsafe values", () => {
  const out = applyAuthMeta("<html><head></head></html>", "1", { gcid: "123-abc.apps.googleusercontent.com", ts: "0x4AAAAAAAtest_Key-1" });
  assert.match(out, /<meta name="sw-gcid" content="123-abc\.apps\.googleusercontent\.com">/);
  assert.match(out, /<meta name="sw-ts" content="0x4AAAAAAAtest_Key-1">/);
  const bad = applyAuthMeta("<html><head></head></html>", "1", { gcid: '"><script>', ts: "a b" });
  assert.doesNotMatch(bad, /sw-gcid|sw-ts/);
  assert.doesNotMatch(applyAuthMeta("<html><head></head></html>", "0", { gcid: "x.apps.googleusercontent.com" }), /sw-gcid/);
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `node --test test/security-headers.test.js test/prebuild.test.js`. Expected: FAIL.

- [ ] **Step 3: Implement.**

In `vercel.json`, in every `Content-Security-Policy*` value:
- append ` https://accounts.google.com/gsi/client` to `script-src`
- append ` https://accounts.google.com/gsi/style` to `style-src`
- append ` https://accounts.google.com/gsi/` to `connect-src`
- append ` https://accounts.google.com/gsi/` to `frame-src`

Edit the JSON by hand and keep it valid (`node -e "require('./vercel.json')"`).

In `scripts/prebuild.js`, replace `applyAuthMeta`:

```js
function applyAuthMeta(html, authEnabled, keys) {
  if (authEnabled !== "1") return html;
  if (html.indexOf('<meta name="sw-auth"') !== -1) return html;  // idempotent
  const k = keys || {};
  /* Both are public by design (Google's client id and Turnstile's site key
     are meant for the browser); the shape checks only keep markup out. */
  const gcid = /^[0-9A-Za-z._-]{1,200}\.apps\.googleusercontent\.com$/.test(String(k.gcid || "")) ? k.gcid : "";
  const ts = /^[0-9A-Za-z_-]{1,100}$/.test(String(k.ts || "")) ? k.ts : "";
  return html.replace("<head>", '<head><meta name="sw-auth" content="1">' +
    (gcid ? '<meta name="sw-gcid" content="' + gcid + '">' : "") +
    (ts ? '<meta name="sw-ts" content="' + ts + '">' : ""));
}
```

In `injectAuthMeta`, pass the keys:

```js
    const after = applyAuthMeta(before, process.env.AUTH_ENABLED,
      { gcid: process.env.GOOGLE_CLIENT_ID, ts: process.env.TURNSTILE_SITE_KEY });
```

- [ ] **Step 4: Run and commit.** Run `node --test test/security-headers.test.js test/prebuild.test.js`. Expected: PASS.

```bash
git add vercel.json scripts/prebuild.js test/security-headers.test.js test/prebuild.test.js
git commit -m "Build: allow Google Identity Services and hand pages the public sign-in keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Tactics Spell (`public/spell.js`)

**Files:**
- Create: `public/spell.js`
- Test: `test/spell.test.js`

**Interfaces:**
- Produces:
  - In the browser: `window.swSpell(mount, {name, odds, onRetry}) -> {step(n), setName(s), finish(cb), stop()}`.
    - `step(n)`: n is 1 or 2; the phase only moves forward.
    - `finish(cb)`: plays out to the goal, holds 900ms, then calls `cb()`.
  - In Node: `require("../public/spell.js")` returns `{nextBeat, firstName, MAX_MS, HOLD_MS, MIN_MS}`.
  - It reads the CSS tokens `--si-act`, `--si-act-ink`, `--si-odds`, `--si-grey`, `--si-faint`, `--si-line`, `--si-card`, `--si-card2`, `--si-text`, `--si-soft`, `--si-ball`, `--si-ball-ink`, `--si-glow`, `--si-glow-soft`, which Task 7 defines.

- [ ] **Step 1: Write the failing test.** Create `test/spell.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "spell.js"), "utf8");
const S = require("../public/spell.js");

test("spell.js is ES5 and uses no raw colours", () => {
  assert.doesNotMatch(src, /=>|\blet\s|\bconst\s|`|\bclass\s/);
  const hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => !/^#fff$/i.test(h));
  assert.deepStrictEqual(hex, [], "colours come from --si-* tokens");
});

test("the keeper holds the ball until the account is signed in", () => {
  assert.deepStrictEqual(S.nextBeat(0, 0, false), { hold: true });
  assert.deepStrictEqual(S.nextBeat(0, 1, false), { to: 1, kind: "pass" });
});

test("a long load circles the ball back through midfield instead of freezing", () => {
  assert.deepStrictEqual(S.nextBeat(4, 1, false), { to: 2, kind: "pass", loop: true });
});

test("once finishing: flick into 5, pass to 6, shot into the goal (7)", () => {
  assert.deepStrictEqual(S.nextBeat(4, 1, true), { to: 5, kind: "flick" });
  assert.deepStrictEqual(S.nextBeat(5, 2, true), { to: 6, kind: "pass" });
  assert.deepStrictEqual(S.nextBeat(6, 2, true), { to: 7, kind: "shot" });
  assert.deepStrictEqual(S.nextBeat(0, 0, true), { to: 1, kind: "pass" }, "finish before step(1) never deadlocks");
});

test("first names: Google's given name, else the email's local part, title-cased and short", () => {
  assert.strictEqual(S.firstName("tunde", "x@y.com"), "Tunde");
  assert.strictEqual(S.firstName("", "ade.bola99@gmail.com"), "Ade");
  assert.strictEqual(S.firstName("  ", "_@x.com"), "");
  assert.strictEqual(S.firstName("A".repeat(50), "").length, 20);
});

test("timing constants match the spec", () => {
  assert.strictEqual(S.MAX_MS, 20000);
  assert.strictEqual(S.HOLD_MS, 900);
  assert.strictEqual(S.MIN_MS, 1800);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/spell.test.js`. Expected: FAIL, cannot find `public/spell.js`.

- [ ] **Step 3: Create `public/spell.js`.** This is a port of `docs/design/signin-loaders/09-signin-flow-site-colours.html`, scoped to a mount element and driven by real steps:

```js
/* The Tactics Spell: the sign-in loader. A passing move on a tilted tactics
   board, paced by what the account is really doing: the keeper holds the
   ball until sign-in succeeds (step 1), the build-up keeps passing while the
   slips load, and only finish() - called when the first sync is back - sends
   it through the flick and the curler into the net. Colours are the site's
   own tokens via --si-* (defined by signin.js), so light and dark both work.
   Plain ES5. The pure parts are exported for test/spell.test.js. */
(function(root){
  "use strict";
  var PTS=[[128,246],[48,200],[100,160],[196,176],[210,104],[120,92],[140,52],[128,-4]];
  var XS=[[92,178],[168,138],[166,96],[112,60]], XHIT={2:0,4:1,5:2,6:3};
  var MAX_MS=20000, HOLD_MS=900, MIN_MS=1800;
  var CAPS=[["Signing you in","Checking your account"],["Pulling your slips","Your slips and favourites"],["Ready",""]];

  /* What the ball does after player i has it. */
  function nextBeat(i,phase,finishing){
    if(i>=6) return {to:7,kind:"shot"};
    if(i===5) return {to:6,kind:"pass"};
    if(i===4) return finishing?{to:5,kind:"flick"}:{to:2,kind:"pass",loop:true};
    if(phase<1&&!finishing) return {hold:true};
    return {to:i+1,kind:"pass"};
  }
  function firstName(given,email){
    var n=String(given||"").replace(/^\s+|\s+$/g,"");
    if(!n) n=(String(email||"").split("@")[0].replace(/[^A-Za-z]+/g," ").replace(/^\s+|\s+$/g,"").split(" ")[0])||"";
    n=n.slice(0,20);
    return n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():"";
  }
  var api={nextBeat:nextBeat,firstName:firstName,MAX_MS:MAX_MS,HOLD_MS:HOLD_MS,MIN_MS:MIN_MS};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  var d=root.document, NS="http://www.w3.org/2000/svg", seq=0;
  var CSS=".sws{position:relative;display:flex;flex-direction:column;height:100%;min-height:360px}"+
    ".sws-flash{position:absolute;inset:-30px;background:radial-gradient(circle at 50% 30%,var(--si-glow),var(--si-glow-soft) 40%,transparent 70%);opacity:0;pointer-events:none;z-index:5}"+
    ".sws-flash.go{animation:sws-fl .7s ease-out}@keyframes sws-fl{0%{opacity:1}100%{opacity:0}}"+
    ".sws-hud{display:flex;justify-content:space-between;align-items:center;font:700 10px 'Roboto Condensed',sans-serif;letter-spacing:.16em;color:var(--si-faint);text-transform:uppercase;height:22px}"+
    ".sws-hud b{color:var(--si-act-ink)}.sws-call{color:var(--si-act-ink);opacity:0;transition:opacity .2s}.sws-call.on{opacity:1}"+
    ".sws-stage{flex:1;position:relative;display:flex;align-items:center;justify-content:center;perspective:640px}"+
    ".sws-tilt{transform:rotateX(0) scale(.86);transform-style:preserve-3d;transition:transform 1.1s cubic-bezier(.2,.9,.25,1)}"+
    ".sws-tilt.up{transform:rotateX(32deg) scale(1) translateY(-4px)}"+
    ".sws-tilt.flat{transform:rotateX(0) scale(.9);transition:transform .7s cubic-bezier(.3,1.3,.4,1)}"+
    ".sws-tilt.shake{animation:sws-sh .42s}@keyframes sws-sh{20%{translate:-4px 2px}40%{translate:4px -3px}60%{translate:-3px 1px}80%{translate:2px -1px}}"+
    ".sws svg{width:256px;height:286px;max-width:100%;overflow:visible}"+
    ".sws-turf{fill:var(--si-card2);opacity:0;transition:opacity 1s}.sws-turf.on{opacity:.7}"+
    ".sws-pl{fill:none;stroke:var(--si-faint);stroke-opacity:.45;stroke-width:1.3;stroke-dasharray:1;stroke-dashoffset:1}"+
    ".sws-pl.on{transition:stroke-dashoffset .9s cubic-bezier(.6,.1,.3,1);stroke-dashoffset:0}"+
    ".sws-runes{opacity:0;transition:opacity .8s;transform-box:view-box;transform-origin:128px 134px;animation:sws-spin 18s linear infinite}.sws-runes.on{opacity:.8}"+
    "@keyframes sws-spin{to{transform:rotate(360deg)}}.sws-runes text{font:700 7px 'Roboto Condensed',sans-serif;letter-spacing:3px;fill:var(--si-faint)}"+
    ".sws-st0{stop-color:var(--si-act-ink)}.sws-st1{stop-color:var(--si-act);stop-opacity:0}"+
    ".sws-beam{opacity:0;transform-box:fill-box;transform-origin:50% 100%}.sws-beam.go{animation:sws-beam .55s ease-out}"+
    "@keyframes sws-beam{0%{opacity:0;transform:scaleY(.2)}30%{opacity:1;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1.1)}}"+
    ".sws-dot{fill:var(--si-card);stroke:var(--si-grey);stroke-width:1.6;transform-box:fill-box;transform-origin:center;transform:scale(0);transition:fill .3s,stroke .3s,transform .35s cubic-bezier(.2,1.8,.4,1)}"+
    ".sws-dot.in{transform:scale(1)}.sws-dot.on{fill:var(--si-act);stroke:var(--si-act-ink)}"+
    ".sws-ring{fill:none;stroke:var(--si-act-ink);stroke-width:1.5;opacity:0;transform-box:fill-box;transform-origin:center}.sws-ring.go{animation:sws-ring .6s ease-out}"+
    "@keyframes sws-ring{0%{opacity:1;transform:scale(.6)}100%{opacity:0;transform:scale(2.8)}}"+
    ".sws-odd{font:800 10px 'Roboto Condensed',sans-serif;fill:var(--si-odds);opacity:0;text-anchor:middle}.sws-odd.go{animation:sws-odd 1s ease-out forwards}"+
    "@keyframes sws-odd{0%{opacity:0;transform:translateY(4px)}25%{opacity:1}100%{opacity:0;transform:translateY(-16px)}}"+
    ".sws-x{stroke:var(--si-grey);stroke-width:2.2;stroke-linecap:round;opacity:0;transition:opacity .3s}.sws-x.in{opacity:1}.sws-shard{fill:var(--si-grey)}"+
    ".sws-pass{fill:none;stroke:var(--si-act);stroke-width:2;stroke-linecap:round;stroke-opacity:.7}"+
    ".sws-zap{fill:none;stroke:var(--si-act-ink);stroke-width:1.2;stroke-linejoin:round}.sws-tail circle{fill:var(--si-act-ink)}"+
    ".sws-shadow{fill:var(--si-text);opacity:.3}.sws-bf{fill:var(--si-ball);stroke:var(--si-line);stroke-width:.6}.sws-bi{fill:var(--si-ball-ink)}"+
    ".sws-net{stroke:var(--si-soft);stroke-opacity:.6;stroke-width:.8;fill:none;transform-box:fill-box;transform-origin:50% 100%}"+
    ".sws-net.go{stroke:var(--si-act-ink);stroke-opacity:1;animation:sws-bulge .6s cubic-bezier(.3,1.8,.4,1)}"+
    "@keyframes sws-bulge{40%{transform:scaleY(1.9) scaleX(1.1)}100%{transform:none}}"+
    ".sws-wave{fill:none;stroke:var(--si-act-ink);opacity:0}.sws-bits .r{fill:var(--si-act-ink)}.sws-bits .g{fill:var(--si-odds)}"+
    ".sws-pitch{transition:opacity .5s}.sws-pitch.out{opacity:.1}"+
    ".sws-hello{position:absolute;left:0;right:0;top:50%;margin-top:-36px;text-align:center;opacity:0;transform:scale(.5);transition:opacity .6s,transform .6s cubic-bezier(.2,1.5,.4,1);pointer-events:none}"+
    ".sws-hello.on{opacity:1;transform:none}.sws-hello small{display:block;font:800 11px 'Roboto Condensed',sans-serif;letter-spacing:.3em;color:var(--si-odds);margin-bottom:6px}"+
    ".sws-hello b{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.05;color:var(--si-text)}.sws-hello i{font-style:normal;color:var(--si-act-ink)}"+
    ".sws-cap{min-height:40px;text-align:center}.sws-cap b{display:block;font-size:15px;color:var(--si-text)}"+
    ".sws-cap small{display:block;color:var(--si-soft);font-size:12px;margin-top:3px;font-family:'Roboto Condensed',sans-serif;letter-spacing:.06em;text-transform:uppercase}"+
    ".sws-retry{margin:8px auto 0;display:block;padding:10px 16px;border-radius:12px;border:0;background:var(--si-act);color:#fff;font:inherit;font-weight:800;cursor:pointer}"+
    "@media (prefers-reduced-motion:reduce){.sws *{animation:none!important;transition:none!important}}";
  var cssDone=false;
  function injectCss(){ if(cssDone) return; cssDone=true; var s=d.createElement("style"); s.textContent=CSS; d.head.appendChild(s); }

  function markup(id){
    var pl=["<rect class='sws-pl' pathLength='1' x='8' y='8' width='240' height='252' rx='6'/>",
      "<line class='sws-pl' pathLength='1' x1='8' y1='134' x2='248' y2='134'/>",
      "<circle class='sws-pl' pathLength='1' cx='128' cy='134' r='30'/>",
      "<path class='sws-pl' pathLength='1' d='M84 8v44h88V8'/>","<path class='sws-pl' pathLength='1' d='M106 8v16h44V8'/>",
      "<path class='sws-pl' pathLength='1' d='M102 52a30 30 0 0 0 52 0'/>","<path class='sws-pl' pathLength='1' d='M84 260v-44h88v44'/>",
      "<path class='sws-pl' pathLength='1' d='M102 216a30 30 0 0 1 52 0'/>"].join("");
    return "<div class='sws'><div class='sws-flash'></div>"+
      "<div class='sws-hud'><span class='sws-call'>&nbsp;</span><span>Pass <b class='sws-n'>0</b>/7</span></div>"+
      "<div class='sws-stage'><div class='sws-tilt'><svg viewBox='0 -18 256 296' aria-hidden='true'>"+
      "<defs><linearGradient id='"+id+"b' x1='0' y1='1' x2='0' y2='0'><stop offset='0' class='sws-st0'/><stop offset='1' class='sws-st1'/></linearGradient>"+
      "<path id='"+id+"r' d='M128 134m-58 0a58 58 0 1 1 116 0a58 58 0 1 1-116 0'/></defs>"+
      "<g class='sws-pitch'><rect class='sws-turf' x='8' y='8' width='240' height='252' rx='6'/>"+
      "<g class='sws-runes'><text><textPath href='#"+id+"r'>✦ SOCCERWIZARD ✦ 4-3-3 ✦ BUILD-UP ✦ FINISH ✦</textPath></text></g>"+pl+
      "<path class='sws-net' d='M104 8V-10h48V8M112 -10V8M120 -10V8M128 -10V8M136 -10V8M144 -10V8M104 -4h48M104 2h48'/>"+
      "<g class='sws-xs'></g><g class='sws-passes'></g><g class='sws-players'></g>"+
      "<ellipse class='sws-shadow' rx='5' ry='2.2' opacity='0'/><g class='sws-tail'></g>"+
      "<g class='sws-ball' opacity='0'><circle r='6.5' class='sws-bf'/><path d='M0 -2.6l2.5 1.8-1 3H-1.5l-1-3z' class='sws-bi'/></g></g>"+
      "<circle class='sws-wave' cx='128' cy='4' r='4'/><g class='sws-bits'></g></svg></div>"+
      "<div class='sws-hello' role='status'><small>✦ GOAL ✦</small><b>You're in<span class='sws-nm'></span></b></div></div>"+
      "<div class='sws-cap' aria-live='polite'><b class='sws-c1'></b><small class='sws-c2'></small></div></div>";
  }

  function swSpell(mount,o){
    o=o||{}; injectCss();
    var id="sws"+(++seq); mount.innerHTML=markup(id);
    var q=function(s){ return mount.querySelector(s); }, qa=function(s){ return mount.querySelectorAll(s); };
    var reduce=!!(root.matchMedia&&root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var phase=0, finishing=false, speed=1, stopped=false, doneCb=null, scored=false, name=o.name||"";
    var odds=(o.odds||[]).slice(0,6), t0=Date.now(), timers=[];
    function later(ms,f){ timers.push(setTimeout(function(){ if(!stopped) f(); },ms/speed)); }
    function tween(ms,f,cb,ease){ var s0=Date.now(), dur=ms/speed;
      (function tick(){ if(stopped) return; var k=Math.min(1,(Date.now()-s0)/dur); f(ease?ease(k):k);
        if(k<1) root.requestAnimationFrame(tick); else if(cb) cb(); })(); }
    function el(tag,a,p){ var e=d.createElementNS(NS,tag),k; for(k in a) e.setAttribute(k,a[k]); p.appendChild(e); return e; }
    function restart(n,c){ n.classList.remove(c); void n.getBoundingClientRect(); n.classList.add(c); }
    function cap(i){ q(".sws-c1").textContent=CAPS[i][0]; q(".sws-c2").textContent=CAPS[i][1]; }
    function call(t){ var c=q(".sws-call"); c.textContent=t; c.classList.add("on"); later(900,function(){ c.classList.remove("on"); }); }
    function paintName(){ var n=q(".sws-nm"); n.innerHTML=""; if(name){ n.appendChild(d.createTextNode(", ")); var b=d.createElement("br"); n.appendChild(b); var i=d.createElement("i"); i.textContent=name; n.appendChild(i); } }

    var P=q(".sws-players"), X=q(".sws-xs"), i;
    for(i=0;i<7;i++){ var p=PTS[i];
      el("rect",{"class":"sws-beam",x:p[0]-5,y:p[1]-70,width:10,height:70,fill:"url(#"+id+"b)"},P);
      el("circle",{"class":"sws-ring",cx:p[0],cy:p[1],r:7},P);
      el("circle",{"class":"sws-dot",cx:p[0],cy:p[1],r:6.5},P);
      el("text",{"class":"sws-odd",x:p[0],y:p[1]-13},P); }
    for(i=0;i<XS.length;i++) el("path",{"class":"sws-x",d:"M"+(XS[i][0]-4)+" "+(XS[i][1]-4)+"l8 8m0-8l-8 8"},X);
    var beams=qa(".sws-beam"), rings=qa(".sws-ring"), dots=qa(".sws-dot"), odd=qa(".sws-odd"), xs=qa(".sws-x");
    var ball=q(".sws-ball"), sh=q(".sws-shadow"), tail=q(".sws-tail"), passes=q(".sws-passes"), bits=q(".sws-bits"), tilt=q(".sws-tilt");
    var trail=[]; for(i=0;i<8;i++) trail.push(el("circle",{r:(4.2-i*.45).toFixed(2),opacity:0},tail));
    cap(0); paintName();

    function place(x,y,h){ ball.setAttribute("transform","translate("+x.toFixed(1)+" "+(y-h).toFixed(1)+") scale("+(1+h/40).toFixed(2)+")");
      sh.setAttribute("cx",x); sh.setAttribute("cy",y+3); sh.setAttribute("rx",(5-h/14).toFixed(1)); sh.setAttribute("opacity",(.3-h/180).toFixed(2));
      trail.unshift(trail.pop()); trail[0].setAttribute("cx",x); trail[0].setAttribute("cy",y-h);
      for(var j=0;j<trail.length;j++) trail[j].setAttribute("opacity",(.55-j*.07).toFixed(2)); }
    function shatter(x,y){ for(var k=0;k<7;k++) (function(){ var s=el("path",{"class":"sws-shard",d:"M0-2.5L2 1.5-2 1.5z"},bits),
      a=Math.random()*Math.PI*2, v=10+Math.random()*16, r=Math.random()*360;
      tween(520,function(t){ s.setAttribute("transform","translate("+(x+Math.cos(a)*v*t)+" "+(y+Math.sin(a)*v*t)+") rotate("+(r+t*300)+")"); s.setAttribute("opacity",1-t); },
        function(){ if(s.parentNode) s.parentNode.removeChild(s); }); })(); }
    function zap(a,b){ var g=el("polyline",{"class":"sws-zap"},passes), n=0;
      (function f(){ if(n++>3||stopped){ if(g.parentNode) g.parentNode.removeChild(g); return; } var pts=a[0]+","+a[1];
        for(var s=1;s<6;s++){ var k=s/6; pts+=" "+(a[0]+(b[0]-a[0])*k+(Math.random()-.5)*10).toFixed(1)+","+(a[1]+(b[1]-a[1])*k+(Math.random()-.5)*10).toFixed(1); }
        g.setAttribute("points",pts+" "+b[0]+","+b[1]); later(55,f); })(); }
    var oi=0;
    function touch(k){ dots[k].classList.add("on"); restart(rings[k],"go");
      if(k>0){ odd[k].textContent=odds.length?String(odds[oi++%odds.length]):"✦"; restart(odd[k],"go"); }
      if(XHIT[k]!=null&&xs[XHIT[k]].classList.contains("in")){ xs[XHIT[k]].classList.remove("in"); shatter(XS[XHIT[k]][0],XS[XHIT[k]][1]); } }
    var cur=0, count=0;
    function beat(){
      if(stopped) return;
      var b=nextBeat(cur,phase,finishing);
      if(b.hold){ later(120,beat); return; }
      var a=PTS[cur], to=PTS[b.to], shot=b.kind==="shot", flick=b.kind==="flick";
      var bend=shot?-64:(cur%2?-28:28), mx=(a[0]+to[0])/2+bend, my=(a[1]+to[1])/2+(shot?14:0);
      var path=el("path",{"class":"sws-pass",d:"M"+a[0]+" "+a[1]+" Q"+mx+" "+my+" "+to[0]+" "+to[1]},passes);
      var L=path.getTotalLength(); path.style.strokeDasharray=L; path.style.strokeDashoffset=L;
      if(b.kind==="pass") zap(a,to);
      if(flick) call("RAINBOW FLICK"); if(shot) call("CURLER…");
      var ease=shot?function(k){ return k<.15?k*2:(k<.85?.3+(k-.15)*.43:.6+(k-.85)*2.67); }:function(k){ return 1-Math.pow(1-k,2.2); };
      tween(shot?1500:flick?780:430,function(e){ path.style.strokeDashoffset=L*(1-e); var pt=path.getPointAtLength(L*e);
          place(pt.x,pt.y,flick?46*Math.sin(Math.PI*e):shot?10*Math.sin(Math.PI*e):4*Math.sin(Math.PI*e)); },
        function(){ cur=b.to; if(shot) return goal();
          count++; q(".sws-n").textContent=Math.min(count,6); touch(cur);
          path.style.transition="stroke-opacity .9s"; path.style.strokeOpacity=.15;
          later(flick?220:90,beat); },ease);
    }
    function goal(){
      scored=true; q(".sws-n").textContent="7"; ball.setAttribute("opacity",0); sh.setAttribute("opacity",0);
      for(var j=0;j<trail.length;j++) trail[j].setAttribute("opacity",0);
      restart(q(".sws-net"),"go"); restart(q(".sws-flash"),"go"); cap(2);
      try{ if(root.navigator&&root.navigator.vibrate) root.navigator.vibrate([20,40,30]); }catch(e){}
      var w=q(".sws-wave"); tween(700,function(t){ w.setAttribute("r",4+t*230); w.setAttribute("opacity",(1-t).toFixed(2)); w.setAttribute("stroke-width",(4-3*t).toFixed(2)); });
      for(var k=0;k<26;k++) (function(k){ var star=k%3===0, ang=Math.PI*(.02+.96*Math.random()), sp=30+Math.random()*90, rot=Math.random()*360,
        n=star?el("path",{"class":"g",d:"M0-4.5L1.1-1.1 4.5 0 1.1 1.1 0 4.5-1.1 1.1-4.5 0-1.1-1.1z"},bits):el("circle",{"class":k%2?"r":"g",r:(1.3+Math.random()*1.4).toFixed(1)},bits);
        tween(1000+Math.random()*400,function(t){ n.setAttribute("transform","translate("+(128+Math.cos(ang)*sp*t)+" "+(4+Math.sin(ang)*sp*t+30*t*t)+") rotate("+(rot+t*260)+")"); n.setAttribute("opacity",(1-t).toFixed(2)); }); })(k);
      tilt.classList.add("shake");
      later(380,function(){ tilt.classList.remove("up"); tilt.classList.remove("shake"); tilt.classList.add("flat"); q(".sws-pitch").classList.add("out"); paintName(); q(".sws-hello").classList.add("on"); });
      later(380+HOLD_MS,function(){ clearTimeout(maxT); if(doneCb){ var f=doneCb; doneCb=null; f(); } });
    }
    function showFinal(){ scored=true; cap(2); q(".sws-pitch").classList.add("out"); paintName(); q(".sws-hello").classList.add("on");
      setTimeout(function(){ if(!stopped&&doneCb){ var f=doneCb; doneCb=null; f(); } },HOLD_MS); }

    var maxT=setTimeout(function(){ if(stopped||scored) return;
      q(".sws-c1").textContent="Still working… check your connection"; q(".sws-c2").textContent="";
      if(o.onRetry&&!q(".sws-retry")){ var b=d.createElement("button"); b.type="button"; b.className="sws-retry"; b.textContent="Retry";
        b.onclick=function(){ o.onRetry(); }; q(".sws-cap").appendChild(b); } },MAX_MS);

    if(!reduce){
      later(80,function(){ tilt.classList.add("up"); q(".sws-turf").classList.add("on"); });
      var pls=qa(".sws-pl"); for(i=0;i<pls.length;i++) (function(l,i){ later(120+i*70,function(){ l.classList.add("on"); }); })(pls[i],i);
      later(500,function(){ q(".sws-runes").classList.add("on"); });
      for(i=0;i<7;i++) (function(i){ later(900+i*110,function(){ restart(beams[i],"go"); dots[i].classList.add("in"); }); })(i);
      for(i=0;i<xs.length;i++) (function(x,i){ later(1300+i*90,function(){ x.classList.add("in"); }); })(xs[i],i);
      later(2000,function(){ ball.setAttribute("opacity",1); place(PTS[0][0],PTS[0][1],0); touch(0); later(250,beat); });
    } else { for(i=0;i<7;i++) dots[i].classList.add("in"); }

    return {
      step:function(n){ if(n>phase){ phase=n; if(n<2) cap(n); } },
      setName:function(n){ name=n||""; },
      finish:function(cb){
        doneCb=cb; finishing=true; if(phase<1) phase=1;
        var wait=Math.max(0,MIN_MS-(Date.now()-t0));
        if(reduce){ setTimeout(function(){ if(!stopped) showFinal(); },wait); return; }
        speed=2;                  // the account is ready: play every remaining beat, just faster (the summon alone outlasts MIN_MS)
      },
      stop:function(){ stopped=true; clearTimeout(maxT); for(var k=0;k<timers.length;k++) clearTimeout(timers[k]); }
    };
  }
  root.swSpell=swSpell;
})(typeof window!=="undefined"?window:this);
```

- [ ] **Step 4: Run it and confirm it passes.** Run `node --test test/spell.test.js`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add public/spell.js test/spell.test.js
git commit -m "Tactics Spell: the sign-in loader, paced by real sign-in and sync steps

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The sign-in sheet (`public/signin.js`)

**Files:**
- Create: `public/signin.js`
- Test: `test/signin.test.js`

**Interfaces:**
- Consumes: `window.swSpell` (Task 6); metas `sw-gcid` and `sw-ts` (Task 5); routes from Tasks 3 and 4.
- Produces:
  - In the browser, `window.swSignIn`:
    - `open({action, detail, resume, ret, afterAuth(j, done), onDone(), page})`
    - `resume({action, detail, afterAuth, onDone})` opens straight into the spell, phase 1
    - `close()`
  - `action` is `"book" | "build" | "slips"`.
  - `detail` is `{rows:[{t,o}], odds, legs, book}` or null.
  - `afterAuth(j, done)` is supplied by the caller. It must call `done()` once the account's first sync has answered.
  - Before the Google redirect it writes `sessionStorage["sw.gate"] = JSON {action, detail, resume}`.
  - In Node: `{errText, env, HEAD, WORDING, TOKENS}`.

**Token table.** Defined here once on `.sw-tok`. Each maps to the index.html name, with a fallback to the static-page name:

| --si-* | index.html token | static page (`lib/pages.js`) fallback |
| ------ | ---------------- | ------------------------------------- |
| act | `--red-fill` | `--brand` |
| act-ink | `--red-ink` | `--brand` |
| odds | `--win` | `--accent` |
| grey | `--grey` | `--d` |
| faint | `--faint` | `--faint` |
| line | `--line` | `--line` |
| card | `--card` | `--card` |
| card2 | `--card-2` | `--card2` |
| bg | `--bg` | `--bg` |
| text | `--text` | `--text` |
| soft | `--soft` | `--soft` |
| ball / ball-ink | `--ball` / `--ball-ink` | `#fff` / `--bg` |
| glow / glow-soft | `--red-glow` / `--red-glow-soft` | `color-mix(in srgb, var(--si-act) 55% / 28%, transparent)` |
| wash | `--red-wash` | `color-mix(in srgb, var(--si-act) 13%, transparent)` |

- [ ] **Step 1: Write the failing test.** Create `test/signin.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "public", "signin.js"), "utf8");
const S = require("../public/signin.js");

test("signin.js is ES5 and uses no raw colours but white", () => {
  assert.doesNotMatch(src, /=>|\blet\s|\bconst\s|`|\bclass\s/);
  const hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => !/^#fff$/i.test(h));
  assert.deepStrictEqual(hex, []);
});

test("copy is exact", () => {
  assert.strictEqual(S.WORDING, "Email me the wizard's best picks. Unsubscribe any time.");
  assert.deepStrictEqual(S.HEAD, { book: "book this slip", build: "build a slip", slips: "see your slips" });
  assert.match(src, /Free\. Your slips follow you to every phone and laptop\./);
});

test("every POST carries the CSRF header and the opt-in rides on sign-in, not on send", () => {
  assert.match(src, /X-SW-Request/);
  assert.match(src, /\/api\/auth\/google\/onetap/);
  assert.match(src, /\/api\/auth\/email\/verify"[^;]*optin/);
  assert.match(src, /\/api\/auth\/google\/prepare"[^;]*optin/);
  assert.doesNotMatch(src, /\/api\/auth\/email\/send"[^;]*optin/);
});

test("in-app browsers and the installed iPhone app get email first", () => {
  const ua = "Mozilla/5.0 (iPhone) Twitter for iPhone";
  assert.deepStrictEqual(S.env(ua, false), { inapp: true, iosApp: false, standalone: false });
  assert.deepStrictEqual(S.env("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari", true), { inapp: false, iosApp: true, standalone: true });
  assert.strictEqual(S.env("Mozilla/5.0 (Linux; Android 14) Chrome/120", false).inapp, false);
  assert.strictEqual(S.env("Mozilla/5.0 (Linux; Android 14; wv) Chrome/120", false).inapp, true);
});

test("every server error has words", () => {
  assert.match(S.errText(0, {}), /No connection/);
  assert.match(S.errText(401, { error: "google_failed" }), /Google sign-in didn't finish/);
  assert.match(S.errText(503, { error: "google_down" }), /Google is slow right now/);
  assert.match(S.errText(429, { error: "slow_down", minutes: 15 }), /15 minutes/);
  assert.match(S.errText(400, { error: "wrong", left: 1 }), /1 try left/);
  for (const e of ["bad_email", "bot", "send_failed", "dead", "expired", "used"]) assert.ok(S.errText(400, { error: e }).length > 10, e);
});

test("tokens fall back to the static pages' names", () => {
  assert.match(S.TOKENS, /--si-act:var\(--red-fill,var\(--brand\)\)/);
  assert.match(S.TOKENS, /--si-odds:var\(--win,var\(--accent\)\)/);
  assert.match(S.TOKENS, /--si-card2:var\(--card-2,var\(--card2\)\)/);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/signin.test.js`. Expected: FAIL, missing file.

- [ ] **Step 3: Create `public/signin.js`.**

```js
/* The sign-in sheet. Opens over the page when a signed-out reader taps
   something that needs an account (swGate in index.html), or fills /login.
   Google One Tap first (Google draws that button; we pick shape and words),
   the old redirect button where One Tap cannot show, the 6-digit email code
   always, and an unticked opt-in that rides on the sign-in request itself.
   Once signed in, the form fades and the Tactics Spell (spell.js) plays in
   the same sheet until the caller's afterAuth says the first sync is back.
   Colours are site tokens through --si-*; see TOKENS. Plain ES5. */
(function(root){
  "use strict";
  var WORDING="Email me the wizard's best picks. Unsubscribe any time.";
  var HEAD={book:"book this slip",build:"build a slip",slips:"see your slips"};
  var TOKENS=".sw-tok{--si-act:var(--red-fill,var(--brand));--si-act-ink:var(--red-ink,var(--brand));--si-odds:var(--win,var(--accent));"+
    "--si-grey:var(--grey,var(--d));--si-faint:var(--faint);--si-line:var(--line);--si-card:var(--card);--si-card2:var(--card-2,var(--card2));"+
    "--si-bg:var(--bg);--si-text:var(--text);--si-soft:var(--soft);--si-ball:var(--ball,#fff);--si-ball-ink:var(--ball-ink,var(--bg));"+
    "--si-glow:var(--red-glow,color-mix(in srgb,var(--si-act) 55%,transparent));--si-glow-soft:var(--red-glow-soft,color-mix(in srgb,var(--si-act) 28%,transparent));"+
    "--si-wash:var(--red-wash,color-mix(in srgb,var(--si-act) 13%,transparent))}";

  function errText(st,j){
    var e=j&&j.error;
    if(st===0) return "No connection. Check your data and try again.";
    if(st===404) return "Sign-in is not open yet.";
    if(e==="google_failed") return "Google sign-in didn't finish. Try again or use the email code.";
    if(e==="google_down") return "Google is slow right now. Use the email code.";
    if(e==="bad_email") return "Check the email address.";
    if(e==="bot") return "The check did not pass. Try again.";
    if(e==="slow_down") return "Too many tries. Try again in "+(j.minutes||15)+" minutes.";
    if(e==="send_failed") return "We could not send the email. Try again in a minute.";
    if(e==="wrong") return "Wrong code. "+j.left+(j.left===1?" try":" tries")+" left.";
    if(e==="dead") return "Too many wrong tries. Ask for a new code.";
    if(e==="expired") return "That code has expired. Ask for a new code.";
    if(e==="used") return "That code has been used. Ask for a new code.";
    return "Something went wrong. Try again.";
  }
  function env(ua,standalone){
    ua=String(ua||"");
    return {inapp:/FBAN|FBAV|Instagram|Twitter|Line\/|Telegram|WhatsApp|Snapchat|; wv\)/i.test(ua),
      iosApp:!!standalone&&/iphone|ipad|ipod/i.test(ua), standalone:!!standalone};
  }
  var api={errText:errText,env:env,HEAD:HEAD,WORDING:WORDING,TOKENS:TOKENS};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  var d=root.document, ls=null; try{ ls=root.sessionStorage; }catch(e){}
  var CSS=TOKENS+
    ".swsi-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .3s;z-index:9990}.swsi-scrim.on{opacity:1;pointer-events:auto}"+
    ".swsi{position:fixed;left:0;right:0;bottom:0;z-index:9991;max-width:480px;margin:0 auto;background:var(--si-card);color:var(--si-text);border-radius:26px 26px 0 0;"+
      "border-top:1px solid var(--si-line);padding:12px 20px calc(20px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .45s cubic-bezier(.2,.9,.25,1);max-height:92vh;overflow:auto}"+
    ".swsi.on{transform:none}.swsi.page{position:relative;transform:none;border-radius:20px;border:1px solid var(--si-line);margin:24px auto;z-index:auto;max-height:none}"+
    ".swsi-grab{width:38px;height:4px;border-radius:4px;background:var(--si-line);margin:0 auto 10px}.swsi.page .swsi-grab,.swsi.page .swsi-x{display:none}"+
    ".swsi-x{position:absolute;right:14px;top:14px;width:32px;height:32px;border-radius:50%;border:0;background:var(--si-card2);color:var(--si-soft);font-size:18px;cursor:pointer;z-index:3}"+
    ".swsi-form{transition:opacity .3s}.swsi-form.gone{opacity:0;pointer-events:none;height:0;overflow:hidden}"+
    ".swsi-h{font-size:23px;font-weight:800;letter-spacing:-.025em;line-height:1.1;margin:4px 40px 6px 0}.swsi-h i{font-style:normal;color:var(--si-act-ink)}"+
    ".swsi-s{color:var(--si-soft);font-size:13px;margin:0 0 14px;line-height:1.45}"+
    ".swsi-seal{position:relative;margin:0 0 14px}.swsi-slip{background:var(--si-bg);border:1px solid var(--si-line);border-radius:14px;padding:10px 14px 8px}"+
    ".swsi-slip .r{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--si-soft)}.swsi-slip .r span{filter:blur(2.4px)}"+
    ".swsi-slip em{font:700 14px 'Roboto Condensed',sans-serif;font-style:normal;color:var(--si-odds)}"+
    ".swsi-slip .t{display:flex;justify-content:space-between;align-items:baseline;border-top:1px dashed var(--si-line);margin-top:4px;padding-top:6px;font:700 10px 'Roboto Condensed',sans-serif;letter-spacing:.14em;color:var(--si-faint)}"+
    ".swsi-slip .t em{font-size:19px}"+
    ".swsi-wax{position:absolute;right:14px;top:50%;margin-top:-33px;width:66px;height:66px;border-radius:50%;transform:rotate(-10deg);display:flex;align-items:center;justify-content:center;"+
      "background:radial-gradient(circle at 36% 30%,rgba(255,255,255,.35),transparent 38%),radial-gradient(circle at 50% 55%,var(--si-act),var(--si-act) 60%,color-mix(in srgb,var(--si-act) 60%,black) 100%);"+
      "box-shadow:0 6px 16px rgba(0,0,0,.45),inset 0 -3px 6px rgba(0,0,0,.3);animation:swsi-throb 2.6s ease-in-out infinite}"+
    "@keyframes swsi-throb{50%{box-shadow:0 6px 16px rgba(0,0,0,.45),inset 0 -3px 6px rgba(0,0,0,.3),0 0 0 9px var(--si-glow-soft)}}"+
    ".swsi-dorm{position:relative;height:118px;margin:-2px -20px 12px;overflow:hidden;perspective:500px;border-bottom:1px solid var(--si-line)}"+
    ".swsi-dorm .tb{position:absolute;left:50%;top:-50px;width:250px;margin-left:-125px;transform:rotateX(52deg);transform-origin:50% 100%}"+
    ".swsi-dorm .dl{fill:none;stroke:var(--si-faint);stroke-opacity:.4;stroke-width:1.4}.swsi-dorm .dd{fill:var(--si-card2);stroke:var(--si-grey);stroke-width:1.6}"+
    ".swsi-dorm .dx{stroke:var(--si-grey);stroke-width:2.2;stroke-linecap:round}.swsi-dorm .em{fill:var(--si-act);animation:swsi-br 2.4s ease-in-out infinite}"+
    "@keyframes swsi-br{0%,100%{opacity:.3}50%{opacity:1}}"+
    ".swsi-dorm .fb{position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,var(--si-card))}"+
    ".swsi-dorm .lb{position:absolute;left:0;right:0;bottom:8px;text-align:center;font:700 9.5px 'Roboto Condensed',sans-serif;letter-spacing:.24em;color:var(--si-faint)}.swsi-dorm .lb b{color:var(--si-act-ink)}"+
    ".swsi-g{min-height:44px}.swsi-gbtn{width:100%;height:44px;border-radius:999px;border:1px solid var(--si-line);background:#fff;color:rgba(0,0,0,.87);font:600 14px Roboto,Arial,sans-serif;cursor:pointer}"+
    ".swsi-or{display:flex;align-items:center;gap:10px;color:var(--si-faint);font:700 10.5px 'Roboto Condensed',sans-serif;letter-spacing:.16em;margin:12px 0}"+
    ".swsi-or:before,.swsi-or:after{content:'';flex:1;height:1px;background:var(--si-line)}"+
    ".swsi-row{display:flex;gap:8px}.swsi input[type=email]{flex:1;min-width:0;height:44px;border-radius:12px;background:var(--si-bg);border:1px solid var(--si-line);color:var(--si-text);padding:0 14px;font:inherit;font-size:16px}"+
    ".swsi-go{height:44px;padding:0 16px;border:0;border-radius:12px;background:var(--si-act);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer}"+
    ".swsi-go.wide{width:100%;margin-top:10px}.swsi-go[disabled]{opacity:.6;cursor:wait}"+
    ".swsi-ts{margin:10px 0 0;min-height:65px}"+
    ".swsi-code{position:relative;display:flex;gap:6px;margin:4px 0 0}.swsi-code span{flex:1;height:50px;border-radius:10px;background:var(--si-bg);border:1px solid var(--si-line);display:flex;align-items:center;justify-content:center;font:800 22px 'Roboto Condensed',sans-serif}"+
    ".swsi-code span.cur{border-color:var(--si-act);box-shadow:0 0 0 3px var(--si-wash)}"+
    ".swsi-code input{position:absolute;inset:0;width:100%;height:100%;opacity:0;font-size:16px}"+
    ".swsi-opt{display:flex;gap:10px;align-items:flex-start;margin:12px 0 0;font-size:12.5px;color:var(--si-soft);line-height:1.4;cursor:pointer}"+
    ".swsi-opt input{appearance:none;-webkit-appearance:none;flex:none;width:18px;height:18px;margin:1px 0 0;border-radius:5px;border:1.5px solid var(--si-grey);display:grid;place-items:center}"+
    ".swsi-opt input:checked{background:var(--si-act);border-color:var(--si-act)}.swsi-opt input:checked:after{content:'';width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px)}"+
    ".swsi-flag{border:1px solid var(--si-line);background:var(--si-bg);border-radius:12px;padding:10px 12px;margin:0 0 12px;color:var(--si-soft);font-size:12.5px;line-height:1.45}.swsi-flag b{color:var(--si-text)}"+
    ".swsi-msg{min-height:1.3em;margin:10px 0 0;font-weight:600;font-size:13px;color:var(--si-act-ink)}"+
    ".swsi-link{display:block;margin:12px auto 0;background:none;border:0;color:var(--si-act-ink);font:inherit;font-weight:700;font-size:13px;cursor:pointer}"+
    ".swsi-sent{display:flex;align-items:center;gap:10px;margin:0 0 12px;color:var(--si-soft);font-size:13px}.swsi-sent b{color:var(--si-text)}"+
    ".swsi-fine{font-size:11px;color:var(--si-faint);margin:10px 0 0;text-align:center}.swsi-fine a{color:var(--si-soft)}"+
    ".swsi-spell{display:none;height:430px}.swsi-spell.on{display:block}"+
    "[hidden]{display:none!important}"+
    "@media (prefers-reduced-motion:reduce){.swsi,.swsi *{animation:none!important;transition:none!important}}";

  var box=null, scrim=null, cur=null, spell=null, TS=null, tsId=null, EMAIL="", NONCE=null, gisLoaded=false, lastFocus=null;
  var E=env(root.navigator&&root.navigator.userAgent,(root.matchMedia&&root.matchMedia("(display-mode: standalone)").matches)||(root.navigator&&root.navigator.standalone===true));
  function $(s){ return box.querySelector(s); }
  function meta(n){ var m=d.querySelector('meta[name="'+n+'"]'); return m?m.getAttribute("content")||"":""; }
  function req(method,url,body,cb){
    var x=new XMLHttpRequest(); x.open(method,url,true);
    if(method==="POST"){ x.setRequestHeader("Content-Type","application/json"); x.setRequestHeader("X-SW-Request","1"); }
    x.timeout=15000;
    x.onload=function(){ var j={}; try{ j=JSON.parse(x.responseText); }catch(e){} cb(x.status,j); };
    x.onerror=x.ontimeout=function(){ cb(0,{}); };
    x.send(body?JSON.stringify(body):null);
  }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function say(t){ $(".swsi-msg").textContent=t||""; }
  function optin(){ var c=$(".swsi-optin"); return !!(c&&c.checked); }
  function script(src,id){ if(d.getElementById(id)) return; var s=d.createElement("script"); s.src=src; s.async=true; s.defer=true; s.id=id; d.head.appendChild(s); }

  function header(action,detail){
    if(detail&&detail.odds){
      var rows=(detail.rows||[]).slice(0,3).map(function(r){ return "<div class='r'><span>"+esc(r.t)+"</span><em>"+esc(r.o)+"</em></div>"; }).join("");
      return "<div class='swsi-seal'><div class='swsi-slip'>"+rows+"<div class='t'><span>"+esc(detail.legs||"")+" LEGS · "+esc(String(detail.book||"").toUpperCase())+
        "</span><em>"+esc(detail.odds)+"</em></div></div><div class='swsi-wax' aria-hidden='true'><svg width='42' height='42' viewBox='0 0 44 44' fill='none' stroke='rgba(255,255,255,.85)' stroke-width='1.6' stroke-linecap='round'>"+
        "<circle cx='22' cy='22' r='17' stroke-opacity='.45'/><path d='M22 13l6 4.4-2.3 7h-7.4l-2.3-7z' fill='rgba(255,255,255,.85)' stroke='none'/><path d='M22 13V7M28 17.4l5.5-2M25.7 24.4l3.5 4.8M18.3 24.4l-3.5 4.8M16 17.4l-5.5-2'/></svg></div></div>";
    }
    return "<div class='swsi-dorm' aria-hidden='true'><div class='tb'><svg width='250' height='190' viewBox='0 0 250 190'>"+
      "<rect class='dl' x='6' y='6' width='238' height='178' rx='5'/><line class='dl' x1='6' y1='95' x2='244' y2='95'/><circle class='dl' cx='125' cy='95' r='24'/><path class='dl' d='M85 6v30h80V6'/><path class='dl' d='M85 184v-30h80v30'/>"+
      "<circle class='dd' cx='125' cy='170' r='6'/><circle class='dd' cx='52' cy='140' r='6'/><circle class='dd' cx='104' cy='112' r='6'/><circle class='dd' cx='190' cy='124' r='6'/><circle class='dd' cx='200' cy='70' r='6'/><circle class='dd' cx='120' cy='60' r='6'/><circle class='dd' cx='140' cy='30' r='6'/>"+
      "<path class='dx' d='M84 126l7 7m0-7l-7 7M160 100l7 7m0-7l-7 7M160 58l7 7m0-7l-7 7'/><circle class='em' cx='125' cy='170' r='3.2'/></svg></div>"+
      "<div class='fb'></div><div class='lb'>THE MOVE IS SET · <b>YOU TAKE THE KICK-OFF</b></div></div>";
  }

  function build(page){
    if(!d.getElementById("swsi-css")){ var st=d.createElement("style"); st.id="swsi-css"; st.textContent=CSS; d.head.appendChild(st); }
    box=d.createElement("div"); box.className="swsi sw-tok"+(page?" page":""); box.setAttribute("role","dialog"); box.setAttribute("aria-modal",page?"false":"true"); box.setAttribute("aria-labelledby","swsiH");
    box.innerHTML="<div class='swsi-grab'></div><button class='swsi-x' type='button' aria-label='Close'>×</button>"+
      "<div class='swsi-form'><div class='swsi-head'></div><p class='swsi-h' id='swsiH'></p><p class='swsi-s'>Free. Your slips follow you to every phone and laptop.</p>"+
      "<p class='swsi-flag' hidden></p>"+
      "<div class='swsi-gwrap'><div class='swsi-g'></div><button class='swsi-gbtn' type='button' hidden>Continue with Google</button><div class='swsi-or'>OR EMAIL ME A CODE</div></div>"+
      "<form class='swsi-ef' novalidate><div class='swsi-row'><input type='email' autocomplete='email' inputmode='email' maxlength='254' aria-label='Your email' placeholder='you@email.com'>"+
      "<button class='swsi-go' type='submit'>Send</button></div><div class='swsi-ts'></div></form>"+
      "<form class='swsi-cf' novalidate hidden><div class='swsi-sent'><span>6-digit code sent to<br><b class='swsi-to'></b></span></div>"+
      "<label class='swsi-code'><span></span><span></span><span></span><span></span><span></span><span></span>"+
      "<input inputmode='numeric' autocomplete='one-time-code' maxlength='9' aria-label='6-digit code'></label>"+
      "<button class='swsi-go wide' type='submit'>Sign in</button><button class='swsi-link swsi-again' type='button'>Use a different email</button></form>"+
      "<label class='swsi-opt'><input type='checkbox' class='swsi-optin'><span>"+WORDING+"</span></label>"+
      "<p class='swsi-msg' role='status' aria-live='polite'></p>"+
      "<p class='swsi-fine'>No password. We never post for you. <a href='/privacy'>Privacy</a></p></div>"+
      "<div class='swsi-spell'></div>";
    if(page){ (d.getElementById("swLogin")||d.body).appendChild(box); }
    else {
      scrim=d.createElement("div"); scrim.className="swsi-scrim"; d.body.appendChild(scrim); d.body.appendChild(box);
      scrim.addEventListener("click",close);
      d.addEventListener("keydown",function(e){ if(!box.classList.contains("on")) return;
        if(e.key==="Escape") close();
        if(e.key==="Tab"){ var f=box.querySelectorAll("button:not([hidden]),input,a[href],iframe"), v=[].filter.call(f,function(n){ return n.offsetParent!==null; });
          if(!v.length) return; var a=v[0], z=v[v.length-1];
          if(e.shiftKey&&d.activeElement===a){ e.preventDefault(); z.focus(); } else if(!e.shiftKey&&d.activeElement===z){ e.preventDefault(); a.focus(); } } });
      var y0=null; $(".swsi-grab").addEventListener("touchstart",function(e){ y0=e.touches[0].clientY; },{passive:true});
      $(".swsi-grab").addEventListener("touchend",function(e){ if(y0!=null&&e.changedTouches[0].clientY-y0>80) close(); y0=null; });
    }
    $(".swsi-x").addEventListener("click",close);
    $(".swsi-gbtn").addEventListener("click",redirectGoogle);
    $(".swsi-ef").addEventListener("submit",sendCode);
    $(".swsi-cf").addEventListener("submit",verifyCode);
    $(".swsi-again").addEventListener("click",function(){ $(".swsi-cf").hidden=true; $(".swsi-ef").hidden=false; say(""); googleShown(true); });
    var ci=$(".swsi-code input");
    ci.addEventListener("input",function(){ var v=ci.value.replace(/\D/g,"").slice(0,6), sp=$(".swsi-code").querySelectorAll("span");
      for(var i=0;i<6;i++){ sp[i].textContent=v.charAt(i); sp[i].className=i===v.length?"cur":""; }
      if(v.length===6) verifyCode(); });
  }

  function googleShown(on){
    var blocked=E.inapp||E.iosApp;
    $(".swsi-gwrap").hidden=!on||blocked;
    var f=$(".swsi-flag");
    if(blocked){ f.hidden=false; f.innerHTML=E.inapp?"<b>Google sign-in doesn't work inside this app.</b> Use your email below, or open this page in your browser."
      :"<b>Google sign-in doesn't work inside the installed iPhone app.</b> Use your email below."; }
    else f.hidden=true;
  }

  /* One Tap: nonce first, then Google's script, then its button and prompt.
     Nothing in 2s (blocked, FedCM off, no Google session) -> our own button. */
  function startGoogle(){
    if(E.inapp||E.iosApp) return;
    var gcid=meta("sw-gcid"), slot=$(".swsi-g"), fallback=setTimeout(function(){ if(!slot.querySelector("iframe")) $(".swsi-gbtn").hidden=false; },2000);
    if(!gcid){ clearTimeout(fallback); $(".swsi-gbtn").hidden=false; return; }
    req("POST","/api/auth/google/nonce",{},function(st,j){
      if(st!==200||!j.nonce){ clearTimeout(fallback); $(".swsi-gbtn").hidden=false; return; }
      NONCE=j;
      function go(){ var g=root.google&&root.google.accounts&&root.google.accounts.id; if(!g) return;
        g.initialize({client_id:gcid,nonce:j.nonce,callback:onCredential,use_fedcm_for_prompt:true,auto_select:false,itp_support:true,context:"signin",cancel_on_tap_outside:false});
        g.renderButton(slot,{theme:"filled_black",shape:"pill",text:"continue_with",size:"large",width:Math.min(400,slot.offsetWidth||320)});
        try{ g.prompt(); }catch(e){} }
      if(root.google&&root.google.accounts) go();
      else { root.swGisLoad=go; script("https://accounts.google.com/gsi/client?onload=swGisLoad","swsi-gis"); }
    });
  }
  function onCredential(resp){
    if(!resp||!resp.credential||!NONCE) return;
    playSpell();
    req("POST","/api/auth/google/onetap",{credential:resp.credential,nonce_id:NONCE.nonce_id,optin:optin()},function(st,j){
      if(st===200&&j.ok) return authed(j,"");
      unplay(); say(errText(st,j)); NONCE=null; startGoogle();
    });
  }
  function redirectGoogle(){
    var b=$(".swsi-gbtn"); b.disabled=true; say("");
    try{ if(ls) ls.setItem("sw.gate",JSON.stringify({action:cur.action,detail:cur.detail||null,resume:cur.resume||""})); }catch(e){}
    var ret=cur.ret||"/"; ret+=(ret.indexOf("?")<0?"?":"&")+"signedin=1";
    req("POST","/api/auth/google/prepare",{"return":ret,optin:optin()},function(st,j){
      if(st!==200||!j.start){ b.disabled=false; return say(errText(st,j)); }
      if(E.standalone){ root.open(j.start,"_blank"); say("Finish in the Google window, then come back here."); pollMe(0); }
      else root.location.href=j.start;
    });
  }
  /* The installed Android app opens Google in a Chrome tab that shares the cookie jar. */
  function pollMe(n){
    if(n>300){ $(".swsi-gbtn").disabled=false; return say(errText(400,{error:"expired"})); }
    req("GET","/api/me",null,function(st,j){ if(st===200&&j.signedIn){ playSpell(); return authed({ok:true,name:""},j.email||""); }
      setTimeout(function(){ if(box&&(box.classList.contains("on")||box.classList.contains("page"))) pollMe(n+1); },2000); });
  }

  function startTurnstile(){
    var key=meta("sw-ts"); if(!key) return;
    function go(){ if(!root.turnstile||tsId!=null) return;
      tsId=root.turnstile.render($(".swsi-ts"),{sitekey:key,theme:"auto",callback:function(t){ TS=t; },"expired-callback":function(){ TS=null; }}); }
    if(root.turnstile) go(); else { root.swTsLoad=go; script("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=swTsLoad","swsi-ts"); }
  }
  function sendCode(ev){
    if(ev) ev.preventDefault();
    var b=$(".swsi-ef .swsi-go"); EMAIL=$(".swsi-ef input").value.replace(/^\s+|\s+$/g,"");
    if(!EMAIL) return say(errText(400,{error:"bad_email"}));
    if(!TS&&meta("sw-ts")) return say("Wait for the check to finish, then tap Send.");
    b.disabled=true; say("");
    req("POST","/api/auth/email/send",{email:EMAIL,turnstile:TS},function(st,j){
      b.disabled=false; TS=null; try{ if(root.turnstile&&tsId!=null) root.turnstile.reset(tsId); }catch(e){}
      if(st!==200) return say(errText(st,j));
      $(".swsi-ef").hidden=true; googleShown(false); $(".swsi-to").textContent=EMAIL;
      $(".swsi-h").innerHTML="Check your <i>email</i>"; $(".swsi-s").hidden=true; $(".swsi-head").hidden=true;
      $(".swsi-cf").hidden=false; $(".swsi-code input").value=""; $(".swsi-code input").focus();
    });
  }
  function verifyCode(ev){
    if(ev) ev.preventDefault();
    var b=$(".swsi-cf .swsi-go"); if(b.disabled) return;
    b.disabled=true; say(""); playSpell();
    req("POST","/api/auth/email/verify",{email:EMAIL,code:$(".swsi-code input").value,optin:optin()},function(st,j){
      b.disabled=false;
      if(st===200&&j.ok) return authed(j,EMAIL);
      unplay(); say(errText(st,j));
    });
  }

  function playSpell(){
    if(spell) return;
    $(".swsi-form").classList.add("gone"); var m=$(".swsi-spell"); m.classList.add("on");
    spell=root.swSpell?root.swSpell(m,{odds:(cur.detail&&cur.detail.rows||[]).map(function(r){ return r.o; }),onRetry:function(){ unplay(); say("Try again."); }}):null;
  }
  function unplay(){ if(spell){ spell.stop(); spell=null; } $(".swsi-spell").classList.remove("on"); $(".swsi-spell").innerHTML=""; $(".swsi-form").classList.remove("gone"); }
  function authed(j,email){
    var o=cur;
    if(spell){ spell.step(1); if(root.swSpell&&root.swSpell.firstName) spell.setName(root.swSpell.firstName(j.name,email)); }
    var finish=function(){ if(!spell){ close(); if(o.onDone) o.onDone(); return; }
      spell.finish(function(){ close(); if(o.onDone) o.onDone(); }); };
    if(o.afterAuth) o.afterAuth(j,finish); else finish();
  }

  function reset(o){
    cur=o; TS=null; EMAIL=""; NONCE=null; if(spell){ spell.stop(); spell=null; }
    $(".swsi-spell").classList.remove("on"); $(".swsi-spell").innerHTML="";
    $(".swsi-form").classList.remove("gone");
    $(".swsi-head").hidden=false; $(".swsi-head").innerHTML=header(o.action,o.detail);
    $(".swsi-h").innerHTML="Sign in to <i>"+esc(HEAD[o.action]||HEAD.book)+"</i>"; $(".swsi-s").hidden=false;
    $(".swsi-ef").hidden=false; $(".swsi-cf").hidden=true; $(".swsi-gbtn").hidden=true; $(".swsi-gbtn").disabled=false;
    $(".swsi-g").innerHTML=""; say(""); googleShown(true);
  }
  function open(o){
    o=o||{};
    if(!box) build(!!o.page);
    reset(o);
    if(!o.page){ lastFocus=d.activeElement; scrim.classList.add("on"); box.classList.add("on"); setTimeout(function(){ var x=$(".swsi-x"); if(x) x.focus(); },50); }
    startGoogle(); startTurnstile();
  }
  function resume(o){
    o=o||{}; if(!box) build(false); reset(o);
    scrim.classList.add("on"); box.classList.add("on");
    playSpell(); authed({ok:true,name:""},"");
  }
  function close(){
    if(!box) return;
    if(spell){ spell.stop(); spell=null; }
    try{ if(root.google&&root.google.accounts) root.google.accounts.id.cancel(); }catch(e){}
    if(box.classList.contains("page")) return;
    box.classList.remove("on"); if(scrim) scrim.classList.remove("on");
    if(lastFocus&&lastFocus.focus) try{ lastFocus.focus(); }catch(e){}
  }
  root.swSignIn={open:open,resume:resume,close:close};
})(typeof window!=="undefined"?window:this);
```

In `public/spell.js`, expose the helper so `authed()` can use it. Add after `root.swSpell=swSpell;`:

```js
  root.swSpell.firstName=firstName;
```

- [ ] **Step 4: Run it and confirm it passes.** Run `node --test test/signin.test.js test/spell.test.js`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add public/signin.js public/spell.js test/signin.test.js
git commit -m "Sign-in sheet: One Tap, email code and opt-in, on the site's colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Wire the wall into the app (`public/index.html`)

**Files:**
- Modify: `public/index.html`:
  - the theme token blocks near lines 261 and 357
  - `bookSlip` near 13714, `bookMy` near 18932, `splitAndBook` near 14596, `wireSafer`'s book click near 16185
  - the `tab-build` listener near 19194, `openSlipsSheet` near 8284
  - the swAccount block near 22701
- Test: `test/account-client.test.js`, new `test/wall.test.js`

**Interfaces:**
- Consumes: `window.swSignIn` (Task 7), `window.swSpell` (Task 6).
- Produces:
  - `window.swGate(action, detail, go, resumeKey) -> boolean`. True means "carry on now"; false means the sheet opened and `go()` runs after sign-in.
  - `window.swResume = {bookSlip, bookMy, build, slips}`.
  - `gateDetail(picks, B) -> {rows, odds, legs, book}`.

- [ ] **Step 1: Write the failing tests.** Create `test/wall.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const block = /<script id="swAccount">([\s\S]*?)<\/script>/.exec(html)[1];
const fnBody = (name) => { const m = new RegExp("(?:async )?function " + name + "\\([^)]*\\)\\{([\\s\\S]{0,600})").exec(html); assert.ok(m, name); return m[1]; };

test("each locked entry point asks swGate first", () => {
  assert.match(fnBody("bookSlip"), /^\s*if\(window\.swGate&&!swGate\("book",gateDetail\(BUILD\.picks,curBook\(\)\),bookSlip,"bookSlip"\)\) return;/);
  assert.match(fnBody("bookMy"), /^\s*if\(window\.swGate&&!swGate\("book",/);
  assert.match(fnBody("splitAndBook"), /^\s*if\(window\.swGate&&!swGate\("book",/);
  assert.match(fnBody("openSlipsSheet"), /^\s*if\(window\.swGate&&!swGate\("slips",null,openSlipsSheet,"slips"\)\) return;/);
  assert.match(html, /\$\("tab-build"\)\.addEventListener\("click",function\(\)\{if\(window\.swGate&&!swGate\("build",null,function\(\)\{setView\("build"\);\},"build"\)\) return; setView\("build"\);\}\);/);
  assert.match(html, /if\(window\.swGate&&!swGate\("book",null,function\(\)\{go\.click\(\);\},""\)\) return;\s*BYO\._booking=true;/);
});

test("Review Focus 1 and 2: never walls before the account state is known, when accounts are off, or when signin.js failed to load", () => {
  const g = /root\.swGate=function\(action,detail,go,resume\)\{([\s\S]*?)\n  \};/.exec(block);
  assert.ok(g, "swGate");
  assert.match(g[1], /if\(!d\.querySelector\('meta\[name="sw-auth"\]'\)\|\|!st\.known\|\|st\.on\|\|!root\.swSignIn\) return true;/);
});

test("the sign-in and spell scripts load only with accounts on, deferred", () => {
  assert.match(html, /<script src="\/spell\.js" defer><\/script>\s*<script src="\/signin\.js" defer><\/script>/);
});

test("the ball has a token pair in both themes", () => {
  assert.match(html, /:root, \[data-theme="dark"\]\{[\s\S]*?--ball:#F2F1F0;[\s\S]*?--ball-ink:#161619;/);
  assert.match(html, /\[data-theme="light"\]\{[\s\S]*?--ball:#FFFFFF;[\s\S]*?--ball-ink:#1C1A18;/);
});

test("a Google redirect comes back into the spell and resumes only a whitelisted action", () => {
  assert.match(block, /signedin=1/);
  assert.match(block, /sessionStorage/);
  assert.match(block, /root\.swResume&&root\.swResume\[g\.resume\]/);
  assert.match(html, /window\.swResume=\{bookSlip:function\(\)\{bookSlip\(\);\},bookMy:function\(\)\{bookMy\(\);\},build:function\(\)\{setView\("build"\);\},slips:function\(\)\{openSlipsSheet\(\);\}\};/);
});

test("the account sheet has a picks-by-email switch", () => {
  assert.match(block, /Picks by email/);
  assert.match(block, /\/api\/account\/consent/);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/wall.test.js`. Expected: FAIL.

- [ ] **Step 3: Add the tokens.**
  - In the `:root, [data-theme="dark"]{` block, after `--cream:#DCD8D2;`, add: `--ball:#F2F1F0; --ball-ink:#161619;`
  - In the `[data-theme="light"]{` block, after `--cream:#35323C;`, add: `--ball:#FFFFFF; --ball-ink:#1C1A18;`
  - If the dark block also exists under `@media (prefers-color-scheme` or elsewhere, add them there too. Check with `grep -n -- "--cream:" public/index.html`.

- [ ] **Step 4: Add the scripts.** Put them immediately before `<script id="swAccount">`:

```html
<script src="/spell.js" defer></script>
<script src="/signin.js" defer></script>
```

They are small, deferred and only used on a tap. Loading them always keeps the build simple, and `swGate` ignores them when accounts are off.

- [ ] **Step 5: Add `gateDetail` and `swResume`.** In the main app script, right after `function curBook(){ ... }` (line ~11840):

```js
/* What the sign-in sheet shows under its seal: the reader's own slip. The
   match names are blurred there, so they only need to look like a slip; the
   odds and the total are real, because they are the hook. */
function gateDetail(picks,B){
  var rows=[], tot=1, n=0;
  (picks||[]).forEach(function(c){
    var f=c.f||fixtureById(c.id); if(!f) return;
    var o=legOdd(f,c.code,c.p,B); if(!(o>1)) return;
    tot*=o; n++;
    rows.push({t:(f.home||"")+" v "+(f.away||""),o:o.toFixed(2)});
  });
  return n?{rows:rows,odds:tot.toFixed(2),legs:n,book:(B&&B.label)||""}:null;
}
window.swResume={bookSlip:function(){bookSlip();},bookMy:function(){bookMy();},build:function(){setView("build");},slips:function(){openSlipsSheet();}};
```

- [ ] **Step 6: Gate the entry points.** Make these exact edits:
  - `bookSlip`: first line of the body becomes `  if(window.swGate&&!swGate("book",gateDetail(BUILD.picks,curBook()),bookSlip,"bookSlip")) return;`
  - `bookMy`: first line of the body becomes `  if(window.swGate&&!swGate("book",gateDetail(MYSLIP,curBook()),bookMy,"bookMy")) return;`
  - `splitAndBook(picks,n,host,B,opt)`: first line becomes `  if(window.swGate&&!swGate("book",gateDetail(picks,B),function(){splitAndBook(picks,n,host,B,opt);},"")) return;`
  - `openSlipsSheet`: first line becomes `  if(window.swGate&&!swGate("slips",null,openSlipsSheet,"slips")) return;`
  - Line ~19194 becomes `$("tab-build").addEventListener("click",function(){if(window.swGate&&!swGate("build",null,function(){setView("build");},"build")) return; setView("build");});`
  - In `wireSafer`, directly before `    BYO._booking=true;`, insert `    if(window.swGate&&!swGate("book",null,function(){go.click();},"")) return;`

- [ ] **Step 7: Add the gate and the resume to swAccount.** In the browser half of swAccount:

a) Add `known:false` to `st`:

```js
  var st={on:false,known:false,email:"",timer:null,backoff:0,busy:false,raw:"",nextAt:0,pulled:0};
```

b) Let `sync` take a callback. Change the signature to `function sync(keepalive,cb){`.
   - In the `if(!st.on||st.busy) return;` guard, call `cb` first: `if(!st.on||st.busy){ if(cb) cb(); return; }`
   - In the keepalive branch, call `if(cb) cb();` before `return;`.
   - In the XHR callback, add `if(cb) cb();` as the first line after `st.busy=false;`. It must run exactly once for every outcome, including the `schedule(0)` early return.

c) Pull the one-time wiring out of `boot()` into `wire()`. Move the `setInterval(watch,5000)`, the `storage` listener, the `visibilitychange` listener and the `pageshow` listener into:

```js
  var wired=false;
  function wire(){
    if(wired) return; wired=true;
    setInterval(watch,5000);
    /* (the storage / visibilitychange / pageshow listeners, moved here unchanged with their comments) */
  }
```

In `boot()`, replace them with `wire();`.

d) Add the gate, the post-sign-in hook and the resume, before `/* ----------------------------------------------------------- start up */`:

```js
  /* The soft wall. True means go ahead now; false means the sign-in sheet is
     open and go() runs once the reader is signed in and their first sync is
     back. Never walls while /api/me has not answered yet, with accounts off,
     or when signin.js did not load: the site must still book. */
  function afterAuth(j,done){
    req("GET","/api/me",null,function(code,me){
      if(code===200&&me&&me.signedIn===true){ st.on=true; st.known=true; st.email=me.email||""; paintButton(); wire(); return sync(false,done); }
      done();
    });
  }
  root.swGate=function(action,detail,go,resume){
    if(!d.querySelector('meta[name="sw-auth"]')||!st.known||st.on||!root.swSignIn) return true;
    root.swSignIn.open({action:action,detail:detail,resume:resume||"",ret:location.pathname+location.search,afterAuth:afterAuth,onDone:go});
    return false;
  };
  /* Back from the Google redirect: finish the spell here, then run what they tapped. */
  function readGate(){
    if(!/[?&]signedin=1/.test(location.search)) return null;
    try{ if(history.replaceState) history.replaceState(null,"",location.pathname+location.search.replace(/[?&]signedin=1/,"").replace(/^&/,"?")+location.hash); }catch(e){}
    var g=null; try{ g=JSON.parse(sessionStorage.getItem("sw.gate")||"null"); sessionStorage.removeItem("sw.gate"); }catch(e){}
    return g&&g.action?g:null;
  }
```

e) In `boot()`'s `/api/me` callback:
   - Set `st.known=true;` on every answer that is not 404, 0 or 5xx. Put it right after that early return.
   - In the signed-in branch, replace `sync(false);` with:

```js
      var g=readGate();
      if(g&&root.swSignIn){
        wire();
        root.swSignIn.resume({action:g.action,detail:g.detail,afterAuth:function(j,done){ sync(false,done); },
          onDone:(root.swResume&&root.swResume[g.resume])||null});
      } else sync(false);
```

   Keep `wire();` for the signed-in path (it replaces the moved lines).

f) Add the picks-by-email switch to the account sheet:
   - In `build()`, add `'<div class="ac-row"><div><span>Picks by email</span><small>The wizard\'s best picks, now and then</small></div><button class="ac-btn" id="acctMail" type="button" style="width:auto;margin:0">…</button></div>'+` straight after the devices block.
   - At the end of `build()`:

```js
    $("acctMail").onclick=function(){ var b=this, on=b.getAttribute("data-on")!=="1";
      b.disabled=true; req("POST","/api/account/consent",{on:on},function(code,j){ b.disabled=false;
        if(code===200){ b.setAttribute("data-on",j.on?"1":"0"); b.textContent=j.on?"On":"Off"; } else fail(code,j); }); };
```

   - In `openSheet()`, after `loadDevices();`:

```js
    req("GET","/api/account/consent",null,function(code,j){ var b=$("acctMail"); if(!b) return;
      if(code===200){ b.setAttribute("data-on",j.on?"1":"0"); b.textContent=j.on?"On":"Off"; } else b.textContent="Off"; });
```

- [ ] **Step 8: Regenerate the shadow and run everything.**

Run:
```bash
node scripts/graphify-inline.js
node --test test/wall.test.js test/account-client.test.js
npm test
```

Expected: all pass. The existing `account-client.test.js` source-shape tests still match: the `visibilitychange` and `storage` listener bodies moved but kept their exact text. If a regex there anchored on `boot()`, update it to look in `wire()` and say so in the commit message.

- [ ] **Step 9: Commit.**

```bash
git add public/index.html test/wall.test.js test/account-client.test.js
git commit -m "Soft wall: book, build and My slips ask for sign-in, then carry on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `/login` uses the same sheet

**Files:**
- Modify: `lib/pages.js` `renderLogin` (lines 860-1011)
- Test: `test/login-page.test.js`

**Interfaces:**
- Consumes: `public/signin.js` (Task 7) and `public/spell.js` (Task 6).
- `renderLogin(o)` now takes `{siteKey, gcid}` and writes the metas itself. It is a static page built by prebuild, so it cannot rely on `applyAuthMeta`.
- The prebuild call at `scripts/prebuild.js:536` passes `gcid: process.env.GOOGLE_CLIENT_ID`.

- [ ] **Step 1: Rewrite the login tests.** Replace the body of `test/login-page.test.js` after the requires:

```js
const html = P.renderLogin({ siteKey: "0x4AAAAAAAtest_Key-1", gcid: "123-abc.apps.googleusercontent.com" });

test("the page mounts the shared sign-in sheet full-page, with its keys", () => {
  assert.match(html, /<div id="swLogin"><\/div>/);
  assert.match(html, /<script src="\/spell\.js" defer><\/script>/);
  assert.match(html, /<script src="\/signin\.js" defer><\/script>/);
  assert.match(html, /<meta name="sw-ts" content="0x4AAAAAAAtest_Key-1">/);
  assert.match(html, /<meta name="sw-gcid" content="123-abc\.apps\.googleusercontent\.com">/);
  assert.match(html, /swSignIn\.open\(\{action:"slips",page:true/);
});

test("it is never indexed and carries no secret", () => {
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /TURNSTILE_SECRET|GOOGLE_CLIENT_SECRET|AUTH_PEPPER|RESEND_API_KEY|service_role/);
});

test("keys that are not plain keys are dropped, not injected", () => {
  const bad = P.renderLogin({ siteKey: '"><script>alert(1)</script>', gcid: '"><b>' });
  assert.doesNotMatch(bad, /alert\(1\)|<b>/);
});

test("after sign-in it goes back to a same-site return path only", () => {
  assert.match(html, /return=/);
  assert.match(html, /\^\\\/\(\?!\[\\\/\\\\\]\)/);    // the same safe-return regex the old page used
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/login-page.test.js`. Expected: FAIL.

- [ ] **Step 3: Rewrite `renderLogin`.** Keep the explanatory header comment and add one line to it: "It now mounts the shared sheet from public/signin.js."

```js
function renderLogin(o) {
  const key = /^[0-9A-Za-z_-]{1,100}$/.test(String((o && o.siteKey) || "")) ? o.siteKey : "";
  const gcid = /^[0-9A-Za-z._-]{1,200}\.apps\.googleusercontent\.com$/.test(String((o && o.gcid) || "")) ? o.gcid : "";
  const script = `<script>
(function(){
  var m=/[?&]return=([^&]*)/.exec(location.search), ret="/";
  try{ if(m){ ret=decodeURIComponent(m[1]); } }catch(e){}
  if(ret.length>200||!/^\\/(?![\\/\\\\])[A-Za-z0-9\\-._~\\/?=&]*$/.test(ret)) ret="/";
  function go(){ if(!window.swSignIn) return setTimeout(go,50);
    swSignIn.open({action:"slips",page:true,ret:ret,onDone:function(){ location.replace(ret); }}); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",go); else go();
})();
</script>`;
  return staticPage({
    path: "/login", noindex: true,
    title: "Sign in",
    desc: "Sign in to " + BRAND + " to keep your slips and choices on every device.",
    h1: "Sign in",
    sub: "Keeps your slips and choices on every device.",
    head: (key ? `<meta name="sw-ts" content="${esc(key)}">` : "") + (gcid ? `<meta name="sw-gcid" content="${esc(gcid)}">` : "") +
      `<script src="/spell.js" defer></script><script src="/signin.js" defer></script>`,
    body: `<div id="swLogin"></div>${script}`,
  });
}
```

In `scripts/prebuild.js:536`, pass the client id:

```js
      fs.writeFileSync(path.join(PUB, "login.html"), P.renderLogin({ siteKey: process.env.TURNSTILE_SITE_KEY || "", gcid: process.env.GOOGLE_CLIENT_ID || "" }));
```

- [ ] **Step 4: Run and commit.** Run `node --test test/login-page.test.js` and then `npm test`. Expected: PASS.

```bash
git add lib/pages.js scripts/prebuild.js test/login-page.test.js
git commit -m "/login mounts the shared sign-in sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Privacy copy, runbook, preview deploy

**Files:**
- Modify: the `/privacy` source. Find it with `grep -rn "no accounts\|Accounts" lib/pages.js public/privacy.html | head`. It is the file `test/privacy-accounts.test.js` reads.
- Modify: `docs/accounts-runbook.md`
- Test: `test/privacy-accounts.test.js`

- [ ] **Step 1: Write the failing test.** Append to `test/privacy-accounts.test.js`, using its existing `html` variable:

```js
test("privacy explains marketing email: opt-in only, how to stop, what is kept", () => {
  assert.match(html, /Picks by email/);
  assert.match(html, /only if you tick/i);
  assert.match(html, /unsubscribe/i);
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run `node --test test/privacy-accounts.test.js`. Expected: FAIL.

- [ ] **Step 3: Add the paragraph** to the accounts section of the privacy page:

```html
<h3>Picks by email</h3>
<p>We email you picks only if you tick the box when you sign in, or switch it on in your account. We keep the date you agreed and the words you agreed to. Every email has an unsubscribe link that works in one click, and you can switch it off in your account at any time. Deleting your account deletes this record too.</p>
```

- [ ] **Step 4: Update the runbook.** Append a section to `docs/accounts-runbook.md`:

```markdown
## 8. Soft wall, One Tap and picks by email (Sep 2026)

Owner, once:
1. Google Cloud: console.cloud.google.com/auth/clients, project soccerwizard, Web client.
   Under Authorised JavaScript origins, add https://www.soccerwizard.live and https://soccerwizard.live. Save.
2. Supabase: SQL Editor, New query. Paste the email_consent block and the auth_attempts optin line from sql/accounts.sql. Run.
   Then check that Table Editor shows email_consent.

Device pass on the preview link before promoting:
- Android Chrome: tap Book on a slip, then "Continue as …", then the spell plays, then the code books.
- Desktop Chrome: tap My slips, then One Tap, then the slips sheet opens.
- iPhone Safari: tap Build me a slip, then Continue with Google (redirect), then back in the spell, then the builder opens.
- X and Telegram in-app browsers: Google is hidden and email comes first. The code signs in.
- Installed Android app: the Google redirect opens in a Chrome tab, then the app signs in by itself.
- Reduced motion on: the spell shows only its final frame.
- Tick the box, then check that a row appears in email_consent.
- Unsubscribe link from the export, then check that revoked_at is set.
- Light theme: the sheet and the spell are readable. Red means action, gold means odds.
```

- [ ] **Step 5: Run the whole suite.** Run `node scripts/graphify-inline.js`, then `npm test`. Expected: all pass. The count is 2127 plus the new tests.

- [ ] **Step 6: Commit and push to a preview branch.** Do not push to main.

```bash
git add -A lib/pages.js public/privacy.html docs/accounts-runbook.md test/privacy-accounts.test.js
git commit -m "Privacy and runbook: picks by email, One Tap setup and the device pass

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin HEAD:signin-wall
```

Vercel builds a preview for the `signin-wall` branch. Give the owner the preview URL (`vercel ls soccerwizard | head`) and the runbook §8 checklist.

The owner's "promote" means: merge `signin-wall` into main and push.
