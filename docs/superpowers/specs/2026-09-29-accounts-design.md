# Accounts: Google + email code sign-in, cross-device sync, paygate hooks

Date: 2026-09-29. Status: approved in conversation, section by section; this
document is the written record for review before the implementation plan.

## 1. Purpose and decisions

Readers can sign in and find everything they saved on every device they use.
The account is also the identity a future paygate attaches to. Security is the
first requirement: no route may give anyone access to an account that is not
theirs.

Decisions taken with the owner (29 Sep 2026):

| Question | Decision |
|---|---|
| Sign-in required? | No. The whole site works signed out, as today. Signing in adds sync. |
| Paygate | Coming later, undecided scope. Build the hooks (entitlement check, feature table, subscriptions table); every feature is free until switched. Billing is a separate spec. |
| Sign-in methods | Continue with Google, plus "Email me a code" (6 digits). No passwords anywhere. |
| Devices | 3 per account from day one. A 4th sign-in signs out the least-recently-used device. |
| First sign-in on a device with local data | Merge, no prompt. Nothing is deleted by signing in. |
| What syncs | The reader's things and main choices (section 6). Display settings stay per device. |
| How it is built | Our own auth on Vercel functions + Supabase tables, zero new dependencies. |

Out of scope here: payment provider and checkout; gating any specific feature;
linking the Telegram bot to accounts; the site-wide performance / SEO / UX /
copy audit from the owner's screenshots (its own spec next).

## 2. Architecture

```
browser (index.html, /login, static pages)
   │  same-origin fetch, cookie __Host-sw_session (HttpOnly)
   ▼
Vercel functions  api/auth.js   api/me.js   api/account.js
   │  lib/auth/{session,google,emailcode,ratelimit}.js
   │  lib/sync.js  lib/access.js  lib/supabase.js (service-role REST)
   ├──► Google OAuth 2.0 / OIDC (token endpoint, server to server)
   ├──► Resend (email codes, new-device alerts)
   ├──► Cloudflare Turnstile siteverify (bot check on code send)
   ▼
Supabase Postgres (RLS on, no policies: service role only)
```

The browser never holds a database key, an OAuth secret or a session token it
can read.

### Units

| Unit | Does | Depends on |
|---|---|---|
| `lib/auth/session.js` | token create (32 random bytes), SHA-256 hash, cookie build/parse, 3-device rule, rotation | `crypto`, supabase |
| `lib/auth/google.js` | build Google URL (state, PKCE S256, nonce); exchange code; validate ID-token claims | `fetch`, `crypto` |
| `lib/auth/emailcode.js` | code create (6 digits, `crypto.randomInt`), HMAC hash with pepper, constant-time verify, send via Resend | `crypto`, `fetch` |
| `lib/auth/ratelimit.js` | fixed-window counters by key (email hash, IP hash, user id) | supabase RPC |
| `lib/sync.js` | pure `merge(server, client, now)` and `validate(payload)` | none |
| `lib/access.js` | `access(user, feature)` against `feature_access` + `subscriptions` (60 s cache) | supabase |
| `api/auth.js` | routes under `/api/auth/*` (one function, dispatch by path) | the above |
| `api/me.js` | `GET` synced data + entitlements; `POST` merge-and-save | session, sync, access |
| `api/account.js` | download my data; delete account | session |

## 3. Data (Supabase, `sql/accounts.sql`)

Every table: `alter table ... enable row level security;` and **no policies**
(deny for `anon` and `authenticated`; only the service role reaches them).
All ids `uuid default gen_random_uuid()`.

- `users(id, email citext unique not null, google_sub text unique, created_at, last_seen_at)`
- `sessions(id, user_id → users on delete cascade, token_hash bytea unique not null, label text, created_at, last_used_at, expires_at, absolute_expires_at, ended_at, end_reason text)` — live = `ended_at is null and expires_at > now()`. Index `(user_id) where ended_at is null`.
- `login_codes(id, email citext, code_hash bytea, expires_at, attempts int default 0, consumed_at)` — index on `email`.
- `auth_attempts(id, state_hash bytea unique, code_verifier text, nonce text, return_to text, handoff_hash bytea unique, user_id uuid null, created_at, expires_at, started_at, consumed_at)` — Google sign-in in flight.
- `user_data(user_id pk → users on delete cascade, data jsonb not null, version int not null default 0, updated_at)`
- `rate_counters(key text, window_start timestamptz, count int, primary key(key, window_start))` + function `rl_hit(key, window_seconds, limit) returns boolean` (atomic upsert-increment).
- `feature_access(feature text pk, tier text check (tier in ('free','paid')) default 'free')`
- `subscriptions(user_id pk → users on delete cascade, plan text, status text, current_period_end timestamptz, provider text, provider_ref text)` — no rows until the paygate.

Housekeeping (daily, existing `api/cron.js`): delete expired `login_codes` and
`auth_attempts` older than 1 day, ended sessions older than 30 days, rate
counters older than 1 day.

## 4. Sign-in flows

### 4.1 Continue with Google (authorization code + PKCE, server side)

