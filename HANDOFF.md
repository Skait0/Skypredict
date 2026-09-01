# Soccerwizard — Session Handoff (updated 2026-09-01)

## Deployed state
- **Live URL:** https://www.soccerwizard.live — **www is canonical**, the bare
  domain 308s to it. `SITE_ORIGIN` must be the www form.
- **In front of it:** Cloudflare (free plan, account `Sowizardsb@gmail.com`),
  added 1 Sep. Apex + www proxied; every mail record DNS-only.
- **Deploy model:** push to `main` → Vercel GitHub integration → prod (~30s)
- **Repo:** https://github.com/Skait0/Skypredict.git — `main` synced with origin
- **Working tree:** clean · **HEAD:** `277abcd` "www is the canonical host now"
- **API:** `C:\Users\DELL\Documents\soccerwizard-api` on Railway.
  **Trial ends ~13 Sep 2026.**

## The one that will bite you: DNS
The site was **blank on Nigerian mobile data** for a day. Not the app - the
carrier blocks `76.76.21.21`, Vercel's *shared* apex IP. Fixed by making www
canonical (Vercel CDN addresses), then by putting Cloudflare in front so the
apex stops resolving to that IP at all.

```
nameservers   mustafa.ns.cloudflare.com / zariyah.ns.cloudflare.com
rolled back by setting these to atlas.dns-parking.com / hyperion.dns-parking.com
              at Hostinger - the records still exist there, so the old setup returns
proxied       apex A, www CNAME
DNS only      3x hostingermail-*._domainkey (DKIM), autodiscover, autoconfig,
              2x MX, SPF, DMARC, google-site-verification
SSL/TLS       Full (strict) + Always Use HTTPS
```

**Cloudflare rewrites Cache-Control.** Its free-plan **Browser Cache TTL** was
4 hours and overrode any *shorter* max-age from Vercel, so `sw.js` shipped as
`max-age=14400` instead of `max-age=0` - a four-hour delay on worker updates
and on the kill switch. Now set to **Respect Existing Headers**
(Caching -> Configuration). The `immutable` bundles were never affected; a
longer origin TTL wins. After any CDN change, diff the headers through the
proxy against the origin:
```bash
curl -sI https://www.soccerwizard.live/sw.js        | grep -i cache-control
curl -sI https://skypredict-theta.vercel.app/sw.js  | grep -i cache-control
```

**Cloudflare's import marks every CNAME proxied by default.** That silently
breaks DKIM (the lookup must follow the CNAME to Hostinger's key, and a proxied
record answers with a Cloudflare IP) and mail-client autoconfig. Nothing errors;
mail just starts failing DKIM. If you ever re-import, set those five back to
grey cloud. `scratchpad/dns-baseline.txt` holds all 12 records as they were.

DNSSEC was confirmed empty before the cutover. With DNSSEC live, changing
nameservers is a hard SERVFAIL outage, not a soft handover.

## This session (2026-09-01)
Large session. Themes, newest last:

**Bet9ja, end to end.** Full league coverage (1154/1154 competitions) via
`GetEventsInGroup`, which ignores `MKEY`, unlike `GetEventsInCouponV2` which
honours it but only exposes 14 coupons. Fixture matching measured at **98.4%**
and needing exactly one alias (`"atletico rosario" -> "rosario central"`); the
remaining misses are fixtures Bet9ja has not published yet, not matcher bugs.

**Two outages on the API, one loud and one silent.**
1. `bet9ja.py` imported `requests`, which was never in `requirements.txt`. It
   was present locally as a transitive dep, so every test passed. 42 min down.
2. Then the routes came back answering `{"count":0,"success":true}` - a lie,
   not a crash. Bet9ja was serving a block page to the datacentre. Fixed with
   `curl_cffi` TLS impersonation (`impersonate="chrome120"`); `_get_json`
   retries transport errors but never accepts a block page as data.

**Bookmaker toggle.** `BOOKS` table in `index.html` (`sporty` / `bet9ja`) holds
per-book id, odds field, wordmark, code lookup and deep link. Bet9ja's deep link
parameter is `bookABetCode` - this was guessed wrong once and shipped broken.

**Grading was reading 6 of ~30 games.** Both sources were down at once. See
`grading-two-sources-both-fragile` in memory. `lib/soccervista.js` is now a
second score source ahead of the oracle, and `recordPublishedTips` files
predictions independently of the sweep, reading the tip from the previously
published board rather than recomputing it. Rows went 132 → 308.

**POTD/SOTD rank by league tier**, not by continent. The old no-Asian-league
rule pushed the board onto third-tier European games, which is worse.

**A bookmaker refusing part of a slip now asks** rather than silently dropping
legs and re-sending.

## The two fixture feeds do not behave the same
- **football-data CSVs** publish a league schedule ahead of time and keep it, so
  a league match is found again by every rebuild. **League only - no cup ties.**
- **SportyBet `/api/fixtures`** lists what you can still bet on and **drops a
  match at kick-off**. Measured 1 Sep: 1,385 fixtures in it and *none* of that
  day's games. It is the **only** source of cup ties.

So a cup tie used to vanish from the board on the first rebuild after it
started, taking the reader's in-play match with it - and, worse, making the
fixture unresolvable by `fixtureById`, so a slip leg on it could never be
re-graded. `carryInPlay` in `lib/build.js` now puts back anything on the
previous board that has kicked off, is inside `IN_PLAY_MAX_MS` (4.5h, so extra
time and penalties still count), and is not already in the new list.
**Note:** the tip is recomputed for a carried fixture like any other, so it can
move mid-match. Pinning the published tip while a match is in play is the
stricter thing and is not done.

