import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, CalendarDays, Check, ChevronRight, CircleDashed, Clock3, Eye, FileText, Hammer, ListChecks, Lock, ShieldCheck, User, Users } from 'lucide-react';
import { modulesForDeal } from './api';
import { loadAllocation } from './allocationApi';
import AllocationDetailsDialog from './AllocationDetailsDialog';
import AskAIButton from './ai/AskAIButton';
import AICopilotDrawer from './ai/AICopilotDrawer';
import './primaryDealSummary.css';
import DealOverviewDetails from './DealOverviewDetails';
import { taskDisplayName } from './taskDisplay';

const sections = [
  { key: 'alloc', title: 'Deal Allocations', match: /alloc/i, icon: Banknote },
  { key: 'risk', title: 'Risk & Compliance', match: /risk|compl|ethic/i, icon: ShieldCheck },
  { key: 'legal', title: 'Legal Entity Management', match: /legal|entity/i, icon: Hammer },
  { key: 'docs', title: 'Transactional Docs', match: /transaction|document|doc/i, icon: FileText },
  { key: 'liquidity', title: 'Liquidity & Cash Management', match: /liquid|cash/i, icon: Banknote },
  { key: 'funding', title: 'Funding', match: /fund/i, icon: Banknote },
  { key: 'investment', title: 'New Investment Setup', match: /investment setup|new investment/i, icon: ListChecks },
];
const done = t => ['completed', 'skipped'].includes(t.taskStatus);
const isPrimaryTask = t => t.closeId == null;
const statusText = s => ({ completed: 'Completed', inProgress: 'In progress', overdue: 'Overdue', pending: 'Not started', skipped: 'Skipped' }[s] || s || 'Not started');
const fmtDate = value => {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.valueOf()) ? value : d.toLocaleDateString('en-US');
};
const daysUntil = value => {
  if (!value) return '—';
  const end = new Date(`${value}T00:00:00`);
  if (Number.isNaN(end.valueOf())) return '—';
  return Math.ceil((end - new Date(new Date().toDateString())) / 86400000);
};

function TaskMark({ status }) {
  if (status === 'completed') return <span className="pds-task-mark completed"><Check size={12} /></span>;
  if (status === 'overdue') return <span className="pds-task-mark overdue"><AlertTriangle size={12} /></span>;
  if (status === 'inProgress') return <span className="pds-task-mark progress"><Clock3 size={12} /></span>;
  return <span className="pds-task-mark"><CircleDashed size={12} /></span>;
}

