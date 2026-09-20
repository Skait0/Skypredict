-- Push subscriptions: who has asked to be told when the day's code is up.
--
-- A push subscription is an opaque endpoint the browser's push service minted,
-- not an identity. There is no account here and no column that could become
-- one: no user id, no IP address. `ua` is kept only so a support question
-- ("nothing arrives on my iPhone") can be answered without guessing.
--
-- `p256dh` and `auth` are the subscriber's public key and shared secret. We do
-- not use them today - an empty push needs no encryption - and they are stored
-- so that a payload-bearing notification later does not need every reader to
-- subscribe again.

create table if not exists public.push_subs (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now()
);

-- Written and read only by the service role, as with shared_slips, so anon and
-- authenticated get no policies at all.
alter table public.push_subs enable row level security;
