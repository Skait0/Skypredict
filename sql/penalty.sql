-- Penalty Wahala (docs/specs/2026-10-08-penalty-wahala-design.md). Server key
-- only: RLS on, no policies, like every other table here.
create table if not exists penalty_matches (
  id text primary key check (id ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  challenger_name text not null,
  challenger_device text not null,
  ch_shots jsonb not null,
  ch_dives jsonb not null,
  friend_name text,
  friend_device text,
  friend_kicks jsonb not null default '[]'::jsonb,
  kicks_n int not null default 0,
  result jsonb,
  finished_at timestamptz
);
create index if not exists penalty_matches_mine on penalty_matches (challenger_device, finished_at desc);
alter table penalty_matches enable row level security;

create table if not exists penalty_daily_plays (
  day date not null,
  device text not null,
  shots jsonb not null default '[]'::jsonb,
  shots_n int not null default 0,
  score int,
  primary key (day, device)
);
create index if not exists penalty_daily_rank on penalty_daily_plays (day, score);
alter table penalty_daily_plays enable row level security;

-- Ranked (owner, 9 Oct 2026): sudden death against a keeper only the server
-- knows; the leaderboard reads the longest streaks.
create table if not exists penalty_ranked_runs (
  id text primary key check (id ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  device text not null,
  name text not null,
  kicks jsonb not null default '[]'::jsonb,
  kicks_n int not null default 0,
  streak int not null default 0,
  alive boolean not null default true
);
create index if not exists penalty_ranked_board on penalty_ranked_runs (streak desc, created_at);
create index if not exists penalty_ranked_recent on penalty_ranked_runs (created_at desc);
alter table penalty_ranked_runs enable row level security;
-- Club wars (9 Oct 2026): the scorer's club, from CLUBS in lib/penalty.js.
alter table penalty_ranked_runs add column if not exists club text check (club is null or club ~ '^[a-z0-9-]{2,24}$');
