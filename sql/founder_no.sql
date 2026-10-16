-- sql/founder_no.sql - adds `no` to founder_offer: this reader's place among the
-- Founding Wizards (1 = the first), by when their first founder pass was paid.
-- null until they are one. Run once in the Supabase SQL editor, after payments.sql.
create or replace function public.founder_offer(p_user uuid)
returns json language sql stable security definer set search_path = public as $$
  with firsts as (
    select user_id, min(paid_at) as at from public.payments
    where founder and status = 'paid' group by user_id)
  select json_build_object(
    'taken', (select count(*) from firsts),
    'mine', (select count(*) from public.payments where founder and status = 'paid' and user_id = p_user),
    'no', (select n from (select user_id, row_number() over (order by at, user_id) as n from firsts) r
           where r.user_id = p_user));
$$;
revoke all on function public.founder_offer(uuid) from public, anon, authenticated;
grant execute on function public.founder_offer(uuid) to service_role;
