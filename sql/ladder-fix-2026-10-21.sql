-- 21 Oct 2026 day page: show the Merlin's Pick codes we posted that day (owner, 23 Oct 2026:
-- "fix 21 oct page"). The old ladder builder booked other slips for 21 Oct (x5 XMWNDS, x10, x20)
-- that were never posted; the posted ones were VZ6QMG x5, UEZAC3 x10, W2NL3M x20, H0EA2Y x30.
-- SportyBet codes only: no other book was minted for these. The page updates on the next build.

create table public.daily_ladder_bak_20261023 as select * from public.daily_ladder where day = '2026-10-21';
alter table public.daily_ladder_bak_20261023 enable row level security;

delete from public.daily_ladder where day = '2026-10-21';

insert into public.daily_ladder (day, rung, odds, codes, legs) values
  ('2026-10-21', 5, 5.04, '{"sporty":{"code":"VZ6QMG","n":4}}'::jsonb, '[{"home":"Bayern Munich","away":"Arsenal","code":"GG","p":null,"odds":null},{"home":"Betis","away":"Feyenoord","code":"AWAY_UNDER_1.5","p":null,"odds":null},{"home":"Real Madrid","away":"RB Leipzig","code":"AWAY_UNDER_1.5","p":null,"odds":null},{"home":"Levante","away":"Athletic Bilbao","code":"MIXGG_X","p":null,"odds":null}]'::jsonb),
  ('2026-10-21', 10, 10.29, '{"sporty":{"code":"UEZAC3","n":6}}'::jsonb, '[{"home":"Lille","away":"Galatasaray Istanbul","code":"UNDER_3.5","p":null,"odds":null},{"home":"Aston Villa","away":"Viking FK","code":"MIXGG_X","p":null,"odds":null},{"home":"Bayern Munich","away":"Arsenal","code":"GG","p":null,"odds":null},{"home":"Betis","away":"Feyenoord","code":"AWAY_UNDER_1.5","p":null,"odds":null},{"home":"Inter","away":"Shakhtar D","code":"1","p":null,"odds":null},{"home":"Levante","away":"Athletic Bilbao","code":"HOME_OVER_0.5","p":null,"odds":null}]'::jsonb),
  ('2026-10-21', 20, 20.47, '{"sporty":{"code":"W2NL3M","n":8}}'::jsonb, '[{"home":"Lille","away":"Galatasaray Istanbul","code":"UNDER_3.5","p":null,"odds":null},{"home":"Aston Villa","away":"Viking FK","code":"MIXGG_X","p":null,"odds":null},{"home":"Bayern Munich","away":"Arsenal","code":"12","p":null,"odds":null},{"home":"Betis","away":"Feyenoord","code":"AWAY_UNDER_1.5","p":null,"odds":null},{"home":"Club Brugge","away":"Lens","code":"MIXGG_X","p":null,"odds":null},{"home":"Real Madrid","away":"RB Leipzig","code":"GG","p":null,"odds":null},{"home":"Levante","away":"Athletic Bilbao","code":"HOME_OVER_0.5","p":null,"odds":null},{"home":"PK-35 Helsinki","away":"FF Jaro","code":"OVER_1.5","p":null,"odds":null}]'::jsonb),
  ('2026-10-21', 30, 31.05, '{"sporty":{"code":"H0EA2Y","n":9}}'::jsonb, '[{"home":"Como 1907","away":"Man Utd","code":"MIXGG_X","p":null,"odds":null},{"home":"Lille","away":"Galatasaray Istanbul","code":"UNDER_3.5","p":null,"odds":null},{"home":"Aston Villa","away":"Viking FK","code":"AWAY_OVER_0.5","p":null,"odds":null},{"home":"Bayern Munich","away":"Arsenal","code":"GG","p":null,"odds":null},{"home":"Betis","away":"Feyenoord","code":"AWAY_UNDER_1.5","p":null,"odds":null},{"home":"Inter","away":"Shakhtar D","code":"1","p":null,"odds":null},{"home":"Real Madrid","away":"RB Leipzig","code":"GG","p":null,"odds":null},{"home":"Levante","away":"Athletic Bilbao","code":"HOME_OVER_0.5","p":null,"odds":null},{"home":"PK-35 Helsinki","away":"FF Jaro","code":"OVER_1.5","p":null,"odds":null}]'::jsonb);

-- UNDO:
-- delete from public.daily_ladder where day = '2026-10-21';
-- insert into public.daily_ladder select * from public.daily_ladder_bak_20261023;
