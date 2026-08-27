# Resume session — Skypredict / Soccerwizard

Written 2026-08-27. Repo: `C:\Users\DELL\Desktop\skypredict`
Live: https://skypredict-theta.vercel.app · remote `main` @ `acd14a1`

## How to pick this up in PowerShell

The Claude session ran with **cwd `C:\Users\DELL`** (not the repo), so:

```powershell
cd C:\Users\DELL; claude --continue
```

`--continue` resumes the most recent session **for that directory** — running it
from inside the repo will not find this one. Use `claude --resume` to pick from
a list if `--continue` lands on the wrong session.

---

## Verifying a deploy (read this before saying "not live")

`scripts/prebuild.js` extracts the big inline `<style>` and `<script>` out of
`public/index.html` into content-hashed `/app.<hash>.css` and `/app.<hash>.js`
at build time. **Grepping the deployed `index.html` for a CSS rule or JS comment
always misses** — only HTML (ids, markup) stays behind. This cost ~40 minutes of
false "deploy is stuck" alarms in this session.

```powershell
$U="https://skypredict-theta.vercel.app"
$H=(Invoke-WebRequest "$U/?raw=$(Get-Random)").Content
$css=[regex]::Match($H,'/app\.[0-9a-f]+\.css').Value
(Invoke-WebRequest "$U$css").Content -match 'your-marker'
```

Per-deployment URLs (`soccerwizard-<hash>-skypredict.vercel.app`) sit behind
Vercel SSO and 302 to a login — they cannot be read from the CLI. Use the
production domain.

Also: `npm run build` outside Vercel **rewrites `public/index.html` in place**.
If that happens: `git checkout public/index.html`. Leave building to Vercel.

---

## Shipped this session (all live at `acd14a1`)

| Commit | Change |
|---|---|
| `c71de4a` | Time-of-day buckets only bite on a single fixture day |
| `8bc81e3` | "Today only" is a day-picker dropdown (Tomorrow / day after / …) |
| `c3029db` | Day-pill count repaints when fixtures load |
| `294ea27` | Tighter "in Xm" countdown pill; centred POTD score dash |
| `91fba41` | Live-row dots solid; pulse reserved for POTD |
| `acd14a1` | ★ Pick tag on the POTD's board row |

Tests: `npm test` → 65/65 passing.

---

## OPEN — 8 items raised, none started

### 1. "Copy" button on the SportyBet code changes shape and snaps back
`public/index.html:5645` — on click it sets `this.textContent="Copied"` then
restores it. There is a comment at **:2033** saying the button was given a fixed
width for exactly this reason, so the reserved width is either not applied to
this button or is being beaten by another rule. Check the `.code-copy` (or
equivalent) rule near :2033 against the element at :5645.

### 2. EFL Cup vanished from today's predictions after the game finished
**Wanted:** keep every prediction for the day until the last predicted game of
that day has finished.

The front end is probably not the culprit: `onDay()` (**:3931**) deliberately
keeps every fixture for the day including finished ones, and `shown()`
(**:4021**) only applies country/league/category/search filters. `lib/build.js`
**:493-495** keeps fixtures by UTC *date*, not by kickoff, so it should keep them
too.

**Prime suspect:** the fixture *source*. `lib/build.js:398` notes SportyBet is
pulled because it "pulls today's games earlier than football-data". If a fixture
only ever existed in the SportyBet feed and that feed drops games once they
finish, the fixture disappears from the payload on the next rebuild (~6h /
deploy). Confirm by diffing a fixture list before/after a game ends, then either
merge-preserve fixtures already seen for the current day, or source that league
from football-data as well.

### 3. POTD live pill has low contrast
`public/index.html:4297` builds `<span class='potd-status potd-live'>` with a
`.ld` dot; styles at **:245-253**. It is currently white-on-red inside an
already-red header. **Wanted:** white pill with a red blinking dot (invert it).
Note `.potd-status.potd-live .ld` (**:251**) is the one animated pulse we kept —
keep it animated, just recolour to red on a white pill.

### 4. New users get errors when clicking to book a bet
Booking paths: `doBook` **:5570**, `doBookList` **:5838**, `doBookMy` **:7070**;
`bookFetch` **:4919** (3 retries + 15s timeout against `BOOK_URL`, a Railway
app). Error surfaces are the `.code-err` blocks and the toast at **:8147**.
Worth checking whether this is (a) the Railway endpoint cold-starting / being
flaky, (b) fixtures with no `eventId` (the "None of these are on SportyBet"
path), or (c) something specific to a first-time visitor (empty slip, no
`sw.myslip`, no matched SportyBet events yet because `loadSporty()` has not run).
**Needs a real error message from an affected user** — the current copy does not
distinguish these cases.

### 5. On "Tomorrow", show that day's POTD
`renderPotd()` **:4249-4254** deliberately pins to today:
`allOnDay(0).length ? allOnDay(0) : allOnDay(V.off)` — the comment explains it
should hold today's pick even after the board moves on. **Wanted:** follow the
selected day instead. Careful: the pick is locked per date in localStorage
(`sw.potd.<date>`, **:4256-4270**) and `prunePotdKeys(dateStr)` deletes every key
except the one for the date just rendered — following `V.off` means it will
prune the *other* day's lock on every switch. Fix `prunePotdKeys` to keep the
keys for the days in view, or key the lock differently.
`POTD_ID` (**:4249**, set at **:4271**) drives the new ★ tag and will follow
automatically.

### 6. No "clear slip" in **Your slips** on web
There is a clear for the *my slip* sheet (`clearMy` **:6703**, wired at
**:7249** to `myClearBtn`), but `renderSlipsSheet()` (**:3769**) has no
equivalent. Add one there. Note that a saved/booked slip is a different store
from `MYSLIP` — check what `renderSlipsSheet` reads before wiring a clear.

### 7. Floating "My slip" FAB — keep it floating; what does it hide?
`#myFab` markup **:3488**, `renderFab()` **:6701** (hidden when `MYSLIP` is
empty), draggable via `makeFab("myFab","sw.fabpos", …)` **:7246**, with a
hide-on-something handler around **:6723**. In this session's screenshots the FAB
sat over the bottom-left of the board and covered a list row's team name.
**Wanted:** it stays floating (do not dock it), but establish what it overlaps on
the home page and give the page bottom padding / shift the default rest position
so it never covers content.

### 8. Live ticker + live pills — noise check (open question, no action yet)
Decided this session: they are **not** duplicate scoreboards. `tickerEvents()`
**:6581** only emits goal / red card / half-time / full-time, so a game quietly
in play never enters the ticker; the board pills carry the running score.
Ticker only scrolls above 2 items (**:6640**). If it ever feels heavy on a real
Saturday, the lever is capping items (~6) and slowing `animationDuration`
(**:6643**) — not removing either surface.
**Never delivered:** the offered busy-slate simulation (≈10 live games with
goals / a red / HT) to eyeball ticker + board together.

---

## Conventions worth keeping

- Comments explain *why*, in prose, often noting what broke before. Match that.
- `npm test` (node --test, 65 tests) before pushing.
- Syntax-check the inline scripts after editing `public/index.html`:
  `node -e "const h=require('fs').readFileSync('public/index.html','utf8');const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;while((m=re.exec(h))){i++;try{new Function(m[1])}catch(e){console.log('#'+i,e.message)}}console.log('checked',i)"`
- To render the real board locally: fetch prod's payload into
  `public/predictions.json` (gitignored), serve `public/` with
  `python -m http.server 8899`, then delete the payload afterwards.
