# Web push: telling a reader the day's booking code is up

Date: 2026-09-20
Status: code complete 2026-09-20, awaiting owner setup (see Handover below)

## The problem

The site has one thing worth coming back for every day — a free booking code,
minted, booked on real bookmakers, and graded against the final score. Nothing
tells anybody it has arrived. A reader who wants it has to remember to visit,
and the mint lands around midday UTC, so the reader who does remember, at
breakfast in Lagos, finds yesterday's.

The decision that led here: re-engagement, triggered on "today's code is up",
delivered as web push on the PWA the site already ships. A Telegram broadcast
would reach further in Nigeria and has no iOS install bar, but it re-engages
toward Telegram rather than toward the graded record we own. A native binary is
months and a store review for a surface Puntrr's own 3.5 stars says is not what
earns trust.

**The known cap, stated once so nobody rediscovers it:** on iOS, web push
requires the PWA to be installed to the home screen first. Reach is therefore
bounded by the install bar's conversion, which this site has never measured.

## Architecture

```
reader taps "Tell me when the code is up"   (only on tap; never on load)
  -> sw.js registration -> pushManager.subscribe({ userVisibleOnly: true })
  -> POST /api/push  { endpoint, keys }        -> Supabase push_subs

daily-code.yml, after the mint commits
  -> wait for the deploy to actually serve today's code   (poll, capped)
  -> scripts/pushcode.js  signs one VAPID JWT per endpoint host, POSTs empty
  -> browser push service -> sw.js 'push'
  -> fetch /code-today.json -> showNotification -> tap opens /booking-codes
```

Six pieces.

**`api/push.js`** — `POST` to subscribe, `DELETE` to unsubscribe. Validates the
subscription shape and allowlists the endpoint host (FCM, Mozilla, Apple,
Windows). That allowlist is the security boundary: without it the route is a
stranger handing us a URL of their choosing and asking us to POST to it daily.
Nothing personal is stored — a push subscription is an opaque endpoint, not an
identity.

**`lib/supabase.js`** — three helpers alongside the existing ones:
`putPushSub`, `listPushSubs`, `dropPushSubs`. They follow `putSharedSlip`,
including its merge-on-duplicate behaviour, keyed on `endpoint`.

**`sql/push_subs.sql`** — alongside `book_quota.sql` and `shared_slips.sql`:

```sql
create table if not exists public.push_subs (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
```

No user id, no IP address, and no user agent: alongside a stable per-device
endpoint and a `created_at`, a user agent is a device fingerprint with a
timestamp, and nothing reads it. The `keys` are stored because a later
payload-bearing notification would need them; the first version never reads
them, and `listPushSubs` does not even select them.

The file also carries a `BEFORE INSERT` trigger that refuses once the table
holds 5000 rows. The route is unauthenticated — there are no accounts — so the
allowlist bounds *where* we will POST but not *how many* rows a stranger can
create. 5000 is a safety ceiling, not a product limit.

Accounts are coming to this site, and when they do this table gets a nullable
`user_id` and the ceiling becomes per account instead of per table. Nothing
here blocks that: the row is keyed on `endpoint`, which is what a browser hands
us whether or not anybody is logged in, so a later migration adds a column and
backfills nothing.

**`scripts/pushcode.js`** — the sender. Signs an ES256 JWT with `node:crypto`
and POSTs **no payload**. An empty push needs no AES128-GCM encryption, which is
the whole reason this feature adds no npm dependency: `package.json` has zero
dependencies today and keeps zero.

**`public/sw.js`** — a `push` handler and a `notificationclick` handler, added
to the existing worker. `VERSION` bumps, as it must for any worker change.

**`public/code-today.json`** — already shipped (commit `a6c25c0`). Written by
`prebuild.js`, about 200 bytes: the day, the leg count, which books have a code,
and how the previous code graded. The worker reads it to build the notification
text.

### The race, which is the part worth looking hardest at

The mint commits, Vercel builds, and a push sent immediately would arrive before
the site is serving today's code — a reader taps and lands on yesterday's. So
the sender polls the live `/code-today.json` until its `date` matches the entry
it is announcing, with a cap, and sends nothing if the deploy never lands.

Publishing is unaffected in every branch: the code is committed to
`data/daily-codes.json` before any of this runs. A failed send costs the
notification and never the code.

## The client

**Where the ask lives.** One control, under the code panel on `/booking-codes`
and on a day page — the only place where a reader has just read a code and might
want the next one. Never a prompt on load: an unprompted permission dialog is
how a site gets permanently blocked, and Chrome holds it against the origin.

**The gate, in order.**

1. No `PushManager` in `window` — render nothing.
2. `Notification.permission === "denied"` — render nothing. The browser has
   already answered and cannot be asked again; a button that claims otherwise is
   a lie in the UI.
3. iOS and not standalone — render the line, not the button: *"Add Soccerwizard
   to your home screen first — iPhone only allows this for installed apps."*
   That is the honest version of the cap above, shown to exactly the people it
   affects, and it doubles as the only non-pushy reason to install this site has
   ever had.
