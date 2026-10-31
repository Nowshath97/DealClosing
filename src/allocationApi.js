import { rest, currentUser } from './supabaseClient';

// Save / load for the Initiate Allocations screen. Tables: allocation, allocation_line, allocation_legal_map,
// allocation_close, allocation_comment, allocation_document. Saving goes through the save_allocation() database
// function so the whole screen is stored in one transaction.

const num = v => Number(String(v ?? '').replaceAll(',', '')) || 0;
const nz = v => (v === '' || v == null ? null : num(v));
const round2 = n => Math.round(n * 100) / 100;
const flag = v => (v === true ? 1 : v === false ? 0 : null);
const yes = v => (v === 'Yes' ? 1 : v === 'No' ? 0 : null);

// Screen state -> payload for save_allocation(). `expenseOf` and `pctShown` are the screen's own calculations,
// so what is stored is exactly what the user sees.
export function buildAllocationPayload({ deal, s, status, lookups, expenseOf, pctShown }) {
  const infoOf = a => lookups.byAccount[a.account]?.find(e => e.name === a.entity);
  const totalAlloc = s.allocs.reduce((n, a) => n + num(a.exposure), 0);
  const totalExpenses = s.allocs.reduce((n, a) => n + expenseOf(a), 0);

  const lines = s.allocs.map((a, i) => {
    const info = infoOf(a);
    const expenses = expenseOf(a);
    return {
      ref: a.id, line_no: i + 1, account_map_id: info?.mapId ?? null, client_account: a.account || '', entity_id: info?.id ?? null,
      is_placeholder: a.placeholder ? 1 : 0, adjusted_exposure: nz(a.exposure), percentage: pctShown(a), expenses_amount: round2(expenses),
      expenses_overridden: s.override && a.expenseOverride !== '' ? 1 : 0, client_funding: a.exposure ? round2(num(a.exposure) + expenses) : null,
      amgo_review_required: info ? flag(info.amgo) : null, lux_review_required: info ? flag(info.lux) : null,
      additional_aml_review: info ? flag(info.aml) : null, client_veto: info ? flag(info.veto) : null
    };
  });

  return {
    deal_code: deal.id,
    user: currentUser()?.email ?? null,
    header: {
      status, funding_currency: deal.currency, total_adjusted_exposure: nz(s.totalExposure), funding_required: yes(s.fundingRequired),
      partial_funding: yes(s.partialFunding), expenses_pct: nz(s.expensesPct), expenses_value: round2(totalExpenses), total_allocated: round2(totalAlloc),
      total_client_funding: round2(totalAlloc + totalExpenses), calculation_override: s.override ? 1 : 0, aggregators_formed: s.aggregators ? 1 : 0
    },
    lines,
    legal_map: s.mappings.filter(m => m.allocId || m.legalName || m.amount)
      .map(m => ({ line_ref: m.allocId || null, investment_legal_name: m.legalName || null, allocation_amount: nz(m.amount) })),
    closes: s.closes.filter(c => c.date || c.final).map(c => ({ close_date: c.date || null, close_type: c.final || null })),
    comments: s.comments.map(c => ({ comment_text: c.text, created_by: c.by || null, created_on: c.iso || null })),
    documents: s.docs.map(d => ({ file_name: d.name, file_type: d.type || null, uploaded_by: d.by || null, uploaded_on: d.iso || null }))
  };
}

export const saveAllocation = payload => rest('rpc/save_allocation', { method: 'POST', body: { p: payload } });

// Stored allocation -> screen state. Returns null when this deal has no allocation yet.
export async function loadAllocation(dealCode) {
  const q = encodeURIComponent(dealCode);
  const [headers, lines, legal, closes, comments, docs, entities] = await Promise.all([
    rest(`allocation?deal_code=eq.${q}&select=*`),
    rest(`allocation_line?deal_code=eq.${q}&select=*&order=line_no,id`),
    rest(`allocation_legal_map?deal_code=eq.${q}&select=*&order=id`),
    rest(`allocation_close?deal_code=eq.${q}&select=*&order=id`),
    rest(`allocation_comment?deal_code=eq.${q}&select=*&order=created_on,id`),
    rest(`allocation_document?deal_code=eq.${q}&select=*&order=uploaded_on,id`),
    rest('entity?select=Id,EntityName')
  ]);
  const h = headers[0];
  if (!h) return null;
  const nameOf = id => entities.find(e => e.Id === id)?.EntityName || '';
  const text = v => (v == null ? '' : String(v));
  const yn = v => (v === 1 ? 'Yes' : v === 0 ? 'No' : '');

  return {
    status: h.status,
    state: {
      totalExposure: text(h.total_adjusted_exposure), fundingRequired: yn(h.funding_required), partialFunding: yn(h.partial_funding),
      expensesPct: text(h.expenses_pct), override: h.calculation_override === 1, aggregators: h.aggregators_formed === 1,
      allocs: lines.map(l => ({
        id: String(l.id), account: l.client_account || '', entity: nameOf(l.entity_id), placeholder: l.is_placeholder === 1,
        exposure: text(l.adjusted_exposure), pct: text(l.percentage), expenseOverride: l.expenses_overridden === 1 ? text(l.expenses_amount) : ''
      })),
      mappings: legal.map(m => ({ id: String(m.id), allocId: m.line_id == null ? '' : String(m.line_id), legalName: m.investment_legal_name || '', amount: text(m.allocation_amount) })),
      closes: closes.map(c => ({ id: String(c.id), date: c.close_date || '', final: c.close_type || '' })),
      comments: comments.map(c => ({ id: String(c.id), text: c.comment_text, by: c.created_by, iso: c.created_on, at: new Date(c.created_on).toLocaleString() })),
      docs: docs.map(d => ({ id: String(d.id), name: d.file_name, type: d.file_type || 'File', by: d.uploaded_by, iso: d.uploaded_on, date: new Date(d.uploaded_on).toLocaleDateString('en-US') }))
    }
  };
}

// Everything saved for a deal's allocation, shaped for the read-only "View Details" dialog. Returns null if none is saved.
export async function loadAllocationDetails(dealCode) {
  const q = encodeURIComponent(dealCode);
  const [headers, lines, legal, closes, comments, entities] = await Promise.all([
    rest(`allocation?deal_code=eq.${q}&select=*`),
    rest(`allocation_line?deal_code=eq.${q}&select=*&order=line_no,id`),
    rest(`allocation_legal_map?deal_code=eq.${q}&select=*&order=id`),
    rest(`allocation_close?deal_code=eq.${q}&select=*&order=id`),
    rest(`allocation_comment?deal_code=eq.${q}&select=*&order=created_on,id`),
    rest('entity?select=Id,EntityName')
  ]);
  const header = headers[0];
  if (!header) return null;
  const nameOf = id => entities.find(e => e.Id === id)?.EntityName || '';
  const lineRows = lines.map(l => ({ ...l, entity_name: nameOf(l.entity_id) }));
  return {
    header,
    lines: lineRows,
    legal: legal.map(m => { const l = lineRows.find(x => x.id === m.line_id); return { ...m, client_account: l?.client_account || '', entity_name: l?.entity_name || '' }; }),
    closes,
    comments
  };
}