export default function PrimaryDealSummary({ deal, deals = [], user, onBack, onOpenTask, onOpenDeal }) {
  const [level, setLevel] = useState('deal');
  const [selectedCloseId, setSelectedCloseId] = useState(null);
  const [selectedSection, setSelectedSection] = useState('alloc');
  const [taskTab, setTaskTab] = useState('all');
  const [allocation, setAllocation] = useState(null);
  const [allocationError, setAllocationError] = useState('');
  const [showAllocation, setShowAllocation] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    let active = true;
    loadAllocation(deal.id).then(value => { if (active) { setAllocation(value); setAllocationError(''); } })
      .catch(error => { if (active) setAllocationError(error.message || 'Could not load close dates.'); });
    return () => { active = false; };
  }, [deal.id]);

  const allModules = modulesForDeal(deal);
  const closes = useMemo(() => {
    const saved = (allocation?.state?.closes || []).filter(c => c.date).map(c => ({ ...c, id: String(c.id), title: fmtDate(c.date) }));
    if (saved.length) return saved;
    const target = String(deal.targetCloseDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!target) return [];
    const date = `${target[3]}-${target[1].padStart(2, '0')}-${target[2].padStart(2, '0')}`;
    return [{ id: `target:${date}`, date, final: 'Estimate', title: fmtDate(date), estimated: true }];
  }, [allocation, deal.targetCloseDate]);
  const activeClose = closes.find(c => c.id === selectedCloseId) || closes[0] || null;
  const moduleSections = sections.map(section => {
    const source = allModules.find(m => section.match.test(m.title));
    const sectionTasks = source?.tasks || [];
    const tasks = sectionTasks.filter(t => level === 'deal'
      ? isPrimaryTask(t)
      : activeClose && String(t.closeId ?? '') === activeClose.id);
    const finished = tasks.filter(done).length;
    const hasOpen = tasks.some(t => t.taskStatus === 'overdue');
    const status = !tasks.length ? 'Not started' : finished === tasks.length ? 'Completed' : hasOpen ? 'Overdue' : 'In progress';
    return { ...section, id: source?.id || section.key, source, tasks, finished, status };
  });
  const currentSection = moduleSections.find(s => s.key === selectedSection) || moduleSections[0];
  const visibleTasks = currentSection.tasks.filter(t => taskTab === 'mine'
    ? !!user && [user.name, user.email].some(v => String(v || '').toLowerCase() === String(t.assignedTo || '').toLowerCase())
    : true);
  const allCloseTasks = allModules.flatMap(m => m.tasks).filter(task => task.closeId != null);
  const closeTasks = allCloseTasks.filter(t => activeClose && String(t.closeId) === activeClose.id);
  const pendingDealTasks = allModules.flatMap(m => m.tasks).filter(t => isPrimaryTask(t) && !done(t)).length;
  const pendingCloseTasks = closeTasks.filter(t => !done(t)).length;
  const sectionTotal = moduleSections.reduce((n, s) => n + s.tasks.length, 0);
  const sectionDone = moduleSections.reduce((n, s) => n + s.finished, 0);

  return <div className="workspace-page pds-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to Deals</button>
    <header className="pds-header">
      <div><div className="pds-title-line"><h1>{deal.investmentName}</h1><span className={`status-badge ${deal.status === 'Closed' ? 'closed' : ''}`}>{deal.status}</span></div>
        <p>{deal.id} <span>·</span> Primary <span>·</span> {deal.milestone}</p></div>
      <div className="pds-actions"><AskAIButton open={askOpen} onClick={() => setAskOpen(v => !v)} /><button className="secondary-action" onClick={() => setShowAllocation(true)}><Eye size={14} /> Allocation details</button></div>
    </header>

    <section className="pds-deal-information" aria-label="Deal information"><DealOverviewDetails deal={deal} primary /></section>
    <section className="pds-overview">
      <div className="pds-overview-heading"><div><span className="pds-kicker">PRIMARY DEAL SUMMARY</span><h2>Deal and close overview</h2></div></div>
      <div className="pds-table-wrap"><table className="pds-close-table"><thead><tr><th>Close date</th><th>Final?</th><th>Approved</th><th>Days to executed docs</th><th>Days to closing</th><th>Total allocation {deal.currency}</th><th>Total allocation USD</th></tr></thead>
        <tbody>{closes.length ? closes.map(c => <tr key={c.id} className={activeClose?.id === c.id && level === 'close' ? 'selected' : ''} onClick={() => { setLevel('close'); setSelectedCloseId(c.id); }}><td>{fmtDate(c.date)}</td><td>{c.final || '—'}</td><td>—</td><td>—</td><td>{daysUntil(c.date)}</td><td>—</td><td>—</td></tr>) : <tr><td colSpan={7} className="pds-empty-row">{allocationError ? `Close dates unavailable: ${allocationError}` : 'No close dates mapped yet. Use “Map accounts to closes” to add close dates.'}</td></tr>}</tbody>
      </table></div>
      <p className="pds-data-note">{closes.some(c => c.estimated) ? 'The deal target date is shown as an estimate until closes are mapped. ' : 'Close dates and estimate/final status come from the allocation record. '}Approval, executed-document timing, and per-close allocation totals are not recorded yet.</p>
      <div className="pds-level-bar" role="tablist" aria-label="Workflow level">
        <button className={level === 'deal' ? 'selected' : ''} role="tab" aria-selected={level === 'deal'} onClick={() => { setLevel('deal'); setSelectedSection('alloc'); }}><CalendarDays size={15} /><span>Deal</span><small>{pendingDealTasks} pending tasks</small></button>
        <div className="pds-close-tabs">{closes.map(c => <button key={c.id} className={level === 'close' && activeClose?.id === c.id ? 'selected' : ''} role="tab" aria-selected={level === 'close' && activeClose?.id === c.id} onClick={() => { setLevel('close'); setSelectedCloseId(c.id); setSelectedSection('alloc'); }}><CalendarDays size={15} /><span>{c.title} close</span><small>{String(c.id).startsWith('target:') ? 'No close tasks' : `${allCloseTasks.filter(t => String(t.closeId) === c.id && !done(t)).length} pending tasks`}</small></button>)}</div>
      </div>
    </section>

    <div className="pds-workspace">
      <nav className="pds-sections" aria-label={`${level === 'deal' ? 'Deal' : `Close ${activeClose?.title || ''}`} task sections`}>
        <div className="pds-sections-head"><strong>{level === 'deal' ? 'Deal tasks' : `Close tasks · ${activeClose?.title || 'Select a close'}`}</strong><span>{sectionDone} of {sectionTotal} complete</span><div className="pds-progress"><i style={{ width: `${sectionTotal ? sectionDone / sectionTotal * 100 : 0}%` }} /></div></div>
        {moduleSections.map(s => { const Icon = s.icon; const active = selectedSection === s.key; return <button key={s.key} className={`pds-section ${active ? 'active' : ''}`} onClick={() => setSelectedSection(s.key)}><span className={`pds-section-icon ${s.status.toLowerCase().replaceAll(' ', '-')}`}><Icon size={16} /></span><span className="pds-section-copy"><strong>{s.title}</strong><small>{s.status}</small></span><span className="pds-section-count">{s.finished}/{s.tasks.length}</span><ChevronRight size={15} /></button>; })}
      </nav>
      <main className="pds-content">
        <div className="pds-content-title"><div><span className="pds-kicker">{level === 'deal' ? 'DEAL LEVEL' : `CLOSE LEVEL · ${activeClose?.title || ''}`}</span><h2>{currentSection.title}</h2></div>{currentSection.key === 'alloc' && <button className="secondary-action" onClick={() => setShowAllocation(true)}><Eye size={14} /> View Details</button>}</div>
        <div className="pds-task-tabs" role="tablist"><button className={taskTab === 'mine' ? 'selected' : ''} role="tab" aria-selected={taskTab === 'mine'} onClick={() => setTaskTab('mine')}><User size={14} /> My Tasks</button><button disabled title="Not available yet"><Users size={14} /> My Team Tasks</button><button className={taskTab === 'all' ? 'selected' : ''} role="tab" aria-selected={taskTab === 'all'} onClick={() => setTaskTab('all')}><ListChecks size={14} /> All Tasks</button></div>
        <div className="pds-task-table-wrap"><table className="pds-task-table"><thead><tr><th>Task name</th><th>Due date</th><th>Assigned to</th><th>Status</th></tr></thead><tbody>
          {!visibleTasks.length && <tr><td colSpan={4} className="pds-empty-row">{currentSection.tasks.length ? 'No tasks assigned to you in this section.' : level === 'deal' ? 'No deal-level tasks in this section.' : 'No tasks are linked to this close yet.'}</td></tr>}
          {visibleTasks.map(t => <tr key={t.id} className={done(t) || t.locked ? 'static' : ''} onClick={done(t) || t.locked ? undefined : () => onOpenTask?.(currentSection.source || { id: currentSection.id, title: currentSection.title, tasks: currentSection.tasks }, t)}><td><div className="pds-task-name">{t.locked ? <span className="pds-task-mark"><Lock size={12} /></span> : <TaskMark status={t.taskStatus} />}{taskDisplayName(t, activeClose?.date)}{t.locked && <small>{t.reason}</small>}</div></td><td>{t.date || '—'}</td><td>{t.assignedTo && t.assignedTo !== '-' ? t.assignedTo : 'Unassigned'}</td><td><span className={`pds-task-status ${t.taskStatus}`}>{t.locked ? 'Locked' : statusText(t.taskStatus)}</span></td></tr>)}
        </tbody></table></div>
        {level === 'close' && !closeTasks.length && <p className="pds-close-note">Close-level tasks are shown here once they are associated with this close date.</p>}
      </main>
    </div>
    <AICopilotDrawer open={askOpen} onClose={() => setAskOpen(false)} deal={{ code: deal.id, name: deal.investmentName }} onOpenDeal={code => { if (code !== deal.id) onOpenDeal?.(deals.find(d => d.id === code)); }} />
    {showAllocation && <AllocationDetailsDialog deal={deal} onClose={() => setShowAllocation(false)} />}
  </div>;
}
