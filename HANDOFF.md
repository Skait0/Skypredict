# Soccerwizard — Session Handoff (updated 2026-09-04)

## Deployed state
- **Live URL:** https://www.soccerwizard.live — **www is canonical**, the bare
  domain 308s to it. `SITE_ORIGIN` must be the www form.
- **In front of it:** Cloudflare (free plan, account `Sowizardsb@gmail.com`),
  added 1 Sep. Apex + www proxied; every mail record DNS-only.
- **Deploy model:** push to `main` → Vercel GitHub integration → prod (~30s)
- **Repo:** https://github.com/Skait0/Skypredict.git — `main` synced with origin
- **Working tree:** clean · **HEAD:** `a32416c` "Bring the handoff up to date for a fresh session"
- **Tests:** `npm test` → **978/978** · API `python -m unittest test_server` → **59/59**
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

## 2026-09-03 morning - the betslip cap, and what Google actually thinks

**BOTH BOOKS REFUSE MORE THAN 50 SELECTIONS ON ONE BETSLIP.** SportyBet says so
in as many words - "There cannot be over 50 selections within a betslip" - and
Bet9ja is the same. **The limit is on the BETSLIP, not on making the code**,
which is why an earlier session booked 199 legs, called it a success, and wrote
into lib comments that there is no practical ceiling. Their share endpoint takes
whatever you send and returns a valid code; the wall appears when a person opens
it. Our API sees success, Sentry sees nothing, the reader sees a dialog.

`BETSLIP_MAX` is declared once now. "Add all" already capped what it booked, but
its "confirm and trim" branch loads every pick into the slip and hands the
reader to the slip sheet, and `bookMy` counted nothing - so a Saturday card
(136 fixtures) went straight past it. Verified live with a 55-pick slip: the
prompt appears, names both numbers, and nothing is sent.

**The Slider link has an effect now** - hairline, sliding arrow, slow sheen.
Still a link, not a fourth chip.

### Two decisions, both the owner's, both already argued

- **Shuffle jitter stays 0.10.** "First tap is quality." Tried at 0.20 and
  reverted. Full reasoning in test/shuffle.test.js - read it before touching.
- **Balanced stays the default**, and no attempt to make it 15 legs: 15 at x10
  needs legodd ~1.166, which pins Balanced at the 40-leg cap from x500 up and
  leaves "More games" nowhere to sit. Dropped on the owner's "never mind".

### The Slider was not changed, and here is the proof

Asked whether anything this session moved how the Slider picks. Nothing did.
buildPicks, riskParams, allowedMarkets, preferGoalsOverDouble, mProb, legOdd,
oddOf, hasRealOdd, pricedFixture, saWeight, isLowerFixture are byte-identical to
72606d2, as are the BUILD defaults and every risk constant, and so are
renderBuilder, bookSlip and doBook.

**What DOES make picks feel heavier, and it is not code: `sw.risk` never
resets.** riskWord splits Balanced/Bold at 60. A dial left at 63 reads "Bold",
which drops the minimum leg confidence from 57% to 53%. It has no expiry and no
reset - unlike sw.wspodds and sw.tod, which are deliberately cleared on load.
First place to look if anyone reports heavy picks.

Also worth knowing: on a thin midweek card the dial barely bites. Risk
40/50/63/70 all returned the same 15 legs at ~78% on a 15-fixture board -
maxGames is 17-23 there, so the BOARD is the binding constraint, not the
setting. It will bite on a Saturday.

### Sentry, and why "no market at SportyBet" is not what it looks like

54 events over FOURTEEN DAYS - about two a day, not the daily plague the raw
total suggests, and the 24h view is where to read it. Also **not a dead end**:
`_unbookable` refuses the slip,
names the legs, and the client's `dropUnbookable` drops exactly those, clears
the stale price, ASKS the reader and retries with the rest. Friction, not
failure.

The disagreement is about TIME, not markets: the fixtures cache lives 45
minutes and the browser read its own copy at page load. **The obvious fixes are
both unavailable.** There is no single-event endpoint to re-check against, only
the full-card scrape; and shortening the TTL means more of it - a refresh is ~49
sequential requests and this server has been blocked by SportyBet for less.
Refusing on stale data is also the safer error, since a false refusal costs a
prompt while a false pass can take the whole ticket down.

So it is instrumented rather than guessed at (`0267426` in the API repo,
deployed 3 Sep 10:09 and confirmed from the boot line). `_unbookable` returns
`(bad, how)` and the route sends `cache_age_s`, `legs_judged` and
`legs_unknown` to Sentry. Only refusals from 10:10 onward carry them, and at
two a day it takes a few days to gather enough to read.

**How to read it when there is enough:** refusals clustered at HIGH cache ages
mean our 45-minute copy was stale and the market was probably there - worth
fixing, and the fix is not a shorter TTL. Spread evenly across ages means real
market gaps, the current behaviour is correct, and nothing needs building.