1. `POST /api/auth/google/prepare {return}` (CSRF rules of section 5) —
   validate `return` against an allowlist (same-site relative path starting
   with a single `/`; no `//`, `\`, scheme or host); otherwise `/`. Create an
   `auth_attempts` row: `state` (32 random bytes, stored hashed),
   `code_verifier` (43+ chars), `nonce`, `handoff` (32 random bytes, stored
   hashed), 10-minute expiry. Respond `{start: "/api/auth/google/start?a=<id>",
   handoff}`. The page keeps `handoff` **in memory only** and navigates to
   `start`.
2. `GET /api/auth/google/start?a=<id>` — attempt must exist, be unexpired and
   not yet started (mark started). Set cookie `__Host-sw_oauth=<state>;
   HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`. 302 to Google with
   `response_type=code, scope=openid email, code_challenge=S256(verifier),
   code_challenge_method=S256, state, nonce, prompt=select_account`.
3. `GET /api/auth/google/callback?code&state` — look up by `state` hash: must
   exist, unexpired, unconsumed; mark consumed. Exchange `code` +
   `code_verifier` at `https://oauth2.googleapis.com/token`. Decode the ID
   token received over that TLS response and require: `iss` ∈
   {`https://accounts.google.com`, `accounts.google.com`}, `aud` = our client
   id, `exp` > now, `iat` ≤ now + 60 s, `nonce` = stored nonce,
   `email_verified` = true. Any failure: generic error page, logged to Sentry.
4. Account: by `google_sub`; else by `email` (link `google_sub`); else create.
5. Deliver: if `__Host-sw_oauth` equals `state` → create session, set session
   cookie, clear oauth cookie, 302 to `return_to`. Otherwise (iPhone installed
   app, Google opened in another browser) → store `user_id` on the attempt and
   show "Signed in. Go back to Soccerwizard." The originating page polls
   `POST /api/auth/handoff {handoff}` every 2 s (max 10 min); first valid call
   gets the session cookie in its own cookie jar; the handoff is single use.
6. In-app browsers (X, Telegram, WhatsApp, Instagram, Facebook webviews): the
   login page detects them, explains Google blocks sign-in there, and puts the
   email code first.

### 4.2 Email me a code

- `POST /api/auth/email/send {email, turnstile}`: normalise (trim, lower-case),
  validate format and length (≤ 254). Verify Turnstile server-side. Limits:
  3 per email per 15 min, 10 per IP per hour. Invalidate earlier unconsumed
  codes for that email. Code = 6 digits from `crypto.randomInt`; store
  `HMAC-SHA256(PEPPER, email + ":" + code)`; expiry 10 min; send via Resend.
  Response is identical whether or not an account exists.
- `POST /api/auth/email/verify {email, code}`: latest unconsumed, unexpired
  code for the email; compare hashes with `crypto.timingSafeEqual`; wrong →
  `attempts+1`, at 5 the code is consumed (dead). Right → consume, find or
  create user by email, create session. Limit 20 verifies per IP per hour.

## 5. Sessions and security

- Cookie `__Host-sw_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/`,
  `Max-Age` 30 days, renewed on use (at most once per 10 min); absolute
  lifetime 90 days. Token: 32 random bytes, base64url; database stores SHA-256.
  New token on every sign-in.
- 3-device rule: after creating a session, if the user has more than 3 live
  sessions, end the least-recently-used with `end_reason='displaced'`. A request
  carrying an ended session gets `401 {reason}` and the page shows "Signed out:
  this account was used on a newer device".
- Your devices: `GET /api/auth/devices` (label, created, last used, current);
  `POST /api/auth/devices/end {id}` (only ids belonging to the caller);
  `POST /api/auth/logout`; `POST /api/auth/logout-all`.
- New-device email via Resend on each new session (not on the first ever).
- CSRF: every state-changing endpoint is `POST`, requires header
  `X-SW-Request: 1` and an `Origin` equal to the site origin; else 403.
- CORS: no `Access-Control-Allow-Origin` on account routes.
- Authorisation: user id comes only from the session lookup; every query is
  filtered by it; request bodies are validated against a field allowlist.
- Errors: clients receive `{error:"<code>"}` with a plain message mapped in the
  page; no stack traces; details to Sentry.
- Headers for the whole site (`vercel.json`): `Strict-Transport-Security:
  max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  (camera, microphone, geolocation off), `X-Frame-Options: DENY` +
  CSP `frame-ancestors 'none'`. Content-Security-Policy ships as
  `Content-Security-Policy-Report-Only` for at least 3 days, then enforced
  once reports are clean.
- Secrets only in Vercel env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `RESEND_API_KEY`, `AUTH_PEPPER` (32 random bytes), `TURNSTILE_SECRET`,
  existing `SUPABASE_*`. Feature switch: `AUTH_ENABLED`.

Screenshot security items and where they are met: API keys hidden (env only,
test scans built assets); Git secrets (history scan before launch); public DB
key (none in the browser); RLS (on, no policies); sensitive data (tokens and
codes hashed, no passwords); server-side auth, record locking, field tampering
(session-derived user id, filtered queries, allowlisted fields); secure cookies
(`__Host-`, HttpOnly, Secure, SameSite); rate limits and bot protection
(section 4.2, Turnstile); parameterised queries (Supabase REST filters and RPC,
no SQL strings); input validation and escaping (validators, `textContent`);
trimmed responses; security headers; HTTPS (HSTS); dependency scan (none in
the site; `pip-audit` on the API); CORS not `*`; email verification (Google
verified or code); unpredictable ids; no stack traces; webhook signatures (in
the paygate spec); no admin panel (owner uses Supabase with 2FA).

## 6. Sync

Synced payload `data` (schema version 1):

| Key | From | Merge rule |
|---|---|---|
| `slips` | `sw.slips.v1` (by `sid`; same `code` = same slip) | union; for the same slip the graded copy wins, else later `at`/`updatedAt`; tombstones `{sid, deletedAt}` kept 60 days |
| `myslip` | `sw.myslip` (array; stored as `{items, updatedAt}`) | whole-object last-write-wins by `updatedAt` |
| `livefav` | `sw.livefav` | union with tombstones |
| `leaguefav` | `formline.favs.v1` | union with tombstones |
| `prefs` | `sw.book`, `sw.mk`, `sw.risk`, `sw.mode`, `sw.wspodds`, `sw.bldleagues`, `sw.toponly`, `sw.scope`, slip style (new key `sw.legodd`) | per-key last-write-wins by timestamp |

Per device, never synced: theme, view, filter panel state, 18+ gate, install
state, coach marks, intro, streak, device id, FAB position.

Flow: on load when signed in and on changes (2 s debounce, and on
`visibilitychange` hidden with `fetch(..., {keepalive:true})`), the page posts
`{base_version, data}` to `POST /api/me`; the server merges with the stored
copy using `lib/sync.merge`, saves `version+1`, returns `{version, data}`; the
page replaces its local copy. Offline: changes stay local; retry with backoff.
Validation: known keys and types only, strings ≤ 500 chars, ≤ 1,000 slips,
total ≤ 256 KB; over the cap, the oldest graded slips fold into a record
summary. Sign-out (any kind) clears synced keys from that device.

## 7. Paygate hooks

`access(user, feature) → boolean`: `feature_access.tier` for the feature
(missing = `free`); `free` → true; `paid` → `subscriptions.status = 'active'`
and `current_period_end > now()`. `/api/me` returns `entitlements: {feature:
bool}` for the page; routes re-check server-side. Features are registered as
rows when first gated; none are gated by this spec.

## 8. Account rights

- `GET /api/account/export` → JSON of profile, synced data, devices.
- `POST /api/account/delete` → requires a sign-in within the last 10 minutes
  (session `created_at`), deletes the user (cascade removes sessions, data,
  subscription). Cookie cleared.
- Privacy and Terms pages updated: email, Google id, device labels, hashed IPs
  for rate limits; retention; deletion.

## 9. User interface

- `/login`: Continue with Google (hidden in in-app browsers, with the
  explanation), email field → code field (`inputmode="numeric"`,
  `autocomplete="one-time-code"`), Turnstile, clear loading and error states.
- Top bar account button: person icon signed out (→ `/login`), initial signed
  in (→ account sheet: email, Your devices, Download my data, Sign out, Sign
  out everywhere, Delete account with confirmation).
- Displaced / expired sessions show a one-line notice.

## 10. Errors shown to people

Wrong code (n tries left); code expired; too many attempts (try again in N
minutes); Google blocked in this app; network down; signed out elsewhere;
something went wrong (generic, logged).

## 11. Testing

- Unit (`node --test`): tokens, hashing, cookie attributes; state/PKCE/nonce;
  every ID-token claim rule (wrong `aud`, `iss`, expired, unverified email,
  wrong nonce each rejected); code expiry, attempts, single use, timing-safe
  compare; rate limits; merge rules (union, tombstones, graded wins, prefs
  per key, idempotent re-merge); validator limits; `access()`.
- Attack tests (must fail): replayed or forged state; reused code; brute force
  past 5; another user's session id; writing `plan`/`email`/`user_id` through
  sync; cross-site POST without header or with foreign Origin; open redirect
  (`//evil`, `https://evil`, `/\evil`); payload over 256 KB; HTML and SQL
  strings stored and returned inert.
- Mutation checks on each guard (break it, confirm a test fails, restore).
- Secret scan of built assets in the suite; one-off git history scan.
- Real devices before launch: Android Chrome, iPhone Safari, iPhone installed
  app (handoff), X and Telegram in-app browsers, desktop; 4 devices to see the
  oldest signed out.
- Live checks after deploy: headers present; CSP reports reviewed.

## 12. Launch

Ship with `AUTH_ENABLED` off (button hidden, routes return 404). Owner tests on
production with two accounts; then switch on. CSP enforced after its report
period.

Owner setup (exact steps given at build time): Google Cloud OAuth client with
redirect URI `https://www.soccerwizard.live/api/auth/google/callback`; Resend
account with `soccerwizard.live` verified (DNS in Cloudflare); Cloudflare
Turnstile site; Vercel env vars (section 5); two-factor authentication on
Supabase, Vercel, Google Cloud, Cloudflare, Resend and GitHub.
