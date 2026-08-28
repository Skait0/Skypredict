# Resume session — Skypredict / Soccerwizard

Last updated 2026-08-28. Repo: `C:\Users\DELL\Desktop\skypredict`
Live: https://skypredict-theta.vercel.app · remote `main` @ `7d0b237`
Tests: `npm test` → **89/89**.

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

### Not yet exercised on real data

Both tables were still empty at the end of the session, because the only live
football at 02:00 was South American and we publish no tips for those leagues —
`observed: 0` was correct, not a fault.

- **Name matching is untested against our actual leagues.** The sweep pairs the
  live feed to fixtures with `M.normName`. If `observed` stays 0 while European
  games are live, look there, not at the plumbing.
- The client ledger remains the **better** capture when someone is on the site:
  it polls every 30s, so it catches the true final score. The sweep records the
  last seen score, which is why it needs the 80th-minute guard. They fill the
  same table from two angles.

---

## Still open

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
- `npm test` before pushing (node --test, 89 tests).
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
