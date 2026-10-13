# Soccerwizard - the design, written down

Read this before changing anything a reader sees. Everything here is taken
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
  app sheet, under "DISPLAY FACE".

Don't add a third family. BetKing's wordmark still uses its condensed system
stack, and a test forbids a Roboto webfont link for it. The static pages are
still all Plus Jakarta Sans.

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
  light). In the app they are on `BOOKS.<key>.mark`; in `lib/pages.js` they
  are in the `MARK` map. Reuse those - do not retype the markup.
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
  left edge, 13.5px `--text`, with a plain "Close" that hides it for that page
  view. Red, not gold: a notice is often a warning, and gold never is.
- **Paused bookie** (`book_off` from `/api/book`): the normal `.code-err`
  block. The bold line is "<wordmark> booking is paused right now." and the
  next line says the slip is saved and to pick another bookmaker.

## Admin page

The Admin view in the account sheet (`public/account-ui.js`), owner only. It
uses the same `.swa-h` headings, `.swa-card` cards and `.swa-set` rows as
Settings. The sections, in order:

1. **Site switches**: one row per bookmaker with a `.swa-sw` switch (on means
   booking is on), then the notice input with "Show notice" and "Clear notice".
2. **Status**: per bookmaker, when its last code was booked, how many in the
   last hour and how many today, then how long ago the predictions were built.
3. **Numbers**: accounts, new accounts, signed-in readers seen, Family &
   friends, codes booked, slips that landed, and our pick record over the last
   14 days.
4. **Find a reader**: email lookup showing plan, join date, last seen,
   devices with "Sign out everywhere", their codes (Family & friends only:
   free readers are counted by device), and Give or Remove Family & friends.
5. **Give Family & friends**, the grants list, and **Slips that landed**, as
   before.

Every result line is a short sentence ("Bet9ja booking paused. Readers see it
within a couple of minutes."), never a code or a status word.

## Motion and state

- Transitions are 140ms with `var(--ease-out)`. Hover lifts by 1px, never more.
- **Every hover rule lives inside `@media (hover:hover)`** - a phone holds the
  hover state after a tap otherwise.
- Focus is `outline:2px solid` the local accent, `outline-offset:2px`. Never
  remove it.
- An element JS hides with `.hidden = true` needs its own
  `[hidden]{display:none}` rule; an author `display` beats the attribute.

## Layout

Breakpoints in use: 560px (footer outbound links stop floating, legs table
tightens), 720px (footer becomes three columns; the app's desktop layout),
1180px (max column). Phones are the default case, not the exception - measure at 320/360/390/414/430 before calling a layout done, and remember
Claude's browser pins the viewport, so a 390px iframe measures boxes but is
not a phone.

## Copy

Sentence case everywhere except the uppercase section labels. No em dashes in
reader-facing copy. Say what a number is ("7 of 9 landed"), never "amazing"
or "guaranteed". Every claim on the site is graded somewhere.
