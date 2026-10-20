-- 👍 / 👎 under every Telegram bot answer (owner, 20 Oct 2026).
--
-- One row per vote. `job` is what the bot did (read, edit, trim, split, change,
-- convert, today, pick); `who` is the hashed Telegram id the quota uses, never
-- the raw id; `msg` is the bot message voted on, so a second tap on the same
-- answer is ignored. Admin shows the last 7 days per job.

create table if not exists public.bot_feedback (
  id    bigint generated always as identity primary key,
  at    timestamptz not null default now(),
  job   text not null,
  vote  smallint not null check (vote in (-1, 1)),
  who   text not null,
  msg   bigint not null,
  unique (who, msg)
);

create index if not exists bot_feedback_at_idx on public.bot_feedback (at desc);

-- Written and read only by the service role, like every other table here.
alter table public.bot_feedback enable row level security;