**A reminder is scheduled so this does not get forgotten.** Windows task
`Soccerwizard Sentry check`, one-shot, **Sun 6 Sep 10:00**, running as DELL with
LogonType Interactive so its dialog can appear; `StartWhenAvailable` is on, so a
machine that is off catches up at next login. It **deletes itself after firing**
rather than becoming a nag. The script is
`C:\Users\DELL\soccerwizard-sentry-reminder.ps1` and carries the same
read-it-this-way note as above, so it is useful without Claude in the room.

Deliberately a plain scheduled task and not a cloud agent or a routine: the
owner asked for nothing that bills, and this involves no model at all - it
nudges a human, who then asks. To cancel early:
`Unregister-ScheduledTask -TaskName "Soccerwizard Sentry check" -Confirm:$false`.
Note it was never test-fired, because running it would both block on a dialog
and trigger its own self-delete; verified instead by parsing the script and
checking the registration, principal and next run time.

The other one - `SportyBet rejected a slip that passed validation` - is
`legs=1 markets=? reason=Invalid`. One leg, so nothing to do with the 50 cap.
One occurrence in 20 hours, unexplained.

### Google: indexed, just not crawled deep

The premise "Google hasn't indexed us" is wrong, checked in Search Console:

- `https://www.soccerwizard.live/` - **URL is on Google, page is indexed**
- `https://www.soccerwizard.live/matches` - **also indexed** (so Request
  Indexing on it is a no-op; do not spend the daily quota there)
- a match page - **"Discovered - currently not indexed", Last crawl N/A**
- Page indexing report - "Processing data, check again in a day or so"

Everything technical is right and was verified as Googlebot: robots allows,
1,105 URLs in the sitemap, canonical correct, no noindex, Cloudflare does not
challenge the crawler, apex 308s to www, and match pages are fully
server-rendered with real titles and h1s. `/matches` carries 1,100 internal
links and is linked from the homepage.

So this is **crawl budget on a domain a few days old**, not a fault. Google has
the front door and the hub; it has not walked the 1,100 children yet. What moves
that is age and inbound links, not configuration. Nothing to fix.

*(Beware `/matches.html` - cleanUrls redirects it, and checking that instead of
`/matches` makes the match pages look orphaned when they are not.)*

## Later on 2026-09-03 - the Wizard, and what the board may claim

**The Wizard no longer defers to the Slider at all, and the handover is gone.**
Reported as "when i click on fewer games bigger odds, it doesn't do that
anymore" - and on All upcoming it genuinely never did. wspBuild handed the
payout to the Slider whenever the Slider could reach it, and hid the Slip style
chips while it did. That threshold is a property of the BOARD and moves by five
orders of magnitude between cards: measured, x93 on a thin midweek day scope and
**x18,606,289 on All upcoming**. So the chips were permanently dead on a big
card, live on a small one, and nothing named the number deciding it.

The swap was not free either. On the real 386-fixture board at x2000, prices
derived from the model the way engines.test.js does:

    Slider (was automatic)   25 legs   x2259   lands 0.044%   73.7% avg
    Wizard / Fewer games     12 legs   x2001   lands 0.050%   53.5% avg

Per leg the Slider is much safer; across a slip it is not, because compounding
punishes leg count harder than it rewards per-leg confidence. Same result as the
x10 measurement that put the edge metric in.

So: three style chips always, once a payout is chosen, and a plain link out to
the Slider tab. Auto was briefly a fourth chip and was dropped - over a full
Saturday with live SportyBet prices it lost every rung, 30 legs landing 0.001%
at x6000 against 16 landing 0.182%. **Balanced is the default** (`WSP.legodd`
1.4). No chips at all in "every game that qualifies", because that mode pins the
count and legodd cannot move it - measured, all three styles return the same 40
legs.

`sliderReach` and its whole chain were deleted once nothing called them, along
with test/sliderhandoff.test.js. Three of its guards survive in
test/wizardpanel.test.js. 614 lines out.

**WSP.everyGame IS DEAD STATE.** It is never assigned anywhere - no control, no
handler. Not the same thing as "All upcoming", which is `SCOPE` and is a real
live control. If you wire the mode up, the panel already handles it.

**The board no longer decides a verdict; the backend does, and only after the
day.** See the section above. Note where results are actually read: the board
holds today and forward, so yesterday's hit/miss lives in the "See past results"
view off `DATA.results`, not on the board.

**"How we did yesterday" now says how much is still out.** It could only do that
for a reader whose browser kept yesterday's board, or from `pendingByDate` -
which counts rows the record HOLDS and cannot confirm, and a tip is filed only
while its fixture is on the board, so a late game with no build before midnight
is never written down. Hence `{}` on a day with nine ungraded games, and
"18 of 31 tips landed, 58%" shown as finished. The build now records
`publishedByDate` and carries it forward. **Takes effect from the next rollover**
- 2 Sep was already off the board.

