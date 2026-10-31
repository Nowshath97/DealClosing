import React from 'react';
import { TASK_STATUS } from './statusConfig';
import { StatusIcon } from './StatusBadge';

export default function WorkflowProgressSummary({ progress }) {
  const known = progress.pct !== null;
  const pct = known ? Math.round(progress.pct) : 0;
  const stats = [
    [TASK_STATUS.completed, progress.completed], [TASK_STATUS.inProgress, progress.inProgress],
    [TASK_STATUS.overdue, progress.overdue], [TASK_STATUS.pending, progress.notStarted]
  ];
  return (
    <section className="wf-progress" aria-label="Overall workflow progress">
      <div className="wf-progress-top">
        <span className="wf-progress-text">{known ? `${progress.completed} of ${progress.total} sections completed` : 'Progress unavailable — no workflow sections yet'}</span>
        <strong>{known ? `${pct}%` : '–'}</strong>
      </div>
      <div className="wf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? pct : undefined} aria-label="Sections completed">
        <i style={{ width: `${pct}%` }} />
      </div>
      <ul className="wf-stats">
        {stats.map(([meta, n]) => <li key={meta.key}><StatusIcon meta={meta} size={15} /> <b>{n}</b> {meta.label}</li>)}
      </ul>
    </section>
  );
}
