-- sql/admin.sql - the admin page's switches and numbers (13 Oct 2026).
-- Run once in the Supabase SQL editor. RLS on and no policy, like every other
-- table here: only the service-role key used by our Vercel functions reaches it.

-- One row, key 'site': {"booksOff": ["sporty", ...], "notice": "text"}.
-- A missing row means nothing is switched off and there is no notice.
create table if not exists public.site_flags (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.site_flags enable row level security;

-- Every number the admin page shows, in one round trip. Slips count only when
-- built from our picks: a reader's own code (converter, editor, trim, change)
-- never does (lib/slipwatch.js READER_SRCS). "Today" is the Lagos
-- day, the same day the booking quota counts.
create or replace function public.admin_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select (now() at time zone 'Africa/Lagos')::date as today
  ),
  t as (
    select (b.today::timestamp at time zone 'Africa/Lagos') as day0,
           ((b.today - 6)::timestamp at time zone 'Africa/Lagos') as week0
    from b
  )
  select jsonb_build_object(
    'users',        (select count(*) from users),
    'signupsToday', (select count(*) from users, t where created_at >= t.day0),
    'signups7d',    (select count(*) from users, t where created_at >= t.week0),
    'activeToday',  (select count(*) from users, t where last_seen_at >= t.day0),
    'active7d',     (select count(*) from users, t where last_seen_at >= t.week0),
    'ffMembers',    (select count(*) from plan_grants where revoked_at is null),
    'codesToday',   (select count(*) from site_slips, t where created_at >= t.day0 and (src is null or src not in ('convert','editor','trim','change')) and status <> 'foreign'),
    'codes7d',      (select count(*) from site_slips, t where created_at >= t.week0 and (src is null or src not in ('convert','editor','trim','change')) and status <> 'foreign'),
    'landed7d',     (select count(*) from site_slips, t where status = 'landed' and settled_at >= t.week0 and (src is null or src not in ('convert','editor','trim','change')) and status <> 'foreign'),
    'books', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'book', s.book,
        'today', s.today,
        'week', s.week,
        'lastHour', s.last_hour,
        'last', s.last_at) order by s.week desc), '[]'::jsonb)
      from (
        select book,
               count(*) filter (where created_at >= t.day0) as today,
               count(*) as week,
               count(*) filter (where created_at >= now() - interval '1 hour') as last_hour,
               max(created_at) as last_at
        from site_slips, t
        where created_at >= t.week0 and (src is null or src not in ('convert','editor','trim','change')) and status <> 'foreign'
        group by book
      ) s
    )
  );
$$;
revoke all on function public.admin_stats() from public, anon, authenticated;

-- THE AUDIT LOG (owner, 13 Oct 2026): every admin change and every look at a
-- reader's private details, who did it and when. Append-only from the app: the
-- functions only ever insert and read.
create table if not exists public.admin_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  admin_email text not null,
  action      text not null,
  target      text,
  detail      jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_at_idx on public.admin_audit (at desc);
alter table public.admin_audit enable row level security;