**The slip card is checked on its pixels now.** test/slipcard.test.js asserts on
the baked JSON and textWidth and renders nothing, so `pen += a` -> `pen += 0`
survived all 13. test/slipcardpixels.test.js decodes the PNG and measures ink;
5/5 mutations caught.

### Two decisions made deliberately - do not re-derive them

- **Ticket uniformity is known and accepted.** 200 simulated readers on a
  Saturday card: the most popular leg is in 100% of tickets at x100 and above,
  pairwise overlap 70-79%, 200 twelve-leg slips drawn from a pool of 17. Raising
  the shuffle jitter base from 0.10 to 0.20 halves the overlap for at most 2% of
  the landing chance. **Tried, reverted on the owner's call: "first tap is
  quality is what i think."** The reasoning is written into
  test/shuffle.test.js, where the 0.12 ceiling lives. Raising this later without
  reading that is going round the loop again.
- **Balanced stays the default over Fewer**, though Fewer won 6 of 7 rungs on
  real prices. Owner's call.

### Sentry, triaged 3 Sep

Eight unresolved. Three are NOT ours - `CONFIG`, `currentInset` and
`window.webkit.messageHandlers`, all injected by in-app browsers off X traffic;
all three are named in `ignoreErrors` now, and the guard test checks each
pattern names an agreed identifier rather than hardcoding CONFIG.

The rest are booking, in soccerwizard-api:

- **`picks with no market at SportyBet`, ~2 a day** (54 over 14 days; the raw
  total misleads). NOT a dead end:
  `_unbookable` refuses the whole slip, names the legs, and the client's
  `dropUnbookable` drops exactly those, clears the stale price, ASKS the reader
  and retries with the rest. It is friction, not failure. Root cause is the
  45-minute server cache against a client copy read at page load. The fix worth
  building is the server re-checking a "missing" market against the live event
  before refusing, the way the Bet9ja path can with `fetch_event`.
- **`SportyBet rejected a slip that passed validation`, 1 event**, `legs=1
  markets=? reason=Invalid`. One leg, so nothing to do with any selection-count
  limit. Unexplained; one occurrence in 20 hours.
- Bet9ja's unmapped markets were **already fixed** in `b93c250` - GG,
  FH_OVER_0.5, HOME/AWAY_OVER_1.5 plus nine de-vig unders. Deployed, and the
  issue has had no events since.

**On SportyBet's selection limit:** there is none in our code, and a previous
session booked 199 legs in one code successfully. Our caps are 40, and 50 for
jackpot. If a 50-selection limit is real, it is not recorded anywhere and the
jackpot cap sits exactly on it - worth confirming before trusting x20000+.

## 2026-09-04 - the wizard's picks, and the header

Twelve commits. All pushed, all verified live by fetching the hashed bundles.

### The wizard was buying its own mistakes

Reported: at x100 it picked "Monaco to score against PSG", "Betis to score
against Madrid", while the SLIDER at its riskiest - 32 legs, x3000 - picked
Real Madrid or draw. Measured on a 394-fixture board, our probability minus the
bookmaker's implied one:

```
every priced option on the board   -3.5 pts   we are higher on 26%
"more games" legs chosen           -0.6 pts   ...on 39%
"balanced" legs chosen            +10.1 pts   ...on 80%
"fewer games" legs chosen         +14.8 pts   ...on 100%
```

The model is not over-confident - across the board it sits BELOW the book on
every market. The fault was in what the builder SELECTED. It fixes leg count
from the payout then needs each leg to hit a price; on a lopsided fixture every
safe market is 1.05-1.10, all under the band, so the only thing in range is the
unlikely thing - and `edge` then PREFERS those, because a high probability at a
long price looks efficient. Band plus edge acted as a filter isolating our own
errors, and the higher the per-leg target the purer it got.

**The Slider never did this because it has no per-leg price target at all.**
That is the whole difference, and it is worth remembering before adding one.

Fixed with a **value cap**: refuse a leg whose probability exceeds the book's
implied one by more than 5 points, judged only where a real price exists. NOT a
ban on team-to-score - that market grades 81.6% against 78% claimed and a rule
against it was tried once and was wrong. Balanced x100 went from 10 legs at a
+10.1 mean gap to 13 legs at +2.0. **The leak was `_alts`**: two later loops
reach in to lengthen legs and neither re-checks the price.

Ground truth: across 1,752 matches in five top leagues, against a favourite at
65%+ the underdog scored **52-56%** of the time. Those legs claimed 63-74%.

### The model would not call a favourite

Chasing "why no big teams on wizard tickets" found a real calibration fault.
Against the de-vigged book price, after the flat 30% blend:

```
book says fav is   40-50%  50-60%  60-70%  70-80%  80%+
our gap             -2.3    -6.7   -11.4   -14.4   -16.5
away favourites     -6.1   -11.5   -17.1   -18.5      -
```

