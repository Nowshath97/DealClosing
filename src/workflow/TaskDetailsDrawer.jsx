import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, CheckCircle2, X } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { hasDate, sectionProgress, taskStatusMeta } from './statusConfig';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

// Right-side drawer (full-screen sheet on mobile) with focus trap, Escape to close and focus return.
export default function TaskDetailsDrawer({ deal, section, task, returnFocusTo, onClose, onOpenTask, onMarkComplete }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = ref.current;
    el?.querySelector('[data-autofocus]')?.focus();
    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; returnFocusTo?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = taskStatusMeta(task.taskStatus);
  const actionable = task.taskStatus !== 'completed' && task.taskStatus !== 'skipped';
  const { done, total } = sectionProgress(section);

  const complete = async () => {
    setBusy(true); setError('');
    try { await onMarkComplete(task); } catch (e) { setError(e.message || 'Could not update the task.'); } finally { setBusy(false); }
  };

  const rows = [
    ['Section', section.title],
    ['Assigned to', task.assignedTo && task.assignedTo !== '-' ? task.assignedTo : 'Unassigned'],
    ['Due date', hasDate(task.date) ? task.date : 'No due date'],
    ['System status', task.statusLabel || meta.label],
    ['Deal', `${deal.investmentName} (${deal.id})`],
    ['Section progress', total ? `${done} of ${total} tasks completed` : 'No tasks to measure']
  ];

  return (
    <div className="wf-drawer-root">
      <div className="wf-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="wf-drawer" role="dialog" aria-modal="true" aria-labelledby="wf-drawer-title" ref={ref}>
        <header>
          <div>
            <p>{section.title}</p>
            <h2 id="wf-drawer-title">{task.name}</h2>
            <StatusBadge meta={meta} />
          </div>
          <button type="button" className="wf-icon-btn" aria-label="Close task details" onClick={onClose} data-autofocus><X size={20} /></button>
        </header>
        <div className="wf-drawer-body">
          <dl className="wf-dl">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={k === 'Due date' && task.taskStatus === 'overdue' ? 'overdue' : ''}>{v}</dd></div>)}</dl>
          <h3>Description</h3>
          <p className="wf-muted">No description is available for this task.</p>
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>
        <footer>
          <button type="button" className="wf-primary" onClick={() => onOpenTask(section, task)}><ExternalLink size={15} aria-hidden="true" /> Open Task</button>
          {actionable && <button type="button" className="wf-outline" disabled={busy} onClick={complete}><CheckCircle2 size={15} aria-hidden="true" /> {busy ? 'Saving…' : 'Mark Complete'}</button>}
        </footer>
      </aside>
    </div>
  );
}
