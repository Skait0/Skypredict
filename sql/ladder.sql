-- sql/ladder.sql - the daily ladder and "My daily slip" (owner, 17 Oct 2026).
-- Run once in the Supabase SQL editor.
--
-- daily_ladder: one row per day and rung (x5, x10, x20, x100, x1000), booked at
-- 10:30 Lagos by api/ladder.js on every book that takes it (lib/ladder.js).
-- autopilot: a Wizard Pass reader's choice - one rung, one bookie, how to send.
-- tg_chat is filled when the reader sends /daily to the bot (the Telegram link
-- table keeps only a hashed id, which cannot be messaged).
-- RLS on with no policy - service role only.
create table if not exists public.daily_ladder (
  day        text not null,
  rung       int  not null check (rung in (5, 10, 20, 100, 1000)),
  odds       numeric not null,
  codes      jsonb not null,
  legs       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (day, rung)
);
alter table public.daily_ladder enable row level security;

create table if not exists public.autopilot (
  user_id        uuid primary key references public.users(id) on delete cascade,
  rung           int  not null check (rung in (5, 10, 20, 100, 1000)),
  book           text not null check (book in ('sporty','bet9ja','betking','betpawa','onexbet','betway')),
  push           boolean not null default true,
  tg_chat        bigint,
  last_sent_day  text,
  updated_at     timestamptz not null default now()
);
alter table public.autopilot enable row level security;
