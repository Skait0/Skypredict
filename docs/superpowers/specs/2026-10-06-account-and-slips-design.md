# Account menu, avatars and My slips: design

Date: 6 Oct 2026. Status: approved mockups, spec for review.
Mockups (the visual source of truth for this spec):
- `docs/design/account-slips/01-slips.html` (Home slips strip, Recent rows, My slips sheet)
- `docs/design/account-slips/02-account.html` (top bar, account menu, Profile, Settings)
- Avatar art: `docs/design/account-slips/av/*.webp` (14 portraits, 192px)

## Why

The owner's list (6 Oct 2026): the account button placement is odd, initials
should be a changeable avatar, the account sheet is chunky and opens from the
wrong place, nobody downloads their data, the menu should hold Profile and
Settings with subscription and usage, theme belongs in Settings, and My slips
needs a summary, top actions, swipe-to-delete with Undo, Clear all, and "Lost"
not "Cut". Skins per plan come later.

## Owner rulings (binding)

1. The avatar sits top-right and replaces the initial. It opens the account
   menu from the top-right.
2. **The avatar never shows twice on one screen.** Top bar is its one home. The
   menu header has no avatar; Profile shows it only as the ringed tile in the
   picker; sheets carry no avatar of their own.
3. The menu holds Profile, My slips, Settings and Sign out, plus the plan and
   today's codes.
4. Theme lives only in Settings. The header theme toggle goes.
5. No "Download my data" anywhere in the UI. (The `/api/account/export` route
   stays; it is harmless and answers a legal request if one ever comes.)
6. The plan section is called **Subscription** and shows the plan plus today's
   code usage. Pricing is not final: show "Free plan" and "More plans soon".
7. No search icon in the top bar.
8. "Lost", never "Cut".
9. Every visible string follows DESIGN.md: one font (Plus Jakarta Sans),
   sentence case, no em dashes, 12px cards, 99px pills, gold for codes and odds,
   bookmakers in their own wordmarks.

## Scope

### A. Top bar
- Signed in: a 36px round avatar (the chosen portrait, `object-fit:cover`,
  1.5px `--accent-rim` ring). Signed out: today's person icon, unchanged
  behaviour (goes to /login).
- The theme toggle `#tgl` is removed from the header. The early theme script
  (`sw.theme` in `<head>`) stays; Settings writes the same key.
