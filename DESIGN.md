# Soccerwizard - the design, written down

Read this before changing anything a user sees. Everything here is taken
from what already ships, not from taste: `public/index.html`'s stylesheet is
the app, and the `CSS` const in `lib/pages.js` is the static shell that the
match pages, the standing pages and the 404 share. When the two disagree, the
app wins and the shell gets ported to match.

## Two stylesheets, one site

| | App | Static shell |
|---|---|---|
| Where | `public/index.html` `<style>` | `CSS` const in `lib/pages.js` |
| Covers | the board, the rail, the converter, the sheets | match pages, `/privacy`, `/terms`, `/how-it-works`, `/booking-codes`, 404 |
| Column | 1180px | 680px |

The shell is a smaller vocabulary on purpose. It does **not** define
`--red-ink`, `--line-soft`, `--card-2`, `--raise` or `--green`; it has
`--card2`, `--brand`, `--w`, `--l`, `--d`. A test
(`test/staticpages.test.js`) fails the build for any `var()` the shell does
not define, so port the rule to shell tokens rather than inventing one.

**Page CSS passed to `staticPage({head})` is injected BEFORE the shared
sheet.** An unscoped selector there loses to the shared rule of the same
specificity. Scope it, or raise specificity.

## Tokens

Dark is the default; light comes from `prefers-color-scheme`. App values:

```
--bg #0D0D0F   --card #161619  --card-2 #1E1E22  --raise #25252A  --line #2A2A30
--text #F2F1F0 --soft #A3A0A6  --faint #87848B
--red #E63946  --red-fill #DB3643  --red-ink #FF6B75
--green #2FD48A --green-ink #4FE39E --amber #F0A93B
--win / --accent #F2B84B  --on-accent #14120E  --accent-rim rgba(242,184,75,.42)
--grey #5A5762
--ease-out cubic-bezier(0.23,1,0.32,1)
--r-sm 4px  --r-md 6px  --r-lg 8px  --r-chip 6px  --r-seg 8px
(99px only for dots, progress tracks, counters and the round floating buttons)
```

Light: `--bg #E9E4DA`, `--card #F4F1EA`, `--text #1C1A18`, `--faint #65605A`,
`--accent #8E5B08`, `--on-accent #FFFFFF` (app and shell; both pass AA on the
card and the ground).

### What the colours mean

- **Gold (`--accent`)** marks what we favour and what we are proud of: the
  pick of the day, the booking code itself, the total odds, a section keyline.
  It comes out of the logo. Never use it for a warning.
- **Red (`--brand` / `--red`)** is the brand mark and the 18+ badge. It is the
  house colour, not an error colour.
- **Green** is strength and a landed leg. **Amber** is a caution in a scale,
  not an alert.
- **`--soft` / `--faint`** carry everything secondary. Body prose is `--soft`;
  timestamps, counts and labels are `--faint`.

## Type

Two families, both from Google Fonts in one request:

- **Plus Jakarta Sans** (400-800) is the body face: prose, labels, chips and
  buttons.
- **Saira Condensed** (600-800), token `--disp`, is the display face. It sets
  the headlines (uppercase, `letter-spacing:.005em`), the risk word, and the
  numbers people came for: odds, totals, the stat tiles and the slider bubble.
  It was chosen on 13 Oct 2026 (option 2b of the type mock-up) because Plus
  Jakarta on everything read as an AI-template site. Fallback:
  `'Roboto Condensed','Arial Narrow',sans-serif`. The rule sits last in the
  app sheet, under "DISPLAY FACE". `public/account-ui.js` uses `var(--disp)`
  bare: a test forbids the word Roboto in that file.

Don't add a third family. BetKing's wordmark still uses its condensed system
stack, and a test forbids a Roboto webfont link for it. The static pages
(`lib/pages.js`) load the same two families and set every `h1` and `h2` in
Saira Condensed, uppercase, one colour (`h1 em` inherits); `h1` is 30px.

- h1 17-26px/800 in `--disp`, one colour. There is no gold or red second
  half: `.intro h1 span` and `.bld-title em` inherit the colour. A
  split-colour headline is the most common AI-template tell.
- Body 13px/1.65 in the shell, `--soft`.
- Section labels: 11px/800, `letter-spacing:.09em`, uppercase - the one
  uppercase label style (app: `.potd-top b`, `.sotd-top b`, `.ck-tag` and the
  footer heads; static pages: the footer heads only). Static section headings
  are 15px/800 sentence case.
