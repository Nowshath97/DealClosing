import React, { useEffect, useMemo, useRef, useState } from 'react';
import './dealPage.css';
import AskAIButton from './ai/AskAIButton';
import AICopilotDrawer from './ai/AICopilotDrawer';
import { AlertTriangle, ArrowDown, ArrowUp, Briefcase, Check, CheckCircle2, ChevronLeft, ChevronRight, ChevronsUpDown, Circle, CircleSlash, Flag, Hourglass, MoreHorizontal, MoreVertical, Plus, Search, XCircle } from 'lucide-react';

const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// Deal status buckets for the summary cards (ref_deal_status values are matched by keyword).
const BUCKETS = [
  { key: 'active', label: 'Active', tone: 'blue', icon: Briefcase, bar: true },
  { key: 'closed', label: 'Closed', tone: 'green', icon: CheckCircle2, bar: true },
  { key: 'recordComplete', label: 'Closed, Record Complete', tone: 'purple', icon: Flag },
  { key: 'dead', label: 'Dead / Declined', tone: 'red', icon: XCircle }
];
const bucketOf = deal => {
  const v = norm(deal.status);
  if (v.includes('recordcomplete')) return 'recordComplete';
  if (v.includes('dead') || v.includes('declin')) return 'dead';
  if (v.includes('closed')) return 'closed';
  return 'active';
};

const ACTIVITY_STATUSES = [
  { key: 'Not Started', icon: Circle, tone: 'grey' },
  { key: 'Not Required', icon: CircleSlash, tone: 'light' },
  { key: 'In Progress', icon: Hourglass, tone: 'green' },
  { key: 'Completed', icon: CheckCircle2, tone: 'blue' },
  { key: 'Overdue', icon: AlertTriangle, tone: 'red' }
];
const statusMeta = key => ACTIVITY_STATUSES.find(s => s.key === key) || ACTIVITY_STATUSES[0];

const SHORT = { allocations: 'Deal Alloc', riskcompliance: 'Risk & Cmpl', legalentitymanagement: 'Legal Enty Mgmt', transactionaldocs: 'Trans Docs', funding: 'Funding' };
const shortName = title => SHORT[norm(title)] || title;

const DAYS_FILTERS = [
  { key: '', label: 'Any' }, { key: 'overdue', label: 'Past target date' }, { key: '7', label: 'Within 7 days' },
  { key: '30', label: 'Within 30 days' }, { key: '31', label: 'More than 30 days' }
];
const daysMatch = (d, key) => {
  if (!key) return true;
  if (d == null) return false;
  if (key === 'overdue') return d < 0;
  if (key === '31') return d > 30;
  return d >= 0 && d <= Number(key);
};

const dealStatusTone = status => (/complete|closed|funded/i.test(status) ? 'green' : /progress|active/i.test(status) ? 'amber' : /dead|declin/i.test(status) ? 'red' : 'grey');

function ActivityIcon({ status }) {
  const { icon: Icon, tone } = statusMeta(status);
  return <span className={`dp-st ${tone}`} title={status}><Icon size={17} /></span>;
}
function MilestoneIcon({ reached }) {
  return reached ? <span className="dp-st ok" title="Reached"><Check size={13} strokeWidth={3} /></span> : <span className="dp-st grey" title="Not reached"><Circle size={17} /></span>;
}

function Menu({ label, icon: Icon, items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span className="dp-menu" ref={ref}>
      <button type="button" className="dp-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={e => { e.stopPropagation(); setOpen(o => !o); }}><Icon size={17} /></button>
      {open && <div className="dp-menu-list" role="menu">{items.map(([text, fn]) => <button key={text} role="menuitem" onClick={() => { setOpen(false); fn(); }}>{text}</button>)}</div>}
    </span>
  );
}

const PAGE_SIZE = 20;
const parseUs = d => { const [m, day, y] = String(d).split('/'); return new Date(`${y}-${m}-${day}`).getTime() || 0; };
const csvCell = v => `"${String(v ?? '').replaceAll('"', '""')}"`;

