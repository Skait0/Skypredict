-- Push v2 (13 Oct 2026): the 9am pick of the day, and "your slip landed".
--
-- user_id links a subscription to an account, and is set only when the reader
-- subscribes (or re-registers) while signed in. Deleting the account clears it.
-- note/note_at hold the one personal line the service worker shows for the
-- next empty push (lib/pushsend.js, GET /api/push?a=note). The worker reads the
-- line once, and the read clears it.
alter table public.push_subs add column if not exists user_id uuid references public.users(id) on delete set null;
alter table public.push_subs add column if not exists note jsonb;
alter table public.push_subs add column if not exists note_at timestamptz;
create index if not exists push_subs_user on public.push_subs (user_id);
