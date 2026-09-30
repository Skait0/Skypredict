# Soft wall, One Tap sign-in, email opt-in and the Tactics Spell loader

**Date:** 30 Sep 2026
**Status:** design approved in conversation, waiting for the owner to review this written spec
**Theme:** wizardry x soccer: dark #0D0D0F, gold #F2B84B, Plus Jakarta Sans and Roboto Condensed
**Mockups:** docs/design/signin-loaders/07-tactics-spell-v3.html (loader) and 08-signin-sheet-themed.html (sheet)

## 1. Goal

Turn readers into signed-in accounts without losing search or social traffic.

- Picks stay free to read.
- Sign-in is required only for the three things people come back for: the slip builder, booking codes and saved slips.
- Sign-in takes one tap where Google allows it.
- Signing in feels like a moment, not a wait.
- A separate, unticked checkbox collects email consent for marketing.

**Success:**
1. A signed-out reader who taps a locked feature is signed in and back on the action they tapped, with nothing lost.
2. On Android Chrome that takes two taps: the feature, then their Google account.
3. Every marketing email address in the database has a recorded opt-in and can unsubscribe in one click.

## 2. What the owner decided

- **Soft wall.** Picks, results, match pages and every static page stay open, and Googlebot still sees them.
- **Locked:** opening the slip builder, generating any booking code, and viewing saved slips.
- **Sheet over the app**, not a separate page. After sign-in, the reader carries on with what they tapped.
- **Google One Tap** so readers already signed in to Gmail just tap their account.
- **Email marketing opt-in**: a separate checkbox, unticked by default.
- **Loader:** Tactics Spell v3 (summon, beam-in, build-up, rainbow flick, bullet-time curler, goal).
- **Sheet header** is a mix of the two sheet mockups:
  - When the tapped action has a slip (book a code, save a slip), the header shows that slip under a gold football seal. Matches are blurred; total odds stay visible.
  - Otherwise (open the builder, view saved slips), the header shows the dormant tactics board.
  - Either way, the Tactics Spell then plays in the same sheet.

## 3. Out of scope

- Sending marketing emails. This work only collects consent and makes unsubscribe work.
- Server-side enforcement of the wall. Booking endpoints stay open; the wall is a conversion device in the page. A later change can check the session in `api/book.js`.
- Paid features. `lib/access.js` stays as it is.
- The Haiku Telegram-bot plan, which is on hold.

## 4. Where the wall applies

