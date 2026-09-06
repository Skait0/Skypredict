# A European results source, and country offsets fitted from it

Date: 2026-09-06
Status: design approved, not implemented

## The problem

`countryHandicap` in `lib/build.js` is imported, not measured. It converts a
published UEFA association coefficient into a log goal-rate handicap:

    handicap = COUNTRY_SCALE x (ln(England) - ln(country))

with `COUNTRY_SCALE = 0.50` and `COUNTRY_CAP = 0.70`, both chosen by argument
rather than by fit. That is not laziness, and the comment above
`UEFA_COEFFICIENT` explains why: **the offset between two countries is not
merely unknown in our data, it is unidentifiable.**

`fitModel` in `lib/model.js` centres attack and defence within each league after
every Adam step, and `buildIndex` places each team in exactly one league. The
training corpus contains no match that crosses a border and no club that appears
in two countries. With no observation linking one country's scale to another's,
there is nothing for a fitted offset to be estimated from. The league intercept
`lgI[l]` carries a league's scoring rate, not its strength.

So the offsets have to be anchored from outside - which is what the coefficient
does - unless we obtain matches that actually cross a border.

## What was measured, on 2026-09-06

Source: `github.com/openfootball/champions-league`, licence **CC0-1.0**, last
pushed 2026-07-02. Public domain, so unlike SoccerVista there is no question of
reusing somebody else's licence.

Matches were parsed and resolved against the index the model actually builds
from the committed floor (`data/results/*.csv.gz`, 66,965 matches, 873 clubs,
39 leagues).

Five seasons, nineteen competition files:

| | matches |
|---|---|
| parsed | 2,795 |
| both countries in our ratings (ceiling) | 1,422 |
| both clubs resolve against our index today | 763 |
| **ambiguous or wrong resolutions** | **0** |

The parse is complete, not approximate: the per-file counts equal openfootball's
own declared `# Matches` totals (2025-26 `cl.txt` declares 189, we parse 189;
`confq.txt` declares 256, we parse 256).

**The floor constrains which seasons are usable.** Era-correct ratings require
that season's domestic results, and the floor's main-league files cover only
`2425`, `2526` and `2627`. So the first cut fits on **2024-25 and 2025-26**:

| | matches |
|---|---|
| parsed | 1,576 |
| ceiling | 629 |
| resolve today | 305 (all cross-border) |
| ambiguous | 0 |

Cross-border matches per country, at today's resolution rate:

    ENG 58  ITA 48  TUR 48  NOR 42  NED 41  ESP 38  GER 38  BEL 37
    GRE 34  SUI 32  SCO 32  SWE 32  AUT 30  FRA 21  DEN 18  POR 17
    ROU 14  POL 14  IRL 10  FIN  6  RUS  0

**Russia is permanently zero** - banned from UEFA competitions since 2022 - and
Finland is on single figures. Those two are the reason the design shrinks toward
the imported prior rather than replacing it. They must come out of this work
carrying exactly the number they carry today, and that must be provable.

Cost, measured on this machine: loading and parsing the whole floor is 0.5s, and
one `fitModel` is 1.1s.

## Goal

Correct the imported anchor with measured evidence where measured evidence
exists, and leave it untouched where it does not.

## Non-goals

Explicitly out of scope, and none of them should be quietly added during
implementation:

- **No change to `CROSS_COUNTRY_SHRINK`** (0.55) and no change to the goals-only
  restriction on European ties in `bestTip`. Whether corrected offsets justify
  loosening those is a separate question that needs its own evidence.
- **No European ties in pick of the day.**
- **European matches never enter `fitModel`.** Club ratings are untouched, so no
  domestic fixture can move as a side effect of this work.
- **No added CPU in the Vercel build.** No extra fit, no extra network call.

## Design

### 1. The corpus is committed, and the build never reads it

A new `data/europe/` directory alongside `data/results/`, under the same rules
the floor already establishes: gzipped, read-only, refreshed by a deliberate
commit rather than written at build time.

`scripts/mkeurope.js` fetches the openfootball season files, parses them,
resolves the clubs, and writes both the corpus and the fitted offsets. It runs
on a developer machine, by hand, roughly once a season.

**The corpus stores openfootball's source text verbatim, not our resolved
matches.** Storing the raw files means a later improvement to the alias table
re-resolves the whole history without re-fetching, and means any disagreement
about a fitted number can be traced back to the line it came from. The resolved
corpus is derived on each run and never committed.

The corpus exists for audit and reproducibility. **The build does not read it.**
The only thing the build reads is `data/country-offsets.json`.

### 2. Score extraction, which is the part most likely to inject a fake result

