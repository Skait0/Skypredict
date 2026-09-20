-- Push subscriptions: who has asked to be told when the day's code is up.
--
-- A push subscription is an opaque endpoint the browser's push service minted,
-- not an identity. There is no account here and no column that could become
-- one: no user id, no IP address, no user agent. A user agent alongside a
-- stable per-device endpoint and a created_at is a device fingerprint with a
-- timestamp, and the privacy page promises there is normally nothing of yours
-- here to retrieve or delete. Nothing read it, so it is not stored.
--
-- `p256dh` and `auth` are the subscriber's public key and shared secret. We do
-- not use them today - an empty push needs no encryption - and they are stored
-- so that a payload-bearing notification later does not need every reader to
-- subscribe again.

create table if not exists public.push_subs (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

-- Written and read only by the service role, as with shared_slips, so anon and
-- authenticated get no policies at all.
alter table public.push_subs enable row level security;

-- THE CEILING. /api/push is unauthenticated - there are no accounts - so it
-- allowlists WHERE we will later POST but has nothing to say about HOW MANY
-- rows exist. Without this, a stranger with a script can grow the table until
-- the daily send is the bill. 5000 is a safety ceiling, not a product limit:
-- it is far above any plausible subscriber count this site will reach before
-- somebody is watching, and if it is ever hit in earnest the answer is to
-- raise it deliberately, not to remove it.
create or replace function public.push_subs_ceiling() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.push_subs) >= 5000 then
    raise exception 'push_subs is at its 5000-row safety ceiling';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subs_ceiling on public.push_subs;
create trigger push_subs_ceiling
  before insert on public.push_subs
  for each row execute function public.push_subs_ceiling();
