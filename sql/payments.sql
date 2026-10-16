-- sql/payments.sql - Plus passes bought through Paystack (api/pay.js).
-- Run once in the Supabase SQL editor, after accounts.sql. RLS ON and NO
-- policy, like accounts.sql: only the service-role key reaches these rows.
--
-- One row per checkout started. A row turns 'paid' exactly once, inside
-- apply_payment(), which also extends the reader's pass - so a webhook and the
-- return page both arriving, or Paystack retrying, can never credit twice.
create table if not exists public.payments (
  reference text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  pass text not null check (pass in ('day', 'week', 'month')),
  days int not null check (days > 0),
  amount_kobo int not null check (amount_kobo > 0),
  founder boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.payments enable row level security;
create index if not exists payments_user on public.payments (user_id, status);

-- Marks a checkout paid and stacks its days on the reader's pass: from the end
-- of a pass still running, or from now. Returns the new end, or null when the
-- reference is unknown, already paid, or the amount differs from what we asked.
create or replace function public.apply_payment(p_ref text, p_amount int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare r public.payments; v_end timestamptz;
begin
  update public.payments set status = 'paid', paid_at = now()
    where reference = p_ref and status = 'pending' and amount_kobo = p_amount
    returning * into r;
  if not found then return null; end if;
  insert into public.subscriptions (user_id, plan, status, current_period_end, provider, provider_ref)
    values (r.user_id, r.pass, 'active', now() + make_interval(days => r.days), 'paystack', r.reference)
  on conflict (user_id) do update set
    plan = excluded.plan, status = 'active', provider = 'paystack', provider_ref = excluded.provider_ref,
    current_period_end = greatest(now(), coalesce(public.subscriptions.current_period_end, now()))
                         + make_interval(days => r.days)
  returning current_period_end into v_end;
  return v_end;
end;
$$;

-- Founding Wizards (owner, 16 Oct 2026): the first 500 buyers pay the founder
-- price on their first 3 month passes. taken = founders so far, mine = this
-- reader's founder months already paid.
create or replace function public.founder_offer(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'taken', (select count(distinct user_id) from public.payments where founder and status = 'paid'),
    'mine', (select count(*) from public.payments where founder and status = 'paid' and user_id = p_user));
$$;

revoke all on function public.apply_payment(text, int) from public, anon, authenticated;
revoke all on function public.founder_offer(uuid) from public, anon, authenticated;
grant execute on function public.apply_payment(text, int) to service_role;
grant execute on function public.founder_offer(uuid) to service_role;