openfootball writes knockout scores as a tail after the two clubs:

    2-3 (2-0)                        FT 2-3, HT 2-0
    3-2 a.e.t. (3-0, 1-0)            FT 3-0, HT 1-0   - 3-2 is after extra time
    0-1 a.e.t. (0-0)                 FT 0-0, HT unknown
    4-3 pen. 1-1 a.e.t. (1-1, 0-1)   FT 1-1, HT 0-1   - 4-3 is a shootout

The rule: **when `a.e.t.` is present the parenthesised list is (90-minute score,
half-time score); otherwise it is (half-time score) and the bare pair is the
90-minute score.** Any shootout pair is discarded.

Only the 90-minute score may reach the fit, because that is what the domestic
model is fitted on. A naive parser reads `4-3` and feeds a penalty shootout in
as a 4-3 football match; that is an invented result, and it would be invisible.

The parser asserts internal consistency - the extra-time score can never be
behind the 90-minute score, and the half-time score can never be ahead of it -
and **drops any line it cannot resolve into this shape, reporting it, rather
than guessing**. Half-time is carried as `hth`/`hta` where present and null
otherwise, matching the shape `lib/footballdata.js` already produces.

### 3. Name resolution reuses `matchTeam`; it does not invent a matcher

Every openfootball club carries its country: `Athletic Club (ESP)`. That tag is
the whole reason this is safe. The resolution is:

    country code -> our country -> that country's league indices
                 -> matchTeam(idx, name, li) for each
                 -> accept only a unique hit across them

`matchTeam`'s own comment sets the bar at 0.82 with a league given and 0.90
across the whole index, precisely because a whole-index search produced
confident singular errors (York City scoring 0.889 against Cork City). The
country tag keeps every lookup in the narrow case. Measured over 367 distinct
clubs across five seasons, this produced **zero ambiguous and zero wrong
resolutions**.

A club that does not resolve is **dropped and reported**, never guessed. Clubs
in countries we hold no ratings for (188 of the 367 - Czechia, Cyprus,
Azerbaijan, Kazakhstan and the rest) are expected misses, not failures.

About 52 aliases close the resolvable gap. They go into `TEAM_ALIAS_SRC` in
`lib/model.js`, where hand-checked pairs already live, because an explicit alias
beats the fuzzy pass. openfootball spells the same club several ways across
seasons - `Manchester City FC` and `Manchester City`, `FC Bayern Muenchen` and
`Bayern Muenchen`, `Olympique de Marseille` and `Olympique Marseille` - so each
variant is its own entry. That is why the count is 52 and not 30.

### 4. Era-correct ratings

Today's Real Madrid rating does not describe Real Madrid two seasons ago:
`fitModel` is time-weighted with a 200-day half-life. Using current ratings to
explain an old match would bias every offset.

So `scripts/mkeurope.js` refits the model once per season covered, from the
committed floor, with `opts.reference` set to that season's midpoint, and
evaluates each European match against the fit for its own season. At 1.1s per
fit this is seconds of work, offline, on a developer machine.

A European match whose season the floor cannot rate is excluded, and the
artefact records which seasons were used. This is what limits the first cut to
2024-25 and 2025-26. Adding older seasons to the floor widens the corpus toward
the 1,422 ceiling with no code change - but it needs football-data.co.uk, which
has been answering 503 since 2026-09-05, so it is not a prerequisite.

### 5. The offset fit

For a European match between home club `h` in league `L_h` (country A) and away
club `a` in league `L_a` (country B), the mean structure mirrors `predictTotals`
and `tierEdge` exactly, so the fitted quantity is in the units the build
consumes:

    e        = (rung(L_a) + C_B) - (rung(L_h) + C_A)
    lambda_h = exp(lgI[L_h] + att[h] - def[a] + hadv + e)
    lambda_a = exp(lgI[L_h] + att[a] - def[h] - e)

The free parameters are one `C_c` per country, with `C_England` fixed at 0 as
the anchor - the same anchor `COUNTRY_ANCHOR` already uses. `att`, `def`,
`lgI`, `hadv` and `rung` are all held fixed at their era-correct values; this
stage estimates nothing but the offsets.

Fitted by Adam on the Poisson quasi-likelihood, matching the optimiser
`fitModel` already uses. Poisson is the right choice for the mean structure:
the model's dispersion `k` is a variance parameter and does not shift the
location, so it is neither used nor re-estimated here.

The prior is the number we ship today:

    prior_c = min(COUNTRY_CAP, max(0, COUNTRY_SCALE x (ln(anchor) - ln(coef_c))))

and the penalty is a Gaussian centred on it, with precision expressed as an
equivalent match count `K`, so that the fitted value behaves as

    C_c ~= (n_c x MLE_c + K x prior_c) / (n_c + K)

**`K` is chosen by five-fold cross-validation on held-out Poisson deviance over
the corpus, not written down**, and the chosen value is recorded in the
artefact. This follows the precedent set by the seasons list in `lib/build.js`,
which was worked out rather than asserted.

