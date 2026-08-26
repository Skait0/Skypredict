# Skypredict — Session Handoff (updated 2026-08-26)

## Deployed state
- **Live URL:** https://skypredict-theta.vercel.app
- **Deploy model:** push to `main` → Vercel GitHub integration → prod (~30s)
- **Repo:** https://github.com/Skait0/Skypredict.git — local `main` synced with origin
- **Working tree:** clean
- **HEAD:** `697a7f8` "Form strips move with the live feed"

## This session (2026-08-26)
Shipped **live form strips** — the last-5 W/D/L chips now move as matches play.

| Commit | What |
|--------|------|
| `1dfd0bc` | `lib/build.js`: populate `form_home` / `form_away` (last 5 results per team, most recent first, keyed by the canonical index name) |
| `697a7f8` | `public/index.html`: overlay the live feed onto the baked form strips |

Why it was two commits: the UI had been reading `f.form_home` / `f.form_away` in
four places for a while, but **nothing ever populated them** — the strips were
silently always empty. `1dfd0bc` was found sitting uncommitted in the working
tree and finishes the backend half; `697a7f8` is the new live behaviour.

How the overlay works (`formHTML` / `formChips` / `liveFormFor` / `refreshFormStrips`):
- baked form is a nightly snapshot, so a game played *today* is invisible to it
- while a team is in play → prepend a **provisional** chip (`.form i.prov`:
  ringed + breathing, `prefers-reduced-motion` aware); oldest of the five drops
- feed reports FT → ring drops, it becomes a normal settled chip
- **matching bar is deliberately high**: overlay matches on team name alone, so
  it requires `simTeams >= 1.8` (exact-or-substring only). Looser thresholds
  eventually pin one club's result onto another club's form. A missing chip is
  much cheaper than a wrong one — do not lower this without a very good reason.
- the 30s poll calls `refreshFormStrips()`, which rewrites **only** the chips via
  `data-ft` (team) / `data-fs` (baked form) attributes. It deliberately does not
  call `render()` — that would collapse any expanded fixture card mid-read.

Not done on purpose: the POTD prose reason ("have won 3 of their last 5",
~line 2611) still uses baked form only. Folding a half-played match into that
sentence reads as confusing rather than live.

## Recent history before this session (~35 commits, grouped)
The previous handoff was stale — it named `fce0337` as HEAD when ~35 commits had
already landed on top. Themes since then:
- **Pick of the Day** (`9c813db`, `6847c88`): one game locked per fixture day (no
  re-ranking on odds-blend or kickoff); mirrors the live score while playing,
  celebrates wins only, **never labels a loss** (tip stays as-is)
- **Home CTA / wizard banner** (~12 commits, `ddc8fe2`…`330dd3c`): amethyst/gold
  banner, both builder paths shown equally (Conjure / slider), mobile column
  stacking, and several rounds of CTA-orb art (now a violet crystal-ball sphere)
- **Headline tip markets** (`274dc0f`, `b117294`, `6bfcc4b`): main page shows
  safest bets only (1X2 + double chance); goals/BTTS/combos are builder-only
- **Booking** (`8828f50`, `43e1193`): compact green-glass modal; booking prefers
  real-odds markets and auto-retries on a SportyBet "no market" rejection
- **Sentry DSN corrected** (`6d89780`) — now points at the project actually
  visible in the owner's Issues tab

## Key architecture notes
- Single-file SPA: `public/index.html` (~5000 lines, all UI+logic)
- Backend: `lib/build.js` (nightly build, Vercel cron `30 6 * * *` UTC) +
  `lib/model.js` (Dixon-Coles)
- API: `/api/predictions` (6h CDN cache + 1h server memo), served by `api/predictions.js`
- Live scores: `LIVE_URL` → Railway `/api/livescores`, polled every 30s by
  `fetchLive()`. `LIVE.store` keeps a finished game ~10 min after it leaves the
  feed, restamped `status="FT"`.
- Feeds: football-data CSVs (leagues only), SportyBet fixtures (**no competition
  field**), SportyBet livescores (has league, no eventId)
- Service worker `sw-v5`: network-first for page, cache-first assets
- Companion repo: `C:\Users\DELL\Documents\soccerwizard-api` (the Railway API)

## Sound toggle history (READ THIS — do not re-add without asking)
The bell was rebuilt 3× (per-element onclick → document delegation → debounced
direct listener). Owner still saw it stuck "Sound off" and asked for **complete
removal** (`fce0337`). Still removed as of this session: call sites remain at
lines ~3645/4476/4917 but `window.__wizChime` and `window.__wireAlert` are empty
functions (~4927-4928) so nothing throws. If the owner ever wants it back, treat
it as a fresh feature, not a revert — the root cause on their device was never
confirmed (the double-fire theory was unproven; their browser/device is unknown).

## Open / deferred items
- **EFL/Cup exact competition names**: currently "England Cup" style labels. Real
  name upgrade depends on football-data `Latest_Results.csv` carrying cup
  results — it mostly does NOT (league-only). Proper fix needs an upstream feed change.
- **Sentry**: ENABLED, browser DSN inline in `public/index.html` (~line 33,
  `SW_SENTRY_DSN`). Errors-only, origin-scoped, SRI-pinned CDN, fails silent if
  blocked, honors `?nosentry`. Test: `Sentry.captureException(new Error("x"))`.
- **Push notifications**: permission banner exists (`renderNotif`/`wireNotif`);
  goal notifications fire for followed matches. Daily-slip reminder not built.
- **No automated test for the form overlay**: it was verified by driving the real
  `index.html` function sources against a stubbed feed (11 cases: in-play W/D/L,
  settling at FT, empty baked form, null scores, alias matching, and the negative
  case that an unrelated club stays untouched). That harness lived in scratch and
  was not kept. `test/matching.test.js` does **not** cover it.
- **Debug flag**: `?debug=1` or `#debug` enables verbose `[sporty]` match logs.

## Verify commands
```bash
cd /c/Users/DELL/Desktop/Skypredict
git log --oneline -3          # 697a7f8 should be HEAD
node --test                   # 6 matching tests pass
node --check lib/build.js
```
Syntax-checking the inline scripts (there are 4 `<script>` blocks). Writes into
`tmp/_check/`, which is gitignored so this never dirties the tree:
```bash
mkdir -p tmp/_check
python -c "
import re,io
src=io.open('public/index.html',encoding='utf-8').read()
for i,b in enumerate(re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',src,re.S)):
    io.open('tmp/_check/blk%d.js'%i,'w',encoding='utf-8').write(b)
"
for f in tmp/_check/blk*.js; do node --check "$f" || echo "FAIL $f"; done
```

## Gotchas
- `/tmp` in Git Bash ≠ Windows Python's `/tmp` — write temp files into repo
  `tmp/_check/` (gitignored). Note `tmp/blk0.js` / `tmp/blk1.js` are *tracked*
  leftovers from an earlier session; don't write over them.
- The predictions API memo-caches 1h server-side; use `?refresh=1` (cron does) or
  wait out the CDN `s-maxage=21600`
- `git` warns "LF will be replaced by CRLF" on most writes here — harmless
- `lib/build.js` refuses to build on `< 400` downloaded results (guard against a
  half-empty feed silently shipping bad predictions)