- Anything read aloud or typed in (codes, odds, scores) is
  `font-variant-numeric:tabular-nums` and 800. Odds and totals are also in
  `--disp`.

## Components

- **Cards**: `background:var(--card)`, `1px solid var(--line)`, 12px radius.
- **Chips and buttons**: `border-radius:var(--r-chip)` (6px), `1px solid
  var(--line)`, 12-12.5px/600-800, 8/13px padding. A chip that acts uses
  `--card2` on hover. A tray holding a row of them (segmented controls, the
  nav) is `var(--r-seg)` (8px); small tags and grade badges are `--r-sm`.
  They were all 99px pills until 13 Oct 2026, when pills on everything were
  judged an AI-template tell.
- **A chip that does something is filled**: solid `--red-fill` (All games,
  Build me a slip) or solid `--accent` gold (Share your win, Make it safer),
  12.5px/800, 8/14px. A translucent or outlined chip reads as a label, not a
  button, and another brand's colour reads as their badge (the owner, 24 Sep
  2026). One exception: the header's Download app button is outlined in red,
  because a filled one competed with Build me a slip right under it (13 Oct
  2026).
- **No glow, gloss or wallpaper.** Buttons are flat fills with no coloured
  halo. The tab bar marks the current page with a red icon, a red label and a
  short red bar on its top edge; no rings, no neon. The page ground is plain
  `--bg`.
- **No typed symbols as icons.** Arrows in buttons are drawn SVG, not "→";
  labels such as Favourites carry no "★". A typed arrow between two values
  ("x1.50 → x2.10") is text, and stays.
- **One red frame per screen.** The coach card is neutral (`--card-2`,
  `--line`) so the red ring on the pick is the one thing pointing.
- **Stat rows** separate items with a 1px `--line` hairline, not bullet dots.
- **An action happens where it is pressed.** Make it safer used to send the
  reader to the converter; it now does the job in the modal and shows what
  changed. Link out only when the destination is the point.
- **A favoured panel** (total odds, pick of the day) keeps the card
  background and swaps the border for `--accent-rim`.
- **Bookmaker names** are drawn as their own wordmarks, never in our type:
  `.sbm` (SportyBet, brand red), `.b9m > .b9r + .b9g` (bet9ja, `#D42127` +
  `#14B151`), `.bkm > .bkk + .bkg` (BetKing, gold `#FFC400`, `#A97400` in
  light). Betway (14 Oct 2026) was read off their own assets; its code card
  puts Copy and Share on their darker green `#008600` for 4.8:1. In the app
  they are on `BOOKS.<key>.mark`; in `lib/pages.js` they are in the `MARK`
  map. Reuse those - do not retype the markup. The converter's bookmaker row
  wraps, so the sixth book is never off a phone screen.
- **Ready-made slips (`#ladder`, 17 Oct 2026)**: the daily ladder, x5 to x1000. A
  favoured panel (card ground, `--accent-rim`), placed under the offer so it is
  the second thing on a phone. Headline in `--disp` uppercase, no label above it.
  The rungs are one segmented tray (`--bg` ground, `--r-seg`); the chosen rung is
  filled gold because it is the thing acted on; rungs not booked today are
  disabled, never hidden. The code is 30px `--disp` gold beside a filled gold
  Copy. Always drawn: before 10:30 Lagos it says "Ready at 10:30".
- **Code card (SportyBet)**: SportyBet keeps the full-width Open; under it,
  in words, "This code also works on football.com - same slip." and a
  smaller football.com button (14 Oct 2026). The bigger book leads.
- **Footer**: identical blocks and order in both sheets - `.foot-brand`
  (wordmark + one line), `.foot-cols` (h3 heads: What this is / What it isn't / Play
  responsibly), `.foot-links` (the essential few: Daily booking codes, All
  match predictions, Convert a booking code, How it works, Install the app,
  Contact us, then the two outbound links pushed right by
  `.fl-x{margin-left:auto}`), `.foot-legal` (©, `.badge18`, the estimates
  line, Privacy and Terms as plain links, `.rg` BeGambleAware pushed right). Changing one means changing both.
- **Header download button** (`.hsoc-inst`, `.tn-inst` on the static pages):
  outlined in `--red`, `--card` fill, drawn down-arrow in `--red-ink`,
  12.5px/700, 34px tall. It reads "Download app" on desktop and "App" at
  420px and below. On a phone where the account icon is also in the bar, it
  shows the arrow only.
