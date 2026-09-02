# Soccerwizard — Session Handoff (updated 2026-09-01)

## Deployed state
- **Live URL:** https://www.soccerwizard.live — **www is canonical**, the bare
  domain 308s to it. `SITE_ORIGIN` must be the www form.
- **In front of it:** Cloudflare (free plan, account `Sowizardsb@gmail.com`),
  added 1 Sep. Apex + www proxied; every mail record DNS-only.
- **Deploy model:** push to `main` → Vercel GitHub integration → prod (~30s)
- **Repo:** https://github.com/Skait0/Skypredict.git — `main` synced with origin
- **Working tree:** clean · **HEAD:** `2391d7e` "Keep a match on the board while it is being played"
- **API:** `C:\Users\DELL\Documents\soccerwizard-api` on Railway.
  **On the paid Hobby plan since 1 Sep 2026** - the trial deadline is gone.

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

## Shared slips: /s?p=...
`lib/sliplink.js` + `api/s.js`, rewritten from `/s` in vercel.json. A reader
builds a slip and can send a link that renders it, instead of a booking code
that means nothing until it is pasted into a bookmaker.

**The payload carries its own teams, date, market, odds and probability, and is
NOT keyed on fixture ids.** A leg in the browser stores a `fid()` hash, and a
fixture can leave the board mid-match (see the fixture-feeds section above), so
an id-keyed link would rot silently and permanently on somebody else's post.

**Treat the payload as hostile.** Anyone can craft `/s?p=` and share it as
though we said it, which makes it a defacement vector on our own domain.
`decode` refuses rather than repairs - one bad leg rejects the whole slip - and
every field is escaped at the point of use. Field separators are control
characters so no delimiter can be smuggled inside a team name.

**Grading.** `gradeLegs` maps each market code onto the label `lib/grade.js`
already understands and lets that one shared grader decide. It never settles a
market itself: two graders disagreed once and started writing wrong rows into
the record. A leg with no result, or a market a full-time score cannot settle
(team totals, first-half lines), comes back `null` and renders as **not
settled - never as a loss**. A settled slip is cached a week, an unsettled one
five minutes, or a day-old copy would show a finished game as unplayed.

**Every page now emits `og:image`.** It had none at all, including all 578
match pages, so every shared link previewed without a picture. Points at
`/og-card.png` with `twitter:card: summary_large_image`.

Not built yet: a **per-slip** preview image. `lib/ogcard.js` composites digits
onto a baked background with fixed slots, so a per-slip card needs new slots
baked by `scripts/mkogbase.js` (a manual, canvas-based step) - more work than
it looks.

## Bet9ja prices nine markets and no others
Measured 2 Sep against the live feed, 1,303 fixtures:

```
priced 98-100%   1  X  2  1X  X2  12  OVER_1.5  OVER_2.5  OVER_3.5
NEVER priced     GG  FH_OVER_0.5  HOME_OVER_0.5  AWAY_OVER_0.5
                 HOME_OVER_1.5  AWAY_OVER_1.5
```

A leg on one of those is not unlucky on that game, it **cannot be booked on
Bet9ja at all**. `bet9ja.py`'s `MARKET_MAP` maps HOME/AWAY_OVER_0.5 but the
feed never carries a price for them, so mapping is not coverage.

`bookTakes()` in index.html is the check to use: it asks whether the book has
the game **and** prices the market. `bookIdOf()` answers only the first, and
using it to count is what let a slip report itself fully bookable and then have
five legs refused by the API.

**Still open:** the builder happily offers those markets while Bet9ja is
selected, so a reader can build a slip that is structurally unbookable. The
count and the note now say so before booking, but disabling the toggles per
book would be better.

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
- **API-Football is SUSPENDED, and the spend is now bounded so a new key is
  safe to install.** The old one died on arithmetic: 100 requests/day allowed,
  the build grades scores, *every deploy rebuilds*, and there were 37-63
  deploys a day. Two passes each built their own `byDate` map and never shared,
  so every date was paid for twice - 200-400 requests/day against a limit of
  100, with nothing in the output able to say so.
  **Fixed 2 Sep:** one shared `scoreBudget` per build, so a date asked about
  twice costs once; a hard `ORACLE_BUDGET` of 3 calls per build whatever
  happens; `ORACLE_MAX_AGE_DAYS` of 3, because the free plan serves three days
  and *a refusal still costs a request*; and the remaining allowance is read
  off `x-ratelimit-requests-remaining` and logged, with a warning under 20.
  `firstScoreSource(date, log, budget, sources)` takes injectable sources so
  this is testable without reaching the network.
  **Still true:** SoccerVista leads by ordering, not by any limit. 3 calls x 63
  deploys is still 189, so the budget makes a SoccerVista outage survivable
  rather than free - if the oracle ever becomes primary, that number must come
  down.
- ~~**Railway trial**~~ **PAID 1 Sep 2026.** Hobby plan, billing 1st to 1st.
  Project `modest-expression`, service `web`, on `tobioluwadare@gmail.com`.
  It answers on TWO hostnames - `web-production-798c0` (what our code
  uses) and `web-production-71f907` - and they are the same service: they
  share one Redis, so a value written through one reads back cached
  through the other. Do not assume 798c0 is a separate deployment.
  **Watch the bill.** Hobby is $5/month including $5 of usage, and memory
  alone at 512 MB running all month is about $4.99 - so two services
  (web + Redis) can exceed the included amount. There is a spend limit
  control on the usage page if you want a hard ceiling.
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

## Before sending traffic at the site
```bash
node scripts/preflight.js --value
```
Checks the LIVE deployment rather than the code: board built today, fixtures
and tips present, the record and that it still shows its misses, both booking
paths up, robots.txt still crawlable, and the service worker kill switch still
off. Prints the exact record line to paste into a post, and with `--value`
re-runs the campaign's "about 20 games against about 5" claim on the day's real
prices. Exits non-zero if anything fails.

Written for the influencer campaign, where the pitch is "go and check us
yourself" - which makes a stale board worse than no campaign.

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
