-- Re-open the slips our results left short (owner, 23 Oct 2026: "we keep having these issues and
-- cant accurately see the winners"). Slips from the last 14 days that closed "stale" or "ungraded"
-- with no lost leg go back to "open"; the ledger (lib/slipwatch.js, 8e7a9d7 + 73c3f98) then settles
-- each on the bookie's own final score, five a run, and closes it only after that one look.
-- Run after the 73c3f98 deploy is live, or the old grader closes them again.

create table public.site_slips_bak_20261023 as select * from public.site_slips
  where status in ('stale', 'ungraded') and last_kickoff > now() - interval '14 days' and jsonb_array_length(legs) > 0
    and not exists (select 1 from jsonb_each_text(seen) where value = 'lost');
alter table public.site_slips_bak_20261023 enable row level security;

update public.site_slips set status = 'open', settled_at = null
  where id in (select id from public.site_slips_bak_20261023);

-- UNDO:
-- update public.site_slips s set status = b.status, settled_at = b.settled_at, seen = b.seen
--   from public.site_slips_bak_20261023 b where s.id = b.id;
