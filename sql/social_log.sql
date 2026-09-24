-- Every post the social engine (api/social.js) sends, one row per post per
-- channel. `key` is what makes a slot idempotent: "potd|2026-09-25|x" can be
-- written once, so a cron that fires twice, or a retry, cannot double-post.
-- The newest row per channel is also how the dormancy watchdog knows how long
-- a channel has been quiet.

create table if not exists public.social_log (
  id        bigint generated always as identity primary key,
  key       text not null unique,
  channel   text not null,          -- 'x' or 'tg'
  kind      text not null,          -- potd, bankers, promo, keepalive
  text      text,
  posted_at timestamptz not null default now()
);

create index if not exists social_log_channel_time_idx on public.social_log (channel, posted_at desc);

alter table public.social_log enable row level security;