The wall applies only when accounts are on (`<meta name="sw-auth">` present) and the reader is signed out (the swAccount block's `st.on === false`).

When `AUTH_ENABLED` is off, nothing changes.

One gate function sits in the swAccount block:

```
swGate(action, detail, go)
  action : "book" | "save" | "build" | "slips"
  detail : the slip, when there is one (legs, odds, book), for the sealed header
  go     : the function to run once the reader is signed in
```

- **Signed in:** `go()` runs straight away.
- **Signed out:** the sheet opens. After a successful sign-in and first sync, `go()` runs. If the reader closes the sheet, nothing runs and nothing is lost.

Every locked entry point calls `swGate` instead of acting directly:

| Action | Entry point in public/index.html |
| ------ | -------------------------------- |
| Generate a booking code | every `bookFetch(...)` caller (`bookSlip`, builder, split, editor, myslip); gate at the user-tap handler, not inside `bookFetch`, so background checks still work |
| Save a slip | the path that calls `SLIPS.unshift(slip); saveSlips()` |
| Open the builder | the builder's open handler |
| View saved slips | the saved-slips tab or sheet open handler |

The owner's own slips made before sign-in are not lost. They stay in localStorage and go up on the first sync, as today (merge on first sign-in).

A test asserts that each listed handler routes through `swGate`.

## 5. The sign-in sheet

This is one component, in a new file `public/signin.js` plus its CSS. The file is plain ES5, served from our own domain, so the current CSP `script-src 'self'` covers it.

The same component is used by:
- the sheet in `index.html`, opened by `swGate`
- the `/login` page (`lib/pages.js` `renderLogin`), which mounts it full-screen. `/login` keeps working for links, the Android standalone-app poll and old bookmarks.

### Layout, top to bottom

1. **Header:** the sealed slip or the dormant board (section 2), 120 to 140px.
2. **Headline** naming the action:
   - "Sign in to book this slip"
   - "Sign in to save this slip"
   - "Sign in to build a slip"
   - "Sign in to see your slips"

   Subline: "Free. Your slips follow you to every phone and laptop."
3. **Google One Tap row** (section 6). When One Tap cannot show, the existing "Continue with Google" redirect button takes its place.
4. **"OR EMAIL ME A CODE"**, then the email field, Turnstile and a gold Send button. After Send, the code step runs in the same sheet: 6-digit field, Sign in button, "Use a different email".
5. **Opt-in checkbox**, unticked: "Email me the wizard's best picks. Unsubscribe any time."
6. **Fine print:** "No password. We never post for you. Privacy".

### Kept from the current /login

- **In-app browsers** (X, Telegram, WhatsApp, Instagram, Facebook) and the **installed iPhone app**: Google is hidden and email comes first, with the same explanation text as now.
- **Installed Android app:** the Google redirect opens in a Chrome tab. The sheet polls `/api/me` every 2s, up to 10 minutes, then plays the loader.
- All the existing error messages, rate-limit messages and Turnstile handling.

### Also

- Closing: the × button, tapping the scrim, Escape, or swiping the sheet down.
- Focus moves into the sheet and is trapped there, and returns to the tapped control on close.
- The sheet has `role="dialog"`, `aria-modal`, and a labelled headline.

## 6. Google One Tap

The client uses Google Identity Services: `https://accounts.google.com/gsi/client`, loaded only when the sheet opens, never on page load.

**Settings:**
- `use_fedcm_for_prompt: true`
- `auto_select: false`
- `itp_support: true`
- `context: "signin"`
- `cancel_on_tap_outside: false`

**Flow:**
1. The sheet also renders Google's personalised button (`google.accounts.id.renderButton`) with theme `filled_black`, shape `pill` and text `continue_with`. This is the "Continue as Tunde" row. The browser-level One Tap prompt is also requested.
2. If both fail to appear within 2s, or the browser is in-app or the installed iPhone app, the existing redirect button shows instead.
3. On a credential, the page POSTs `{credential, nonce_id, optin, return}` to a new route `POST /api/auth/google/onetap`. The route is in `api/auth.js` and needs the `X-SW-Request` header.

**Nonce:**
- When the sheet opens, the page calls `POST /api/auth/google/nonce`.
- The server creates a random nonce and stores it as an `auth_attempts` row (the same table the redirect flow uses) with a 10-minute expiry.
- The server returns `{nonce_id, nonce}`. The nonce is passed to GIS `initialize({nonce})`.
- The onetap route consumes the row once. A replayed token fails.

**Server verification** is new in `lib/auth/google.js`: `verifyIdToken(jwt, {clientId, nonce, nowMs, getKeys})`.
- Split the JWT. The header must have `alg: "RS256"` and a `kid`.
- Fetch the keys from `https://www.googleapis.com/oauth2/v3/certs` and cache them in memory, honouring `Cache-Control: max-age`. An unknown `kid` forces one refetch.
- Verify with `crypto.createPublicKey({key: jwk, format: "jwk"})` and `crypto.verify("RSA-SHA256", ...)`. No new dependency.
- Then check the claims with the existing `checkClaims`: issuer, audience = `GOOGLE_CLIENT_ID`, expiry, nonce, `email_verified`.

After that, the route follows the same path as `google/callback`:
- find the user by `google_sub`, else by email (and link it), else create one
- create the session under the same device-limit rules
- set the cookie
- answer `{ok: true, first}`, where `first` is true when the user was just created

**Turnstile** is not needed on this route: a Google-signed ID token with a one-time nonce is the bot check.

The route shares the existing auth rate limits with the redirect flow.

**CSP additions** in `vercel.json`, in both the enforced and report-only blocks:
- `script-src`: `https://accounts.google.com/gsi/client`
- `frame-src`: `https://accounts.google.com/gsi/`
- `connect-src`: `https://accounts.google.com/gsi/`
- `style-src`: `https://accounts.google.com/gsi/style`

The existing `test/security-headers.test.js` gains assertions for each.

**The owner does this by hand, once:** in Google Cloud, add `https://www.soccerwizard.live` as an Authorised JavaScript origin on the existing web client.

## 7. Email opt-in

A new table goes into `sql/accounts.sql` and is run once in Supabase by the owner:

```sql
create table if not exists public.email_consent (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted_at timestamptz not null,
  wording text not null,        -- the exact checkbox text shown
  source text not null,         -- 'google-onetap' | 'google-redirect' | 'email-code'
  revoked_at timestamptz
);
alter table public.email_consent enable row level security;
```

**Recording consent:**
- **One Tap and email-code:** the `optin` flag rides on the sign-in request itself (`onetap`, `email/verify`).
- **Google redirect:** the flag is stored on the `auth_attempts` row at `google/prepare` and read back at `google/callback`.
- The server writes a row only when the flag is true. The wording string is the server's own constant, never taken from the client.
- An existing row is not overwritten. Ticking again after unsubscribing sets `revoked_at = null` and a new `granted_at`.

**Unsubscribe:** `GET /api/unsub?u=<user_id>&t=<token>`
- `t = HMAC-SHA256(AUTH_PEPPER, "unsub:" + user_id)`, base64url, first 22 characters.
- The route sets `revoked_at = now()` and shows a small themed page: "You're unsubscribed. No more picks by email."
- It works without signing in.
- A `POST` to the same URL does the same thing, for one-click unsubscribe headers.

**Other changes:**
- The account sheet gets a row: "Picks by email: On/Off".
- "Download my data" includes the consent row.
- "Delete account" removes it through the cascade.
- `/privacy` gains one paragraph on marketing email.

## 8. The Tactics Spell loader

A new file `public/spell.js` exposes `swSpell(mount, opts)`. It is plain SVG, CSS and ES5, about 6 KB, built from mockup 07.

```
var s = swSpell(sheetBody, {name: "Tunde", slips: 3, favs: 2});
s.step(1);      // pulling your slips
s.finish(cb);   // play out to the goal, then cb()
s.stop();       // on close or error
```

**Timing is tied to real work, not a timer:**

| Phase | Starts when | Visual | Caption |
| ----- | ----------- | ------ | ------- |
| 0 | the credential or code is submitted | summon plus beam-in | "Signing you in" |
| 1 | the auth response is OK and the first `sync()` starts | build-up passes | "Pulling your slips" |
| 2 | `sync()` resolves | flick, curler, GOAL | "Ready" |

**Pacing rules:**
- If a phase ends early, the spell speeds up to about 2x. It never skips beats.
- If a phase runs long, the build-up keeps passing: the move circles back through midfield, with no dead frame.
- There is a minimum of about 1.8s from submit to goal, so it never flickers.
- A maximum of 20s triggers an error state: the caption reads "Still working… check your connection" and a Retry button appears.

**After the goal:**
- "✦ GOAL ✦ You're in, <first name>" holds for 900ms.
- The sheet closes and `go()` runs, so the booking code generates or the slip saves.
- The first name comes from the Google `given_name` claim, or from the part of the email before the "@", title-cased.

**Other rules:**
- **Reduced motion:** the final frame shows with the captions only; the timing rules still apply.
- **Haptics:** `navigator.vibrate([20,40,30])` at the goal, wrapped in try/catch, and only on the goal.
- **Google redirect flow:** before redirecting, the page stores `{action, detail}` in sessionStorage. On return with a new session, `boot()` reads it, opens the sheet straight into phase 1, and then runs the saved action. The detail must still exist; a slip rebuilt from `sw.myslip` counts.

## 9. Errors

| Case | Behaviour |
| ---- | --------- |
| One Tap dismissed or blocked | The redirect button and email stay. No error shown. |
| `onetap` route answers 401, token invalid or expired | "Google sign-in didn't finish. Try again or use the email code." |
| Rate limited | Existing slow_down text. |
| Sync fails after sign-in | The goal still plays (sign-in succeeded), `go()` still runs, and sync retries on its existing backoff. |
| Sheet closed mid-spell | `stop()`. The session stands; the saved action does not run. |
| JWKS fetch fails | 503 `{error:"google_down"}`. The sheet shows "Google is slow right now. Use the email code." Reported to Sentry. |

## 10. Testing

Node tests, in the same style as the existing suite:
- `verifyIdToken`:
  - good token, signed with a test RSA key pair
  - bad signature
  - wrong audience
  - wrong issuer
  - expired
  - wrong nonce
  - unknown kid, which forces a refetch
  - `alg: none` and HS256, both rejected
- `onetap` route with fake db and google deps:
  - new user
  - existing email gets linked
  - nonce reuse rejected
  - device limit applied
  - optin true writes consent
  - optin false writes nothing
- `email/verify` and `google/callback` carry `optin` through.
- Unsubscribe:
  - valid token revokes
  - bad token gets 400
  - POST works
  - page is themed
- `swGate`: signed-in runs `go()` at once; signed-out opens the sheet. A source-shape test checks that each locked handler calls `swGate`.
- `swSpell` pacing: pure timing helpers are exported for Node. Early finish speeds up to the goal. Long phases loop. Minimum 1.8s. 20s error state.
- CSP asserts for the GIS hosts.
- `scripts/graphify-inline.js` is rerun whenever `index.html` changes, so the shadow test passes.

**Manual device pass** before switching on, from runbook §7.3 plus:
- One Tap on Android Chrome and desktop Chrome
- redirect on iPhone Safari
- email on the X and Telegram in-app browsers
- installed Android app poll
- reduced motion on
- the opt-in row appears in Supabase
- unsubscribe link works

## 11. Rollout

1. Owner:
   - reviews this spec
   - adds the JavaScript origin in Google Cloud
   - runs the new SQL in Supabase
2. Build behind the existing `AUTH_ENABLED`. The wall is live wherever accounts are live.
3. Deploy to a Vercel preview, run the device pass, then promote.
4. The sync fix `5d73fde` ships first, on its own push.
