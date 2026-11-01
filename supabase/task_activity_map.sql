-- Ensure every task created by the app has its valid activity mapping,
-- including the Primary-deal "Map Accounts to Close" task.
-- Run in Supabase Dashboard -> SQL Editor. Existing mappings are left intact.
insert into public.ref_task_name (id, value, sort_order)
select (select coalesce(max(id), 0) + 1 from public.ref_task_name), 'Map Accounts to Close', 5
where not exists (
  select 1 from public.ref_task_name
  where regexp_replace(lower(value), '[^a-z]', '', 'g') = 'mapaccountstoclose'
);

insert into public.task_activity_map (task_id, activity_id)
select tn.id, a.id
from (values
  ('Map Accounts to Close', 'allocations'), -- Primary deals: deal-level account/close mapping
  ('Initiate Allocations', 'allocations'),
  ('Finalize Allocations', 'allocations'),
  ('AML Counterparty Screening', 'riskcompliance'),
  ('Avoidance Policy Confirmation', 'riskcompliance'),
  ('Assign Legal Lead', 'legalentitymanagement'),
  ('Legal Approval to Close', 'transactionaldocs'),
  ('Transactional Document Approval', 'transactionaldocs'),
  ('Complete Funding', 'funding')
) as required(task_name, activity_key)
join public.ref_task_name tn
  on regexp_replace(lower(tn.value), '[^a-z]', '', 'g') = regexp_replace(lower(required.task_name), '[^a-z]', '', 'g')
join public.ref_deal_activity a
  on regexp_replace(lower(a.value), '[^a-z]', '', 'g') in (
    required.activity_key,
    case when required.activity_key = 'allocations' then 'dealallocations' else required.activity_key end
  )
on conflict do nothing;

notify pgrst, 'reload schema';
