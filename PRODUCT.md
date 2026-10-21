# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Adults (18+) in Nigeria, mostly on a phone, who bet on SportyBet and the other local bookies
(Bet9ja, BetKing, betPawa, 1xBet, Betway). Their job: get a ready booking code at the payout they
want, without picking every game themselves, and load it on their bookie in one tap. Many reach
the site from X, Instagram, Facebook or Telegram, often on mobile data.

## Product Purpose

Soccerwizard predicts football matches with its own model and turns those predictions into
booking codes the reader can play. Success is all four, measured together:

- **Codes booked:** readers leave with a code they actually load.
- **Slips that land:** picks land often, and the public record shows it.
- **Wizard Pass sales:** readers pay for bigger payouts and every tool.
- **Return visits:** readers come back daily (site, Telegram bot, phone notifications, app).

## Positioning

Our own model (time-weighted Poisson over results data, blended with bookie prices), every
prediction recorded before kick-off and graded in public, and one build that books the same slip
on six Nigerian bookies. Readers can also bring any bookie's code to convert, check or edit.

## Operating Context

- Ways to build a slip, each with its own colour: Slider (red), Wizard (gold), Pick for me (orange),
  Merlin's Pick (night blue, the likeliest slip for a payout). "Build me a slip" shows them as four rows.
- The board of today's predictions, live scores, the code converter, daily booking codes, Slip of
  the day, My slips, results and "how we did yesterday".
- Telegram bot (read, edit, convert, merge, follow and check codes), the X/Instagram/Facebook
  accounts and the Telegram channel, an installable app.
- Wizard Pass is the paid tier; free readers get the smaller payouts. Prices change on 1 Nov 2026;
  read live prices from `/api/pay/offer`, never copy them into designs.

## Capabilities and Constraints

- Phone first: the first load has a budget (`test/pageweight.test.js`), and key panels such as
  "Build me a slip" must fit one phone screen without scrolling.
- Dark is the default; light must stay readable (both themes are shipped).
- Every leg must be bookable on the reader's bookie at a real price; volatile leagues stay out
  until the reader says yes.
- Result-type bets back the favourite by default (combos and handicaps); the reader can turn
  this off.

## Brand Commitments

- **No win promises:** never "free", "sure win" or a promised result; 18+ and "play responsibly"
  wherever a slip is offered.
- **Plain words, no AI slop:** short plain sentences, nothing that looks AI-made, no em dashes,
  no green check marks, no violet outside the Wizard's Conjure button.
- **Our model only:** every number shown comes from our own model and real bookie prices, never
  invented.
- **Never name rivals** in our copy.
- Wizard theme: the wizard mascot and wizard words (conjure, Merlin), kept playful, never mystical
  claims about results.

## Evidence on Hand

- The graded record: `/booking-codes` and the results on the board (every tip recorded before
  kick-off, graded against the final score).
- Mascot art in `public/fw/` and `public/av/`; promo videos in `Desktop/Soccerwizard Promo`.
- No testimonials, press or user counts exist to quote. Do not invent them.

## Product Principles

1. A code you can play beats advice you have to act on.
2. Show the honest chance: say how likely a slip is, never dress up long odds as safe.
3. Every number traces back to our model or a real bookie price.
4. Fast and light on a cheap phone on mobile data.
5. The reader stays in control: nothing booked, spent or added without their tap; a quick builder
   asks before it uses a booking code.

## Accessibility & Inclusion

Text must meet contrast in both themes; controls are tappable on small phones; reduced motion
skips every animation straight to the result.
