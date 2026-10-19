-- sql/refs.sql - who came from a tracking link (soccerwizard.live/?t=<tag>),
-- to see what a promotion brought in (owner, 19 Oct 2026).
-- Run once in the Supabase SQL editor. RLS ON and NO policy, like accounts.sql:
-- only the service-role key (api/ref.js, api/account.js refs) reaches these rows.
--
-- One row per (tag, kind, who): kind 'visit' keys on the device id, kind 'user'
-- on the account that signed in on a device that arrived through the tag.
-- Passes bought are read from public.payments by those users, never stored here.
create table if not exists public.ref_hits (
  ref text not null check (ref ~ '^[a-z0-9_-]{1,24}$'),
  kind text not null check (kind in ('visit', 'user')),
  who text not null check (length(who) between 8 and 64),
  at timestamptz not null default now(),
  primary key (ref, kind, who)
);
alter table public.ref_hits enable row level security;
