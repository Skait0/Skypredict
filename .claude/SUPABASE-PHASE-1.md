# Supabase phase 1 — shared results, sticky fixtures, booking-code cache

Spec, not yet built. Written 2026-08-28 against `main` @ `30b6d89`.
Companion to [RESUME-SESSION.md](./RESUME-SESSION.md).

## The one architectural rule

**The browser never talks to Supabase.** Not in phase 1.

- Clients **write** through our own Vercel route (`/api/record-result`), which
  validates and inserts with the service-role key.
- The **build** and `/api/predictions` **read** with the service-role key and
  bake results into the payload the CDN already serves.

Three things fall out of that, and they are why phase 1 is shaped this way:

1. **No Supabase key ever reaches the page.** No anon key to lift, no RLS
   surface exposed to the public. The only writer is a route we control.
2. **Egress stays near zero.** Reads happen once per build and once per
   `/api/predictions` refresh, not once per visitor — so the free tier's 5 GB
   is never in play regardless of traffic.
3. **The fast path is untouched.** Visitors still get `predictions.json` from
   the CDN with no serverless invocation. Supabase enriches what gets baked; it
   never sits in front of a page load.

No new dependency: this project has **zero** `dependencies`, Node ≥ 20 has
global `fetch`, and Supabase's PostgREST is a plain REST API. Use `fetch`, not
`@supabase/supabase-js`.

## Environment

Set in Vercel (all environments), server-side only — never `NEXT_PUBLIC_*`:

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Every helper must no-op cleanly when these are unset, so local builds and
preview deploys without the vars still work. Same discipline as `prebuild.js`:
this is an enrichment, and it must never fail a build.

---

## 1. `results` — the shared full-time ledger

Replaces the per-browser `sw.ft.v1` ledger with one every visitor sees. Fixes
the "results stop at Tuesday" gap (the feed runs ~3 days behind) and grades cup
ties, which `lib/build.js:636` structurally cannot — it only grades leagues the
model was fitted on.

```sql
create table public.results (
  match_date    date        not null,
  home          text        not null,
  away          text        not null,
  home_norm     text        not null,
  away_norm     text        not null,
  league        text        not null default '',
  hg            smallint    not null check (hg between 0 and 30),
  ag            smallint    not null check (ag between 0 and 30),
  tip           text        not null,
  hit           boolean     not null,
  tip_p         real,
  source        text        not null default 'live',
  confirmations smallint    not null default 1,
  recorded_at   timestamptz not null default now(),
  primary key (match_date, home_norm, away_norm)
);

create index results_recent on public.results (match_date desc);

alter table public.results enable row level security;
-- Deliberately no policies. service_role bypasses RLS and is the only writer
-- or reader. If a browser ever reads this table directly, add a select policy
-- for anon then - not before.
```

The primary key mirrors the client's `ftKey(date, normTeam(home), normTeam(away))`
so **the database enforces dedupe** rather than trusting clients to agree.

### Conflicts

Two visitors can report the same match; a feed glitch could make one of them
wrong. **First write wins.** A matching repeat bumps `confirmations`; a
*conflicting* score is rejected and logged, never overwritten. A result already
graded by the build is never touched by this table at all — see the merge order
below. Do not add "latest wins": a wrong score that overwrites a right one is
the one failure mode this record cannot afford.

### Write route — `api/record-result.js`

`POST` with one result. Add to `vercel.json` under `functions` with
`maxDuration: 15, memory: 256` (matching `live.js`/`fixtures.js`).

Validation, in order — reject with 400 on any failure:

1. Shape and ranges: `match_date` is `YYYY-MM-DD` and within the last 21 days;
   `hg`/`ag` are integers 0–30; `home`/`away`/`tip` non-empty strings under
   120 chars.
