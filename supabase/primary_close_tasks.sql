-- Enable task rows to belong to one Primary deal close as well as a deal.
-- Run after allocation_tables.sql, from Supabase Dashboard -> SQL Editor.
-- Existing rows remain deal-level (close_id IS NULL).

alter table public.task
  add column if not exists close_id integer
  references public.fund_closes(id) on delete cascade;

create index if not exists task_deal_close_activity_idx
  on public.task (deal_code, close_id, activity_id);

-- One database-backed Finalize Allocations task per Primary close.
create or replace function public.ensure_primary_close_finalize_task() returns trigger
language plpgsql as $$
declare task_ref integer; activity_ref integer; status_ref integer;
begin
  if not exists(select 1 from public.deal d join public.ref_deal_type t on t.id=d.type
    where d.deal_code=new.deal_code and regexp_replace(lower(t.value),'[^a-z]','','g') in ('primary','primaries')) then return new; end if;
  select id into task_ref from public.ref_task_name where regexp_replace(lower(value),'[^a-z]','','g')='finalizeallocations' order by id limit 1;
  select id into status_ref from public.ref_task_status where regexp_replace(lower(value),'[^a-z]','','g')='notstarted' order by id limit 1;
  select activity_id into activity_ref from public.task_activity_map where task_id=task_ref and activity_id is not null limit 1;
  if activity_ref is null then
    select id into activity_ref from public.ref_deal_activity where regexp_replace(lower(value),'[^a-z]','','g') in ('allocations','dealallocations') order by id limit 1;
  end if;
  if task_ref is null or status_ref is null or activity_ref is null then
    raise exception 'Configure Finalize Allocations, Not Started and its task/activity mapping before saving Primary closes.';
  end if;
  perform pg_advisory_xact_lock(70621,new.id);
  if not exists(select 1 from public.task where close_id=new.id and deal_code=new.deal_code and task_id=task_ref) then
    insert into public.task(deal_code,close_id,task_id,activity_id,status,due_date)
      values(new.deal_code,new.id,task_ref,activity_ref,status_ref,new.close_date);
  end if;
  return new;
end $$;
drop trigger if exists primary_close_finalize_task on public.fund_closes;
create trigger primary_close_finalize_task after insert or update of close_date on public.fund_closes
  for each row execute function public.ensure_primary_close_finalize_task();
-- Backfill through the same trigger without duplicating existing task rows.
update public.fund_closes set close_date=close_date;
notify pgrst, 'reload schema';
