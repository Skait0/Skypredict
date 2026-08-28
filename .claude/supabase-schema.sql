-- Skypredict / Soccerwizard - Supabase phase 1
-- Run this in the Supabase SQL editor on a new project.
--
-- Nothing here is reachable from the browser. Every table has row-level
-- security on and *no policies at all*, which denies anon and authenticated
-- outright; the service-role key used by api/ and scripts/ bypasses RLS and is
-- the only way in. If a page is ever given direct read access, add a select
-- policy for anon at that point and not before.

-- ---------------------------------------------------------------- results
-- Every fixture we published a tip for, graded against its final score.
-- Fills the two gaps the build cannot: the days football-data has not
-- published yet, and cup ties, which are never graded because a cup has no
-- league in the model's index.
create table if not exists public.results (
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
  source        text        not null default 'sweep',
  recorded_at   timestamptz not null default now(),
  primary key (match_date, home_norm, away_norm)
);

create index if not exists results_recent on public.results (match_date desc);
alter table public.results enable row level security;

-- First write wins. A result already here is never replaced by a later report
-- of the same match: the failure that matters is a right score being
-- overwritten by a wrong one, and inserts use ignore-duplicates for that
-- reason. Nothing needs an update policy.

-- -------------------------------------------------------------- live_seen
-- Working memory for the sweep, not a record of anything.
--
-- No feed we have reports a finished match. The live feed carries only games
-- in play and a match vanishes from it when it ends; the fixtures feed has no
-- scores. So a final score can only be caught by watching a match while it is
-- on and noticing when it goes - and a serverless function keeps nothing
-- between calls, so what was on last time lives here.
--
-- Rows are transient: each one is deleted the moment its match is finalised
-- into results, or expired after a day if it never qualifies.
create table if not exists public.live_seen (
  match_key   text        primary key,
  match_date  date        not null,
  home        text        not null,
  away        text        not null,
  home_norm   text        not null,
  away_norm   text        not null,
  league      text        not null default '',
  tip         text        not null,
  tip_p       real,
  kickoff     timestamptz,
  hg          smallint    not null,
  ag          smallint    not null,
  minute      smallint,
  status      text,
  last_seen   timestamptz not null default now()
);

alter table public.live_seen enable row level security;

-- ------------------------------------------------------------- how to wire
-- 1. Project settings -> API: copy the URL and the *service_role* key.
-- 2. Vercel -> project -> Settings -> Environment Variables, all environments:
--      SUPABASE_URL                = https://<project>.supabase.co
--      SUPABASE_SERVICE_ROLE_KEY   = <service_role key>
--      SWEEP_KEY                   = <any long random string you invent>
--    The service-role key bypasses RLS, so it must never be prefixed in a way
--    that exposes it to the client, and never referenced from public/.
-- 3. GitHub -> repo -> Settings -> Secrets and variables -> Actions:
--      SWEEP_URL  = https://skypredict-theta.vercel.app/api/record-sweep
--      SWEEP_KEY  = the same string as above
-- 4. Run the workflow once by hand (Actions -> Record full-time results ->
--    Run workflow) with "Grade but do not write" ticked, and read the summary
--    it prints before letting it write anything.