## Key architecture notes
- Single-file SPA: `public/index.html` (~5000 lines, all UI + logic).
  **It is both source and build output** - the prebuild only rewrites it under
  `VERCEL` / `SPLIT=1`, so plain local builds are safe.
- Backend: `lib/build.js` (nightly, Vercel cron `30 6 * * *` UTC) +
  `lib/model.js` (Dixon-Coles)
- Live scores: `LIVE_URL` → Railway `/api/livescores`, polled every 30s
- **Every deploy rebakes the board.** Anything that must stay put (pick of the
  day, published tips) has to be *recorded*, not recomputed.
- Tests: `node --test`, zero runtime deps. **Test the callers, not just the
  logic** - three bugs shipped past green tests that asserted source strings or
  built their own inputs.

## Open / deferred
- **API-Football account is SUSPENDED, because we overran the free plan.**
  100 requests/day allowed; the build grades scores, *every deploy rebuilds*,
  and there were 37-63 deploys a day. Worse, two passes - `confirmScores`
  (~line 740) and `recordPublishedTips` (~line 817) - each build their own
  `byDate` map and never share, so every date is paid for twice. That is
  200-400 requests/day against a 100 limit. `inScoreWindow` also allowed 4 days
  (now 7) where the free plan serves 3, and **a refusal still costs a request**.
  **Do not install a new key until this is bounded** or the new account goes the
  same way. Wanted: memoise date lookups within a build, cap oracle calls per
  build (~3), only ask inside its real 3-day window, and log
  `x-ratelimit-requests-remaining` so the quota shows up in the build output.
  Deferred by the owner 1 Sep. SoccerVista covers grading meanwhile - but that
  feed is Opta data under *their* licence, not ours, and it sits ahead of the
  oracle only by ordering, not by any limit. If it goes down, every build falls
  through to the oracle at full volume.
- **Railway trial ends ~13 Sep 2026.**
- ~~**Service worker**~~ **DONE 1 Sep, and it was broken.** `sw-v7`.
  **The worker had been a complete no-op since `9cfdea0`.** Its "skip non-http
  schemes" guard compared `req.url.split(":")[0]` - which is `"https"`, no
  colon - against `/^https?:$/`, which requires the colon. It matched nothing,
  so `fetch` returned early on *every* request: no offline shell, no
  cache-first assets, no network-first page. The two later fixes on top of it
  (network-first page, manifest) could never have done anything. Now compares
  `new URL(req.url).protocol`.
  Also added: a **`KILL` switch** (set true, deploy, and every installed worker
  drops its caches, unregisters and reloads its tabs - the only way to recall a
  bad worker, since it is the one thing that outlives a deploy), a **cap of 24
  hashed bundles** so the cache stops growing by one copy of the app per deploy
  forever, `/api/*` never cached and no longer given a dead cache fallback, and
  `sw.js` pinned to `max-age=0, must-revalidate` in `vercel.json`.
  `test/sw.test.js` is new: 18 tests, all 8 mutations caught.
  `predictions.json` stays cache-first **on purpose** - the page compares the
  payload's build time and calls `refreshPayload()`, which asks
  `/api/predictions` and so goes to the network, not this cache. It self-heals,
  and painting instantly then correcting beats a blank screen on a slow phone.
- ~~**Google Search Console**~~ **DONE 1 Sep.** *Domain* property
  `sc-domain:soccerwizard.live` on `tobioluwadare@gmail.com`, verified by DNS
  TXT. Both sitemaps read Success: the www one (578 URLs) and an older
  bare-domain one submitted 31 Aug (582). Notes:
  - The verification TXT now lives in **Cloudflare**. Do not delete it or the
    property loses verification. It sits alongside a second, older
    `google-site-verification` token and the SPF record - all three must stay.
  - Google offered to verify by **authorizing it against the Cloudflare
    account**. Declined: that is a standing OAuth grant with write access to the
    zone that carries the MX and DKIM records. A single TXT does the same job.
- Sweep cadence: GitHub throttles the 10-minute cron to ~5 runs/day.
- Bet9ja is deliberately the quieter brand in the UI. SportyBet is the primary.

## Verify commands
```bash
cd /c/Users/DELL/Desktop/skypredict
git log --oneline -3          # 277abcd should be HEAD
node --test                   # full suite
node scripts/b9match.js       # Bet9ja coverage against the live board
```
DNS, after any change:
```powershell
Resolve-DnsName soccerwizard.live -Type NS -Server 8.8.8.8
Resolve-DnsName soccerwizard.live -Type MX -Server 8.8.8.8   # mail must survive
Resolve-DnsName hostingermail-a._domainkey.soccerwizard.live -Type CNAME -Server 8.8.8.8
```

## Gotchas
- Grepping `index.html` to check whether something is live gives a false
  "not live" - the production build splits CSS/JS into hashed files.
- `vercel env pull` will NOT give you `SUPABASE_URL`; it returns the literal
  `[SENSITIVE]`, so the Supabase path cannot be run locally.
- Supabase errors get truncated at 200 chars, cutting off the column name. Use
  `explain()`.
- `lib/build.js` refuses to build on `< 400` downloaded results.
- Mutation scripts must restore in a `finally`. One left a broken CRC in a
  source PNG, and Chrome renders bad-CRC PNGs, so nothing looked wrong.