Two consequences that must hold and are tested for:

- **A country with no evidence gets exactly its prior.** With `n_c = 0` the
  penalty is the entire objective. Russia comes out carrying today's number.
- Fitted values stay clamped to `[0, COUNTRY_CAP]`, and the artefact records
  when the clamp binds. Russia's raw prior is 0.886 and already clamps to 0.70.

### 6. The artefact

`data/country-offsets.json`, committed, reviewable in a diff. Every value below
is illustrative - including `shrinkageK`, which is whatever cross-validation
selects, not a constant to copy:

    {
      "generated": "2026-09-06",
      "source": "openfootball/champions-league @ <commit sha>",
      "seasons": ["2024-25", "2025-26"],
      "shrinkageK": 40,
      "anchor": "England",
      "countries": {
        "Spain":  { "offset": 0.183, "prior": 0.106, "matches": 38, "clamped": false },
        "Russia": { "offset": 0.700, "prior": 0.700, "matches": 0,  "clamped": true }
      }
    }

Recording `prior` and `matches` next to `offset` is deliberate: it makes every
number in the file auditable against the evidence behind it without re-running
anything.

### 7. What the build does

`countryHandicap` reads the artefact once at module load and returns
`countries[country].offset` where present, falling back to computing from
`UEFA_COEFFICIENT` exactly as it does today. That is the entire model change.
`tierEdge` and every caller are untouched.

The build logs one line naming the artefact's `generated` date, the seasons it
used, and how many countries were fitted rather than imported. **That line must
be added to the whitelist regex at `scripts/prebuild.js:172` or it will not be
printed** - the build log filters what it prints, and a diagnostic that does not
match the pattern is invisible for the whole deploy.

Cost to the build: one small JSON read. No fit, no network, no CPU.

## Failure modes

- **Artefact missing, unreadable, or malformed** - fall back to computing from
  `UEFA_COEFFICIENT` for every country, log one line, build normally. The site
  must never fail to build over this file.
- **A country in the artefact that is not in `UEFA_COEFFICIENT`** - ignored, and
  reported. Non-UEFA countries keep being refused, as today.
- **A country in `UEFA_COEFFICIENT` missing from the artefact** - computed from
  the coefficient, as today.
- **A line the parser cannot resolve** - dropped and counted; the harvest fails
  loudly if the drop rate exceeds a threshold, rather than silently fitting on a
  thinned corpus.
- **openfootball unreachable** - only affects `scripts/mkeurope.js`, run by
  hand. The build is unaffected because it never fetches.

## Testing

This codebase has shipped bugs past green tests: `test/pageweight.test.js` never
ran its main arm because `predictions.json` is gitignored and the check sits in
a try/catch, and three bugs passed tests that asserted on helpers nobody called.
So these tests assert the **caller and the observable behaviour**, not the
helper in isolation:

1. `countryHandicap` actually consults the artefact - assert a changed offset in
   a fixture file changes what `countryHandicap` returns, and changes `tierEdge`
   for a cross-border pair.
2. A zero-evidence country returns the unchanged imported number. Russia by
   name, since it can never acquire evidence.
3. A missing artefact, an empty one, and a syntactically broken one each
   degrade to today's numbers rather than throwing - asserted against the values
   `countryHandicap` returns today, not against a hardcoded constant.
4. The score parser: each of the four tail shapes yields the 90-minute score;
   a shootout is never returned as a result; an inconsistent line is dropped
   rather than repaired.
5. Name resolution rejects rather than guesses - a club in a country we do not
   rate resolves to nothing, and a variant side never resolves to the senior
   club.
6. The fit reproduces its own artefact: running the offset fit on a small
   committed fixture corpus produces the committed offsets to a tolerance.

## Refresh procedure

    node scripts/mkeurope.js          # fetch, parse, resolve, refit, write
    git diff data/country-offsets.json
    # review the offsets and the evidence counts, then commit

Roughly once a season, alongside refreshing `UEFA_COEFFICIENT` itself.

## Accepted limitations

- **Country-level, not club-level.** The offset moves a whole country at once
  and still cannot know that Celtic are stronger than Scotland's number
  suggests. That is the same limitation the imported coefficient has; this work
  measures the number better, it does not change what the number is.
- **Russia can never be fitted**, and Finland is on single figures. Both keep
  the imported value, by design.
- **Neutral-venue finals** are fitted with home advantage applied, which is
  wrong for about one match per competition per season. Left alone rather than
  special-cased; the alternative is a venue rule this corpus cannot support.
- **The current season is absent.** openfootball has no 2026-27 directory yet.
  Offsets move slowly and are refreshed by hand, so this does not matter for the
  fit; it does mean the corpus always trails the board.
