# Soccerwizard - read this first

This file is loaded automatically whenever Claude Code runs with this directory
in scope. It exists because session memory is keyed to the directory Claude was
started in: notes written from `C:\Users\DELL` are invisible to a session
started anywhere else, which is how the same ground gets re-covered. Anything
that must survive a session goes in the repo, here or in the files named below,
not in memory.

**Start sessions from this directory**: `cd C:\Users\DELL\Desktop\Skypredict`
then `claude`.

**Two standing rules from the owner (24 Sep 2026):**
1. **Query graphify first.** Every question about this codebase starts with
   `graphify query "<question>"` (or `path` / `explain`), before grep or Read.
2. **Every save-session updates the `prediction-site` skill** (in
   `~/.claude/skills/prediction-site`) with what the session learned, and
   refreshes the graph: `node scripts/graphify-inline.js`, then
   `graphify update .`.
3. **(25 Sep 2026) Every issue to fix starts with graphify AND memory.** Grep
   `~/.claude/projects/C--Users-DELL/memory/` for the symptom and its likely
   cause, and query graphify, before reading or editing code - "chances are,
   we have done it before." Say in the reply what each turned up.

## What this is

Football predictions and free bookmaker booking codes. One static page
(`public/index.html`, source and build input both), a Node build
(`scripts/prebuild.js` + `lib/`) that bakes `public/predictions.json`, the match
pages and the sitemap, and a small API on Railway
(`C:\Users\DELL\Documents\soccerwizard-api`) that talks to SportyBet and
Bet9ja.

- Live: https://www.soccerwizard.live (www is canonical, Cloudflare in front)
- Deploy: push to `main`, Vercel builds prod in ~30s. Nothing else deploys.
- Tests: `npm test` (node:test, no framework). Build: `npm run build`.

## Where state is written

| What | Where |
|---|---|
| Current state and open items | newest `session-handoff-*.md` in `~/.claude/projects/C--Users-DELL/memory/` |
| Long-lived project facts | the other `*.md` in that same memory directory |
| History and incident write-ups | `HANDOFF.md` - **history only, its state lines are stale** |
| Plans and specs | `docs/plans/`, `docs/specs/` |
| Palette, type, components, motion | `DESIGN.md` - **read it before changing anything a reader sees** |

## Rules learned the hard way

- **Verify a fix by reading the code that changed**, not by grepping the file - the same words appear in guards that were never the bug.
- **graphify cannot read `public/index.html`** - it classes `.html` as prose, so
  the biggest file in the repo contributed zero of 2,003 nodes and a graph miss
  proved nothing. Run `node scripts/graphify-inline.js` before
  `graphify update .`: it copies the inline script to an untracked
  `graphify-src/index.inline.js`, newline-padded so graph line numbers still
  point at `index.html` (508 callables, 507 landing on the right line). Never
  gitignore that file - graphify skips everything git ignores, `.gitignore`,
  `.graphifyignore` and `.git/info/exclude` alike.
- **A plain `npm run build` is safe**; only `VERCEL`/`SPLIT=1` rewrites
  `public/index.html`. It does regenerate `public/og-card.png` and
  `public/predictions.json` - revert those before committing unless the data
  change is the point.
- **An author `display` beats `[hidden]`**, so any element JS hides with
  `.hidden = true` needs its own `[hidden]{display:none}` rule.
- **Adding a bookmaker is a checklist, not a project** - it is section 4 of the
  `prediction-site` skill, seventeen steps including the seven allowlists, the
  market lists (`BOOK_ONLY`, the style chips), the daily code, the canary and
  the brand sampling. Four books in, nothing there is optional.
- **Two feeds can name one club two ways and publish a match that never
  happened.** Fix the pair with an alias in `TEAM_ALIAS_SRC`, never by
  tightening the tail rule (measured: a tighter rule loses Excelsior Rotterdam
  and Fluminense FC RJ). `slotClash` in lib/build.js is the net under it: one
  club, one kick-off.
- **After moving a CSS block, check brace balance** - CSS recovers from a stray
  `}` in silence.
- **Phone layout needs the user's eyes.** Claude's browser pins the viewport;
  a 390px iframe measures boxes honestly but is not a phone.
- **Don't build before committing** and don't trust a stopwatch for a deploy - read the deployment's own commit and timestamp.
- The reader's day is **Lagos, UTC+1**. `f.date` is a UTC date; the two differ
  for any kickoff from 23:00Z on. `LAGOS_OFFSET_MS` lives in `lib/quota.js`.
- **A static file with no rule in `vercel.json` is served
  `max-age=0, must-revalidate`** - it is re-fetched on every visit. The intro
  videos now have a 30-day rule, and their names are NOT hashed: replacing one
  needs a new filename or a Cloudflare purge, or readers keep the old clip for
  up to a month.
