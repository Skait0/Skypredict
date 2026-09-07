-- The free-period booking quota: one row per booking code minted.
--
-- Ten a day per device during the free run, before any account system exists.
-- Slip building is free client-side compute, so this counts the only call that
-- costs anything: /api/book, which spends Railway CPU on a $5 plan and
-- bookmaker goodwill that has been used up once already.
--
-- A ROW PER BOOKING, NOT A COUNTER COLUMN. An insert is atomic over PostgREST
-- without a stored procedure, while "read, add one, write" over HTTP is a race
-- with no lock around it. Two requests can still both pass the read and both
-- book, so the cap is soft by a request or two under concurrency - the right
-- trade for a cost control, and the wrong one for anything that must be exact.
--
-- `subject` is either a device id minted by the browser, or 'ip-' plus a
-- peppered, truncated hash of the address when there is no device id. The
-- address itself is never stored: it is only ever a bucket key, and the whole
-- IPv4 space is small enough to enumerate against an unpeppered digest.
--
-- `day` is the LAGOS day, computed in lib/quota.js, because "ten a day" has to
-- mean the day the reader is living in. Nigeria is UTC+1 all year.

create table if not exists public.book_quota (
  id         bigint generated always as identity primary key,
  subject    text not null,
  day        date not null,
  created_at timestamptz not null default now()
);

-- The only query this table serves: how many rows for this subject today,
-- capped. Without this index that count is a sequential scan on the busiest
-- route on the site, which is how a rate limiter becomes the outage it was
-- meant to prevent.
create index if not exists book_quota_subject_day_idx
  on public.book_quota (subject, day);

-- Written and read only by the service role, like every other table here.
alter table public.book_quota enable row level security;

-- Housekeeping. Yesterday's counts decide nothing - the day has rolled over
-- and the allowance with it - so keep a fortnight for looking at usage during
-- the awareness month and drop the rest.
--
--   delete from public.book_quota where day < current_date - interval '14 days';
--
-- Run it from the Supabase SQL editor, or schedule it with pg_cron if this
-- table ever grows fast enough to matter.
create index if not exists book_quota_day_idx on public.book_quota (day);