4. Otherwise — the button.

**Turning it off has to actually work.** `DELETE /api/push` plus
`pushManager.unsubscribe()`, and the row leaves the table. One tap, no account
to log into. Local state mirrors it so the control renders correctly on return.

**What the notification says**, built in the worker from `/code-today.json`:

```
Today's booking code is up
5 games - SportyBet, Bet9ja, BetKing
```

`tag: "code-" + date`, so a resend collapses onto the same notification instead
of stacking; `renotify` stays off. If the fetch fails the worker still shows a
generic line — `userVisibleOnly: true` is a promise to the browser, and a push
that shows nothing earns the "this site was updated in the background" notice,
which is worse than a plain message.

**The tap.** `notificationclick` focuses an open tab if there is one, otherwise
`clients.openWindow("/booking-codes")`.

**Quiet hours.** Never send between 22:00 and 06:00 Lagos, using
`LAGOS_OFFSET_MS` from `lib/quota.js`. The mint lands around midday UTC today,
so this changes nothing on a normal day. It exists for the day GitHub's queue
slips or somebody runs `workflow_dispatch` at night. The failure mode is waking
people up, and that is a failure you only get to make once.

## The destination

Section 3 of this design asked where a notification should land, and the answer
turned out to be a change to the home page rather than to the notification. It
was split out and shipped first, in commit `a6c25c0`: today's code on the board
above the fixtures, a real link in the trust row, and `/booking-codes` rebuilt
around the code as a tap-to-copy ticket with the all-time graded record.

Push had to wait for that. A notification pointing at a page nobody wanted to be
on is a notification that gets switched off.

## The sender, step by step

`scripts/pushcode.js`, run by `daily-code.yml` only when the mint committed.

1. Read the newest entry from `data/daily-codes.json` — newest, not today's, the
   same rule `code-today.json` follows, because the mint runs at midday UTC and
   a today-keyed lookup finds nothing for half the clock. No entry, or no
   bookmaker code in it — exit 0, send nothing.
2. Quiet hours: 22:00–06:00 Lagos — exit 0, log the reason. Nothing is queued
   for the morning; a code held overnight is stale by the time it would go.
3. Wait for the deploy: poll `https://www.soccerwizard.live/code-today.json`
   until `date` matches, roughly 20 tries at 15 second intervals, cache-busted.
   Never matches — exit 0. Re-check quiet hours once the poll returns: a run
   that starts at 21:55 and waits five minutes must not send at 22:00.
4. `listPushSubs()`, then per endpoint: an ES256 JWT (`aud` = the endpoint's
   origin, `exp` = now + 12h, `sub` = a `mailto:`), header
   `Authorization: vapid t=<jwt>, k=<public key>`, `TTL: 3600`,
   `Urgency: normal`, and an empty body. One JWT is signed per endpoint host,
   not per row. Each push aborts after 10 seconds — a timeout counts as failed,
   never as dead.
5. `404` or `410` means the subscription is dead: collect them and hand them to
   `dropPushSubs(endpoints)` at the end of the run, which deletes them 20 at a
   time. Not one request: PostgREST takes the `in.()` list in the query string,
   and a few dozen percent-encoded endpoints overrun the 8 KB header buffer
   Kong and nginx default to — a 414 on precisely the morning a push service
   expires hundreds of subscriptions at once. `429` and `5xx` are left alone —
   tomorrow's run retries. Concurrency 10.
6. Log `sent N, dropped M, failed K`, where M is the count the database
   confirmed, not the length of the list handed over. Exit non-zero only if
   every send failed, which means the keys are wrong rather than the weather.

## Keys and secrets

One VAPID key pair, generated once locally with `node:crypto`
(`generateKeyPairSync("ec", { namedCurve: "prime256v1" })`), stored base64url as
raw points.

- **Public key** — baked into `index.html` at build from `VAPID_PUBLIC_KEY`. It
  is public by definition; it ships to every browser that subscribes.
- **Private key** — GitHub Actions secret `VAPID_PRIVATE_KEY`, read only by the
  sender step. Vercel never needs it: `api/push.js` stores rows and signs
  nothing.

Rotating the pair silently invalidates every existing subscription. So: do not
rotate casually. If it is ever forced, add a `vapid` column, and re-subscribe
readers on their next visit rather than leaving a table full of endpoints that
will never accept another message.

## Operations

- Dead subscriptions are swept by the daily send itself. No separate cron.
- `api/push.js` is unauthenticated by necessity — there are no accounts. Its
  guards are the host allowlist, a body size cap, and shape validation. The
  existing quota/readlimit pattern applies if it fits the route.
- Observability is the workflow log plus the row count. No dashboard.
- `ecc:security-reviewer` runs against `api/push.js` and `scripts/pushcode.js`;
  `ecc:code-reviewer` runs against the whole diff. Both at implementation time.

## Testing

`node:test`, no framework, no network, consistent with the rest of `test/`.

`test/push.test.js`:

- **JWT**: sign, then verify with `crypto.verify` against the public key. Assert
  the header is `{alg:"ES256",typ:"JWT"}`, that `aud` is the endpoint's origin
  and not its full path, and that `exp` is within 24h — push services reject
  longer. Assert the signature is raw `r||s`, 64 bytes, not DER: that is the one
  mistake here that fails silently, as a `401` from Google with no explanation.
- **Allowlist**: FCM, Mozilla, Apple and Windows hosts pass;
  `https://evil.example/x` is rejected.
- **Quiet hours**: a fixed clock at 23:30 and at 07:00 Lagos, asserting no-send
  and send.
- **The race**: a stubbed fetch returning yesterday's date N times and then
  today's — assert the sender waits rather than sending early, and that an
  exhausted cap exits 0 having sent nothing.
- **Dead subscriptions**: stubbed `410` responses — assert exactly those
  endpoints, and no others, reach `dropPushSubs`, and that `main()` is what
  hands them over. A stubbed timeout asserts the opposite: failed, not dead.

`test/pushdrop.test.js` is separate because `lib/supabase.js` reads its
environment once at module load, and the chunking can only be exercised on a
configured client: 60 real-length endpoints, three requests, every request line
measured and asserted small, and a sweep that fails halfway reporting what
actually went.

`test/pushui.test.js` drives the emitted page script against stubs rather than
matching its source — including that `subscribe()` is called with
`userVisibleOnly: true`, and that a declined prompt takes the button away.

`test/sw.test.js` exists already and is extended: the `push` handler is present,
the tag is `"code-" + date`, a thrown fetch still
shows a generic notification, and `notificationclick` tries to focus an open tab
before opening a new window.

One manual check before the feature is announced anywhere: subscribe on a real
phone, trigger `workflow_dispatch`, confirm the notification arrives, tap it,
then unsubscribe and confirm the row is gone.

## Not building

- A retry queue. A missed day is a missed notification, not lost data.
- Per-reader preferences, topics or timing.
- Any second notification type — results, kick-off reminders, price moves.
- Payload-bearing pushes, which would pull in AES128-GCM and the first
  dependency this repo has ever had.

Each of these becomes worth revisiting once the first notification shows that
readers keep it switched on.

## Handover: what the owner still has to do

Everything in the repo is done — `api/push.js`, `scripts/pushcode.js`,
`public/sw.js`, `lib/pages.js`, and the `Announce the code` step in
`.github/workflows/daily-code.yml`. Nothing in this list can be done from the
repo; each needs credentials only the owner has. Do them in order.

1. **Generate the one key pair this site will ever have.**

   ```
   node scripts/vapidkeys.js
   ```

   This prints two lines, `VAPID_PUBLIC_KEY=...` and
   `VAPID_PRIVATE_KEY=...`. Copy both somewhere safe for the next two steps,
   then don't run it again — rotating the pair silently invalidates every
   subscription collected so far.

2. **Apply the table.** Open the Supabase SQL editor for this project, paste
   the contents of `sql/push_subs.sql`, and run it. Confirm afterwards that
   `push_subs` exists and has RLS enabled (the same check already used for
   `book_quota` and `shared_slips`).

3. **Set the public key in Vercel.** Project settings → Environment
   Variables → add `VAPID_PUBLIC_KEY` (the value from step 1) for both
   Production and Preview. This is read at build time and baked into the
   page; without it `pushControl()` returns an empty string and the control
   simply never renders — a safe failure, not a broken one.

4. **Set the four secrets in GitHub.** Repo → Settings → Secrets and
   variables → Actions → New repository secret:
   - `VAPID_PUBLIC_KEY` — same value as step 3.
   - `VAPID_PRIVATE_KEY` — from step 1. Never put this in Vercel; only the
     workflow's sender step reads it.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — skip these two if the
     repo's Actions secrets already carry them for another workflow.

5. **Redeploy** (push anything to `main`, or use Vercel's redeploy button)
   so the new `VAPID_PUBLIC_KEY` is actually baked into the page. The push
   control will not appear until this happens even if step 3 is done.

6. **The live check, on a real phone.**
   - Open `https://www.soccerwizard.live/booking-codes`. On iOS, install it
     to the home screen first — the control only renders for an installed
     PWA there.
   - Tap the control, accept the permission prompt, and confirm a new row
     appears in `push_subs`.
   - Trigger a send: `gh workflow run "Mint the day's booking code"`, or run
     `node scripts/pushcode.js` locally with all four secrets exported — the
     poll passes immediately since the site is already serving today's code.
     **Note:** the workflow only announces on a run that actually commits a
     new code. If you dispatch it by hand on a day it already minted (nothing
     new to commit), the `Announce the code` step is skipped and nothing
     sends — that's correct, not a bug; trigger `scripts/pushcode.js` directly
     instead if you need to test the send itself.
   - You should see a notification titled "Today's booking code is up"
     naming the right number of games and the right books, and tapping it
     should land on `/booking-codes`.
   - Tap the control again to turn it off. Confirm the row is gone from
     `push_subs`, and that a second send reaches nobody.

7. **Close it out.** Once step 6 passes, change this file's `Status:` line
   to `implemented <date>` and commit.
