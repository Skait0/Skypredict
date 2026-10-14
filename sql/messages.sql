-- sql/messages.sql - the admin's message board (owner, 14 Oct 2026).
-- Run once in the Supabase SQL editor. RLS on and no policy, like every other
-- table here: only the service-role key used by our Vercel functions reaches it.

-- One row per message. user_id is the reader whose thread it sits in; null is a
-- broadcast to every account (including accounts made later). from_admin false
-- is a reader's reply. body is sanitised HTML from the admin (public/messages.js
-- clean()) or plain text from a reader. Unsending sets deleted_at.
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references public.users(id) on delete cascade,
  from_admin  boolean not null default true,
  body        text not null,
  deleted_at  timestamptz
);
create index if not exists messages_thread_idx on public.messages (user_id, created_at desc);
create index if not exists messages_bcast_idx on public.messages (created_at desc) where user_id is null;
alter table public.messages enable row level security;

-- How far each account has read: the inbox (read_at) and the top-of-page banner
-- (banner_at). The admin's own row marks how far they have read the replies.
create table if not exists public.message_reads (
  user_id    uuid primary key references public.users(id) on delete cascade,
  read_at    timestamptz,
  banner_at  timestamptz
);
alter table public.message_reads enable row level security;
-- The messages a reader deleted from their inbox (14 Oct 2026). Hidden for them only.
alter table public.message_reads add column if not exists hidden bigint[] not null default '{}';

-- Every account with its synced name and avatar, for the admin's Readers list.
create or replace function public.admin_readers()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'name', d.data #>> '{prefs,name,v}',
    'avatar', d.data #>> '{prefs,avatar,v}',
    'google', u.google_sub is not null,
    'created_at', u.created_at,
    'last_seen_at', u.last_seen_at,
    'ff', exists (select 1 from plan_grants g where g.email = u.email and g.revoked_at is null)
  ) order by u.last_seen_at desc), '[]'::jsonb)
  from users u left join user_data d on d.user_id = u.id;
$$;
revoke all on function public.admin_readers() from public, anon, authenticated;
