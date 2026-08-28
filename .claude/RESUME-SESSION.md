# Resume session — Skypredict / Soccerwizard

Last updated 2026-08-28 (evening). Repo: `C:\Users\DELL\Desktop\skypredict`
Live: https://skypredict-theta.vercel.app · remote `main` @ `182ead8`
Tests: `npm test` → **119/119**.

## How to pick this up in PowerShell

The Claude session ran with **cwd `C:\Users\DELL`** (not the repo), so:

```powershell
cd C:\Users\DELL; claude --continue
```

`--continue` resumes the most recent session **for that directory** — running it
from inside the repo will not find this one. `claude --resume` gives a picker.

---

## Three traps that cost real time — read before debugging

### 1. Verifying a deploy

`scripts/prebuild.js` extracts the big inline `<style>` and `<script>` out of
`public/index.html` into content-hashed `/app.<hash>.css` and `/app.<hash>.js`.
**Grepping the deployed `index.html` for a CSS rule or JS comment always
misses** — only HTML (ids, markup) stays behind. This produced ~40 minutes of
false "the deploy is stuck" alarms and a pointless trip through the Vercel
dashboard. Deploys land in ~45s.

```powershell
$U="https://skypredict-theta.vercel.app"
$H=(Invoke-WebRequest "$U/?raw=$(Get-Random)").Content
$css=[regex]::Match($H,'/app\.[0-9a-f]+\.css').Value
$js =[regex]::Match($H,'/app\.[0-9a-f]+\.js').Value
(Invoke-WebRequest "$U$css").Content -match 'your-css-marker'
(Invoke-WebRequest "$U$js").Content  -match 'yourJsFunction'
```

Per-deployment URLs (`soccerwizard-<hash>-skypredict.vercel.app`) sit behind
Vercel SSO and 302 to a login — unreadable from the CLI. Use the production
domain.

`npm run build` outside Vercel **rewrites `public/index.html` in place** and
drops `app.*.css/js` into `public/`. If it happens:
`git checkout public/index.html; rm -f public/app.*.css public/app.*.js`.

### 2. `predictions.json` can legitimately 404

The bake is best-effort by design — `prebuild.js` will not fail a deploy over
it. On 28 Aug a build logged:

```
[prebuild] build failed, skipping bake (the page will use /api/predictions):
           only 0 results downloaded, refusing to build
```

football-data returned nothing to Vercel's builder; it built fine locally
minutes later. The site stayed up on `/api/predictions` throughout, which is
the fallback working. **Anything that reads the payload must fall back the same
way** — the sweep did not, and died on `payload: http 404`. Fixed in `7d0b237`.

### 3. A CSS group that is not in the media query it looks like it is in