`blendFixture` now scales its weight with the size of the disagreement, 0.30 up
to 0.75 over a 20-point gap. After: -1.6, -3.9, -5.3, -6.0, -6.2. Liverpool at
Ipswich went 41% to 56%.

**It still will not put Real Madrid on a ticket, and that is structural:** a team
winning is always less likely than the same team scoring, and bestOf takes the
highest probability in band. Changing that is a taste decision about what a
ticket should look like, and the owner should call it.

### Smaller, all live

- **A toggled market that contributes nothing now says so**, and says where it
  WOULD work - decided by rebuilding at the longest style and looking, not by
  modelling the band. Team over 1.5 clears its 50% floor on only 101 of 790
  candidates and is priced above the Balanced band; at Fewer games it takes 4 of
  9 legs. The toggle was never broken.
- **A typed payout the current window cannot reach** warns and offers to switch
  scope, instead of silently clamping x20,000 to x6,000.
- **"Open in football.com" on shared SportyBet slips.** See the warnings below.
- **Social tags** completed (twitter:title, description, og:site_name).

### The header, and a bug under it

The masthead was `background:var(--bg)` - the page colour exactly - with a hard
1px rule on scroll and `--shadow:none` on dark. Now glass: translucent, 16px
backdrop blur, hairline drawn INTO the surface with an inset shadow, and 18px of
gradient falloff so the edge ends rather than stops.

**Translucency over the same colour is a no-op.** The first attempt changed
nothing at the top of the page, correctly reported as "the black background is
there the same way". The hero band now starts ABOVE the masthead so the glow
passes under the glass.

**And the header was never sticking.** Declared `position:sticky`, measured at
-306 with 306 of scroll. `body{overflow-x:hidden}` made body a scroll container,
and a scroll container breaks sticky for everything inside it. `overflow-x:clip`
clips identically without becoming a scroller. Both declarations kept.

The nav tabs became a segmented control - a recessed rail, the current view
lifted off it, hover lift behind `@media (hover:hover)`, a press state. On
phones the Live tab had to lose its own fill/border/small-radius, which rendered
as a box inside the new rail.

All of it carried through to the 1,120 generated pages, where the bar now sits
OUTSIDE `.wrap` - **a full-width bar with viewport units inside a 680px column
put 348px of horizontal scroll on every page**, because 100vw counts the
scrollbar and body's overflow propagates to the viewport when html's is visible.
The glow there is a background LAYER on body, sized in percentages.

---

## Warnings earned today, in order of how much they cost

1. **A template literal is not a text file.** A regex written into the shared
   slip's inline script lost its escaped slashes, terminated early, and turned
   the rest of the line into a comment - a syntax error that killed the WHOLE
   script block, so **Copy code was dead on every shared slip page**. None of
   thirteen tests caught it: they all read the rendered markup as a string, and
   a string containing broken JavaScript is a perfectly good string. There is
   now a test that COMPILES what the page emits, and another that refuses any
   backslash in that literal. Later the same day a backtick inside a CSS comment
   in `lib/pages.js` ended the stylesheet literal the same way.

2. **"It works for me" is worthless when two paths are not the same code.** The
   owner reported football.com opening the app, so I removed the `intent://`
   workaround as unnecessary. He was tapping the app's modal, which had it; a
   reader tapping a SHARED slip, which did not, got the website. Restored.

3. **Computed styles on a transitioning property are a moving target.** Half an
   hour went into a header "bug" that was me sampling box-shadow and opacity
   mid-transition. Disable the transition before measuring.

4. **Check the scope before quoting a Vercel plan.** `skypredict` is an empty
   Hobby scope; the real one is `soccerwizard`, on Pro.

## Still open

- Whether the +5 value cap is the right number. It is calibrated to the board's
  own -3.5 mean, which is sound reasoning, but the real test is whether capped
  slips LAND more often. The graded record answers that once enough settle.
- Whether outrights should be preferred when close to the best in-band option.
  Taste, not correctness - ask before changing.
- The Sun 6 Sep 10:00 Sentry reminder is still a scheduled Windows task
  (`cache_age_s` on booking refusals). The Fri 4 Sep CPU reminder is **answered**
  — see below — but the task is still armed and will fire.

### CPU: verified fixed, 4 Sep 09:15 (the reminder's answer)

`/api/predictions` was 577 invocations, **8 hours of Active CPU** and a 100%
timeout rate over 12h. Read off Observability → Functions with the window
narrowed to the last 6 hours, so nothing pre-fix is in frame:

```
                        during the incident   now (6h window)
invocations             577 / 12h             22 / 6h
active CPU              8 HOURS               810ms
P75 duration            60s (timeout)         98ms
error rate              100%                  0%
football-data.co.uk     ~47,000 / 12h         85 / 6h, in two build-shaped spikes
```

