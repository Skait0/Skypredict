-- Shared slips, keyed by the booking code the bookmaker already minted.
--
-- The code is a short unique name for the slip that the reader already has,
-- so it makes a better key than anything we could invent: the share link
-- becomes /s/MS0LJY instead of ~1,600 characters of base64.
--
-- `payload` is OUR self-contained encoding (teams, date, market, odds,
-- confidence), not a list of SportyBet event ids. Their lookup does exist and
-- returns references with no team names, and the only feed that maps those ids
-- to teams drops a match at kick-off - so a slip resolved that way would lose
-- its games hours after it was sent.

create table if not exists public.shared_slips (
  code       text primary key,
  book       text not null default 'sporty',
  payload    text not null,
  created_at timestamptz not null default now()
);

-- Nothing here is personal: it is a list of football matches somebody chose.
-- But the table is only ever written and read by the service role, so anon
-- and authenticated get no policies at all.
alter table public.shared_slips enable row level security;

-- Housekeeping. A shared slip is interesting for a few weeks at most; after
-- that the games are long finished and the link is a museum piece.
create index if not exists shared_slips_created_at_idx
  on public.shared_slips (created_at desc);
