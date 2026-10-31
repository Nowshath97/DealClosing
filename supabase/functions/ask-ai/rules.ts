// Business rules + deterministic closing-readiness logic for Ask AI.
//
// Everything here is plain TypeScript with no Deno or network dependencies, so it is unit-tested from Node
// (scripts/test-ask-ai.mjs). The TASK_RULES below MUST stay identical to src/taskRules.js (the test fails if they drift).
// The language model never decides readiness or totals: it only explains what these functions return.

export const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export interface RuleDef {
  label: string;
  activity: string; // ref_deal_activity name, letters only, lower-case
  after?: string[]; // task keys that must be Completed first (unlock rule)
  if?: "icApproved" | "fundingRequired"; // task only exists when this deal fact is true
  // Does this task have to be done before the deal can close? CONFIGURED DEFAULT: every rule-defined task is required.
  // Confirm with the business; tasks that have no rule at all are reported as "unclassified" instead of guessed at.
  blocksClose: boolean;
}

export const TASK_RULES: Record<string, RuleDef> = {
  initiateallocations: { label: "Initiate Allocations", activity: "allocations", blocksClose: true },
  finalizeallocations: { label: "Finalize Allocations", activity: "allocations", after: ["initiateallocations"], blocksClose: true },
  amlcounterpartyscreening: { label: "AML Counterparty Screening", activity: "riskcompliance", blocksClose: true },
  avoidancepolicyconfirmation: { label: "Avoidance Policy Confirmation", activity: "riskcompliance", blocksClose: true },
  assignlegallead: { label: "Assign Legal Lead", activity: "legalentitymanagement", if: "icApproved", blocksClose: true },
  legalapprovaltoclose: { label: "Legal Approval to Close", activity: "transactionaldocs", after: ["finalizeallocations"], blocksClose: true },
  transactionaldocumentapproval: { label: "Transactional Document Approval", activity: "transactionaldocs", after: ["legalapprovaltoclose"], blocksClose: true },
  completefunding: { label: "Complete Funding", activity: "funding", if: "fundingRequired", after: ["initiateallocations"], blocksClose: true },
};

// Tasks that always display under a given section whatever activity_id is stored (same as the app).
export const DISPLAY_ACTIVITY: Record<string, string> = { legalapprovaltoclose: "transactionaldocs" };

const MISSING_REASON: Record<string, string> = {
  completefunding: "it is created once funding is confirmed as required in Initiate Allocations",
  assignlegallead: "it is expected because IC approval is recorded for this deal",
};

export type TaskStatus = "completed" | "skipped" | "overdue" | "inProgress" | "pending";
export const STATUS_LABEL: Record<TaskStatus, string> = {
  completed: "Completed", skipped: "Not required", overdue: "Overdue", inProgress: "In progress", pending: "Not started",
};

export const isFundingRequired = (refValue: unknown): boolean => {
  const v = norm(refValue);
  return v === "yes" || v === "true" || (v.includes("required") && !v.includes("not") && !v.includes("no"));
};

// ref_task_status: Not Started, Assigned, Accepted, Completed, Skipped.
// "Overdue" only ever applies to an incomplete task that HAS a due date in the past.
export function taskStatusOf(refValue: unknown, dueDate: string | null | undefined, today: string): TaskStatus {
  const v = norm(refValue);
  if (v.includes("complete")) return "completed";
  if (v.includes("skip")) return "skipped";
  if (dueDate && dueDate < today) return "overdue";
  if (v.includes("assigned") || v.includes("accepted")) return "inProgress";
  return "pending";
}

export interface NormTask {
  id: number;
  name: string;
  key: string;
  activity: string;
  status: TaskStatus;
  statusLabel: string;
  systemStatus: string; // the raw ref_task_status text
  dueDate: string | null;
  completedDate: string | null;
  assignedTo: string | null;
  completedBy: string | null;
  assumed?: boolean; // marked completed by a what-if simulation
  lock?: { reason: string; blockedBy: string[] } | null;
}

export function lockInfo(key: string, byKey: Record<string, { status: TaskStatus }>): { reason: string; blockedBy: string[] } | null {
  const rule = TASK_RULES[key];
  if (!rule?.after) return null;
  const unmet = rule.after.filter((dep) => byKey[dep]?.status !== "completed");
  if (!unmet.length) return null;
  const names = unmet.map((d) => TASK_RULES[d].label);
  return { reason: `Available after ${names.join(" and ")} is completed`, blockedBy: names };
}