export default function DealPage({ deals, user, onOpenDeal, onCreateDeal }) {
  const [askOpen, setAskOpen] = useState(false);
  const [bucket, setBucket] = useState('active');
  const [tab, setTab] = useState('mine');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [milestone, setMilestone] = useState('');
  const [days, setDays] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [sort, setSort] = useState({ key: 'created', dir: 'desc' });
  const [page, setPage] = useState(1);

  const counts = useMemo(() => Object.fromEntries(BUCKETS.map(b => [b.key, deals.filter(d => bucketOf(d) === b.key).length])), [deals]);
  const distinct = key => [...new Set(deals.map(d => d[key]).filter(v => v && v !== '-'))].sort();
  const columns = useMemo(() => {
    const seen = new Map();
    deals.forEach(d => d.modules.forEach(m => { if (!seen.has(m.id)) seen.set(m.id, m.title); }));
    return [...seen].map(([id, title]) => ({ id, title }));
  }, [deals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = deals.filter(d =>
      bucketOf(d) === bucket &&
      (!q || `${d.investmentName} ${d.id}`.toLowerCase().includes(q)) &&
      (!type || d.investmentType === type) && (!status || d.status === status) && (!milestone || d.milestone === milestone) &&
      daysMatch(d.daysToClose, days) &&
      (!activityFilter || d.modules.some(m => m.status === activityFilter)));
    const val = { name: d => d.investmentName.toLowerCase(), created: d => parseUs(d.dateCreated), days: d => d.daysToClose ?? -Infinity }[sort.key];
    return [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * (sort.dir === 'asc' ? 1 : -1));
  }, [deals, bucket, query, type, status, milestone, days, activityFilter, sort]);

  // Back to page 1 whenever the result set changes; clamp if rows disappear (e.g. after a refresh).
  useEffect(() => { setPage(1); }, [bucket, query, type, status, milestone, days, activityFilter, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const from = (current - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(from, from + PAGE_SIZE);
  const pageNumbers = [...new Set([1, current - 1, current, current + 1, pageCount])].filter(n => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const toggleSort = key => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const SortHead = ({ k, children }) => (
    <th><button className="dp-sort" onClick={() => toggleSort(k)}>{children}{sort.key === k ? (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="dim" />}</button></th>
  );

  const exportCsv = () => {
    const rows = filtered;
    const head = ['Investment', 'Deal Code', 'Investment Type', 'Status', 'Created', 'Days to Close', 'Milestone', ...columns.map(c => c.title)];
    const lines = rows.map(d => [d.investmentName, d.id, d.investmentType, d.status, d.dateCreated, d.daysToClose ?? '', d.milestone, ...columns.map(c => d.modules.find(m => m.id === c.id)?.status || 'Not Started')]);
    const blob = new Blob([[head, ...lines].map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'deals.csv' });
    a.click(); URL.revokeObjectURL(a.href);
  };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const total = deals.length || 1;

  return (
    <div className="workspace-page dp-page">
      <section className="dp-welcome">
        <div>
          <p className="dp-date">{today}</p>
          <h1>Welcome Back, {user?.name || 'there'} <span aria-hidden="true">👋</span></h1>
          {user?.email && <p className="dp-email">{user.email}</p>}
        </div>
        <div className="dp-welcome-actions">
          <AskAIButton open={askOpen} onClick={() => setAskOpen(o => !o)} />
          <button className="dp-create" onClick={onCreateDeal}><Plus size={16} /> Create New Deal</button>
        </div>
      </section>

      <div className="dp-kpis">
        {BUCKETS.map(b => (
          <button key={b.key} className={`dp-kpi ${b.tone} ${bucket === b.key ? 'on' : ''}`} onClick={() => setBucket(b.key)} aria-pressed={bucket === b.key}>
            <span className="dp-kpi-icon"><b.icon size={24} /></span>
            <span className="dp-kpi-text"><strong>{counts[b.key]}</strong><small>{b.label}</small></span>
            {b.bar && <span className="dp-kpi-bar" aria-hidden="true"><i style={{ width: `${(counts[b.key] / total) * 100}%` }} /></span>}
          </button>
        ))}
      </div>

      <section className="dp-card">
        <div className="dp-card-head">
          <h2><Briefcase size={20} /> Deals</h2>
        </div>
        <div className="dp-tabs" role="tablist">
          {[['mine', 'My Deals'], ['team', 'My Team Deals'], ['entities', 'My Entities']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} disabled={k !== 'mine'} title={k !== 'mine' ? 'Not available yet' : undefined} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        <div className="dp-filters">
          <label className="dp-search"><Search size={16} aria-hidden="true" /><span className="dp-sr">Search</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search investment or deal code..." /></label>
          <label className="dp-field"><span>Investment type</span><select value={type} onChange={e => setType(e.target.value)}><option value="">Any</option>{distinct('investmentType').map(v => <option key={v}>{v}</option>)}</select></label>
          <label className="dp-field"><span>Status</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="">Any</option>{distinct('status').map(v => <option key={v}>{v}</option>)}</select></label>
          <label className="dp-field"><span>Milestone</span><select value={milestone} onChange={e => setMilestone(e.target.value)}><option value="">Any</option>{distinct('milestone').map(v => <option key={v}>{v}</option>)}</select></label>
          <label className="dp-field"><span>Days to closing</span><select value={days} onChange={e => setDays(e.target.value)}>{DAYS_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
        </div>

        <div className="dp-legend-row">
          <div className="dp-legend">
            {ACTIVITY_STATUSES.map(s => (
              <button key={s.key} className={`dp-pill ${s.tone} ${activityFilter === s.key ? 'on' : ''}`} aria-pressed={activityFilter === s.key} onClick={() => setActivityFilter(activityFilter === s.key ? '' : s.key)}>
                <s.icon size={14} /> {s.key}
              </button>
            ))}
          </div>
          <span className="dp-count">Showing {filtered.length ? `${from + 1}–${from + pageRows.length}` : 0} of {filtered.length}{filtered.length !== counts[bucket] ? ` (${counts[bucket]} in ${BUCKETS.find(b => b.key === bucket).label})` : ''} · {deals.length} deals loaded</span>
        </div>

        <div className="dp-table-wrap">
          <table className="dp-table">
            <thead>
              <tr>
                <SortHead k="name">Investment</SortHead><th>Deal Code</th><th>Investment Type</th><th>Status</th>
                <SortHead k="created">Created</SortHead><SortHead k="days">Days to Close</SortHead>
                <th className="c">IC Approved</th><th className="c">Ready to Close</th><th className="c">Closed</th>
                {columns.map(c => <th key={c.id} className="c" title={c.title}>{shortName(c.title)}</th>)}
                <th className="act"><Menu label="Table actions" icon={MoreVertical} items={[['Export to CSV', exportCsv]]} /></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(d => (
                <tr key={d.id}>
                  <td><button className="dp-link" onClick={() => onOpenDeal(d)}>{d.investmentName}</button></td>
                  <td className="muted">{d.id}</td><td className="muted">{d.investmentType}</td>
                  <td>{d.status && d.status !== '-' ? <span className={`dp-status ${dealStatusTone(d.status)}`}>{d.status}</span> : <span className="muted">-</span>}</td>
                  <td className="muted">{d.dateCreated}</td>
                  <td>{d.daysToClose == null ? <span className="muted">-</span> : <span className={`dp-days ${d.daysToClose < 0 ? 'neg' : ''}`}>{d.daysToClose}</span>}</td>
                  <td className="c"><MilestoneIcon reached={d.icApproved === 'Yes'} /></td>
                  <td className="c"><MilestoneIcon reached={d.readyToClose === 'Yes'} /></td>
                  <td className="c"><MilestoneIcon reached={d.closed === 'Yes'} /></td>
                  {columns.map(c => <td key={c.id} className="c"><ActivityIcon status={d.modules.find(m => m.id === c.id)?.status || 'Not Started'} /></td>)}
                  <td className="act"><Menu label={`Actions for ${d.investmentName}`} icon={MoreHorizontal} items={[['Open deal', () => onOpenDeal(d)]]} /></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={11 + columns.length} className="dp-empty">No deals match the current filters.</td></tr>}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <nav className="dp-pager" aria-label="Deals pagination">
            <span>Page {current} of {pageCount}</span>
            <div>
              <button className="dp-pg" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
              {pageNumbers.map((n, i) => (
                <React.Fragment key={n}>
                  {i > 0 && n - pageNumbers[i - 1] > 1 && <span className="dp-gap">…</span>}
                  <button className={`dp-pg ${n === current ? 'on' : ''}`} onClick={() => setPage(n)} aria-current={n === current ? 'page' : undefined} aria-label={`Page ${n}`}>{n}</button>
                </React.Fragment>
              ))}
              <button className="dp-pg" onClick={() => setPage(current + 1)} disabled={current === pageCount} aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
          </nav>
        )}
      </section>

      <AICopilotDrawer open={askOpen} onClose={() => setAskOpen(false)} deal={null} onOpenDeal={code => { const d = deals.find(x => x.id === code); if (d) onOpenDeal(d); }}
        pageFilters={{ deal_group: bucket, investment_type: type || null, status: status || null, milestone: milestone || null, days_to_closing: days || null, search: query || null, activity_status: activityFilter || null }} />
    </div>
  );
}