2. **The fixture must be one we published.** Load the current payload
   (`/predictions.json` from the deployment, or `lib/build`'s cached copy) and
   require a fixture matching `match_date` + normalised teams **whose `tip`
   equals the submitted tip**. Reject otherwise.
3. Recompute `hit` server-side from `(tip, hg, ag)` using the same logic as the
   client's `tipEval`. **Never store a client-supplied `hit`.**

Step 2 is the important one. It means the table can only ever contain results
for fixtures we actually published, carrying the tip we actually published —
so the "69% of tips landed" claim cannot be poisoned by anyone posting to the
endpoint. Without it, a public write route is an open door into the number the
whole site rests on.

Then `POST` to PostgREST with `Prefer: resolution=ignore-duplicates` (or
`on conflict do nothing` semantics) so a repeat is a cheap no-op.

`tipEval` currently lives only in the page (`public/index.html`). Lift it into
`lib/grade.js`, `require` it from the route, and — because the page is a single
standalone file — keep the page's copy but add a test asserting the two agree
on a table of cases. Do not let them drift silently.

### Client change

In `recordFinishedFixtures()`, after `saveFTLog()`, `POST` each newly recorded
result to `/api/record-result`. Fire-and-forget with `keepalive: true`; ignore
failures entirely. The local ledger stays exactly as it is and remains the
source for *today* — it already works offline, and it means a failed POST costs
the user nothing.

### Read / merge

Both `scripts/prebuild.js` (bake) and `api/predictions.js` (fresh path) pull the
last 21 days and merge into `payload.results`, using the existing precedence:

```
build-graded result  >  supabase result  >  (client's local ledger, in the page)
```

Merge only rows whose `(match_date, home_norm, away_norm)` is not already
present. Sort by date descending, as `lib/build.js:646` does.

Guard it exactly like the bake step: wrapped in try/catch, logged into
`payload.log`, never fatal.

### Freshness

The existing daily cron (`/api/cron`, 06:30 UTC, already in `vercel.json`)
rebuilds and will pick up overnight results. Between rebuilds, `/api/predictions`
serves the merged copy, and each visitor's own ledger covers today. That is
enough for phase 1 — no extra cron needed.

---

## 2. `fixtures_seen` — sticky day, server-side

The client-side `sw.day.<date>` fix only helps someone whose browser saw the
fixture before the SportyBet feed dropped it. This makes it hold for first-time
visitors too.

```sql
create table public.fixtures_seen (
  match_date date        not null,
  home_norm  text        not null,
  away_norm  text        not null,
  fixture    jsonb       not null,
  first_seen timestamptz not null default now(),
  primary key (match_date, home_norm, away_norm)
);
alter table public.fixtures_seen enable row level security;
```

**Written by the build, not by clients** — no new public write path. At the end
of `buildPayload`, upsert every fixture for today and the next two days. On the
next build, restore any fixture for a still-future or in-progress day that the
feeds no longer return.

Prune rows older than 3 days in the same pass.

One judgement call inherited from the client version: a genuinely postponed
match will linger until its day passes. That is the right side to err on — the
board briefly listing a called-off game is recoverable; silently dropping a tip
people are tracking is not.

---

## 3. `booking_codes` — cache

```sql
create table public.booking_codes (
  slip_hash  text primary key,
  code       text        not null,
  legs       smallint    not null,
  created_at timestamptz not null default now()
);
alter table public.booking_codes enable row level security;
```

`slip_hash` = SHA-256 of the `eventId|prediction` pairs sorted and joined. Check
the cache before calling `BOOK_URL`; store on success.

Two wins: identical slips (the Slip of the Day, "Add all N tips") stop hitting
the Railway service, and that service is the cold-start-prone one behind the
booking errors users have reported. Cache entries expire with the fixtures —
prune anything older than 3 days, since a code for a played match is useless.

This needs the booking call to move server-side to be worthwhile, since the page
currently calls `BOOK_URL` directly. Treat it as the last of the three.

---

## Order to build

1. **`results`** end to end — table, `lib/grade.js` + agreement test, write
   route, client POST, merge in prebuild and `api/predictions`. This is the one
   that fixes a bug users can see, and it exercises the whole pattern on public
   data where a mistake cannot leak anything.
2. **`fixtures_seen`** — small, build-only, no new public surface.
3. **`booking_codes`** — only alongside moving the booking call server-side.

## Checks before calling phase 1 done

- With `SUPABASE_URL` unset, `npm run build` and `npm test` behave exactly as now.
- A `POST` to `/api/record-result` with a fixture that was never published is
  rejected.
- A `POST` with a correct fixture but a falsified `hit` is stored with the
  *recomputed* value.
- A duplicate `POST` is a no-op and does not create a second row.
- A conflicting score for an existing row does not overwrite it.
- `predictions.json` after a build contains results for a day the feed has not
  published yet, and for a cup tie.
- `results` never appears in a request from the browser's network tab.
