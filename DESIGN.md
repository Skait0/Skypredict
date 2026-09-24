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
--r-sm 4px  --r-md 6px  --r-lg 8px   (pills use 99px)
```

Light: `--bg #E9E4DA`, `--card #F4F1EA`, `--text #1C1A18`, `--accent #9A6B00`,
`--on-accent #FFFFFF`.

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

One family: Plus Jakarta Sans (400-800), loaded from Google Fonts in both
sheets. No second webfont - a test forbids adding one, because BetKing's
wordmark is drawn with a condensed system stack
(`"Roboto Condensed","Arial Narrow",…`) rather than a download.

- h1 17-26px/800, `h1 em` is gold - that is how a headline gets colour.
- Body 13px/1.65 in the shell, `--soft`.
- Section labels: 11px/800, `letter-spacing:.09em`, uppercase.
- Anything read aloud or typed in (codes, odds, scores) is
  `font-variant-numeric:tabular-nums` and 800.

## Components

- **Cards**: `background:var(--card)`, `1px solid var(--line)`, 12px radius.
- **Pills and chips**: `border-radius:99px`, `1px solid var(--line)`,
  12-12.5px/600-800, 8/13px padding. A chip that acts uses `--card2` on hover.
- **A pill that does something is filled**: solid `--red-fill` (Install, All
  games) or solid `--accent` gold (Share your win, Make it safer), 12.5px/800,
  8/14px. A translucent or outlined pill reads as a label, not a button, and
  another brand's colour reads as their badge (the owner, 24 Sep 2026).
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
  (wordmark + one line), `.foot-cols` (What this is / What it isn't / Play
  responsibly), `.foot-links` (pill row, the two outbound links pushed right
  by `.fl-x{margin-left:auto}`), `.foot-legal` (©, `.badge18`, the estimates
  line, `.rg` BeGambleAware pushed right). Changing one means changing both.

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
