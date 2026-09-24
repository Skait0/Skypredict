-- Big odds of the day (lib/bigodds.js): one row per Lagos day, written when
-- the social engine mints it, read by /api/bigodds for the site's daily codes
-- card. `codes` is {book: {code, n}}; `legs` the games in it.
create table if not exists public.big_odds (
  day        date primary key,
  odds       numeric not null,
  codes      jsonb   not null,
  legs       jsonb   not null,
  created_at timestamptz not null default now()
);
alter table public.big_odds enable row level security;
