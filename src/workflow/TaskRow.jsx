import React from 'react';
import { ChevronRight } from 'lucide-react';
import { StatusIcon } from './StatusBadge';
import { hasDate, taskStatusMeta } from './statusConfig';

// The whole row is the single control for opening task details.
export default function TaskRow({ task, onOpen }) {
  const meta = taskStatusMeta(task.taskStatus);
  const dated = hasDate(task.date);
  return (
    <li>
      <button type="button" className="wf-row" onClick={e => onOpen(task, e.currentTarget)}>
        <StatusIcon meta={meta} />
        <span className={`wf-task-name ${task.taskStatus === 'skipped' ? 'muted' : ''}`}>{task.name}</span>
        <span className={`wf-due ${task.taskStatus === 'overdue' ? 'overdue' : dated ? '' : 'muted'}`}>{dated ? task.date : 'Pending'}</span>
        <span className={`wf-assignee ${task.assignedTo && task.assignedTo !== '-' ? '' : 'muted'}`}>{task.assignedTo && task.assignedTo !== '-' ? task.assignedTo : 'Unassigned'}</span>
        <ChevronRight size={16} className="wf-row-chev" aria-hidden="true" />
      </button>
    </li>
  );
}
