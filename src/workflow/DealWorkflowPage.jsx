import React, { useMemo, useRef, useState } from 'react';
import './workflow.css';
import { modulesForDeal } from '../api';
import WorkflowHeader from './WorkflowHeader';
import WorkflowProgressSummary from './WorkflowProgressSummary';
import WorkflowToolbar from './WorkflowToolbar';
import WorkflowSectionAccordion from './WorkflowSectionAccordion';
import TaskDetailsDrawer from './TaskDetailsDrawer';
import NextActionPanel from './NextActionPanel';
import { STATUS_FILTERS, defaultOpen, overallProgress, parseUsDate, pickNextAction, taskStatusMeta } from './statusConfig';

const sortTasks = (tasks, sort) => {
  if (sort === 'due') return [...tasks].sort((a, b) => (parseUsDate(a.date) ?? Infinity) - (parseUsDate(b.date) ?? Infinity));
  if (sort === 'priority') return [...tasks].sort((a, b) => taskStatusMeta(a.taskStatus).rank - taskStatusMeta(b.taskStatus).rank);
  return tasks;
};

export default function DealWorkflowPage({ deal, onBack, onOpenTask, onTaskComplete, initialModuleId }) {
  const sections = modulesForDeal(deal);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const [openMap, setOpenMap] = useState(initialModuleId ? { [initialModuleId]: true } : {});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState(null); // { sectionId, taskId }
  const openerRef = useRef(null);

  const isOpen = s => openMap[s.id] ?? defaultOpen(s.status);
  const setAll = value => setOpenMap(Object.fromEntries(sections.map(s => [s.id, value])));

  const f = STATUS_FILTERS.find(x => x.key === filter);
  const q = query.trim().toLowerCase();

  // Per-section visible tasks under the current search + filter.
  const view = useMemo(() => sections.map(sec => {
    const matchesQuery = t => `${t.name} ${t.assignedTo}`.toLowerCase().includes(q);
    const titleMatch = !!q && sec.title.toLowerCase().includes(q);
    const qTasks = !q || titleMatch ? sec.tasks : sec.tasks.filter(matchesQuery);
    const fTasks = filter === 'all' ? qTasks : qTasks.filter(t => t.taskStatus === f.task);
    const sectionPasses = filter === 'all' || sec.status === f.section;
    const shown = fTasks.length ? fTasks : sectionPasses ? qTasks : [];
    const included = (!q || titleMatch || qTasks.length > 0) && (filter === 'all' || fTasks.length > 0 || sectionPasses);
    return { sec, tasks: sortTasks(shown, sort), included };
  }).filter(v => v.included), [sections, q, filter, f, sort]);

  const progress = overallProgress(sections);
  const next = pickNextAction(sections);

  const selSection = selected && sections.find(s => s.id === selected.sectionId);
  const selTask = selSection?.tasks.find(t => t.id === selected.taskId);

  const openDetails = (section, task, el) => { openerRef.current = el; setSelected({ sectionId: section.id, taskId: task.id }); };
  const openFromNext = (section, task) => { openerRef.current = null; onOpenTask(section, task); };

  const resultText = `${view.length} of ${sections.length} sections shown`;

  return (
    <div className="workspace-page wf-page">
      <WorkflowHeader deal={deal} onBack={onBack} detailsOpen={detailsOpen} onToggleDetails={() => setDetailsOpen(o => !o)} />
      <WorkflowProgressSummary progress={progress} />
      <WorkflowToolbar query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} sort={sort} onSort={setSort}
        onExpandAll={() => setAll(true)} onCollapseAll={() => setAll(false)} resultText={resultText} />

      <div className="wf-list">
        {sections.length === 0 && <p className="wf-empty box">No workflow sections are configured.</p>}
        {sections.length > 0 && view.length === 0 && <p className="wf-empty box">No sections match your search or filter.</p>}
        {view.map(({ sec, tasks }) => (
          <WorkflowSectionAccordion key={sec.id} section={sec} tasks={tasks} open={isOpen(sec)}
            onToggle={() => setOpenMap(m => ({ ...m, [sec.id]: !isOpen(sec) }))} onOpenTask={openDetails} />
        ))}
      </div>

      <NextActionPanel next={next} onOpen={openFromNext} />

      {selTask && (
        <TaskDetailsDrawer deal={deal} section={selSection} task={selTask} returnFocusTo={openerRef.current}
          onClose={() => setSelected(null)} onOpenTask={(s, t) => onOpenTask(s, t)} onMarkComplete={t => onTaskComplete(t.id)} />
      )}
    </div>
  );
}
