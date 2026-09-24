-- "Follow my slip" in the Telegram bot: one row per slip a reader follows.
--
-- The bot DMs them as each leg settles and once more when the whole slip has.
-- `legs` is the slip as the bot read it, mapped to OUR fixture names and dates
-- (so the results table can grade it); `seen` records which legs have already
-- been announced, so a leg is never announced twice however often the job runs.
-- `done` closes the row once every tracked leg has a verdict, or when the
-- slip's last kickoff is days behind us and a result will not come.

create table if not exists public.tg_follows (
  id           bigint generated always as identity primary key,
  chat_id      bigint not null,
  book         text   not null,
  code         text   not null,
  legs         jsonb  not null,
  seen         jsonb  not null default '{}'::jsonb,
  done         boolean not null default false,
  last_kickoff timestamptz,
  created_at   timestamptz not null default now(),
  unique (chat_id, code)
);

-- The job reads only the open rows, every ten minutes.
create index if not exists tg_follows_open_idx on public.tg_follows (done) where not done;

-- Written and read only by the service role, like every other table here.
alter table public.tg_follows enable row level security;
