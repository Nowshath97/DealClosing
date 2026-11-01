// Task creation + trigger rules for new deals, keyed by the normalised ref_task_name value.
//
// "Triggered" means the task is visible on the deal but locked (not clickable) until its conditions are met.
// For now locking is derived from the status of the deal's other tasks; this is the logic to move into
// Temporal later. Keep it here so the workflow engine can replace it without touching the UI.
//
//   activity : intended ref_deal_activity for the task; task_activity_map is the database source of truth
//   if       : the task is only created when this deal fact is true ('icApproved' | 'fundingRequired')
//   after    : task keys that must be Completed before this task unlocks
export const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

export const TASK_RULES = {
  mapaccountstoclose: { label: 'Map Accounts to Close', activity: 'allocations', if: 'primary' },
  initiateallocations: { label: 'Initiate Allocations', activity: 'allocations' },
  finalizeallocations: { label: 'Finalize Allocations', activity: 'allocations', after: ['initiateallocations'] },
  amlcounterpartyscreening: { label: 'AML Counterparty Screening', activity: 'riskcompliance' },
  avoidancepolicyconfirmation: { label: 'Avoidance Policy Confirmation', activity: 'riskcompliance' },
  assignlegallead: { label: 'Assign Legal Lead', activity: 'legalentitymanagement', if: 'icApproved' },
  legalapprovaltoclose: { label: 'Legal Approval to Close', activity: 'transactionaldocs', after: ['finalizeallocations'] },
  transactionaldocumentapproval: { label: 'Transactional Document Approval', activity: 'transactionaldocs', after: ['legalapprovaltoclose'] },
  // Only exists when funding is required; unlocks once Initiate Allocations is done.
  completefunding: { label: 'Complete Funding', activity: 'funding', if: 'fundingRequired', after: ['initiateallocations'] }
};

// Tasks that always display under a given section, whatever activity_id is stored on the row. This moves existing deals
// too, without a data fix. (Value = ref_deal_activity name, letters only, lower-case.)
export const DISPLAY_ACTIVITY = { legalapprovaltoclose: 'transactionaldocs' };

// Task keys to create when a deal is created, given what is known at that moment.
export const tasksForNewDeal = facts => Object.entries(TASK_RULES)
  .filter(([key, r]) => {
    if (facts.primary && ['initiateallocations', 'finalizeallocations'].includes(key)) return false;
    return !r.if || facts[r.if];
  })
  .map(([key]) => key);

// For a not-yet-started task: is it locked, and why? `byKey` maps task key -> that deal's task.
export function lockInfo(key, byKey, primary = false) {
  if (primary && key === 'finalizeallocations') return null;
  const rule = TASK_RULES[key];
  if (!rule?.after) return null;
  const dependencies = primary
    ? rule.after.map(dep => ['finalizeallocations', 'initiateallocations'].includes(dep) ? 'mapaccountstoclose' : dep)
    : rule.after;
  const unmet = dependencies.filter(dep => byKey[dep]?.taskStatus !== 'completed');
  if (!unmet.length) return null;
  return { locked: true, reason: `Available after ${unmet.map(d => TASK_RULES[d].label).join(' and ')} is completed` };
}
