-- sql/pricing_v2.sql - Wizard Pass prices from 1 Nov 2026 (lib/pricing.js). Run once in the
-- Supabase SQL editor BEFORE the deploy that ships it. Safe to run again.
--
-- 1. A N200 Starter pack: 10 codes for good, no days. It is a payments row like the
--    passes, but it never touches subscriptions (lib/bookgate.js counts what was bought).
alter table public.payments drop constraint if exists payments_pass_check;
alter table public.payments add constraint payments_pass_check check (pass in ('day', 'week', 'month', 'starter'));
alter table public.payments drop constraint if exists payments_days_check;
alter table public.payments add constraint payments_days_check check (days >= 0);

-- 2. apply_payment as before, plus: a Starter pack is marked paid and returns now() without
--    a pass; and a shorter pass bought on top of a running longer one keeps the longer
--    plan's name (from 1 Nov the plan sets codes a day: day 40, week 50, month 60).
create or replace function public.apply_payment(p_ref text, p_amount int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare r public.payments; v_end timestamptz;
begin
  update public.payments set status = 'paid', paid_at = now()
    where reference = p_ref and status = 'pending' and amount_kobo = p_amount
    returning * into r;
  if not found then return null; end if;
  if r.pass = 'starter' then return now(); end if;
  insert into public.subscriptions as s
    (user_id, plan, status, current_period_end,
     provider, provider_ref)
  values
    (r.user_id, r.pass, 'active',
     now() + make_interval(days => r.days),
     'paystack', r.reference)
  on conflict (user_id) do update set
    plan = case
      when s.current_period_end > now()
        and coalesce(array_position(array['day','week','month'], s.plan), 0)
          > coalesce(array_position(array['day','week','month'], excluded.plan), 0)
      then s.plan else excluded.plan end,
    status = 'active',
    provider = 'paystack',
    provider_ref = excluded.provider_ref,
    current_period_end =
      greatest(now(), coalesce(s.current_period_end, now()))
      + make_interval(days => r.days)
  returning s.current_period_end into v_end;
  return v_end;
end;
$$;

revoke all on function public.apply_payment(text, int) from public, anon, authenticated;
grant execute on function public.apply_payment(text, int) to service_role;
