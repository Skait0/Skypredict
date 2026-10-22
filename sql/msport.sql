-- sql/msport.sql - MSport, the seventh book (22 Oct 2026). Run once in the Supabase SQL editor.
-- Lets a Wizard Pass reader pick MSport for "My daily slip". Only the constraint changes;
-- no row is touched, so nothing needs a backup (sql/ rule: test/sqlundo.test.js).
alter table public.autopilot drop constraint if exists autopilot_book_check;
alter table public.autopilot add constraint autopilot_book_check
  check (book in ('sporty','bet9ja','betking','betpawa','onexbet','betway','msport'));

-- UNDO (only if no reader has picked MSport yet):
-- alter table public.autopilot drop constraint if exists autopilot_book_check;
-- alter table public.autopilot add constraint autopilot_book_check
--   check (book in ('sporty','bet9ja','betking','betpawa','onexbet','betway'));