It is now the **second-smallest** CPU consumer on the board; the top row is
`/api/cron`, the 06:30 rebuild, at 1m — which is what should be there. Billing
agrees: the cycle that opened 3 Sep 08:00 has used **$2.16 of the $20 credit**,
almost all of it in the 3 Sep bar; the 4 Sep bar is a sliver. Confirmed from
outside too — a cache-busted cold hit returns 200 in ~1.0s carrying
`x-formline-cache: baked`, so the route serves the payload rather than
rebuilding it.

## 2026-09-03 evening - the CPU incident, and four smaller things

**READ THIS FIRST: `/api/predictions` was rebuilding the model on every
request.** Found by reading the Vercel usage page, which is the only place it
was visible.

```
577 invocations / 12h     8 HOURS of active CPU      100% error rate
every one:  Vercel Runtime Timeout Error: Task timed out after 60 seconds
47,000 requests to football-data.co.uk (~94,000 a day)
89% of the entire Vercel bill; ~$59/month against $20 of included credit
```

Nothing visible broke, which is why it ran so long: the static
`/predictions.json` served fine throughout, so the site looked healthy. Three
failures compounded - a 504 is never cached so every visitor started another
build; the client's freshness path called the route for most visitors all day;
and **the route's own catch/serve-stale/503 handling had never run once**,
because it assumed failure throws. A timeout does not throw - the runtime kills
the invocation. *Error handling that cannot run is not error handling.*

Fixed: the route reads the file prebuild bakes and cannot reach `lib/build.js`
at all. Verified live, before and after in one command: **60.85s / 504 ->
2.07s / 200**, and it now edge-caches (`x-vercel-cache: HIT`), which a 504
never could. maxDuration 60s -> 10s; `vercel.json` bundles the baked file via
`includeFiles` (without it the route deploys fine and 503s on everything).

**The daily cron was failing too** - same 60s cap, same build. Raised to 300s.
Only deploys were keeping the data fresh, and the deploy frequency hid it.

**The client's freshness fetch is gone.** It could never return anything newer:
both sides read the same file, and a deploy replaces the static file and the
function bundle together. A guaranteed no-op run by nearly every visitor, and
the source of most of those 577 calls. `fetchPayload`'s fallback stays - that
one only fires if `/predictions.json` itself fails mid-deploy.

**Reminder set:** Windows task "Soccerwizard CPU check", 4 Sep 10:00, one-shot,
self-deleting. Fluid Active CPU should be near zero; the per-route table at
Observability -> Functions names any remaining offender in one look.

**Where the dashboard actually is:** the team is `soccerwizard`, NOT
`skypredict` - that second scope exists, is empty, and is on Hobby, which is
how I twice reported the wrong plan. **The account is on Pro already.**
`vercel.com/soccerwizard/~/usage`. The v1/usage API rejects every date range
tried; use the dashboard.

---

**Three other things, all live and verified:**

- **A circuit breaker in front of the Railway feeds** (`lib/upstream.js`). The
  fallback already worked; what it did not do was stop WAITING - every request
  during an outage burned the full 8s timeout. Three consecutive failures trip
  it, 30s cooldown, one probe to reopen, and a stalled probe is retired so a
  killed request cannot wedge it open. Per warm container only, like `lastGood`
  - stated honestly, not a global guarantee. Deliberately NOT on booking: a read
  arriving stale costs nothing, a booking refused by an unrelated breaker costs
  somebody their slip.

- **A real 404 page.** Vercel was answering with its bare 79-byte default. It
  matters here because 1,120 match pages are retired as fixtures age out, so a
  404 is what a search result from three weeks ago leads to. noindex but
  `follow`, no canonical, and deliberately never added to `paths` so it cannot
  reach the sitemap.

- **A Telegram community link**, `t.me/soccerwizardTG`, in BOTH footers - the
  hand-written one and the generated one, so it reaches all 1,120 match pages.
  One exported constant with a test that the two agree, same rule as CONTACT.
  Verified resolving before shipping, because the X link once 404d.

- **A hero band** behind the headline: CSS only, ~1KB, gradients plus an inline
  pitch SVG, full-bleed via `100vw` which is safe ONLY because
  `body{overflow-x:hidden}` is set three thousand lines away. A test says so.

**Two lessons that generalise, both now in tests:**

1. *A `>*` rule is a rule about elements you have not written yet.* The draw
   chip became a giant circle on phones because `.mkt-chip.is-draw>*` caught the
   ripple `<span>` the global click handler injects, forcing a 159x159 square
   into a 31px flex chip. Use `isolation:isolate` plus a negative z-index
   instead - it touches no children.

2. *When a club's full name contains another club's whole name, alias TOWARD the
   form that does not.* Expanding QPR to "queens park rangers" made it score
   1.80 against Glasgow Rangers and Queens Park FC.

## 2026-09-03 afternoon - the empty draw slip, the matcher, and a chip that became a circle

