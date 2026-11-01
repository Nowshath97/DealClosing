-- Saves a whole allocation (header + lines + legal-name mapping + closes + comments + documents) in ONE transaction.
-- The app calls this from Save as draft / Save and exit / Initiate. Run allocation_tables.sql, fund_allocations.sql and deal_collaboration.sql first.
-- Run in Supabase Dashboard -> SQL Editor. Safe to re-run.
--
-- It replaces the deal's child rows each time, so what is on screen is exactly what is stored.

create or replace function public.save_allocation(p jsonb)
returns void
language plpgsql
as $$
declare
  v_deal   varchar := p->>'deal_code';
  h        jsonb   := p->'header';
  v_user   varchar := p->>'user';
  v_status varchar := coalesce(h->>'status', 'Draft');
  r        jsonb;
  v_line   int;
  v_updated int;
  v_ids    jsonb := '{}'::jsonb;   -- screen row ref -> allocation_line.id
begin
  if v_deal is null then
    raise exception 'deal_code is required';
  end if;

  insert into public.allocation (
    deal_code, funding_currency, total_adjusted_exposure, funding_required, partial_funding, expenses_pct, expenses_value,
    total_allocated, total_client_funding, calculation_override, aggregators_formed, status, initiated_by, initiated_on,
    created_by, modified_by, modified_on)
  values (
    v_deal, h->>'funding_currency', (h->>'total_adjusted_exposure')::numeric, (h->>'funding_required')::smallint, (h->>'partial_funding')::smallint,
    (h->>'expenses_pct')::numeric, (h->>'expenses_value')::numeric, (h->>'total_allocated')::numeric, (h->>'total_client_funding')::numeric,
    coalesce((h->>'calculation_override')::smallint, 0), coalesce((h->>'aggregators_formed')::smallint, 0), v_status,
    case when v_status = 'Initiated' then v_user end, case when v_status = 'Initiated' then now() end,
    v_user, v_user, now())
  on conflict (deal_code) do update set
    funding_currency        = excluded.funding_currency,
    total_adjusted_exposure = excluded.total_adjusted_exposure,
    funding_required        = excluded.funding_required,
    partial_funding         = excluded.partial_funding,
    expenses_pct            = excluded.expenses_pct,
    expenses_value          = excluded.expenses_value,
    total_allocated         = excluded.total_allocated,
    total_client_funding    = excluded.total_client_funding,
    calculation_override    = excluded.calculation_override,
    aggregators_formed      = excluded.aggregators_formed,
    status                  = excluded.status,
    initiated_by            = coalesce(public.allocation.initiated_by, excluded.initiated_by),
    initiated_on            = coalesce(public.allocation.initiated_on, excluded.initiated_on),
    modified_by             = v_user,
    modified_on             = now();

  -- Remove deal-level fund rows for entities explicitly removed from this screen.
  -- Close-specific allocations are managed separately.
  delete from public.fund_allocations f where f.deal_code=v_deal and f.fund_close_id is null
    and exists(select 1 from public.allocation_line old where old.deal_code=v_deal and old.entity_id=f.entity_id)
    and not exists(select 1 from jsonb_array_elements(coalesce(p->'lines','[]'::jsonb)) x where (x->>'entity_id')::int=f.entity_id);

  -- Replace editable children. Close IDs are preserved so close-scoped tasks remain attached when dates are edited.
  delete from public.allocation_line     where deal_code = v_deal;

  delete from public.fund_closes c
  where c.deal_code = v_deal
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p->'closes', '[]'::jsonb)) x
      where x->>'id' ~ '^[0-9]+$' and (x->>'id')::int = c.id
    );

  for r in select * from jsonb_array_elements(coalesce(p->'lines', '[]'::jsonb)) loop
    insert into public.allocation_line (
      deal_code, line_no, account_map_id, client_account, entity_id, is_placeholder, adjusted_exposure, percentage, expenses_amount,
      expenses_overridden, client_funding, amgo_review_required, lux_review_required, additional_aml_review, client_veto)
    values (
      v_deal, (r->>'line_no')::smallint, (r->>'account_map_id')::int, coalesce(r->>'client_account', ''), (r->>'entity_id')::int,
      coalesce((r->>'is_placeholder')::smallint, 0), (r->>'adjusted_exposure')::numeric, (r->>'percentage')::numeric, (r->>'expenses_amount')::numeric,
      coalesce((r->>'expenses_overridden')::smallint, 0), (r->>'client_funding')::numeric, (r->>'amgo_review_required')::smallint,
      (r->>'lux_review_required')::smallint, (r->>'additional_aml_review')::smallint, (r->>'client_veto')::smallint)
    returning id into v_line;
    v_ids := v_ids || jsonb_build_object(r->>'ref', v_line);
    if nullif(r->>'entity_id','') is not null then
      insert into public.fund_allocations(deal_code,entity_id,allocation_pct,amount_invested,
        initial_amount_invested,expenses_amount,client_id,client_account,is_placeholder,updated_by,updated_date_time)
      values(v_deal,(r->>'entity_id')::int,(r->>'percentage')::numeric,(r->>'adjusted_exposure')::numeric,
        (r->>'adjusted_exposure')::numeric,(r->>'expenses_amount')::numeric,
        (select client_id from public.client_entity_map where id=(r->>'account_map_id')::int),
        r->>'client_account',(r->>'is_placeholder')::smallint,v_user,localtimestamp)
      on conflict(deal_code,entity_id) where fund_close_id is null do update set
        allocation_pct=excluded.allocation_pct,amount_invested=excluded.amount_invested,
        expenses_amount=excluded.expenses_amount,client_id=excluded.client_id,client_account=excluded.client_account,
        is_placeholder=excluded.is_placeholder,updated_by=excluded.updated_by,updated_date_time=excluded.updated_date_time;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'legal_map', '[]'::jsonb)) loop
    insert into public.allocation_legal_map (deal_code, line_id, investment_legal_name, allocation_amount)
    values (v_deal, (v_ids->>(r->>'line_ref'))::int, r->>'investment_legal_name', (r->>'allocation_amount')::numeric);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'closes', '[]'::jsonb)) loop
    v_updated := 0;
    if r->>'id' ~ '^[0-9]+$' then
      update public.fund_closes
      set close_date = (r->>'close_date')::date, estimate_or_final_close = nullif(r->>'close_type', '')
      where id = (r->>'id')::int and deal_code = v_deal;
      get diagnostics v_updated = row_count;
    end if;
    if v_updated = 0 then
      insert into public.fund_closes (deal_code, close_date, estimate_or_final_close)
      values (v_deal, (r->>'close_date')::date, nullif(r->>'close_type', ''));
    end if;
  end loop;

  -- Deal collaboration is shared across tasks. Never replace all deal records on save.
  for r in select * from jsonb_array_elements(coalesce(p->'comments','[]'::jsonb)) loop
    if nullif(r->>'id','') is null then
      insert into public.deal_comment(deal_code,client_ref,comment_text,created_by,created_on)
      values(v_deal,r->>'client_ref',r->>'comment_text',coalesce(r->>'created_by',v_user),coalesce((r->>'created_on')::timestamptz,now()))
      on conflict(deal_code,client_ref) do nothing;
    end if;
  end loop;
  delete from public.deal_document d where d.deal_code=v_deal
    and d.id in(select value::int from jsonb_array_elements_text(coalesce(p->'removed_document_ids','[]'::jsonb)));
  for r in select * from jsonb_array_elements(coalesce(p->'documents','[]'::jsonb)) loop
    if nullif(r->>'id','') is null then
      insert into public.deal_document(deal_code,client_ref,file_name,file_type,uploaded_by,uploaded_on)
      values(v_deal,r->>'client_ref',r->>'file_name',r->>'file_type',coalesce(r->>'uploaded_by',v_user),coalesce((r->>'uploaded_on')::timestamptz,now()))
      on conflict(deal_code,client_ref) do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.save_allocation(jsonb) to authenticated;

notify pgrst, 'reload schema';
