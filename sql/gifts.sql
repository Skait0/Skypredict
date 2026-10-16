-- sql/gifts.sql - passes the admin gives away (api/account.js action "gift").
-- Run once in the Supabase SQL editor, after payments.sql.
--
-- A gift stacks on the reader's pass exactly like a paid one (apply_payment):
-- from the end of a pass still running, or from now, in one statement, so a
-- gift landing while the reader pays cannot lose either. provider says where
-- the days came from ('gift' or 'reimburse'); who gave it, why and the note
-- are in the admin audit log. Returns the new end of the pass.
create or replace function public.gift_pass(p_user uuid, p_pass text, p_days int, p_reason text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_end timestamptz;
begin
  if p_pass not in ('day', 'week', 'month') or p_days not between 1 and 31
     or p_reason not in ('gift', 'reimburse') then
    return null;
  end if;
  insert into public.subscriptions as s
    (user_id, plan, status, current_period_end, provider, provider_ref)
  values
    (p_user, p_pass, 'active', now() + make_interval(days => p_days), p_reason, null)
  on conflict (user_id) do update set
    plan = excluded.plan,
    status = 'active',
    provider = excluded.provider,
    provider_ref = null,
    current_period_end =
      greatest(now(), coalesce(s.current_period_end, now()))
      + make_interval(days => p_days)
  returning s.current_period_end into v_end;
  return v_end;
end;
$$;
