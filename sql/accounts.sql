-- sql/accounts.sql - accounts, sessions, sync and paygate hooks.
-- Run once in the Supabase SQL editor. Every table has RLS ON and NO policy:
-- the anon and authenticated roles can read nothing; only the service-role
-- key used by our Vercel functions reaches these rows. See
-- docs/superpowers/specs/2026-09-29-accounts-design.md section 3.
create extension if not exists citext;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  google_sub text unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.users enable row level security;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text
);
create index if not exists sessions_live_by_user on public.sessions (user_id) where ended_at is null;
alter table public.sessions enable row level security;

create table if not exists public.login_codes (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz
);
create index if not exists login_codes_by_email on public.login_codes (email, created_at desc);
alter table public.login_codes enable row level security;

create table if not exists public.auth_attempts (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  code_verifier text not null,
  nonce text not null,
  return_to text not null default '/',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  started_at timestamptz,
  consumed_at timestamptz
);
alter table public.auth_attempts enable row level security;

create table if not exists public.user_data (
  user_id uuid primary key references public.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;

create table if not exists public.rate_counters (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_counters enable row level security;

create table if not exists public.feature_access (
  feature text primary key,
  tier text not null default 'free' check (tier in ('free', 'paid'))
);
alter table public.feature_access enable row level security;

create table if not exists public.subscriptions (
  user_id uuid primary key references public.users(id) on delete cascade,
  plan text,
  status text,
  current_period_end timestamptz,
  provider text,
  provider_ref text
);
alter table public.subscriptions enable row level security;

-- Marketing email consent: a row only when the reader ticked the box.
-- wording is the exact text they saw; revoked_at is set by unsubscribe.
create table if not exists public.email_consent (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted_at timestamptz not null,
  wording text not null,
  source text not null,
  revoked_at timestamptz
);
alter table public.email_consent enable row level security;

-- The Google redirect flow carries the opt-in tick across the round trip.
alter table public.auth_attempts add column if not exists optin boolean not null default false;

-- One hit on a fixed window. True while the count is within the limit.
-- Atomic: concurrent hits cannot both read the same count.
create or replace function public.rl_hit(p_key text, p_window int, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  c int;
begin
  insert into public.rate_counters (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_counters.count + 1
  returning count into c;
  return c <= p_limit;
end $$;
revoke all on function public.rl_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rl_hit(text, int, int) to service_role;
