-- sql/results_ht.sql - the half-time score on every result (13 Oct 2026).
-- API-Football returns it with each final score; lib/statsfill.js now keeps it, so
-- the slip ledger can settle first-half markets (lib/legrade.js). Safe to run twice.
alter table public.results add column if not exists hth smallint;
alter table public.results add column if not exists hta smallint;
