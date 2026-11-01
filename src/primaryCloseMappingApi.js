import { rest } from './supabaseClient';
import { fetchClientAccounts, fetchAccountEntities } from './api';

const q = value => encodeURIComponent(value);
const dateLabel = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US') : '—';

export async function loadPrimaryCloseMapping(dealCode) {
  const [headers, closes, links, lookup, entityLookup, tranches] = await Promise.all([
    rest(`allocation?deal_code=eq.${q(dealCode)}&select=deal_code`),
    rest(`fund_closes?deal_code=eq.${q(dealCode)}&select=*&order=close_date,id`),
    rest(`allocation_close_account?deal_code=eq.${q(dealCode)}&select=*`),
    fetchClientAccounts(),
    fetchAccountEntities(),
    rest('entity_tranche?select=id,entity_id,name&is_active=eq.true&order=name')
  ]);
  return {
    hasAllocation: headers.length > 0,
    accounts: lookup,
    entitiesByAccount: entityLookup.byAccount,
    tranches,
    closes: closes.map(c => ({ id: String(c.id), date: c.close_date || '', final: c.estimate_or_final_close || '' })),
    assignments: Object.fromEntries(closes.map(c => [String(c.id), links.filter(x => x.close_id === c.id).map(x => x.account_name)])),
    details: Object.fromEntries(closes.map(c => [String(c.id), { _settings: c.editor_data?.settings || {}, ...Object.fromEntries(links.filter(x => x.close_id === c.id).map(x => [x.account_name, {
      nbAgeVintageYear: x.nb_age_vintage_year || '', icApproval: x.ic_approval == null ? '' : x.ic_approval ? 'Yes' : 'No', icApprovedDate: x.ic_approved_date || '',
      allocationFundingCurrency: x.allocation_funding_currency == null ? '' : String(x.allocation_funding_currency), allocationUsd: x.allocation_usd == null ? '' : String(x.allocation_usd),
      receiveSignoffFromPm: x.receive_signoff_from_pm == null ? '' : x.receive_signoff_from_pm ? 'Yes' : 'No',
      subjectToClientReview: x.subject_to_client_review || '', clientReviewInformation: x.client_review_information || '',
      clientApproved: x.client_approved == null ? '' : x.client_approved ? 'Yes' : 'No',
      expensesAmount: c.editor_data?.accounts?.[x.account_name]?.expensesAmount ?? '',
      ...(c.editor_data?.accounts?.[x.account_name]?.allocationMappings ? { allocationMappings: c.editor_data.accounts[x.account_name].allocationMappings } : {})
    }])) }]))
  };
}

export async function savePrimaryCloseMapping(deal, closes, assignments, details, { onlyCloseId = null } = {}) {
  const header = await rest(`allocation?deal_code=eq.${q(deal.id)}&select=deal_code`);
  if (!header.length) {
    await rest('allocation', {
      method: 'POST', prefer: 'return=minimal',
      body: { deal_code: deal.id, funding_currency: deal.currency || 'USD', status: 'Draft' }
    });
  }

  const savedCloses = [];
  for (const close of closes.filter(c => onlyCloseId == null || String(c.id) === String(onlyCloseId))) {
    const body = { deal_code: deal.id, close_date: close.date || null, estimate_or_final_close: close.final || null, editor_data: { settings: details[close.id]?._settings || {}, accounts: Object.fromEntries((assignments[close.id] || []).map(name => [name, { expensesAmount: details[close.id]?.[name]?.expensesAmount ?? '', ...(details[close.id]?.[name]?.allocationMappings ? { allocationMappings: details[close.id][name].allocationMappings } : {}) }])) } };
    if (/^\d+$/.test(String(close.id))) {
      await rest(`fund_closes?id=eq.${q(close.id)}&deal_code=eq.${q(deal.id)}`, { method: 'PATCH', prefer: 'return=minimal', body });
      savedCloses.push({ ...close, sourceId: close.id, id: String(close.id) });
    } else {
      const rows = await rest('fund_closes?select=id', { method: 'POST', prefer: 'return=representation', body });
      if (!rows?.[0]?.id) throw new Error('Supabase did not return the new close ID.');
      savedCloses.push({ ...close, sourceId: close.id, id: String(rows[0].id) });
    }
  }

  const retained = savedCloses.filter(c => /^\d+$/.test(c.id)).map(c => c.id);
  const existing = await rest(`fund_closes?deal_code=eq.${q(deal.id)}&select=id`);
  for (const row of existing) {
    if (onlyCloseId == null && !retained.includes(String(row.id))) {
      const tasks = await rest(`task?close_id=eq.${q(row.id)}&select=id`);
      if (tasks.length) throw new Error(`Close ${row.id} still has workflow tasks attached. Keep it and update its date instead of removing it.`);
      await rest(`fund_closes?id=eq.${q(row.id)}&deal_code=eq.${q(deal.id)}`, { method: 'DELETE', prefer: 'return=minimal' });
    }
  }

  await rest(`allocation_close_account?deal_code=eq.${q(deal.id)}${onlyCloseId == null ? '' : `&close_id=eq.${q(onlyCloseId)}`}`, { method: 'DELETE', prefer: 'return=minimal' });
  const links = savedCloses.flatMap(c => (assignments[c.sourceId] || []).map(account_name => {
    const d = details[c.sourceId]?.[account_name] || {};
    return {
      deal_code: deal.id, close_id: Number(c.id), account_name,
      nb_age_vintage_year: d.nbAgeVintageYear || null, ic_approval: d.icApproval === 'Yes' ? true : d.icApproval === 'No' ? false : null,
      ic_approved_date: d.icApprovedDate || null, allocation_funding_currency: d.allocationFundingCurrency == null || d.allocationFundingCurrency === '' ? null : Number(d.allocationFundingCurrency),
      allocation_usd: d.allocationUsd == null || d.allocationUsd === '' ? null : Number(d.allocationUsd),
      receive_signoff_from_pm: d.receiveSignoffFromPm === 'Yes' ? true : d.receiveSignoffFromPm === 'No' ? false : null,
      subject_to_client_review: d.subjectToClientReview || null, client_review_information: d.clientReviewInformation || null,
      client_approved: d.clientApproved === 'Yes' ? true : d.clientApproved === 'No' ? false : null
    };
  }));
  if (links.length) await rest('allocation_close_account', { method: 'POST', prefer: 'return=minimal', body: links });
  return {
    closes: savedCloses.map(({ sourceId, ...c }) => ({ ...c, dateLabel: dateLabel(c.date) })),
    assignments: Object.fromEntries(savedCloses.map(c => [c.id, assignments[c.sourceId] || []])),
    details: Object.fromEntries(savedCloses.map(c => [c.id, { _settings: details[c.sourceId]?._settings || {}, ...Object.fromEntries((assignments[c.sourceId] || []).map(name => [name, details[c.sourceId]?.[name] || {}])) }]))
  };
}
