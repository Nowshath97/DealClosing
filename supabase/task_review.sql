-- Storage for the single-question review tasks (AML Counterparty Screening and the other Risk & Compliance tasks).
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.
--   task_response : the answer given for a task (one row per task)
--   deal_comment / deal_document: shared deal collaboration; created by deal_collaboration.sql

create table if not exists public.task_response (
  task_id      integer primary key references public.task(id) on delete cascade,
  answer             varchar(100),
  answers            jsonb,                  -- every answer, keyed by question: {"materialExposure":"Yes","alignedWithPolicy":"NO"}
  confirmation_date  date,
  confirmation_by    varchar(255),
  answered_by        varchar(255),
  answered_on        timestamptz not null default now()
);

-- For databases where task_response was created before these two columns existed:
alter table public.task_response add column if not exists answers jsonb;
alter table public.task_response alter column answer drop not null;
alter table public.task_response add column if not exists confirmation_date date;
alter table public.task_response add column if not exists confirmation_by varchar(255);

-- Comments and document metadata are deal-owned. Run deal_collaboration.sql next.

-- POC level: any signed-in user can read and write; tighten before real use.
do $$
declare t text;
begin
  foreach t in array array['task_response'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "app rw" on public.%I', t);
    execute format('create policy "app rw" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