Two commits, both pushed and verified live by fetching the hashed bundles
(`app.b1922afb09.js`, `app.1b13cf1693.css`) - never by grepping `index.html`,
which is rewritten at deploy time and always looks wrong.

**`76898c2` The draw slip came back empty, and the matcher paired the wrong
clubs.**

*The draw.* Turning on Draw returned "No games to conjure", and returned it on
"all upcoming" too. That second half is the diagnosis: that path pins the
per-leg target at 1.01, which NARROWS the market band to 1.41 rather than
widening anything. `bestOf` picks each fixture's market from a band of
`g*0.92` to `g*OVERSHOOT`, and `g` came straight from the Slip style - 1.4 for
Balanced - so the band only ever accepted legs of about 1.3 to 2.0. A draw is
priced near 3.2. Every draw overshot, nothing sat under it, `bestOf` returned
`null` on EVERY fixture. `reachablePerLeg()` now asks the board what a leg
actually costs (median across fixtures of each fixture's cheapest bookable
candidate) and the target is `max(style, reachable)`. With the usual markets on
that is ~1.05, the style stays in charge, and no existing slip changes.
Measured either side of the two lines: draw-only 0 legs to 5 at x100 and 0 to 6
on "all upcoming"; a normal slip unchanged at 11.

*The matcher.* Containment ignored word boundaries and scored coincidences at
1.8 - the figure reserved for an exact or containing name: Gent inside
arGENTinos Juniors, Rakow inside kRAKOW, Angers inside rANGERS, Farul Constanta
against "Tanta FC". Separately the reserve guard anchors markers to the end of a
name, so "Willem II" read as a reserve side and the club could never be matched
at all. Working the sixteen unmatched fixtures from a live log turned up three
more faults that pair a fixture with the wrong football: eight women's sides
scoring 1.8 against their own men's team (Manchester City WFC, Arsenal WFC, Zhfk
Krylya Sovetov), reserve sides numbered MID-name that the end-anchored rule
never saw (Arsenal-2 Tula, FC Zenit-2 St Petersburg, FC Spartak-2 Moscow), and
two clubs called America in two countries.

**One alias was worse than the miss it fixed, and the rule generalises.**
Expanding QPR to "queens park rangers" scored 1.8 against GLASGOW RANGERS and
Queens Park FC, because the long name contains both. It collapses to "qpr"
instead. *When a club's full name contains another club's whole name, alias
toward the form that does not.*

Verified by scoring all 1,562,940 name pairs the live feeds produce under old
and new code: 12 gained, 120 lost, every loss a substring coincidence, a
women's side or a reserve side. Harness kept in the scratchpad (`namelib2.js`
lifts the matcher from any `index.html`, `namediff.js` diffs the verdicts) -
re-run it against a fresh log rather than reasoning about a name.

**`a4a9171` The draw chip became a giant circle on phones.** Reported as "it
shows two big circles", then "it gets big along with both score" - and the
row-mate is what identified it, because a whole GRID ROW stretching is a
different fault from one chip misbehaving. **The page installs a global ripple
handler that APPENDS `<span class="rip-ink">` into whatever was clicked**, sized
to the element's longest side. The stripe styling had lifted the chip's content
with `.mkt-chip.is-draw>*{position:relative;z-index:1}`, which outranks
`.rip-ink`'s own class rule and forced the ink into flow: a 159x159 square in a
31px flex chip, the row grew with it, and at `border-radius:99px` both chips
rendered as circles for the 560ms the ripple lives. Now `isolation:isolate` on
the chip and `z-index:-1` on the stripe layer, so no rule reaches a child at
all. **A `>*` rule is a rule about elements you have not written yet.**

The gold gradient it replaced was itself a fix: gold reads as a jackpot, on the
least likely bet the site builds. The payout row had already solved this with
hazard stripes; the chip now uses the same device.

**Reproducing mobile:** Claude's viewport is pinned, so `@media(max-width:560px)`
never fires. Render the page in a 540px `<iframe>` - it gets its own viewport -
and drive it through `contentWindow`. Half a dozen theories died at desktop
width; at 536px the chips measured 159x31 then 159x173 and named the fault at
once. Note `getBoundingClientRect` (visual) disagreed with
`gridTemplateRows` (layout), and that disagreement is what proved an in-flow
injection rather than a sizing rule.

**Tests: 866 pass.** New: `drawtarget`, `teamnames`, `teamaliases`, `drawchip`.
`variant.test.js` had to learn to lift `containsWords` or every score threw.
22 mutants across the three fixes, all caught - including one that only died
after a test case whose numbers sort differently as text than as numbers.

**Still open from this session:** `Spartak Moscow` vs `Sparta Rotterdam` scores
1.00 and `Fortuna Sittard` brushes `Fortuna D`; both are weak, both pre-existing,
neither can pair a fixture alone. The `"sparta rotterdam": "sparta"` alias is
what does it.

