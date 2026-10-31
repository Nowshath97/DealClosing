-- Assign Legal Lead: where the chosen lead is stored, and read access to the users list for the pick list.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.

-- 1. The deal's legal lead (points at public.users).
alter table public.deal add column if not exists legal_lead integer references public.users(id);

-- 2. Let signed-in users read the users table so the pick list can show them.
--    NOTE: the app reads this table with select=*, so any sensitive column (e.g. a password hash) would be sent to the browser.
--    Safer: expose only what the pick list needs through a view (adjust the column names to your users table), then
--    point the app at it. Tell me the column names and I'll switch the app to the view:
--      create view public.app_users as select id, name, email from public.users where coalesce(is_active, 1) = 1;
--      grant select on public.app_users to authenticated;
alter table public.users enable row level security;
grant select on public.users to authenticated;
drop policy if exists "app read" on public.users;
create policy "app read" on public.users for select to authenticated using (true);

notify pgrst, 'reload schema';
