-- sql/tglinks.sql - which Telegram account belongs to which Soccerwizard
-- account (lib/tglink.js, api/tg.js). Run once in the Supabase SQL editor.
--
-- `tg` is the bot's hashed Telegram id ("tg-" + 24 hex, api/tg.js subjectOf),
-- never the raw id. One Telegram per account and one account per Telegram:
-- connecting again moves the link. RLS on with no policy - service role only.
create table if not exists public.tg_links (
  tg        text primary key,
  user_id   uuid not null unique references public.users(id) on delete cascade,
  linked_at timestamptz not null default now()
);
alter table public.tg_links enable row level security;