- **Notice line** (`.sw-notice`, set from Admin, read from `/api/flags`): one
  line under the header, `--card-2` with a `--line` border and a 3px `--red`
  left edge, 13.5px `--text`, with a plain "Close". Close is remembered per
  notice text until a new notice is set (14 Oct 2026). Red, not gold: a
  notice is often a warning, and gold never is.
- **Paused bookie** (`book_off` from `/api/book`): the normal `.code-err`
  block. The bold line is "<wordmark> booking is paused right now." and the
  next line says the slip is saved and to pick another bookmaker.

## Header and bottom bar

- **The account avatar is a medallion**: 46px (44px at 420px and below), a
  2px `#F2B84B` ring with a soft gold shadow, set apart from the install and
  social buttons. Unread messages are a 12px red dot just outside the ring,
  ringed in the page colour, never a number over the wizard (14 Oct 2026);
  the number lives in the menu beside Messages.
- **The header logo steps aside on the home page**, where the big Wizard
  beside the headline stands in for it. Every other page keeps it.
- **Bottom tab bar (phones)**: Home, Build, Converter, Live, Play, and Admin
  for the admin only. Same 44px slot and one label baseline for every tab;
  the current page is the red icon, red label and short red top bar. Play is
  a game controller icon. The Live icon's core is r 2 with no stroke, so its
  pulse never touches the arcs.
  - Tried and reverted on 14 Oct 2026: Build as a raised gold disc in the
    middle, then as a red tile. The owner wanted it back as a plain second
    tab. Do not dress one tab up again without asking.
  - Every tab buzzes 22ms (`navBuzz`); adding a leg to a slip double-ticks,
    removing it ticks once. iPhone gets its system tick through a hidden
    `<input switch>`, since Safari has no `navigator.vibrate`.
  - The bar stays on screen under the account panels (Admin, Profile,
    Settings, Messages): they stop at the bar, the open panel's tab is lit,
    and any other tab closes the panel. The phone emoji sheet hides the bar
    while open, as a keyboard would.
- **`[hidden]{display:none!important}`** sits at the top of the app sheet
  (14 Oct 2026). An author `display:flex` beat the attribute in several places.

## Home page

Owner, 14 Oct 2026: "on mobile, the home page looks dead". The approved mock
became the page:

- **The Wizard beside the headline**: the hype pose when yesterday landed 70%+,
  the crystal ball otherwise. It rises in once after the loader; tap to tip.
- **"Yesterday: 21 of 27 landed so far"** under the headline, counted up.
- **The day's code is the prize**: a gold tile, the code in the display face.
  Its letters reveal and the odds count up on first show and on a book switch;
  Copy pops and buzzes.
- **Rows**: a confidence meter fills as each row scrolls in (CSS
  scroll-driven, no script; full where unsupported). The day's three best
  picks get a gold rail and "Our pick".
- **Live strip** above the board on phones. A new goal washes the whole tile
  gold for 2s and bumps the digit, including a goal scored while the page was
  shut (last scores kept 3 hours in `sw.liveprev`).
- The page shows once, settled: the loader waits for the first sync (capped),
  so the board does not redraw under the user.

## Board filters

- An **odds range** (from / to) on the pick each card leads with, at the
  user's own bookie, and a **sort**: By league, Strongest first, Kickoff,
  Highest odds. Any sort but By league is one flat list.
- On a phone the controls are 40px, the four rows share the width, the
  category chips fade out under the Filters button so the row reads as
  scrollable, and Filters is an icon button (aria-label "Filters"). On the
  web the panel stays open.

## Booking and the code limit

- **Make it safer** offers three rows, Light touch, Balanced and Safest, each
  with its odds and games changed, worked out before anything is booked;
  tapping a row books it. Levels that make the same changes merge into one row.
- **The daily code limit is an offer, not an error.** Past their 2 codes a
  free account sees `.code-err.code-plus`: `--card-2` with an `--accent`
  border, "That's your 2 codes for today.", one line on the pass, and a
  full-width gold **Get Wizard Pass** button (`data-plus`). A pass holder at
  20, or a device, gets the plain block: when it resets, and that the slip is
  saved.

## The Wizard Pass

The paid plan (owner, 16 Oct 2026). It is called **Wizard Pass**, never
"Plus" ("plus is not our language"); the role inside the code stays `plus`.