- The wordmark never truncates (shipped 6 Oct in `a479a24`'s parent).

### B. Account menu (popover, replaces `#acctSheet`)
- 268px wide, anchored under the avatar, grows from the avatar's corner
  (transform-origin top-right, 200ms ease-out, scale .92 to 1), scrim behind.
  Escape, scrim tap or a second avatar tap closes it. Focus moves to the first
  item on open and back to the avatar on close.
- Header: display name (bold), email (faint), "Free plan" (gold, 12px).
- Today's codes: one flat line "Codes today ... 3 of 10" with a 4px gold bar.
  Hidden when the count is unknown (see E).
- Items: Profile, My slips (count of saved slips on the right), Settings, then
  a divider and Sign out.

### C. Profile view (full-height sheet with Back)
- "Name on your slips" text field, max 24 chars, saved as pref `name`. Default
  is the first name derived from the email (same rule as `spell.js`
  `firstName`).
- Avatar: one row of the 6 free portraits; the chosen one is ringed in gold.
  Below it, heading "Skins" + faint "Unlock with plans", a 4x2 grid of the 8
  locked portraits, dimmed with a lock, not selectable.
- Your record: one card. Big green number of slips won, "slips won / of N
  settled, P%" beside it, and "24 saved" on the right. Uses `myRecord()`.
- Subscription: card with "Free plan", "Every feature, 10 codes a day", "More
  plans soon", and the same Codes today line + bar + "Resets at midnight".

Free: fire, 8bit, 2bit, lino, glass, halo. Locked: storm, lich, gold, holo,
graffiti, afro, lowpoly, clay. Default avatar for a new account: fire.

### D. Settings view (full-height sheet with Back)
Groups, each a 12px card with a sentence-case heading:
- Appearance: Theme segmented control Dark / Light. Calls the existing
  `setTheme(t)` (writes `sw.theme`, swaps `theme-color`). No "Auto": the site
  is dark by design whatever the phone says (comment at index.html head
  script), so Auto would contradict a standing brand decision.
- Booking: Default bookmaker, the five wordmark pills; the chosen one has a
  gold ring. Calls the existing `setBook(key)`.
- Notifications: "Picks by email" switch backed by the existing
  `/api/account/consent` GET/POST.
- Account: "Signed-in devices" row with the count ("This phone and 1 other"),
  opening the existing device list (`/api/auth/devices`, end via
  `/api/auth/devices/end`).
- Sign out (pill button, existing `/api/auth/logout`), then a small red
  "Delete account" link that reveals the existing typed-DELETE confirmation
  and reauth flow.
- Not built: the "Slip results" switch from the mockup. There is no
  account-linked push yet; a switch that does nothing would be a lie. It comes
  with account push.

### E. Today's codes (usage)
The free limit is per device and enforced in `lib/bookproxy.js`, which already
sends `X-Sw-Quota-Remaining` after a counted booking. It will also send
`X-Sw-Quota-Limit`. The page stores `{day, left, limit}` under `sw.quota`
where `day` is the Lagos date. Shown as "used of limit" = `limit-left` of
`limit`. Before any booking today, or when the server sent nothing (limit off
or counter down), the line is hidden; never a guessed number.

### F. Home: Your slips strip + Recent rows (replaces the `#myres` card)
- One 12px card: "Your slips" + faint "N saved" + "See all >" (opens My
  slips). Under it three equal pills: running (gold, with a pulsing dot only
  while something runs), lost (red), won (green); number first, coloured.
  Tapping a pill opens My slips filtered to it.
- Under the card: heading "Recent" and a faint "Clear all" on the right, then
  one row per saved slip (newest first, at most 5): status dot, booking code
  (tabular, 0.06em), "<wordmark>, N games, <when>", total odds in gold.
- Rows swipe left to delete (see H). The first row nudges 58px left once per
  page load as a hint (not under reduced motion).
- Empty: the strip and rows are not drawn at all (first-time visitors see the
  page as today).

### G. My slips sheet
- Title "My slips". No avatar.
- Filter pills: All, Running, Lost, Won, each with its count; red fill when on.
- A line "N slips" with "Clear all" on the right.
- Cards (12px): status pill (Running / Lost / Won, uppercase .09em is allowed
  here by DESIGN.md as a label), wordmark + when, total odds in gold. Then an
  action row: **Share** (red pill, flexes), **Safer** (gold pill, only when
  running and the book is known, same link as today), **Rebuild**, and a round
  **...** menu (Delete, Share your win when won). Then the code box (gold code,
  Copy pill). Then "2 landed, 1 lost, 5 to play" with one 4px segment per leg.
  Then the legs (collapsed except the newest) and a full-width "Show N games"
  bar.
- Share uses `navigator.share` through the existing helpers: `shareCode(code,
  legs, BOOKS[book])` when the slip has a code, else `shareSlip(legs, odds)`.
- Cards swipe left to delete (H).

### H. Delete, Clear all and Undo (shared)
- Swipe: the row follows the finger 1:1 (horizontal lock after 6px), a red bin
  grows; past 45% of the width it arms (deep red, 12ms vibrate); release armed
  or a fast flick (>1.1 px/ms and >40px) deletes; otherwise it springs back.
- Clear all: tapping it turns the line into "Clear N? Keep / Clear" in place.
  No browser `confirm()`.
- **Nothing is removed from storage until the 5s Undo window ends.** The row
  hides at once and a toast "Slip deleted / All slips cleared  Undo" shows with
  a draining bar. Undo restores the view. When the toast expires (or another
  delete starts, or the page hides) the pending removal is committed through
  the existing `removeSlip` / `clearSlips`. Reason: sync tombstones beat every
  copy for 60 days, so deleting and then re-adding the same `sid` would be
  undone by the next sync.

### I. Sync
- `lib/sync.js` `PREF_KEYS` gains `avatar`, `name`, `theme`; the page's
  `PREFS` map gains `avatar:"sw.avatar"`, `name:"sw.name"`,
  `theme:"sw.theme"`. Values are validated server-side: `avatar` must be one of
  the 14 keys (the free six for now), `name` is trimmed, at most 24 chars, no
  `<>`.

## Out of scope
Paid plans and the paywall, unlocking skins, photo upload, account-linked push,
Sign in with Apple (comes with the App Store build), Play/App Store wrapping.

## Acceptance
- All existing tests pass; new tests cover sync prefs, quota headers, the
  pending-delete commit rule, the one-avatar rule (no second `.av` inside the
  menu, Profile or sheets), and copy rules (no "Cut", no "Download my data").
- Phone 360/390/430 and desktop, dark and light: menu, Profile, Settings, Home
  strip, My slips; swipe, Undo, Clear all work with mouse and touch.
- Signed out: the site looks and behaves as today apart from the header (no
  theme toggle) and the Home strip.