**Vercel is asking for Pro over Fluid CPU.** Ruled out as causes: `/api/live`
(edge-cached, MISS then HIT with Age climbing), `/api/predictions` (static file
first, function cached 6h), the sweep (GitHub throttles it to ~5 runs a day).
Cause not yet identified - the breakdown is under **Usage at team level**, not
the project Observability tab, which asks for a connector. Two things to weigh
before paying: Hobby is licensed non-commercial and this site hands out booking
codes, so Pro may be required by terms regardless of CPU; and Railway is already
paid with usage included, so `slipcard.js` (PNG encoding at 1GB) and the sweep
could move onto capacity already bought. Deploy volume is also worth trimming -
63, 59, 43 and 37 deploys a day last week, each one a full board rebuild, which
is what killed the API-Football key.

## This session (2026-09-03)

Five commits, pushed and deployed as `soccerwizard-6c1sy8ujm`. `preflight` all
clear afterwards. Newest last:

**`bf1f5cf` Grade every market on the 90-minute score.** API-Football's `goals`
is the score a fixture ENDED on - for AET it carries the extra-time goals, for
PEN the score at the end of extra time. Every market we grade settles on 90
minutes, so a cup tie level at 90 and won in extra time is a DRAW to every
market we offer and was being recorded as a home or away win. `ninety()` reads
`score.fulltime` whatever the status and falls back to `goals` only for FT.

**`922cbc2` The Wizard's dead style chips.** Two causes. The slider ceiling was
memoised under a key that never named the board, so a ceiling measured before
the payload arrived - empty card, ceiling 0 - was served forever after,
`sliderDrives()` answered false for every payout, the handover never fired, and
the Slip style chips it replaces stayed up permanently. The key now carries the
card's length and both end ids. Second, the chips flickered in while typing a
custom payout, because the first keystroke clears `WSP.odds` on purpose and
`wspBuild` returns an empty slip while it is null.

**`867509f` "most likely score" was a claim the model never made.** `scoreForTip`
draws a representative scoreline from the fixture's own distribution; the mode
is 1-1 across most of the card and was reverted for being right and useless.
Now reads "one way it could finish". Match and standing pages also gained the
`twitter:image` and `og:image` dimensions the homepage already had.

**`19fbeaa` Per-slip share card.** See the shared-slips section below.

**`5683925` The board no longer decides a verdict.** *Reported: a game that
finished 0-0 showed "Hit".* `statusBadge` asked `fixtureState`, which reaches a
full-time verdict three ways and only the first is a score anybody stands
behind: `potdResult` (graded results feed, or a score baked into the payload),
the live feed saying FT, and **an inference drawn from a match going absent from
the feed after the 80th minute**. `finalScoreFor` already refused the third for
settling a slip - a guess from an absence must not decide somebody's ticket - and
the board printed it as a verdict anyway. This is the same mechanism the skill
file records as the worst data bug of the build; it was fixed in the sweep and
left live in the client.

The rule now, chosen by the owner: **nothing on the day itself, everything the
next day.** While a day is running the board offers no verdict at all, only the
countdown; once the day is behind us the backend has graded it. Silent or right,
nothing in between.

**Where results are actually read.** The board holds today and forward only, so
`statusBadge`'s past-day branch almost never fires - the exception is a fixture
`carryInPlay` holds over from a late kickoff. Yesterday's hit/miss lives in the
**"See past results"** view, driven by `DATA.results`, which this change does not
touch. Verified in the browser on the live build, 3 Sep: 19 rows on today's
board carrying zero verdicts (17 empty, 2 countdowns), and the past-results view
rendering all 31 Sep-2 results, 18 hits, matching the sidebar. *If you sample
that view less than ~1.5s after clicking you will catch it mid-render and
miscount it - I did.*

Scope deliberately left alone: `formIndex` uses live scores on purpose and flags
them provisional, and the slip-of-the-day legs still read `fixtureState`, so they
can still show an inferred leg result. Both are candidates if the same complaint
returns.

**Slider -> Wizard handoff, verified live** (it had never been checked in a
browser): ceiling 93.24 on the 3 Sep board, hands over at 2/10/50/90, declines
at 120/5000, and declines with no target set. Before `922cbc2` every one of
those was false.

### Two environment traps, both cost time tonight

- **The mouse-escape flood is per shell.** The PowerShell guard was installed on
  2 Sep and the terminal died again the same night, because Claude Code had been
  launched from **Command Prompt**, which loads no PowerShell profile and never
  touches PSReadLine. cmd now has its own guard (`HKCU\Environment\PROMPT` +
  `HKCU\Console\VirtualTerminalLevel`, plus `C:\Users\DELL\resetmouse.cmd`).
  Tell them apart from the flooded line: `PS C:\Users\DELL>` vs bare
  `C:\Users\DELL>`. Prefer Windows Terminal on `pwsh` - now the default profile.
