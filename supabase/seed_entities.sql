-- Dummy data for public.entity and public.entity_account_map (Acc. 1 - Acc. 10), plus read access for the app.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run (existing ids are left alone).

-- ENTITIES -------------------------------------------------------------------------------------------------
insert into public.entity
  ("Id","EntityName","UpdatedDateTime","IsActive","UpdatedBy","HasVetoRights","IsAmgoReviewRequired","IsLuxReviewRequired","IsArticleEight",
   "FundAdmin","ConfirmWithClient","SubjectToClientReview","EntityCode","IsClientFunding","PrimaryTranche","AddtnlFundAdmin","IsAddtnlAMLReviewRequired","FundStatus","IsDeleted","IsValidEntity")
values
  ( 1,'Emerging Markets Fund',          now(),1,'seed',0,1,0,0,'Northgate Admin',0,0,'EMF-001',1,1,null,0,'Active',0,1),
  ( 2,'Mid Cap Growth Fund',            now(),1,'seed',0,0,0,1,'Northgate Admin',0,0,'MCG-002',1,1,null,0,'Active',0,1),
  ( 3,'Private Equity Partners Fund',   now(),1,'seed',1,1,1,0,'Harbor Fund Services',1,1,'PEP-003',1,1,'Atlas Admin',1,'Active',0,1),
  ( 4,'Secondary Opportunities Fund',   now(),1,'seed',0,0,1,0,'Harbor Fund Services',0,0,'SOF-004',1,2,null,0,'Active',0,1),
  ( 5,'Co-Investment Fund III',         now(),1,'seed',1,0,0,0,'Atlas Admin',1,0,'COI-005',0,1,null,0,'Active',0,1),
  ( 6,'Infrastructure Income Fund',     now(),1,'seed',0,1,0,1,'Northgate Admin',0,1,'INF-006',1,1,null,1,'Active',0,1),
  ( 7,'Real Estate Value Fund',         now(),1,'seed',0,0,0,0,'Atlas Admin',0,0,'REV-007',1,1,null,0,'Active',0,1),
  ( 8,'Credit Opportunities Fund',      now(),1,'seed',0,1,1,0,'Harbor Fund Services',0,0,'COF-008',1,1,'Atlas Admin',1,'Active',0,1),
  ( 9,'Small Cap Buyout Fund',          now(),1,'seed',1,0,0,0,'Northgate Admin',0,0,'SCB-009',1,2,null,0,'Active',0,1),
  (10,'Healthcare Growth Fund',         now(),1,'seed',0,0,0,1,'Atlas Admin',0,0,'HCG-010',0,1,null,0,'Active',0,1),
  (11,'Technology Growth Fund',         now(),1,'seed',0,1,0,0,'Northgate Admin',1,0,'TGF-011',1,1,null,0,'Active',0,1),
  (12,'European Mid Market Fund',       now(),1,'seed',0,0,1,0,'Harbor Fund Services',0,1,'EMM-012',1,1,null,0,'Active',0,1),
  (13,'Asia Pacific Growth Fund',       now(),1,'seed',1,1,0,0,'Atlas Admin',0,0,'APG-013',1,1,null,1,'Active',0,1),
  (14,'Global Income Fund',             now(),1,'seed',0,0,0,0,'Northgate Admin',0,0,'GIF-014',1,1,null,0,'Active',0,1),
  (15,'Sustainable Energy Fund',        now(),1,'seed',0,0,0,1,'Harbor Fund Services',0,0,'SEF-015',1,1,null,0,'Active',0,1),
  (16,'Direct Lending Fund',            now(),1,'seed',0,1,1,0,'Atlas Admin',0,0,'DLF-016',1,1,'Northgate Admin',1,'Active',0,1),
  (17,'Venture Select Fund',            now(),1,'seed',1,0,0,0,'Northgate Admin',1,1,'VSF-017',0,1,null,0,'Active',0,1),
  (18,'Long Short Equity Fund',         now(),1,'seed',0,0,1,0,'Harbor Fund Services',0,0,'LSE-018',1,1,null,0,'Active',0,1),
  (19,'Special Situations Fund',        now(),1,'seed',0,1,0,0,'Atlas Admin',0,0,'SSF-019',1,1,null,0,'Active',0,1),
  (20,'Distressed Debt Fund',           now(),1,'seed',0,1,1,0,'Northgate Admin',0,0,'DDF-020',1,2,null,1,'Active',0,1),
  (21,'Large Cap Value Fund',           now(),1,'seed',0,0,0,0,'Harbor Fund Services',0,0,'LCV-021',1,1,null,0,'Active',0,1),
  (22,'Opportunistic Fund II',          now(),1,'seed',1,0,0,0,'Atlas Admin',0,1,'OPP-022',1,1,null,0,'Active',0,1),
  (23,'Placeholder Entity A',           now(),1,'seed',0,0,0,0,null,0,0,'PH-023',0,1,null,0,'Active',0,0),
  (24,'Placeholder Entity B',           now(),1,'seed',0,0,0,0,null,0,0,'PH-024',0,1,null,0,'Active',0,0),
  -- Not selectable in the app: inactive and deleted entities
  (25,'Legacy Growth Fund (Closed)',    now(),0,'seed',0,0,0,0,'Atlas Admin',0,0,'LGF-025',0,1,null,0,'Closed',0,1),
  (26,'Retired Opportunities Fund',     now(),1,'seed',0,0,0,0,'Atlas Admin',0,0,'ROF-026',0,1,null,0,'Closed',1,1)
