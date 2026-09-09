# Soccerwizard — read this first

This file is loaded automatically whenever Claude Code runs with this directory
in scope. It exists because session memory is keyed to the directory Claude was
started in: notes written from `C:\Users\DELL` are invisible to a session
started anywhere else, which is how the same ground gets re-covered. Anything
that must survive a session goes in the repo, here or in the files named below,
not in memory.

**Start sessions from this directory**: `cd C:\Users\DELL\Desktop\Skypredict`
then `claude`.

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
| History and incident write-ups | `HANDOFF.md` — **history only, its state lines are stale** |
| Plans and specs | `docs/plans/`, `docs/specs/` |

## Rules learned the hard way

- **Verify a fix by reading the code that changed**, not by grepping the file —
  the same words appear in guards that were never the bug.
- **A plain `npm run build` is safe**; only `VERCEL`/`SPLIT=1` rewrites
  `public/index.html`. It does regenerate `public/og-card.png` and
  `public/predictions.json` — revert those before committing unless the data
  change is the point.
- **An author `display` beats `[hidden]`**, so any element JS hides with
  `.hidden = true` needs its own `[hidden]{display:none}` rule.
- **After moving a CSS block, check brace balance** — CSS recovers from a stray
  `}` in silence.
- **Phone layout needs the user's eyes.** Claude's browser pins the viewport;
  a 390px iframe measures boxes honestly but is not a phone.
- **Don't build before committing** and don't trust a stopwatch for a deploy —
  read the deployment's own commit and timestamp.
- The reader's day is **Lagos, UTC+1**. `f.date` is a UTC date; the two differ
  for any kickoff from 23:00Z on. `LAGOS_OFFSET_MS` lives in `lib/quota.js`.
