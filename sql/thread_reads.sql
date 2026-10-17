-- sql/thread_reads.sql - per-conversation read status for the admin inbox
-- (owner, 17 Oct 2026). Run once in the Supabase SQL editor.
-- {readerId: when the admin last read that conversation}, on the admin's own row.
alter table public.message_reads add column if not exists threads jsonb not null default '{}'::jsonb;