- **A Bash heredoc here collapses doubled backslashes**, quoted delimiter or not.
  A doubled-backslash `s+` written into a JS file arrives singled, which JS then
  reads as a bare `s+`. It fails as a wrong-looking regex match, never as a write
  error. Use `String.raw` / Python `r'...'` with single backslashes, or the Write
  tool. It bit three times in one session, including while writing this file.

### Resuming after a crash
Sessions are scoped to the directory Claude Code was launched from, which for
this work is `C:\Users\DELL`, **not the repo**. `claude --continue` from inside
Skypredict finds nothing. Transcripts live in
`~/.claude/projects/C--Users-DELL/`; `claude --resume <id>` picks a specific one.

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

**Built 3 Sep** (`19fbeaa`), by a different route than the one sketched here:
`api/slipcard.js` + `lib/slipcard.js` composite the slip's games count and odds
onto a baked base per request, pure Node, no browser and no canvas dep in the
function. Assets are baked by `scripts/mkslipcard.js`, re-run only to change the
design. Each glyph sits on its OWN advance and the string is centred about a
point - putting every digit on the widest digit's advance renders "3.81" as
"3 . 81". **Known gap: the pixel path has no test.** Mutating `pen += a` to
`pen += 0` in the blit loop (every glyph at the same x, figures overlapping into
a smear) survives all 13 slipcard tests, because they assert on the baked JSON
and on `textWidth`, and nothing renders. Fix with a test that renders and
asserts ink position.

Superseded note, kept for the reasoning: `lib/ogcard.js` composites digits
onto a baked background with fixed slots, so a per-slip card needs new slots
baked by `scripts/mkogbase.js` (a manual, canvas-based step) - more work than
it looks.

## Three score sources, in this order
```
1  soccervista   fastest, widest, reaches a week back      THEIR licence
2  footballdata  free, already downloaded, HALF-TIME too   ours
3  oracle        API-Football, 100 requests a day          ours
```
SoccerVista stays first because it *is* the best - it took grading from 132
rows to 308. Demoting it to feel less dependent on somebody else's feed trades
real coverage for a feeling, and reordering an array does not answer a licence
question: read their terms, or stop using it.

football-data costs nothing. `lib/build.js` already downloads every CSV to fit
the model (it refuses to build under 400 results), so `FD.fromMatches(matches)`
turns what is already in memory into a source. No request, no key, no quota.

It sits ahead of the oracle because the oracle is rationed and there is no
reason to spend an allowance on a date something free can answer.

**It is the only source with a half-time score.** `gradeLabel` refuses a
first-half market outright without one - correctly, a full-time score cannot
settle it - so every `FH_OVER_0.5` tip came back ungraded, and the builder
offers that market. Both grading passes now hand `{hth, hta}` through when the
source has it, and a test counts BOTH: a single `assert.match` passed while one
pass had lost it.

League only. Cup ties stay with the other two.

## Bet9ja carries far more than our bulk feed shows
**A wrong conclusion was committed here on 2 Sep and is corrected below. Read
this before trusting any coverage number.**

Our `/api/bet9ja/fixtures` returns nine markets per game: 1, X, 2, 1X, X2, 12
and the three over lines. That is NOT Bet9ja's catalogue - it is the blind spot
of the endpoint we bulk-fetch with. `bet9ja.py` says so in a comment:
`GetEventsInGroup` **ignores MKEY** and only ever returns the default markets,
so team goals and the rest "are simply not reachable by GID".

Asked directly, `GetEvent?EVENTID=` returns **771 distinct odds keys for one
fixture**. Verified 2 Sep on a Liga MX game:

```
GG            S_GGNG_Y        present, and NOT in bet9ja.py MARKET_MAP
FH_OVER_0.5   S_OU1T@0.5_O    present, and NOT in MARKET_MAP
HOME_OVER_1.5 S_HAOU@1.5_OH   present, and NOT in MARKET_MAP
AWAY_OVER_1.5 S_HAOU@1.5_OA   present, and NOT in MARKET_MAP
HOME_OVER_0.5 S_HTS_Y         present AND mapped
AWAY_OVER_0.5 S_AWAYSCORE_Y   present AND mapped
```

The booking route already fetches all 771 (`bet9ja.fetch_event`), then rejects a
leg with `p.code not in ev["raw"]` - and `raw` only holds codes that appear in
`MARKET_MAP`. So **an unmapped market is refused however well Bet9ja carries
it.** Every GG leg has been refused on Bet9ja for this reason, and we offer GG
by default.

**The fix is to add those four rows to `MARKET_MAP`, not to hide the markets in
the UI.** Do not grey out toggles on the strength of the bulk feed: absence
there measures our fetch, not their book.

Measuring lesson: our own feed is not a source of truth about somebody else's
catalogue. Ask the thing itself.

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
git log --oneline -3          # 5683925 should be HEAD
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
