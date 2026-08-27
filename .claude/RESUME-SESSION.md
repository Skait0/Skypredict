# Resume session — Skypredict / Soccerwizard

Last updated 2026-08-28. Repo: `C:\Users\DELL\Desktop\skypredict`
Live: https://skypredict-theta.vercel.app · remote `main` @ `85bb31f`
Everything below `c800911` shipped in the 27–28 Aug session and is deployed.

## How to pick this up in PowerShell

The Claude session ran with **cwd `C:\Users\DELL`** (not the repo), so:

```powershell
cd C:\Users\DELL; claude --continue
```

`--continue` resumes the most recent session **for that directory** — running it
from inside the repo will not find this one. `claude --resume` gives a picker.

---

## Two traps that cost real time — read before debugging

### 1. Verifying a deploy

`scripts/prebuild.js` extracts the big inline `<style>` and `<script>` out of
`public/index.html` into content-hashed `/app.<hash>.css` and `/app.<hash>.js`.
**Grepping the deployed `index.html` for a CSS rule or JS comment always
misses** — only HTML (ids, markup) stays behind. This produced ~40 minutes of
false "the deploy is stuck" alarms and a wild goose chase through the Vercel
dashboard. Deploys have been landing in ~45s all along.

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

`npm run build` outside Vercel **rewrites `public/index.html` in place**. If it
happens: `git checkout public/index.html`. Leave building to Vercel.

### 2. A CSS group that is not in the media query it looks like it is in

The rules from roughly **line 3026 to 3091** (`#bookResult`, `.code-card`,
`.code-acts`, `.note`, `footer`, …) sit **outside** the `@media(max-width:560px)`
block that appears to contain it — the block closes above them. So those
"phone" rules apply at **every** width and outrank the base rules further up.

Verified in the browser: `matchMedia('(max-width:560px)').matches === false` at
1920px while those rules were still winning.

This bit twice in one session — the copy button's reserved width and the
footer's bottom padding. When a style "isn't applying", check whether something
in that group is overriding it before touching the rule you were looking at.
Rescoping the group is worth doing deliberately, on its own, with a visual pass;
it is not a drive-by fix.

Related: watch specificity on single classes. `.code-acts button` (0-1-1) beats
`.code-copy` (0-1-0); `.tod-seg`-style rules earlier in the file lose to later
ties. Several bugs this session were exactly this.

---

## Shipped 27–28 Aug

| Commit | Change |
|---|---|
| `c71de4a` | Time-of-day buckets only apply to a single fixture day |
| `8bc81e3` | "Today only" is a day picker (Tomorrow / day after / …) with live counts |
| `c3029db` | Day-pill count repaints when fixtures load |
| `294ea27` | Countdown pill tightened; POTD score dash centred |
| `91fba41` | Live-row dots solid; the one pulse kept for POTD |
| `acd14a1` | ★ Pick tag on the POTD's board row |
| `bac4765` | Sticky day, POTD follows the day, booking errors say what failed, copy-button width, POTD live pill contrast, slips clear, FAB fade |
| `f708283` | Full-time ledger — records FT scores from the live feed |
| `85bb31f` | "Add all N tips" restored to the crimson pill |

Tests: `npm test` → **65/65**.

### Worth knowing about two of them

**Sticky day** (`holdTheDay`, `mergeStickyDay`, `sw.day.<date>`) — the SportyBet
feed supplies most of the card and drops a match once it has been played, so a
game could vanish from today's board mid-evening. The client keeps its own copy
of today's fixtures and restores whatever a newer payload lost.

**Full-time ledger** (`recordFinishedFixtures`, `mergeFTLog`, `sw.ft.v1`) — the
results feed runs days behind (on 28 Aug the newest graded result in the payload
was 25 Aug, which is why walking back stopped at Tuesday), and `lib/build.js:636`
only grades leagues the model was fitted on, so cup ties are never graded at all.
When a predicted game reaches FT, its tip is graded against the live score and
kept for 21 days, merged *underneath* the server's results. Guard: only after
`MATCH_LEN_MS` since kickoff, because `fetchLive` forces `status:"FT"` on a match
that merely dropped out of the feed.

**Its limitation is the bridge to the Supabase work below: it is per-browser.**

