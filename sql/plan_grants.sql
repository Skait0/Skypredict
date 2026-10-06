-- sql/plan_grants.sql - Family & friends grants, keyed by lower-cased email.
-- Run once in the Supabase SQL editor. RLS ON and NO policy, like accounts.sql:
-- only the service-role key used by our Vercel functions reaches these rows.
create table if not exists public.plan_grants (
  email text primary key,
  plan text not null default 'ff',
  granted_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.plan_grants enable row level security;
