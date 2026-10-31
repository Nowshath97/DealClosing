import { AlertCircle, CheckCircle2, Circle, CircleSlash, Clock3 } from 'lucide-react';

// Single source of truth for status labels, colours (CSS tone classes), icons and ordering.
export const TASK_STATUS = {
  completed: { key: 'completed', label: 'Completed', tone: 'green', icon: CheckCircle2, rank: 4 },
  inProgress: { key: 'inProgress', label: 'In Progress', tone: 'amber', icon: Clock3, rank: 2 },
  overdue: { key: 'overdue', label: 'Overdue', tone: 'red', icon: AlertCircle, rank: 1 },
  pending: { key: 'pending', label: 'Not Started', tone: 'gray', icon: Circle, rank: 3 },
  skipped: { key: 'skipped', label: 'Not Required', tone: 'gray', icon: CircleSlash, rank: 5 }
};
export const taskStatusMeta = key => TASK_STATUS[key] || TASK_STATUS.pending;

// Section statuses are derived from their tasks in api.js (activityStatus).
const SECTION_STATUS = {
  Completed: TASK_STATUS.completed,
  'In Progress': TASK_STATUS.inProgress,
  Overdue: TASK_STATUS.overdue,
  'Not Started': TASK_STATUS.pending,
  'Not Required': TASK_STATUS.skipped
};
export const sectionStatusMeta = label => SECTION_STATUS[label] || TASK_STATUS.pending;

export const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue', task: 'overdue', section: 'Overdue' },
  { key: 'inProgress', label: 'In Progress', task: 'inProgress', section: 'In Progress' },
  { key: 'completed', label: 'Completed', task: 'completed', section: 'Completed' },
  { key: 'notStarted', label: 'Not Started', task: 'pending', section: 'Not Started' }
];

export const SORTS = [
  { key: 'default', label: 'Default order' },
  { key: 'due', label: 'Due date' },
  { key: 'priority', label: 'Priority' }
];

// Sections that need attention are open by default; users can override.
export const defaultOpen = sectionStatus => sectionStatus === 'Overdue' || sectionStatus === 'In Progress';

export const parseUsDate = d => {
  const [m, day, y] = String(d).split('/');
  const t = new Date(`${y}-${m}-${day}`).getTime();
  return Number.isNaN(t) ? null : t;
};
export const hasDate = d => parseUsDate(d) !== null;

// Progress uses real task data only; skipped ("Not Required") work is excluded from the denominator.
export function sectionProgress(section) {
  const live = section.tasks.filter(t => t.taskStatus !== 'skipped');
  const done = live.filter(t => t.taskStatus === 'completed').length;
  return { done, total: live.length, pct: live.length ? (done / live.length) * 100 : 0 };
}

export function overallProgress(sections) {
  const counted = sections.filter(s => s.status !== 'Not Required');
  const by = label => counted.filter(s => s.status === label).length;
  const completed = by('Completed');
  return { total: counted.length, completed, inProgress: by('In Progress'), overdue: by('Overdue'), notStarted: by('Not Started'), pct: counted.length ? (completed / counted.length) * 100 : null };
}

// Most relevant actionable task: overdue, then in progress, then upcoming dated, then undated pending.
export function pickNextAction(sections) {
  const all = sections.flatMap(section => section.tasks.map(task => ({ section, task })))
    .filter(({ task }) => task.taskStatus !== 'completed' && task.taskStatus !== 'skipped');
  const byDate = (a, b) => (parseUsDate(a.task.date) ?? Infinity) - (parseUsDate(b.task.date) ?? Infinity);
  for (const key of ['overdue', 'inProgress']) {
    const hit = all.filter(x => x.task.taskStatus === key).sort(byDate)[0];
    if (hit) return hit;
  }
  const pending = all.filter(x => x.task.taskStatus === 'pending');
  return pending.filter(x => hasDate(x.task.date)).sort(byDate)[0] || pending[0] || null;
}
