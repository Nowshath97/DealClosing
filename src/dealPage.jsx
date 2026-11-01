import React, { useEffect, useMemo, useRef, useState } from 'react';
import './dealPage.css';
import AskAIButton from './ai/AskAIButton';
import AICopilotDrawer from './ai/AICopilotDrawer';
import { AlertTriangle, ArrowDown, ArrowUp, Briefcase, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, ChevronsUpDown, Circle, CircleSlash, Flag, Hourglass, MoreHorizontal, MoreVertical, Plus, Search, XCircle } from 'lucide-react';

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

function AnimatedCount({ value }) {
  const [display, setDisplay] = useState(0);
  const previous = useRef(0);
  useEffect(() => {
    const start = previous.current;
    const target = Number(value) || 0;
    if (typeof window === 'undefined') { setDisplay(target); return undefined; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target); previous.current = target; return undefined;
    }
    const startTime = performance.now();
    let frame;
    const duration = 550;
    const tick = now => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (target - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else previous.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); previous.current = target; };
  }, [value]);
  return <strong className="dp-kpi-number">{display}</strong>;
}

function ActivityIcon({ status }) {
  const { icon: Icon, tone } = statusMeta(status);
  return <span className={`dp-st ${tone}`} title={status}><Icon size={17} /></span>;
}
function DealStatusProgress({ deal }) {
  const stages = FIXED_MILESTONES;
  const reached = stages.map(stage => isYes(deal[stage.id]));
  return (
    <div className="dp-deal-stage" role="group" aria-label={`Deal status for ${deal.investmentName}`}>
      {stages.map((stage, i) => (
        <React.Fragment key={stage.id}>
          {i > 0 && <span className={`dp-deal-stage-line ${reached[i - 1] && reached[i] ? 'done' : ''}`} aria-hidden="true" />}
          <span className={`dp-deal-stage-node ${reached[i] ? 'done' : ''}`} title={`${stage.title}: ${reached[i] ? 'Reached' : 'Not reached'}`} aria-label={`${stage.title}: ${reached[i] ? 'Reached' : 'Not reached'}`}>
            {reached[i] && <Check size={11} strokeWidth={3} aria-hidden="true" />}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
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
const PREF_KEY = 'dealPage.display.v1';
const readPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); }
  catch { return {}; }
};
const FIXED_MILESTONES = [
  { id: 'icApproved', title: 'IC Approved' },
  { id: 'readyToClose', title: 'Ready to Close' },
  { id: 'closed', title: 'Closed' }
];
const isYes = value => String(value || '').toLowerCase() === 'yes';

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
  const [displayView, setDisplayView] = useState(() => readPrefs().view === 'detailed' ? 'detailed' : 'compact');
  const [visibleMilestones, setVisibleMilestones] = useState(() => readPrefs().visible || null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsMenuRef = useRef(null);
  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ view: displayView, visible: visibleMilestones })); }
    catch { /* Browser storage may be disabled */ }
  }, [displayView, visibleMilestones]);
  useEffect(() => {
    if (!columnsOpen) return;
    const close = event => { if (!columnsMenuRef.current?.contains(event.target)) setColumnsOpen(false); };
    const escape = event => { if (event.key === 'Escape') setColumnsOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [columnsOpen]);
  const toggleExpanded = id => setExpandedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const counts = useMemo(() => Object.fromEntries(BUCKETS.map(b => [b.key, deals.filter(d => bucketOf(d) === b.key).length])), [deals]);
  const distinct = key => [...new Set(deals.map(d => d[key]).filter(v => v && v !== '-'))].sort();
  const columns = useMemo(() => {
    const seen = new Map();
    deals.forEach(d => (d.modules || []).forEach(m => { if (!seen.has(m.id)) seen.set(m.id, m.title); }));
    return [...seen].map(([id, title]) => ({ id, title }));
  }, [deals]);

  // Deal lifecycle and task milestones are intentionally separate.
  const allMilestones = useMemo(() => columns.map(m => ({ ...m, kind: 'module' })), [columns]);
  const displayedMilestones = displayView === 'detailed'
    ? allMilestones.filter(m => visibleMilestones === null || visibleMilestones.includes(m.id))
    : [];
  const milestoneStatus = (deal, item) =>
    ((deal.modules || []).find(m => m.id === item.id)?.status || 'Not Started');
  const completedMilestones = deal => allMilestones.filter(m => milestoneStatus(deal, m) === 'Completed').length;
  const toggleColumn = id => setVisibleMilestones(prev => {
    const current = prev === null ? allMilestones.map(m => m.id) : prev;
    return current.includes(id) ? current.filter(x => x !== id) : [...current, id];
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = deals.filter(d =>
      bucketOf(d) === bucket &&
      (!q || `${d.investmentName} ${d.id}`.toLowerCase().includes(q)) &&
      (!type || d.investmentType === type) && (!status || d.status === status) && (!milestone || d.milestone === milestone) &&
      daysMatch(d.daysToClose, days) &&
      (!activityFilter || (d.modules || []).some(m => m.status === activityFilter)));
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
    const head = ['Investment', 'Deal Code', 'Investment Type', 'Status', 'Created', 'Days to Close', 'IC Approved', 'Ready to Close', 'Closed', 'Milestone', ...columns.map(c => c.title)];
    const lines = rows.map(d => [d.investmentName, d.id, d.investmentType, d.status, d.dateCreated, d.daysToClose ?? '', d.icApproved, d.readyToClose, d.closed, d.milestone, ...columns.map(c => d.modules.find(m => m.id === c.id)?.status || 'Not Started')]);
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

      <div className="dp-kpis dp-kpis-modern" aria-label="Filter deals by status">
        {BUCKETS.map(b => {
          const selected = bucket === b.key;
          const percentage = Math.round((counts[b.key] / total) * 100);
          return (
            <button
              key={b.key}
              type="button"
              className={`dp-kpi dp-kpi-modern ${b.tone} ${selected ? 'on' : ''}`}
              onClick={() => setBucket(b.key)}
              aria-pressed={selected}
              aria-label={`${b.label}: ${counts[b.key]} deals, ${percentage}% of all deals. Filter deals.`}
              style={{ '--dp-kpi-percent': `${percentage}%` }}
            >
              <span className="dp-kpi-icon"><b.icon size={23} strokeWidth={2} /></span>
              <span className="dp-kpi-text">
                <AnimatedCount value={counts[b.key]} />
                <small>{b.label}</small>
                <span className="dp-kpi-subtitle">{percentage}% of all deals</span>
              </span>
              <span className="dp-kpi-chevron" aria-hidden="true"><ChevronRight size={18} /></span>
              <span className="dp-kpi-bar" aria-hidden="true"><i /></span>
            </button>
          );
        })}
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

        <div className="dp-view-toolbar">
          <div className="dp-view-switch" role="group" aria-label="Deal list view">
            <button type="button" className={displayView === 'compact' ? 'on' : ''} aria-pressed={displayView === 'compact'} onClick={() => setDisplayView('compact')}>Compact view</button>
            <button type="button" className={displayView === 'detailed' ? 'on' : ''} aria-pressed={displayView === 'detailed'} onClick={() => setDisplayView('detailed')}>Detailed view</button>
          </div>
          <div className="dp-columns-menu" ref={columnsMenuRef}>
            <button type="button" className="dp-columns-trigger" aria-expanded={columnsOpen} aria-haspopup="true" onClick={() => setColumnsOpen(v => !v)}>
              <Columns3 size={16} /> Columns <ChevronDown size={14} />
            </button>
            {columnsOpen && <div className="dp-columns-popover">
              <strong>Task milestone columns</strong>
              <p>Choose columns for detailed view. Task milestones remain available in expanded rows.</p>
              {allMilestones.map(m => <label key={m.id} className="dp-column-choice">
                <input type="checkbox" checked={visibleMilestones === null || visibleMilestones.includes(m.id)} onChange={() => toggleColumn(m.id)} />
                <span>{m.title}</span>
              </label>)}
              <button type="button" className="dp-columns-reset" onClick={() => setVisibleMilestones(null)}>Show all columns</button>
            </div>}
          </div>
        </div>

        <div className="dp-table-wrap">
          <table className="dp-table dp-expand-table">
            <thead><tr>
              <th className="dp-expand-head"><span className="dp-sr">Expand deal</span></th>
              <SortHead k="name">Investment</SortHead><th>Deal Code</th><th>Investment Type</th><th>Status</th>
              <SortHead k="created">Created</SortHead><SortHead k="days">Days to Close</SortHead>
              <th className="dp-deal-stage-head">Deal Status <span className="dp-stage-head-hint" title="IC Approved → Ready to Close → Closed">ⓘ</span></th>
              {displayView === 'compact'
                ? <th className="dp-progress-head">Task Milestones</th>
                : displayedMilestones.map(m => <th key={m.id} className="c" title={m.title}>{shortName(m.title)}</th>)}
              <th className="act"><Menu label="Table actions" icon={MoreVertical} items={[["Export to CSV", exportCsv]]} /></th>
            </tr></thead>
            <tbody>
              {pageRows.map(d => {
                const expanded = expandedIds.has(d.id);
                const completed = completedMilestones(d);
                const totalMilestones = allMilestones.length;
                const colSpan = 9 + (displayView === 'compact' ? 1 : displayedMilestones.length);
                return <React.Fragment key={d.id}>
                  <tr className={`dp-deal-row ${expanded ? 'dp-row-open' : ''}`}>
                    <td className="dp-expand-cell"><button type="button" className="dp-expand-toggle" aria-label={`${expanded ? 'Collapse' : 'Expand'} milestones for ${d.investmentName}`} aria-expanded={expanded} onClick={() => toggleExpanded(d.id)}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td>
                    <td><button className="dp-link" onClick={() => onOpenDeal(d)}>{d.investmentName}</button></td>
                    <td className="muted">{d.id}</td><td className="muted">{d.investmentType}</td>
                    <td>{d.status && d.status !== '-' ? <span className={`dp-status ${dealStatusTone(d.status)}`}>{d.status}</span> : <span className="muted">-</span>}</td>
                    <td className="muted">{d.dateCreated}</td>
                    <td>{d.daysToClose == null ? <span className="muted">-</span> : <span className={`dp-days ${d.daysToClose < 0 ? 'neg' : ''}`}>{d.daysToClose}</span>}</td>
                    <td><DealStatusProgress deal={d} /></td>
                    {displayView === 'compact'
                      ? <td><button type="button" className="dp-progress-button" onClick={() => toggleExpanded(d.id)} aria-label={`View ${d.investmentName} milestones: ${completed} of ${totalMilestones} completed`}>
                          <span className="dp-progress-track">{allMilestones.map(m => <span key={m.id} className={`dp-progress-segment ${milestoneStatus(d, m) === 'Completed' ? 'done' : ''}`} title={`${m.title}: ${milestoneStatus(d, m)}`} />)}</span>
                          <span className="dp-progress-count">{completed}/{totalMilestones}</span>
                        </button></td>
                      : displayedMilestones.map(m => <td key={m.id} className="c"><ActivityIcon status={milestoneStatus(d, m)} /></td>)}
                    <td className="act"><Menu label={`Actions for ${d.investmentName}`} icon={MoreHorizontal} items={[["Open deal", () => onOpenDeal(d)], [expanded ? 'Collapse milestones' : 'View milestones', () => toggleExpanded(d.id)]]} /></td>
                  </tr>
                  {expanded && <tr className="dp-details-row"><td colSpan={colSpan}>
                    <div className="dp-milestone-panel">
                      <div className="dp-milestone-heading"><div><strong>Task milestone details</strong><span>{d.investmentName} · {completed} of {totalMilestones} completed</span></div><button type="button" onClick={() => onOpenDeal(d)}>Open deal <ChevronRight size={15} /></button></div>
                      <div className="dp-milestone-grid">
                        {allMilestones.map(m => <div className="dp-milestone-item" key={m.id}>
                          <span className="dp-milestone-label">{m.title}</span>
                          <span className="dp-milestone-value"><ActivityIcon status={milestoneStatus(d, m)} /><span>{milestoneStatus(d, m)}</span></span>
                        </div>)}
                      </div>
                    </div>
                  </td></tr>}
                </React.Fragment>;
              })}
              {!filtered.length && <tr><td colSpan={9 + (displayView === 'compact' ? 1 : displayedMilestones.length)} className="dp-empty">No deals match the current filters.</td></tr>}
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
