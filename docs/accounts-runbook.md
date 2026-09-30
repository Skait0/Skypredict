# Accounts: launch runbook

Accounts ship switched OFF. Until `AUTH_ENABLED=1` is set in Vercel, every
account route answers 404, the page shows no account button, and Privacy and
Terms say there are no accounts. Nothing below changes that until step 7.

## 1. Two-factor authentication (owner)

Turn on 2FA for: Supabase, Vercel, Google Cloud, Cloudflare, Resend, GitHub.

## 2. Google sign-in (owner, about 10 minutes)

1. https://console.cloud.google.com -> new project "Soccerwizard".
2. APIs & Services -> OAuth consent screen: External; app name Soccerwizard;
   support email hello@soccerwizard.live; scopes: only `openid` and `email`;
   authorised domain `soccerwizard.live`; Privacy link
   https://www.soccerwizard.live/privacy, Terms link
   https://www.soccerwizard.live/terms. Publish the app (openid/email need no
   Google review).
3. Credentials -> Create OAuth client ID -> Web application. Authorised
   redirect URI, exactly: `https://www.soccerwizard.live/api/auth/google/callback`
4. Copy the Client ID and Client secret for step 5.

## 3. Resend (owner)

1. https://resend.com -> add domain `mail.soccerwizard.live` (a subdomain, so
   login mail cannot hurt the main domain's reputation; the code sends from
   `login@mail.soccerwizard.live`).
2. Add the DNS records Resend shows (SPF, DKIM, and the MX for the bounce
   subdomain) in Cloudflare DNS, "DNS only" (grey cloud).
3. Wait for "Verified". Create an API key with "Sending access" only.

## 4. Cloudflare Turnstile (owner)

Cloudflare dashboard -> Turnstile -> Add site: `www.soccerwizard.live`
(and `soccerwizard.live`), widget mode Managed. Copy the site key and secret.

## 5. Vercel environment variables (Production)

```
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add RESEND_API_KEY production
vercel env add TURNSTILE_SITE_KEY production
vercel env add TURNSTILE_SECRET production
vercel env add AUTH_PEPPER production      # value: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
vercel env add SENTRY_DSN production       # the same DSN as SW_SENTRY_DSN in public/index.html
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist. Do NOT add
`AUTH_ENABLED` yet. Never paste any of these values into chat, code or git.

## 6. Database

Supabase -> SQL editor -> paste all of `sql/accounts.sql` -> Run. Then check:
Table editor shows the 8 tables, each with "RLS enabled" and no policies.

## 7. Deploy, test with two accounts, switch on

1. Merge the `accounts` branch; let Vercel deploy. Live check:
   `curl -sI https://www.soccerwizard.live/ | grep -iE "strict-transport|x-frame|content-security|referrer|permissions|nosniff"`
   shows all six headers, and `https://www.soccerwizard.live/api/me` is 404.
2. In Vercel set `AUTH_ENABLED=1` for Production and redeploy. The build
   reads this flag once, at build time, into the static page (the sign-in
   button and its /api/me call are only wired up when it was on for that
   build) - so the sign-in button does not appear until that redeploy has
   finished, and switching it off again later needs a redeploy too, for the
   same reason.
3. Real devices, each item ticked by a person:
   - [ ] Android Chrome: Continue with Google -> back on the page, initial in the top bar.
   - [ ] Android Chrome: Email me a code -> code arrives -> signed in.
   - [ ] iPhone Safari: both methods.
   - [ ] iPhone installed app: the Google button is hidden with the explanation; Email me a code works.
   - [ ] Android installed app: Continue with Google opens a Chrome tab; back in the app it becomes signed in within a few seconds.
   - [ ] Link opened inside X and inside Telegram: Google button hidden, the
         explanation shows, email code works.
   - [ ] Desktop Chrome: both methods.
   - [ ] Save a slip on the phone -> it appears on the desktop after a reload.
   - [ ] Delete that slip on the desktop -> it stays deleted on the phone.
   - [ ] Sign in on a 4th device -> the oldest shows "Signed out: this account
         was used on a newer device".
   - [ ] New-device email arrives from the second sign-in on.
   - [ ] Download my data gives a JSON file with only your things.
   - [ ] Second account cannot see the first account's slips.
   - [ ] Delete account (within 10 minutes of signing in) -> signed out, and
         signing in again starts an empty account.
4. Any failure: set `AUTH_ENABLED` back to unset and redeploy. That hides
   everything; stored data is untouched.

## 8. After launch

- Sentry: watch for `runtime:server` errors and CSP reports for 3 days.
- When CSP reports are only noise (browser extensions), rename the header key
  `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in
  `vercel.json`, deploy, and reload the site on Android, iPhone and desktop to
  check nothing is blocked (fonts, Sentry, Turnstile, Google sign-in).
- Next spec: the site audit (performance, SEO, UX, copy) from the owner's
  checklists.