export function activityStatus(tasks: Pick<NormTask, "status">[]): string {
  if (!tasks.length) return "Not Started";
  const live = tasks.filter((t) => t.status !== "skipped");
  if (!live.length) return "Not Required";
  if (live.every((t) => t.status === "completed")) return "Completed";
  if (live.some((t) => t.status === "overdue")) return "Overdue";
  if (live.some((t) => t.status !== "pending")) return "In Progress";
  return "Not Started";
}

export interface DealFacts { icApproved: boolean; fundingRequired: boolean }

const urgency = (t: NormTask) => (t.status === "overdue" ? 0 : t.status === "inProgress" ? 1 : 2);
const byUrgency = (a: NormTask, b: NormTask) => urgency(a) - urgency(b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");

const brief = (t: NormTask) => ({
  task_id: t.id, task: t.name, workstream: t.activity, status: t.statusLabel, system_status: t.systemStatus,
  due_date: t.dueDate, assigned_to: t.assignedTo, locked_reason: t.lock?.reason ?? null,
});

// Closing readiness for one deal. `assume` = task ids treated as completed (what-if simulation; nothing is saved).
export function assess(tasks: NormTask[], facts: DealFacts, assume: Set<number> = new Set()) {
  const work: NormTask[] = tasks.map((t) => (assume.has(t.id) && t.status !== "completed" ? { ...t, status: "completed", statusLabel: STATUS_LABEL.completed, assumed: true } : t));
  const byKey: Record<string, NormTask> = Object.fromEntries(work.map((t) => [t.key, t]));
  const locked = work.map((t) => (t.status === "pending" ? { ...t, lock: lockInfo(t.key, byKey) } : t));

  const done = (t: NormTask) => t.status === "completed" || t.status === "skipped";
  const mandatory = locked.filter((t) => TASK_RULES[t.key]?.blocksClose);
  const outstanding = mandatory.filter((t) => !done(t)).sort(byUrgency);
  const unclassified = locked.filter((t) => !TASK_RULES[t.key] && !done(t)).sort(byUrgency);

  // tasks the rules say should exist for this deal but are not there (yet)
  const missing = Object.entries(TASK_RULES)
    .filter(([key, r]) => (!r.if || facts[r.if]) && !byKey[key] && r.blocksClose)
    .map(([key, r]) => ({ task: r.label, workstream: r.activity, reason: MISSING_REASON[key] ?? "it is not present on this deal yet" }));

  let ready: boolean | null;
  let basis: string;
  if (!tasks.length) { ready = null; basis = "This deal has no tasks yet, so closing readiness cannot be determined."; }
  else if (outstanding.length || missing.length) { ready = false; basis = "At least one task required by the configured closing rules is not finished."; }
  else if (unclassified.length) { ready = null; basis = "All rule-defined tasks are finished, but other open tasks have no mandatory/optional rule, so readiness cannot be conclusively determined."; }
  else { ready = true; basis = "Every task required by the configured closing rules is finished."; }

  const nextActions = [
    ...outstanding.filter((t) => !t.lock).map((t) => `Complete "${t.name}" (${t.activity}${t.assignedTo ? `, assigned to ${t.assignedTo}` : ", unassigned"}${t.dueDate ? `, due ${t.dueDate}` : ""})`),
    ...outstanding.filter((t) => t.lock).map((t) => `"${t.name}" is waiting: ${t.lock!.reason}`),
    ...missing.map((m) => `"${m.task}" has not been created yet because ${m.reason}`),
  ];

  const activities = [...new Set(locked.map((t) => t.activity))];
  const workstreams = activities.map((name) => {
    const ts = locked.filter((t) => t.activity === name);
    const live = ts.filter((t) => t.status !== "skipped");
    return { workstream: name, status: activityStatus(ts), completed: live.filter((t) => t.status === "completed").length, total: live.length };
  });

  return {
    ready_to_close: ready,
    basis,
    rules_basis: "Mandatory flags come from the configured task rules (every rule-defined task is treated as required to close). Tasks without a rule are listed as unclassified rather than assumed.",
    totals: { tasks: tasks.length, completed: locked.filter((t) => t.status === "completed").length, not_required: locked.filter((t) => t.status === "skipped").length, open: locked.filter((t) => !done(t)).length },
    completed_tasks: locked.filter((t) => t.status === "completed").map((t) => ({ task_id: t.id, task: t.name, workstream: t.activity, completed_date: t.completedDate, simulated: !!t.assumed })),
    outstanding_mandatory: outstanding.map(brief),
    not_yet_created: missing,
    unclassified_open_tasks: unclassified.map(brief),
    workstreams,
    next_actions: nextActions,
  };
}
