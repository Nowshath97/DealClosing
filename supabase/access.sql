-- Lets signed-in Supabase Auth users use the existing deal/task/ref_* tables from the app.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.
-- POC-level: any authenticated user can read/write every deal. Tighten the policies before real use.

do $$
declare t text;
begin
  -- Read-only lookup tables
  foreach t in array array['ref_assignee_type','ref_deal_activity','ref_deal_milestone','ref_deal_status','ref_deal_type','ref_funding_required','ref_task_name','ref_task_status','task_activity_map','deal_groups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "app read" on public.%I', t);
    execute format('create policy "app read" on public.%I for select to authenticated using (true)', t);
  end loop;

  -- Tables the app writes to
  foreach t in array array['deal','task'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists "app rw" on public.%I', t);
    execute format('create policy "app rw" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