on conflict ("Id") do nothing;

-- ACCOUNT -> ENTITY MAPPING (one row per pair). Each entity belongs to exactly ONE account. --------------------
-- Replaces any earlier seeded mapping (including the first version, where entities were shared between accounts).
delete from public.entity_account_map where "UpdatedBy" = 'seed';

insert into public.entity_account_map
  ("Id","UpdatedDateTime","UpdatedBy","ClientAccount","ModelValuation","Primaries","Secondaries","CoInvest","IsActive","EntityId","AccountNotes",
   "SecondaryOverageOrOtherAccount","SubjectToVeto","IsPlaceholder","GroupId","IsErisa","IsExclusionRights","IsArticle8Eligibility","IsSecondaryFlagship")
select m.id, now(), 'seed', m.account, 0, 'Y', 'Y', 'Y', 1, m.entity_id, null, null,
       case when e."HasVetoRights" = 1 then 'Yes' else 'No' end, m.placeholder, 'G' || regexp_replace(m.account, '[^0-9]', '', 'g'), 0, 0, 0, 0
from (values
  -- Acc. 1: four entities
  ( 1,'Acc. 1', 1,0), ( 2,'Acc. 1', 2,0), ( 3,'Acc. 1', 3,0), ( 4,'Acc. 1', 4,0),
  -- Acc. 2: two
  ( 5,'Acc. 2', 5,0), ( 6,'Acc. 2', 6,0),
  -- Acc. 3: four
  ( 7,'Acc. 3', 7,0), ( 8,'Acc. 3', 8,0), ( 9,'Acc. 3', 9,0), (10,'Acc. 3',10,0),
  -- Acc. 4: one entity (+ a placeholder)
  (11,'Acc. 4',11,0), (12,'Acc. 4',24,1),
  -- Acc. 5: three
  (13,'Acc. 5',12,0), (14,'Acc. 5',13,0), (15,'Acc. 5',14,0),
  -- Acc. 6: two
  (16,'Acc. 6',15,0), (17,'Acc. 6',16,0),
  -- Acc. 7: three
  (18,'Acc. 7',17,0), (19,'Acc. 7',18,0), (20,'Acc. 7',19,0),
  -- Acc. 8: one
  (21,'Acc. 8',20,0),
  -- Acc. 9: one visible entity (+ an inactive and a deleted entity that must NOT show)
  (22,'Acc. 9',21,0), (23,'Acc. 9',25,0), (24,'Acc. 9',26,0),
  -- Acc. 10: one entity (+ a placeholder)
  (25,'Acc. 10',22,0), (26,'Acc. 10',23,1)
) as m(id, account, entity_id, placeholder)
join public.entity e on e."Id" = m.entity_id;

-- An entity can only ever be mapped to one account.
create unique index if not exists entity_account_map_one_account_per_entity on public.entity_account_map ("EntityId");

-- Explicit ids were used, so move the identity counters past them.
select setval(pg_get_serial_sequence('public.entity', 'Id'),             (select max("Id") from public.entity));
select setval(pg_get_serial_sequence('public.entity_account_map', 'Id'), (select max("Id") from public.entity_account_map));

-- ACCESS: the app (signed-in users) only needs to read these two tables -------------------------------------
do $$
declare t text;
begin
  foreach t in array array['entity','entity_account_map'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "app read" on public.%I', t);
    execute format('create policy "app read" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
