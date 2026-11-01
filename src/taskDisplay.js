// Keep database task names stable for routing; append close context only for display.
export function taskDisplayName(task, closeDate = task.closeDate) {
  if (task.closeId == null || !closeDate) return task.name;
  const date = new Date(`${closeDate}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return task.name;
  return `${task.name} - ${date.toLocaleDateString('en-US')} close`;
}
export const isCloseAllocationTask = task =>
  task.closeId != null && (task.key || String(task.name).toLowerCase().replace(/[^a-z]/g, '')) === 'finalizeallocations';