- **Account menu**: the first item, in gold with a drawn bolt, "Get Wizard
  Pass" with "20 codes a day" on the right; a pass holder sees "Add days"
  with "Wizard Pass". The plan line reads "Wizard Pass · until 12 Nov". A
  Founding Wizard gets a small outlined gold tag (`.swa-fw`, `--r-sm`).
- **Profile** has "Your plan" (not Subscription: nothing renews) with a
  Get Wizard Pass / Add days button.
- **The page** (`plusHtml`, `.swa-wp`) is **simple and fits one screen with
  no scrolling** (owner, 16 Oct 2026: "i liked the old one because it was
  simple and every detail could be seen"). A longer, scrolling version with a
  2-to-20 comparison and a ticked list was built and rejected the same day.
  Top to bottom:
  - The title in `--disp`, 40px, uppercase, gold; the `wiz-spell` emote (70px)
    beside it, set below the sticky Back bar so it is never clipped.
  - One paragraph: "**20 booking codes a day** on every bookie, from every
    tool: the Wizard, Slider, Converter, Edit for me, Split and Trim. Pay
    once. Nothing renews."
  - **Founding Wizards** as the one favoured strip (`--card`, `--accent-rim`,
    12px): the gold heading with "438 of 500 places left" on the same line,
    one line of terms, and a 5px places bar that fills once on open (the
    page's one motion).
  - Three compact pass cards (66px): a drawn radio (empty ring, gold and
    ticked when picked), the name in `--disp` uppercase, the per-day price
    under it, the price in `--disp` 28px gold. The month carries a square
    "Best value" tag; a founder price shows the full price struck through.
    Picking updates in place.
  - The pay button in the flow: flat gold, 52px, drawn lock, "Pay ₦1,500 with
    Paystack", and one fine-print line under it.
  - Measured to fit 390x680 and 375x600 of panel height (the space above the
    tab bar); a `max-height:660px` query tightens it for short phones.
  - Leaving Paystack with Back brings the page back as it was: on `pageshow`
    the pay button is enabled again, and 15s after a tap it re-enables anyway.
- Back from Paystack, a notice says "Your Wizard Pass is on until 12 Nov."
  Never the word "free" in this copy.

## Messages

- **Banner** under the header: only the admin's broadcasts and direct
  messages, never the welcome (which waits in the inbox with the dot). The
  admin sees it too. A GIF shows as a "GIF · open to see it" chip; the GIF
  itself only in the inbox.
- **Inbox**: long messages fold to two lines with More / Less; Delete hides a
  message for that user only (tap twice). The Back bar is sticky.
- **Emotes**: 54 Wizard emotes (`/emo/wiz-<name>.webp`, 112px source, drawn at
  44px) in their own picker tab, plus animated Noto emoji (64px). Five pose
  pairs animate as two frames; the rest take a CSS motion picked in the
  picker (wave, bounce, wiggle, jello, spin, pulse), one per emoji, and Wavy
  ripples selected letters. All of it stops under reduced motion. On a phone
  the picker takes the keyboard's place.
- Users can reply, as plain text only.

## Sign-in

One box: a plain 44px button holds the place, and Google's own button is
rendered invisibly on top in the same outline style, fading in 700ms after
its frame loads (1.5s at most). Ours is the one tapped until then. No swap,
no jump (14 Oct 2026).

## Account panels

Admin, Profile, Settings and Messages are full-height panels with a sticky
Back bar. The open one survives a refresh (`sw.acctview`, Admin only when the
server says admin in this page view), and the bottom bar stays visible under
them.

## Wizard Penalty

The game was renamed from Play Penalty on 15 Oct 2026; the tab label stays
"Play". Its menus follow the site: Saira Condensed upright headings, 8px
buttons, hairlines instead of bullet dots, no spinning aura or glow except
the gold aura on the picked fighter card on the start screen (owner: "a
crazier selection picture"). Pause sits top-left, mute top-right. Every
result screen has "Play again" (the daily Wizard Keeper's says "Play again
for fun"). The start screen fits 360x640 without scrolling.

## Admin page

The Admin view in the account sheet (`public/account-ui.js`), owner only. It
uses the same `.swa-card` cards and `.swa-set` rows as Settings. It also has
its own tab in the bottom bar.

**One section at a time.** A row of tabs (`.swa-tabs`, `.swa-tab`) across the
top, wrapping on a phone: Messages, Users, Switches, Status, Numbers, Family
& friends, Won slips, Log. Admin copy says "users", never "readers". Tabs are
34px, 6px corners, `--card` with a `--line` border; the open one is filled
`--red-fill` with white text. The arrow keys move between them, the open tab
scrolls into view, and the last one used is remembered on the device
(`sw.admintab`). Family & friends shows its member count on its tab. A win
not yet seen is a red dot, no number, on the Admin tab in the bottom bar and
on Won slips; opening Won slips clears it. The status line (`#swaMsg`) sits
under the tabs.

Every button in a row (Check, Share, Remove, Give, It landed, It lost) is the
same `.swa-pillbtn`: `--card-2`, `--line` border, 6px corners, 12px/700. The
big full-width buttons (`.swa-outbtn`) have 6px corners too. Only the on/off
switch (`.swa-sw`) stays round.

The tabs, in order:

1. **Messages**: the editor (broadcast or to picked users, emoji, emotes,
   GIFs), the sent broadcasts folded to one line each until tapped, with Edit,
   Resend and Delete, and the Conversations list with "Open their profile".
2. **Users**: email lookup showing plan, join date, last seen, devices with
   "Sign out everywhere", their codes, and Give or Remove Family & friends.
3. **Switches**: one row per bookmaker with a `.swa-sw` switch (on means
   booking is on), maintenance mode, then the notice input with "Show notice"
   and "Clear notice".
4. **Status**: per bookmaker, when its last code was booked, how many in the
   last hour and how many today, then how long ago the predictions were built.
5. **Numbers**: accounts, new accounts, signed-in users seen, Family &
   friends, codes booked, slips that landed, and our pick record over the last
   14 days.
6. **Family & friends**: give by email, then the list.
7. **Won slips**: every booked slip that landed, plus x20+ slips waiting on a
   check. **Check** opens every leg read back from the bookmaker, in words,
   with score and verdict ("Corners over 9.5"), and "It landed" / "It lost".
   The grader re-reads a slip before filing it as a check, so one with a lost
   leg never waits there, and a confirmed "It landed" goes to the owner's
   Telegram as a shareable banner (16 Oct 2026). A landed slip has Share.
8. **Log**: the audit log, newest first. Every admin change (switches, notice,
   Family & friends, sign-outs, settled slips) and every user lookup, each as
   one sentence ("Paused Bet9ja booking", "Looked up ada@gmail.com") with who
   did it and how long ago. Reading Numbers or Status is not logged.

Every result line is a short sentence ("Bet9ja booking paused. Readers see it
within a couple of minutes."), never a code or a status word.

## Motion and state

- Transitions are 140ms with `var(--ease-out)`. Hover lifts by 1px, never more.
- **Every hover rule lives inside `@media (hover:hover)`** - a phone holds the
  hover state after a tap otherwise.
- Focus is `outline:2px solid` the local accent, `outline-offset:2px`. Never
  remove it.
- An element JS hides with `.hidden = true` needs its own
  `[hidden]{display:none}` rule; an author `display` beats the attribute. The
  app sheet now opens with `[hidden]{display:none!important}`.
- **Authored moments, one per surface**: the home Wizard rising in, the day's
  code revealing, row meters filling on scroll, a goal washing a live tile
  gold, the Founding Wizards bar filling. Each runs once, eases out, and is
  off (or already finished) under `prefers-reduced-motion`. Do not add a
  second moving thing to a surface that already has its moment.
- **Haptics** are part of the feel: 22ms on every tab, a double tick on
  adding a leg, a buzz on Copy.

## Layout

Breakpoints in use: 560px (footer outbound links stop floating, legs table
tightens), 720px (footer becomes three columns; the app's desktop layout),
1180px (max column). Phones are the default case, not the exception - measure at 320/360/390/414/430 before calling a layout done, and remember
Claude's browser pins the viewport, so a 390px iframe measures boxes but is
not a phone.

## Copy

Sentence case everywhere except the uppercase section labels. No em dashes in
user-facing copy. Say what a number is ("7 of 9 landed"), never "amazing"
or "guaranteed". Every claim on the site is graded somewhere.

- **"Users", never "readers"**, anywhere the site speaks (owner, 14 Oct 2026).
- **Never "free" in marketing.** The free account is "2 codes a day"; the
  plan label "Free plan" is the one exception.
- **The paid plan is "Wizard Pass"**; the game is "Wizard Penalty"; the
  founders are "Founding Wizards". Never "Plus", and never "Grand Wizard"
  (a Ku Klux Klan title).
- **Money is in naira with the sign**: ₦200, ₦1,500, with thousands commas.
- "Nigeria's top bookies" is allowed for the bookmakers (owner's words).
