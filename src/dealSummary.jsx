import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, Calendar, Check, ChevronDown, ChevronRight, CircleDashed, Clock3, Cloud, FileText, Gavel, Hammer, Eye, ListChecks, Lock, Pencil, ShieldCheck, Target, User, Users } from 'lucide-react';
import { modulesForDeal } from './api';
import AllocationDetailsDialog from './AllocationDetailsDialog';
import AskAIButton from './ai/AskAIButton';
import AICopilotDrawer from './ai/AICopilotDrawer';

// Modules come from the database (ref_deal_activity); pick an icon from keywords in the title.
const iconFor = title => {
  const t = String(title).toLowerCase();
  if (/alloc/.test(t)) return Banknote;
  if (/risk|compl|ethic/.test(t)) return ShieldCheck;
  if (/legal|entity/.test(t)) return Hammer;
  if (/fund/.test(t)) return Gavel;
  return FileText;
};
const statusLabel = { completed: 'Completed', inProgress: 'In progress', overdue: 'Overdue', pending: 'Not started', skipped: 'Skipped' };
const slug = s => s.toLowerCase().replaceAll(' ', '-');

const moduleStats = m => { const done = m.tasks.filter(t => t.taskStatus === 'completed').length; return { done, total: m.tasks.length, pct: m.tasks.length ? (done / m.tasks.length) * 100 : 0, overdue: m.tasks.some(t => t.taskStatus === 'overdue') }; };

function TaskDot({ status }) {
  if (status === 'completed') return <span className="ds-dot completed"><Check size={11} /></span>;
  if (status === 'overdue') return <span className="ds-dot overdue"><AlertTriangle size={11} /></span>;
  if (status === 'inProgress') return <span className="ds-dot in-progress"><Clock3 size={11} /></span>;
  return <span className="ds-dot pending"><CircleDashed size={11} /></span>;
}

