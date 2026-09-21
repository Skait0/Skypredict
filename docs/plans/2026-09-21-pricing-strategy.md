# Pricing strategy, 21 Sep 2026

Answering the `/founder:pricing-strategy` question that was invoked once with no
product attached and never answered. Nothing here is shipped. It is a decision
record to revisit when the numbers in section 6 are actually hit.

The inputs it was given, all measured rather than assumed: ~90 non-brand search
clicks a month, 3K `/api/book` and 2K `/api/slip` calls a week, Vercel Pro $20/
month flat plus Railway, and Puntrr at 50K installs with a paid full version and
no published record.

## The verdict

**Do not ship a subscription.** At ~90 non-brand clicks a month there is no
acquisition engine to price against. A paywall over 3K weekly `/api/book` calls
converts 1-2% at best - 30-60 payers at $2, under $120 a month - and it closes
the WhatsApp sharing loop that the whole referee strategy depends on.

Price the traffic we will have in six months; monetise the traffic we have now
through the bookmakers, who already pay for a depositing customer we are
sending them for free.

## Model fit

| Model | Fit | Pros | Cons |
|---|---|---|---|
| Flat subscription | 2 | Predictable; Puntrr proves some will pay | NG consumer SaaS churns hard, card failure rates are high, and it needs volume we do not have |
| Usage-based | 1 | Matches the `/api/book` cost curve | Punters will not meter their own slips; the converter has to feel free |
| Per-seat | 1 | - | No teams. Dead. |
| Freemium | 4 | Keeps the share loop open; verdict pages must stay public to earn SEO | Needs one genuinely gated feature, which does not exist yet |
| Credits/tokens | 2 | Fits "convert N codes" | Puts friction on the exact action that spreads us |
| One-time purchase | 4 | No churn, no recurring card auth, survives NG payment rails | Caps LTV, no expansion revenue |
| **Affiliate / CPA** | **5** | Bookmakers pay for the depositor we already send; no price friction; scales with booking volume we already measure | Revenue is theirs to report, and it needs attribution - which shipped 21 Sep as `src=` |

**Recommendation: free product, bookmaker affiliate as primary revenue, and a
one-time Pro unlock as the only paid tier - introduced no earlier than 10K
monthly actives.** Every paid tier that could be designed today taxes the
code-sharing loop, and the loop is the asset.

## Tiers - designed now, the paid one shipped later

**Free. Zero, forever, self-serve.** Everything that has to be shareable: the
board, the slip builder, the converter and splitter, verdict pages, the daily
booking code, up to 20 legs a slip, 10 code checks a day. Upgrade trigger: the
10-check ceiling, or wanting a code watched for them. **The verdict page is
never gated** - it is the SEO and it is the WhatsApp payload.

**Pro. 2,500 naira one-time (~$1.60)**, or 900 naira/month (~$0.60) if a
recurring option is insisted on; annual 7,500 (30% off). Gated: unlimited code
checks; auto-grade a saved code and push the verdict when it settles; safer-leg
swaps applied to a whole pasted code in one action; slip history that survives a
device change; corners and Asian markets in the builder; no house ad slot; early
access to the next book (Betpawa). Pro is the ceiling for a consumer - there is
no trigger out of it.

**Partner. 25,000 naira/month (~$16), sales-led, five customers maximum in the
first year.** For tipster channels and WhatsApp group admins: a branded verdict
page for their codes, a monthly record PDF, API access to grading (500 codes a
month), a vanity slug. They are the only buyer in this market with real
willingness to pay: they sell a record and cannot prove one. **Do not build it
until three people ask.**

Prices are naira-first because the traffic is Nigerian and a dollar-denominated
card charge fails more often than a Paystack naira charge.

## Competitive anchors

- **Puntrr** - paid full version, price published nowhere on the store listings
  or their site. Their own reviews say premium does not activate and code
  generation breaks. Sit below them on price and above them on proof: our record
  is published, theirs is not.
- **Tipster Telegram/WhatsApp VIP channels** - the real competitor, roughly
  3,000-10,000 naira a month (observed range, not verified). Sit far below: we
  are not selling picks, we are selling settlement.
- **Bookmaker affiliate programmes** (SportyBet, Bet9ja, BetKing) - revenue
  share or CPA per first-time depositor, NG CPA commonly quoted at 2,000-5,000
  naira. This is the anchor for what one converting user is worth: more than any
  subscription we could charge them.
- **Punters.ng** - free, ad-funded. Proof that free-plus-ads is the local
  default, which is why a paywall reads as hostile here.

## Unit economics

Infra today is $20/month Vercel Pro plus Railway - call it $35 all in, and note
66 of 69 Vercel billable items sit at zero usage. Railway is the softest cost
and removable in about a week's work.

- **COGS per active per month**: $35 over ~2,000 monthly actives = **$0.018**.
  Effectively zero. Support is time, not money.
- **Gross margin**: Pro at 2,500 naira one-time is ~99%. Partner ~95% after
  support time. Free costs almost nothing to serve.
- **Break-even**: **fourteen Pro unlocks, ever, covers a month of infra.** That
  is the argument against paywalling - we are not pricing to survive, we are
  pricing to grow.
- **Target blended ARPU**: 150-400 naira a month (~$0.10-$0.26) across all
  actives, most of it affiliate. Above $0.30 blended means we gated too much.

## Psychology

1. **Anchor on Partner, not Pro.** Publish 25,000/month on the pricing page even
   with zero Partner customers, so 2,500 once reads as free beside it. A single
   price with nothing next to it gets judged against zero, which is what Free
   costs.
2. **Decoy: put 900/month beside the 2,500 lifetime.** Three months of monthly
   beats lifetime, so lifetime is the obvious buy - and lifetime is what we
   want, because recurring card auth fails constantly on NG rails and every
   failure is an involuntary churn event somebody has to support.
3. **Frame it as a code count, not a discount.** "Unlimited checks, forever, for
   less than one 3,000-naira tipster week." The buyer's reference price is a
   tipster subscription, not software.

## Launch versus scale

- **First 90 days: charge nothing.** Ship Pro as a free **Founding** unlock to
  anyone who checks 10+ codes, in exchange for an email. The list and the usage
  proof are worth more than $100. Read the `src=` attribution first - it says
  which surface the payers would even come from.
- **Grandfathering**: Founding unlocks are permanent and free, named as such in
  the UI. Two hundred evangelists inside WhatsApp groups beat 500,000 naira we
  were never going to collect, and revoking them costs the loop.
- **Price increase triggers, specific.** Zero to 2,500 naira when all three
  hold: 10,000 monthly actives; 500 codes graded with a published accuracy
  figure; the Play Store TWA live with 1,000+ installs. Pro to 5,000 naira when
  the referee settles 85% or more of an average pasted code - it went 54% to
  ~82% on 21 Sep, and second-half markets and corners are the remaining gap.
  Partner rises when three of the five slots are filled.

## The correction to the brief

"The competitor has 50K installs and a paid tier" is an argument for
distribution spend, not for a price. The $25 TWA listing and a free daily
Telegram post are the highest-return moves available. A paywall over 90 clicks a
month prices a product nobody has found yet.