---

## Next up — Supabase, phase 1 (agreed direction, not started)

Full reasoning is in the session; the short version:

**Do not move the board's reads into Supabase.** `predictions.json` is baked at
deploy and served from the CDN with no serverless invocation — that is what lets
the site take a crowd. Replacing that with a DB query per visitor makes the site
slower (~150–250ms from Lagos to the nearest region) and turns a flat cost into a
per-visit one. Supabase is for what cannot be done today, not for what already
works.

**Phase 1 is public, read-only, and needs no auth** — which is the point: learn
the setup where a mistake cannot leak anything.

1. **`results` table** — the FT ledger, shared. Closes the Tuesday gap for every
   visitor rather than per-browser, grades cup ties the build structurally
   cannot, and makes the "69% of tips landed" claim permanently auditable
   instead of recomputed each build. That last one is a credibility asset for a
   predictions site, not a nice-to-have.
2. **`fixtures` table** — server-side sticky day, so a dropped fixture stays on
   the board for first-time visitors too.
3. **Booking-code cache** — dedupe identical slips, cut load on the Railway
   service that is already cold-start-prone.

Then, in order: share images + short links (`/s/<id>`) — the growth lever for a
WhatsApp-spread audience; auth + slip sync; push notifications.

**What moves, what stays**

| Today | Goes | Why |
|---|---|---|
| `sw.ft.v1` | Supabase, public | Shared results, auditable record |
| `sw.day.<date>` | Supabase, public | Fixes vanishing fixtures for everyone |
| booking codes | Supabase, public | Cache, less Railway load |
| `sw.slips.v1` | Supabase, per-user | What users lose on a cache clear (`SLIPS_KEEP=60`) |
| `sw.myslip` | Supabase, per-user | Cross-device |
| `sw.livefav` | Supabase, per-user | Enables push |
| `sw.risk`, `sw.mode`, `sw.scope`, `sw.sday`, `sw.tod`, `sw.filters`, `sw.view`, `sw.viewtab`, `sw.fabpos`, `sw.theme`, `sw.toponly`, `sw.wspodds`, `sw.coached.*`, `sw.streak` | **Stay local** | Device preferences. A round trip to learn which filter tab was open is latency for nothing |

**Risks**: the free tier pauses a project after ~1 week of inactivity — budget
Pro ($25/mo) for a site that must be up. RLS is the only thing protecting user
rows once auth exists; the anon key is public by design. For auth, Google OAuth
over SMS OTP (per-message cost) or email (mobile friction). **Never gate the
board** — anonymous visitors keep getting instant predictions; login is an
upgrade offered after someone has a slip worth keeping.

---

## Still open

- **Booking errors** (`bookErrHTML`, `bookFetch`) — now *diagnosable* rather than
  fixed. Every failure used to return a bare `{}`, so a dead network, a 15s
  timeout against the sleeping Railway host and a flat refusal all printed the
  same thing. They now say which. If users still report trouble, the message
  they see names the cause — get that before changing anything.
- **Ticker vs live pills** — decided they layer rather than compete
  (`tickerEvents` only emits goal / red / HT / FT, so a game quietly in play
  never enters the ticker). Never delivered: the offered busy-slate simulation
  (~10 live games with goals, a red, an HT) to eyeball it on a real Saturday.
  If it ever does feel heavy, cap the ticker (~6 items) and slow
  `animationDuration` — do not remove either surface.
- **Rescoping the unscoped CSS group** (trap 2 above).

---

## Conventions

- Comments explain *why*, in prose, usually naming what broke before. Match that.
- `npm test` before pushing (node --test, 65 tests).
- Syntax-check the inline scripts after editing `public/index.html`:
  `node -e "const h=require('fs').readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;while((m=re.exec(h))){i++;try{new Function(m[1])}catch(e){console.log('#'+i,e.message)}}console.log('checked',i)"`
- To render the real board locally: `curl -s https://skypredict-theta.vercel.app/predictions.json -o public/predictions.json`
  (gitignored), serve `public/` with `python -m http.server 8899`, delete it after.
- Restoring an old design: pull it out of git rather than redrawing it —
  `git log -S'<selector>' -- public/index.html`, then `git show <sha>^:public/index.html`.
