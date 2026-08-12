# Formline on Vercel

Football predictions that build and update themselves. No repository full of
CSVs, no Python, nothing to run on your computer.

A serverless function downloads results and fixtures from football-data.co.uk,
fits the model, and returns predictions. The result is cached, so visitors get
an instant page and the sources are only hit a few times a day.

---

## Deploy

**1. Get the files into a Git repo.** GitHub, GitLab or Bitbucket all work.
Keep the structure exactly as it is:

```
api/predictions.js
api/cron.js
lib/build.js
lib/model.js
public/index.html
vercel.json
package.json
```

**2. Import it on Vercel.** vercel.com, Add New, Project, pick the repo.
Leave every build setting alone: there is no build step, no framework, no
dependencies to install.

**3. Deploy.** About a minute. You get a `.vercel.app` URL.

**4. Check it works.** Open `your-url.vercel.app/api/cron` in a browser.
That forces a build and prints what happened. You want `"ok": true` and a
sensible match count. Read the `log` lines if anything looks off.

---

## Your own domain

Vercel dashboard, Settings, Domains, add your domain. Vercel then tells you
which DNS records to create at your registrar, usually an A record pointing
at their IP and a CNAME for `www`. Add them where you bought the domain.

HTTPS is issued automatically and free. Propagation is usually minutes,
occasionally a few hours.

---

## How updating works

Two mechanisms, deliberately overlapping.

**The cron job** runs at 06:30 UTC daily, defined in `vercel.json`. It
rebuilds so the day's first visitor gets warm data.

**The cache** does the real work. `/api/predictions` is served from Vercel's
CDN for six hours, then marked stale but still served instantly while a fresh
copy builds behind it. So nobody ever waits for a build, and the page cannot
drift more than a few hours out of date even if the cron fails.

To force a refresh yourself, open `/api/predictions?refresh=1`.

---

## Changing which leagues appear

Edit the `MAIN` and `EXTRA` objects at the top of `lib/build.js`, commit, and
Vercel redeploys automatically.

`MAIN` maps football-data division codes to display names. `EXTRA` maps a
country to the one competition kept from that country's file, which matters
because several of those files hold more than one: Switzerland's includes the
Challenge League, Argentina's includes the Copa.

Fewer leagues means a faster build. All 38 is fine, it just takes longer.

---

## Other settings

In `lib/build.js`, `DEFAULTS`:

- `seasons` — football-data season codes. **Add the new one each August**
  (`"2627"`) or the ratings slowly go stale.
- `halfLife` — days before an old result counts half as much.
- `shrinkage` — how hard team ratings are pulled toward their league average.
  35 was tuned against real results; lowering it makes the model louder and
  measurably less accurate.
- `daysAhead` — how far forward to predict.
- `concurrency` — parallel downloads. Raise for speed, lower if you see
  timeouts.

Theme lives in `public/index.html` on the `<html data-theme="...">` tag:
`midnight`, `carbon`, `ink` or `slate`.

---

## When it breaks

`/api/cron` is the diagnostic. It returns the full log.

**Every source failed.** Almost always a season code that no longer exists.
Check `seasons` in `lib/build.js`.

**Extra leagues missing.** The per-country file names are a convention rather
than something documented, so the build falls back to the combined results
file automatically. The log says when that happens.

**No fixtures.** Usually correct rather than broken. Fixtures are published
Friday afternoons UK time for the weekend, and Tuesdays for midweek games.
Between rounds there is genuinely nothing to predict, and the page says so.

**Function timed out.** The build downloads around sixty files. Lower
`concurrency`, or cut leagues from `MAIN`.

---

## Markets

Every market is read from one scoreline distribution, so they can never
contradict each other. Double chance always equals its two parts, and
"draw or over 2.5" always equals draw plus over minus their overlap.

- Home / draw / away, and all three double chance combinations
- Anybody wins, which is 12 by another name
- Over 1.5, 2.5, 3.5 and under 2.5
- Both teams to score, and both teams to score with over 2.5
- First half over 0.5
- Draw or over 2.5, and draw or both teams to score
- A draw watch badge when a draw reaches 30%

**Draw correction.** A plain Poisson-style model puts draws about a point
too low, which is the same weakness Dixon-Coles addresses. A single boost is
applied to the diagonal of the scoreline matrix and everything is read from
the corrected version. Fitted on training data, validated on held-out
matches: mean draw went from 25.35% to 26.65% against an actual 26.39%.

**First half.** Roughly 45% of goals arrive before the interval, and that
share is remarkably steady, sitting between 0.430 and 0.463 across 22
leagues. Where a league publishes half-time scores its own measured share is
used; otherwise the average.

---

## What this does not do

It knows results, and nothing else. No injuries, no suspensions, no manager
changes, no midweek European tie, no team already safe with nothing to play
for.

It was backtested against real bookmaker prices across 22 leagues and does
not beat them. It is a reasonable statistical read on a match, better than
guessing and honestly calibrated. It is not a betting edge, and the numbers
should not be treated as one.
