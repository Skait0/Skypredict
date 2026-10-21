-- sql/ladder-x30.sql - Merlin's Pick rungs (owner, 22 Oct 2026: "replace them").
-- The daily ladder is now x5, x10, x20, x30 (lib/ladder.js RUNGS). Run once in the
-- Supabase SQL editor, after sql/ladder.sql.
-- daily_ladder keeps 100 and 1000 so the days already booked stay readable.
alter table public.daily_ladder drop constraint if exists daily_ladder_rung_check;
alter table public.daily_ladder add constraint daily_ladder_rung_check check (rung in (5, 10, 20, 30, 100, 1000));

-- Readers who chose x100 or x1000 move to x30, the new top rung.
alter table public.autopilot drop constraint if exists autopilot_rung_check;
update public.autopilot set rung = 30 where rung in (100, 1000);
alter table public.autopilot add constraint autopilot_rung_check check (rung in (5, 10, 20, 30));
