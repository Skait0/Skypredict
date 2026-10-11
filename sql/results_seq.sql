-- The order the goals came in, as "H"/"A" (11 Oct 2026), for grading
-- "3 or more goals in a row" when the final score alone cannot decide it (a
-- 3-1, a 4-2). Filled by lib/statsfill.js from the API-Football answer it
-- already fetches for corners. Until this runs, the code reads and writes
-- without it. Run once in the Supabase SQL editor.
alter table public.results add column if not exists seq text;
