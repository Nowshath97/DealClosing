import React from 'react';
import { CheckCircle2, Lightbulb } from 'lucide-react';
import { hasDate, taskStatusMeta } from './statusConfig';

export default function NextActionPanel({ next, onOpen }) {
  if (!next) {
    return (
      <aside className="wf-next empty" aria-label="Next action">
        <CheckCircle2 size={20} aria-hidden="true" />
        <div><strong>Next Action</strong><p>No actionable tasks right now.</p></div>
      </aside>
    );
  }
  const { section, task } = next;
  const meta = taskStatusMeta(task.taskStatus);
  const who = task.assignedTo && task.assignedTo !== '-' ? task.assignedTo : null;
  return (
    <aside className="wf-next" aria-label="Next action">
      <Lightbulb size={20} aria-hidden="true" />
      <div className="wf-next-copy">
        <strong>Next Action</strong>
        <p className="wf-next-task">{task.name}</p>
        <p className="wf-next-meta">{section.title} • {meta.label}{hasDate(task.date) ? ` • Due ${task.date}` : ''}{who ? ` • Assigned to ${who}` : ''}</p>
      </div>
      <button type="button" className="wf-primary" onClick={() => onOpen(section, task)}>Open Task</button>
    </aside>
  );
}
