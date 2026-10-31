import React from 'react';
import { ChevronDown } from 'lucide-react';
import { StatusBadge, StatusIcon } from './StatusBadge';
import TaskRow from './TaskRow';
import { sectionProgress, sectionStatusMeta } from './statusConfig';

function SectionHeader({ section, open, onToggle, panelId, taskCount }) {
  const meta = sectionStatusMeta(section.status);
  const { done, total, pct } = sectionProgress(section);
  return (
    <h2 className="wf-sec-h">
      <button type="button" className="wf-sec-btn" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <StatusIcon meta={meta} size={22} />
        <span className="wf-sec-name">{section.title}</span>
        <StatusBadge meta={meta} size="sm" />
        <span className="wf-sec-count">{total ? `${done} of ${total} completed` : taskCount ? `${taskCount} tasks` : 'No tasks yet'}</span>
        <span className="wf-sec-bar" aria-hidden="true"><i className={meta.tone} style={{ width: `${pct}%` }} /></span>
        <ChevronDown size={18} className={`wf-chev ${open ? 'open' : ''}`} aria-hidden="true" />
      </button>
    </h2>
  );
}

export default function WorkflowSectionAccordion({ section, tasks, open, onToggle, onOpenTask }) {
  const panelId = `wf-panel-${section.id}`;
  return (
    <section className={`wf-section ${sectionStatusMeta(section.status).tone}`}>
      <SectionHeader section={section} open={open} onToggle={onToggle} panelId={panelId} taskCount={section.tasks.length} />
      <div id={panelId} className={`wf-panel ${open ? 'open' : ''}`} hidden={!open}>
        {tasks.length ? (
          <>
            <div className="wf-cols" aria-hidden="true"><span /><span>Task</span><span>Due date</span><span>Assigned to</span><span /></div>
            <ul className="wf-tasks">{tasks.map(t => <TaskRow key={t.id} task={t} onOpen={(task, el) => onOpenTask(section, task, el)} />)}</ul>
          </>
        ) : (
          <p className="wf-empty">{section.tasks.length ? 'No tasks match the current search or filter.' : 'No tasks have been created for this section yet.'}</p>
        )}
      </div>
    </section>
  );
}
