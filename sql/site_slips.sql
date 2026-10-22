-- Every booking code minted on the site, graded every ten minutes (owner, 12 Oct 2026).
-- Written by lib/bookproxy.js (via api/book.js), read back and graded by lib/slipwatch.js
-- from api/tgfollow.js, listed for the admin at /api/account/hits.
-- Apply once in the Supabase SQL editor. Until it exists, saving fails silently and
-- bookings work exactly as before.

create table if not exists public.site_slips (
  id           bigint generated always as identity primary key,
  book         text not null,                 -- sporty | bet9ja | betking | betpawa | onexbet | betway | msport
  code         text not null,
  who          text,                          -- admin | user | device | ip | none
  subject      text,                          -- u:<id>, a device id or a hashed address (same as book_quota)
  src          text,                          -- which surface booked it (bookFetch &src=)
  leg_count    int,
  total_odds   numeric,
  legs         jsonb,                         -- gradable legs, lib/follow.js track() shape
  untracked    int,                           -- legs that cannot be graded from a final score
  seen         jsonb not null default '{}'::jsonb,
  status       text not null default 'new',   -- new | open | landed | check | lost | stale | unreadable | ungraded
  last_kickoff timestamptz,
  notified     boolean not null default false,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz,
  unique (book, code)
);

create index if not exists site_slips_work_idx on public.site_slips (status) where status in ('new', 'open');
create index if not exists site_slips_hits_idx on public.site_slips (settled_at desc) where status in ('landed', 'check');

-- Service role only, like every other table here.
alter table public.site_slips enable row level security;