function Kpi({ icon: Icon, label, value, tone }) {
  return <div className="ds-kpi"><span className={`ds-kpi-icon ${tone}`}><Icon size={16} /></span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

// A task is "mine" when its assignee matches the signed-in user's name or email.
// A finished task shows its name as plain text; the details live in the activity's View Details (where there is one).
const isDone = t => t.taskStatus === 'completed' || t.taskStatus === 'skipped';
const normName = s => String(s || '').toLowerCase().replace(/[^a-z0-9@.]/g, '');

export default function DealSummary({ deal, deals = [], user, onBack, onOpenTask, onOpenDeal, initialModuleId }) {
  const [askOpen, setAskOpen] = useState(false);
  const dealModules = modulesForDeal(deal);
  const [moduleId, setModuleId] = useState(initialModuleId || dealModules[0]?.id);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [taskTab, setTaskTab] = useState('all');
  const [viewingAllocation, setViewingAllocation] = useState(false);

  const milestoneIndex = deal.milestoneIndex;
  const module = dealModules.find(m => m.id === moduleId);
  const stats = module ? moduleStats(module) : null;

  const isMine = t => !!user && [user.name, user.email].some(v => normName(v) === normName(t.assignedTo));
  const shownTasks = module ? (taskTab === 'mine' ? module.tasks.filter(isMine) : module.tasks) : [];

  const totalDone = dealModules.reduce((n, m) => n + moduleStats(m).done, 0);
  const totalTasks = dealModules.reduce((n, m) => n + m.tasks.length, 0);

  return (
    <div className="workspace-page ds-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to Deals</button>

      <header className="ds-top">
        <div className="ds-title">
          <div className="title-row"><h1>{deal.investmentName}</h1><span className={`status-badge ${deal.status === 'Closed' ? 'closed' : ''}`}>{deal.status}</span></div>
          <p>{deal.id} · {deal.investmentType} · {deal.milestone}</p>
        </div>
        <div className="ds-top-actions">
          <AskAIButton open={askOpen} onClick={() => setAskOpen(o => !o)} />
          <a className="ds-sf" href="#salesforce" onClick={e => e.preventDefault()}><Cloud size={15} /> Salesforce</a>
          <button className="secondary-action"><Pencil size={14} /> Edit Deal</button>
        </div>
      </header>

      <section className="ds-summary">
        <ol className="ds-path">
          {deal.path.map((m, i) => (
            <li key={m} className={i < milestoneIndex || i === deal.path.length - 1 && i === milestoneIndex ? 'done' : i === milestoneIndex ? 'current' : ''}>
              {(i < milestoneIndex || i === deal.path.length - 1 && i === milestoneIndex) && <Check size={15} />}
              <span>{m}</span>
            </li>
          ))}
        </ol>
        <div className="ds-kpis">
          <Kpi icon={Banknote} tone="green" label="Commitment USD" value={deal.commitment} />
          <Kpi icon={Banknote} tone="green" label={`Commitment ${deal.currency}`} value={deal.commitmentFunding} />
          <Kpi icon={Calendar} tone="red" label="Target Funding" value={deal.targetFundingDate} />
          <Kpi icon={Target} tone="orange" label="Target Closing" value={deal.targetCloseDate} />
          <Kpi icon={FileText} tone="blue" label="Docs Deadline (GP)" value="-" />
        </div>
        <button className="ds-more" onClick={() => setDetailsOpen(o => !o)}>
          {detailsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Deal details
        </button>
        {detailsOpen && (
          <div className="ds-details">
            {[['Deal Code', deal.id], ['Deal Type', deal.investmentType], ['Status', deal.status], ['Milestone', deal.milestone], ['IC Approved', deal.icApproved], ['Currency', deal.currency], ['Target Closing', deal.targetCloseDate], ['Created', deal.dateCreated]].map(([l, v]) => <div key={l}><span>{l}</span><strong>{v}</strong></div>)}
          </div>
        )}
      </section>

      <div className="ds-workspace">
        <nav className="ds-nav" aria-label="Closing workflow">
          <div className="ds-nav-head">
            <strong>Closing workflow</strong>
            <span>{totalDone} of {totalTasks} tasks complete</span>
            <div className="ds-bar"><i style={{ width: `${totalTasks ? (totalDone / totalTasks) * 100 : 0}%` }} /></div>
          </div>
          {dealModules.map(m => {
            const Icon = iconFor(m.title);
            const s = moduleStats(m);
            return (
              <div key={m.id} className={`ds-group ${moduleId === m.id ? 'active' : ''}`}>
                <button className="ds-group-head" onClick={() => setModuleId(m.id)} aria-current={moduleId === m.id}>
                  <span className={`ds-group-icon ${s.overdue ? 'overdue' : s.done === s.total ? 'completed' : ''}`}><Icon size={16} /></span>
                  <span className="ds-group-title">{m.title}<small className={`ds-act-status ${slug(m.status)}`}>{m.status}</small></span>
                  <span className={`ds-count ${s.overdue ? 'overdue' : ''}`}>{s.done}/{s.total}</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            );
          })}
        </nav>

        <main className="ds-content">
          {!module ? (
            <p className="ds-meta">No activities found.</p>
          ) : (
            <>
              <div className="ds-task-head">
                <div>
                  <h2>{module.title}</h2>
                  <div className="ds-meta"><span className={`ds-act-status ${slug(module.status)}`}>{module.status}</span></div>
                </div>
                {/alloc/i.test(module.title) && (
                  <div className="ds-head-actions">
                    <button className="secondary-action" onClick={() => setViewingAllocation(true)}><Eye size={14} /> View Details</button>
                    <button className="primary-action"><Pencil size={14} /> Edit Allocations</button>
                  </div>
                )}
              </div>
              <div className="ds-module-progress">
                <div className="ds-bar"><i style={{ width: `${stats.pct}%` }} /></div>
                <span>{stats.done} of {stats.total} tasks complete</span>
              </div>
              <div className="ds-tabs" role="tablist">
                <button role="tab" aria-selected={taskTab === 'mine'} className={taskTab === 'mine' ? 'on' : ''} onClick={() => setTaskTab('mine')}><User size={14} /> My Tasks</button>
                <button role="tab" disabled title="Not available yet" className="off"><Users size={14} /> My Team Tasks</button>
                <button role="tab" aria-selected={taskTab === 'all'} className={taskTab === 'all' ? 'on' : ''} onClick={() => setTaskTab('all')}><ListChecks size={14} /> All Tasks</button>
              </div>
              <div className="ds-ttable-wrap">
                <table className="ds-ttable">
                  <thead><tr><th>Task Name</th><th>Due Date</th><th>Completion Date</th><th>Assigned To</th><th>Status</th></tr></thead>
                  <tbody>
                    {!shownTasks.length && <tr><td colSpan={5} className="ds-tempty">{!module.tasks.length ? 'No tasks in this activity yet.' : 'No tasks are assigned to you in this activity.'}</td></tr>}
                    {shownTasks.map(t => (
                      <tr key={t.id} className={t.locked ? 'locked' : isDone(t) ? 'done' : ''} onClick={t.locked || isDone(t) ? undefined : () => onOpenTask(module, t)} title={t.locked ? t.reason : undefined}>
                        <td><div className="ds-tname">{t.locked ? <span className="ds-dot pending"><Lock size={11} /></span> : <TaskDot status={t.taskStatus} />}{t.locked
                          ? <span className="ds-tlocked" aria-disabled="true">{t.name}<small>{t.reason}</small></span>
                          : isDone(t)
                            ? <span className="ds-tdone">{t.name}</span>
                            : <button className="ds-tlink" onClick={e => { e.stopPropagation(); onOpenTask(module, t); }}>{t.name}</button>}</div></td>
                        <td className={t.taskStatus === 'overdue' ? 'overdue' : ''}>{t.date}</td>
                        <td className={t.completedDate === '-' ? 'dim' : ''}>{t.completedDate}</td>
                        <td className={t.assignedTo === '-' ? 'dim' : ''}>{t.assignedTo === '-' ? 'Unassigned' : <>{t.assignedTo}{isMine(t) && <span className="ds-me">You</span>}</>}</td>
                        <td>{t.locked ? <span className="ds-chip skipped">Locked</span> : <span className={`ds-chip ${t.taskStatus}`}>{t.statusLabel || statusLabel[t.taskStatus]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </main>
      </div>
      <AICopilotDrawer open={askOpen} onClose={() => setAskOpen(false)} deal={{ code: deal.id, name: deal.investmentName }}
        onOpenDeal={code => { if (code !== deal.id) onOpenDeal?.(deals.find(d => d.id === code)); }} />
      {viewingAllocation && <AllocationDetailsDialog deal={deal} onClose={() => setViewingAllocation(false)} />}
    </div>
  );
}
