-- Finalize Allocations: allow the 'Finalized' allocation status.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run. (Run allocation_tables.sql and save_allocation.sql before this.)

alter table public.allocation drop constraint if exists allocation_status_check;
alter table public.allocation
  add constraint allocation_status_check check (status in ('Draft','Initiated','Finalized'));

notify pgrst, 'reload schema';

-- If the first statement did not remove the old rule (error "violates check constraint ... status" when finalizing), find its name:
--   select conname from pg_constraint where conrelid = 'public.allocation'::regclass and contype = 'c';
-- and drop that one instead: alter table public.allocation drop constraint "<name>";
