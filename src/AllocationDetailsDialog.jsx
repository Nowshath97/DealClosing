import React, { useEffect, useRef, useState } from 'react';
import './allocationDetails.css';
import { ChevronDown, Download, X } from 'lucide-react';
import { loadAllocationDetails } from './allocationApi';

const fmt = n => (n == null || n === '' ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const yn = v => (v === 1 ? 'Yes' : v === 0 ? 'No' : '-');
const date = d => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : '-');
const csvCell = v => `"${String(v ?? '').replaceAll('"', '""')}"`;

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="ad-section">
      <button type="button" className="ad-sec-head" aria-expanded={open} onClick={() => setOpen(o => !o)}><span>{title}</span><ChevronDown size={18} className={open ? 'open' : ''} aria-hidden="true" /></button>
      {open && <div className="ad-sec-body">{children}</div>}
    </section>
  );
}

function Table({ head, rows, empty }) {
  return (
    <div className="ad-table-wrap">
      <table className="ad-table">
        <thead><tr>{head.map((h, i) => <th key={h} className={i === 0 || /name|entity|account|type|status/i.test(h) ? '' : 'num'}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 || /^[^0-9-]/.test(String(c)) && Number.isNaN(Number(String(c).replaceAll(',', ''))) ? '' : 'num'}>{c}</td>)}</tr>) : <tr><td colSpan={head.length} className="ad-empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Read-only view of what was collected by the allocation tasks. It covers the content area only, so the side navigation stays clickable.
export default function AllocationDetailsDialog({ deal, onClose }) {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const ref = useRef(null);

  useEffect(() => {
    let live = true;
    loadAllocationDetails(deal.id)
      .then(data => live && setState({ loading: false, error: '', data }))
      .catch(e => live && setState({ loading: false, error: e.message, data: null }));
    return () => { live = false; };
  }, [deal.id]);

  useEffect(() => {
    const el = ref.current;
    el?.querySelector('[data-autofocus]')?.focus();
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data } = state;
  const usd = deal.currency === 'USD';

  const exportCsv = () => {
    const legalFor = id => data.legal.filter(m => m.line_id === id).map(m => `${m.investment_legal_name} (${fmt(m.allocation_amount)})`).join('; ');
    const head = ['Client Account', 'Allocating Entity', 'Adjusted Exposure', 'Percentage', 'Expenses', 'Client Funding', 'AMGO Review', 'LUX Review', 'Additional AML Review', 'Client Veto', 'Placeholder', 'Investment Legal Names'];
    const rows = data.lines.map(l => [l.client_account, l.entity_name, l.adjusted_exposure, l.percentage, l.expenses_amount, l.client_funding,
      yn(l.amgo_review_required), yn(l.lux_review_required), yn(l.additional_aml_review), yn(l.client_veto), yn(l.is_placeholder), legalFor(l.id)]);
    const blob = new Blob([[head, ...rows].map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `allocations-${deal.id}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="ad-root">
      <div className="ad-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="ad-dialog" role="dialog" aria-modal="false" aria-labelledby="ad-title" ref={ref}>
        <header>
          <div><h2 id="ad-title">Additional Deal Information</h2><p>Read-only data collected from tasks · {deal.investmentName}</p></div>
          <button type="button" className="ad-close" aria-label="Close" onClick={onClose} data-autofocus><X size={20} /></button>
        </header>

        <div className="ad-body">
          {state.loading && <p className="ad-hint">Loading…</p>}
          {state.error && <div className="form-error" role="alert">Could not load the allocation: {state.error}</div>}
          {!state.loading && !state.error && !data && <p className="ad-hint">No allocation has been saved for this deal yet.</p>}

          {data && (
            <>
              <Section title="Allocations">
                <dl className="ad-facts">
                  <div><dt>Funding Currency</dt><dd>{data.header.funding_currency || deal.currency}</dd></div>
                  <div><dt>Total Adjusted Exposure: Funding Currency</dt><dd>{fmt(data.header.total_adjusted_exposure)}</dd></div>
                  <div><dt>Total Adjusted Exposure: USD</dt><dd>{usd ? fmt(data.header.total_adjusted_exposure) : '-'}</dd></div>
                  <div><dt>Funding Required at Time of Close?</dt><dd>{yn(data.header.funding_required)}</dd></div>
                  <div><dt>Partial Funding or Overfunding?</dt><dd>{yn(data.header.partial_funding)}</dd></div>
                  <div><dt>Expenses %</dt><dd>{data.header.expenses_pct == null ? '-' : `${data.header.expenses_pct}%`}</dd></div>
                  <div><dt>Status</dt><dd>{data.header.status}</dd></div>
                </dl>
                <button type="button" className="ad-export" onClick={exportCsv}><Download size={15} /> Export detailed allocations</button>
              </Section>

              <Section title="Allocating entities">
                <Table
                  head={['Client Account', 'Allocating Entity', 'Adjusted Exposure', '%', 'Expenses', 'Client Funding', 'AMGO', 'LUX', 'AML', 'Veto']}
                  rows={data.lines.map(l => [l.client_account || '-', l.entity_name || '-', fmt(l.adjusted_exposure), l.percentage == null ? '-' : `${l.percentage}%`, fmt(l.expenses_amount), fmt(l.client_funding),
                    yn(l.amgo_review_required), yn(l.lux_review_required), yn(l.additional_aml_review), yn(l.client_veto)])}
                  empty="No allocation rows." />
                <p className="ad-total">Total allocated: <b>{fmt(data.header.total_allocated)}</b> · Expenses: <b>{fmt(data.header.expenses_value)}</b> · Client funding: <b>{fmt(data.header.total_client_funding)}</b></p>
              </Section>

              <Section title="Investment legal names">
                <Table head={['Account', 'Entity', 'Investment Legal Name', 'Allocation Amount']}
                  rows={data.legal.map(m => [m.client_account || '-', m.entity_name || '-', m.investment_legal_name || '-', fmt(m.allocation_amount)])}
                  empty="No investment legal names mapped." />
              </Section>

              <Section title="Close details">
                <Table head={['Close Date', 'Type']} rows={data.closes.map(c => [date(c.close_date), c.close_type || '-'])} empty="No closes." />
              </Section>

              <Section title="Comments">
                {data.comments.length
                  ? <ul className="ad-comments">{data.comments.map(c => <li key={c.id}><p>{c.comment_text}</p><small>{c.created_by ? `${c.created_by} · ` : ''}{new Date(c.created_on).toLocaleString()}</small></li>)}</ul>
                  : <p className="ad-hint">No comments on this activity yet.</p>}
              </Section>
            </>
          )}
        </div>
        <footer><button type="button" className="ad-btn" onClick={onClose}>Close</button></footer>
      </div>
    </div>
  );
}