Rules from roughly **line 3026 to 3091** (`#bookResult`, `.code-card`,
`.code-acts`, `.note`, `footer`, …) sit **outside** the `@media(max-width:560px)`
block that appears to contain them — the block closes above. So those "phone"
rules apply at **every** width and outrank the base rules further up. Verified
in-browser: `matchMedia('(max-width:560px)').matches === false` at 1920px while
those rules still won. It bit twice in one session (the copy button's reserved
width, the footer's bottom padding). Rescoping the group is worth doing
deliberately, on its own, with a visual pass.

Related: watch specificity. `.code-acts button` (0-1-1) beats `.code-copy`
(0-1-0). Several bugs were exactly this.

---

## Shipped 27–28 Aug

| Commit | Change |
|---|---|
| `c71de4a` | Time-of-day buckets apply to a single fixture day |
| `8bc81e3` | "Today only" is a day picker with live counts |
| `c3029db` | Day-pill count repaints when fixtures load |
| `294ea27` | Countdown pill tightened; POTD score dash centred |
| `91fba41` | Live-row dots solid; the one pulse kept for POTD |
| `acd14a1` | ★ Pick tag on the POTD's board row |
| `bac4765` | Sticky day, POTD follows the day, booking errors say what failed, copy-button width, POTD live pill contrast, slips clear, FAB fade |
| `f708283` | Full-time ledger — records FT scores from the live feed |
| `85bb31f` | "Add all N tips" restored to the crimson pill |
| `30c6c9c` | **One grader** — `lib/grade.js`; stop guessing at goal lines |
| `e2834ed` | **The sweep** + per-market record breakdown |
| `7d0b237` | Sweep falls back to `/api/predictions` |

### The two that carry the most meaning

**`30c6c9c` — the grader.** The page's `tipEval` ended on
`return res(tot>=2)`, a guess for any label it did not recognise. "Over 2.5"
landed on a 1-1; "Under 2.5" was inverted outright (0-0 read as a miss, 3-0 as
a hit); a draw was called a void rather than a miss on a home-win tip; "First
half goal" was graded off the full-time total. Harmless while it only coloured
a badge — **not** harmless once the ledger began writing that verdict down as a
permanent result. `lib/grade.js` is now the single grader and never guesses: an
unknown label, or a first-half market with no half-time score, comes back
ungraded and callers treat that as "not graded", never as a miss. The page
keeps its own copy (it is one standalone file) and `test/grade.test.js` holds
the two to the same answers and to `lib/model.js` wherever both will answer.
The ledger key moved to `sw.ft.v2`; v1 rows were dropped rather than trusted.

Unifying the graders also added `Over 1.5` to the graded set — published all
along but never measured, because `model.js` returned null for it. The headline
went **69% → 73%** with no change to the model, which is why the record now
reports **by market**: Double chance 69% (173/249), Over 1.5 85% (67/79), Match
result 60% (6/10). Markets called fewer than ten times are dimmed with their
count so a 6/10 does not read as evidence.

**`e2834ed` — the sweep.** See below.

---

## Supabase — phase 1 is live

Project **SoccerWizard.Com** (`utwtcvfliljydnhedpdw`), AWS **eu-west-2**, org
SoccerWizard, **free plan**. Schema in
[supabase-schema.sql](./supabase-schema.sql), spec in
[SUPABASE-PHASE-1.md](./SUPABASE-PHASE-1.md).

Verified working end to end on 28 Aug:

| | |
|---|---|
| `results` + `live_seen`, RLS on, **0 policies** | ✅ |
| Vercel env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SWEEP_KEY` | ✅ |
| GitHub secrets: `SWEEP_URL`, `SWEEP_KEY` | ✅ |
| Workflow run #1 → `HTTP 200 {"ok":true,"dry":false,…}` | ✅ |

Zero policies is the intended state, not an omission: RLS on with no policies
denies anon and authenticated outright, and the service-role key bypasses RLS.
**The browser never talks to Supabase** — clients never hold a key, egress does
not scale with traffic, and the CDN fast path is untouched.

Env vars only reach a deployment built **after** they were saved. If the sweep
reports `dry:true` when you did not ask for it, that means Supabase is not
visible to the function — redeploy.

### How the sweep works, and why

`api/record-sweep.js` records the final score of every fixture we published a
tip for, not just the ones a visitor happened to watch.

Neither feed reports a finished match — **both were checked**:

- the live feed carries only games in play (`HT`, `H1`, `H2`) and a match
  **vanishes** when it ends. There is no FT status.
- the fixtures feed carries odds and kick-off times, **no scores**.
- football-data publishes in batches days later, and has no cup football.

So a final score can only be caught by watching a match while it is on and
noticing when it goes — which needs memory between polls, which a serverless
function does not have. Hence `live_seen`: working memory, not a record.
Each call **observes** (writes current scores) then **finalises** (grades rows
that have gone and are old enough).

**The guard is the point.** A match that vanishes at 62 minutes vanished for
some other reason — a feed hiccup, a restart, an abandonment — and for a cup
tie nothing downstream will ever correct a wrong row. So a score is only taken
as final if the match was last seen **past the 80th minute**; anything else
expires unrecorded. A missing result is recoverable, a wrong one is not.
`held.notLate > 0` is that working, not failing.

That is also why the schedule is **every 10 minutes**, not thirty: the gap
between polls is the window a late goal hides in. Vercel Hobby allows one cron
run a day, so the schedule lives in GitHub Actions.

Check it any time:

```bash
curl -s -H "x-sweep-key: <SWEEP_KEY>" \
  https://skypredict-theta.vercel.app/api/record-sweep
```

### Why it recorded nothing for a week, and what fixed it

`results` was empty until 28 Aug evening. Three causes, found in this order:

1. **The schedule never fired.** The GitHub Actions workflow's entire history
   was one manual run. Actions were enabled and permissions open — GitHub's
   scheduler is best-effort and drops high-frequency crons. **Replaced by
   cron-job.org** (job 8344846, every 10 min, `x-sweep-key` header, response
   saving on). First run 28 Aug 18:30 WAT returned 200, `ok:true`, `dry:false`,
   both error fields null. The GH workflow stays as a fallback; the sweep is
   idempotent if both ever run.
2. **The cron window excluded the Americas.** `*/10 10-23 * * *` was the
   *European* football day. 66 of our 81 MLS / Liga MX / Brazil / Argentina
   fixtures kick off 22:00–10:00 UTC. Worse than missing them: the 23:50 poll
   saw them in the first half, the window shut, and by 10:00 they were gone and
   last seen at ~45' — below the 80th-minute bar, so each was discarded as
   "vanished mid-game". Now `*/10 * * * *`.
3. **A held row said nothing.** `held: {notLate: 2}` could only be explained by
   opening Postgres. The response now carries `heldWhy` — a line per held row
   with match, score, minute, status, ages and the rule that held it. It shows
   up directly in the cron-job execution history.

**A trap avoided, worth remembering:** seeing `notLate` the instinct is to lower
the 80-minute bar. That would have been wrong. Those rows were stuck because
*nothing was polling*, not because the rule is too strict — with a working cron
they'd have been seen at 85'. Loosening it would have started writing
half-finished scores into the one record meant to be trustworthy.

- **Name matching is only partly exercised.** Measured 28 Aug: of 3 fixtures
  actually in play, 1 paired, 1 was absent from the live feed entirely, and 1
  was a real normaliser miss (`Braunschweig` vs the feed's `Eintracht
  Braunschweig`). **Deliberately not fixed yet** — the sweep had just started
  working and a fuzzy matcher writes to the permanent record. Let a few nights
  of `observed` counts and `heldWhy` accumulate, then fix with evidence. Any
  fallback wants one-side-exact + unique candidate + kick-off agreement.
- The client ledger remains the **better** capture when someone is on the site:
  it polls every 30s, so it catches the true final score. The sweep records the
  last seen score, which is why it needs the 80th-minute guard. They fill the
  same table from two angles.

---

## Shipped 28 Aug (evening)

- **Clear was undoing itself.** `clearMy` emptied the slip then called
  `renderBuilder`, which syncs the builder's picks into `MYSLIP` on every
  render — refilling it in the same click. `BUILD.touched` arms that sync the
  moment the slider moves and was never lowered. Fixed with `BUILD_NOSYNC` plus
  lowering `touched`. Second cause, same complaint: the sheet's Clear left the
  builder preview and its total odds on screen, so closing the sheet looked
  like Clear had been ignored — both buttons now share `clearSlipState()`.
  Third: `.clear-btn:hover` paints it red and a phone leaves `:hover` on the
  last thing tapped, so it *stayed* red. Now behind `@media (hover:hover)`.
- **A page per match** — `lib/pages.js` + `writePages` in prebuild. 591 static
  pages, `robots.txt`, `sitemap.xml`, JSON-LD, `cleanUrls`. A fixture page
  becomes a result page at the same URL once played. Gitignored build output.
- **Results keep the model's numbers** so a page never goes thin once played.
  Free for build-graded results (predictTotals had just run); cup ties need the
  snapshot the sweep stores, hence `model jsonb` on `live_seen` and `results`
  (migration applied 28 Aug). The store drops the column and writes the row
  anyway if the migration has not run — losing a snapshot costs a page some
  numbers, losing the row costs a result nothing can recover. Stripped from
  `predictions.json` by `leanResults` (it added 70KB).
- **"Any winner" was a dead chip in wizard mode.** The chip sync renamed `wd`
  to the wizard's `doubles` and threw `any` away. Same keys both sides now.
- **The domain is one env var.** Set `SITE_ORIGIN` on Vercel and canonicals,
  sitemap, robots, social cards and the share-image canvas all follow.

---

## Still open

- **Submit the sitemap to Google Search Console.** The 591 pages exist and are
  crawlable; nothing has told Google they are there. Owner action — needs the
  owner's Google account. Highest-leverage remaining item for traffic.
- **Sweep name matching** — see the measured miss above. Evidence first.
- **Collapse slider + wizard onto one engine.** They are one builder with two
  ways of stating the goal ("how risky" vs "what payout"); everything else —
  fixture pool, league filter, home/away sanity, `h32`, goals lean, seed jitter
  — is written twice. `clearSlipState` was one symptom. Neither engine has a
  single test: write characterisation tests *first*.
- **Weight**: 207KB CSS + 287KB JS for one page, on Nigerian mobile data.
- **Booking errors** — now *diagnosable*, not fixed. `bookFetch` used to return
  a bare `{}` for everything, so a dead network, a 15s timeout against the
  sleeping Railway host and a flat refusal all printed the same thing. They now
  say which. Get a real user-facing message before changing anything.
- **Ticker vs live pills** — decided they layer rather than compete
  (`tickerEvents` only emits goal / red / HT / FT). Never delivered: the offered
  busy-slate simulation (~10 live games with goals, a red, an HT).
- **Rescoping the unscoped CSS group** (trap 3).
- **Supabase phase 2+**: share images and short links (`/s/<id>`) — the growth
  lever for a WhatsApp audience; then auth + slip sync; then push. Never gate
  the board: anonymous visitors keep getting instant predictions.
- **`fixtures_seen`** (server-side sticky day) and **`booking_codes`** from the
  phase 1 spec are specced but not built.

---

## Conventions

- Comments explain *why*, in prose, usually naming what broke before.
- `npm test` before pushing (node --test, 119 tests).
- Syntax-check the inline scripts after editing `public/index.html`:
  `node -e "const h=require('fs').readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;while((m=re.exec(h))){i++;try{new Function(m[1])}catch(e){console.log('#'+i,e.message)}}console.log('checked',i)"`
- Render the real board locally:
  `curl -s https://skypredict-theta.vercel.app/predictions.json -o public/predictions.json`
  (gitignored), serve `public/` with `python -m http.server 8899`, delete after.
- Restoring an old design: pull it from git rather than redrawing —
  `git log -S'<selector>' -- public/index.html`, then
  `git show <sha>^:public/index.html`.
- Secrets are the owner's to paste. A service-role key bypasses RLS and is a
  write handle on the record; it does not belong in a transcript.
