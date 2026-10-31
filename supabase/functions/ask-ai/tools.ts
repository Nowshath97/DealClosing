// The only things Ask AI can do: a fixed set of READ-ONLY lookups.
//
// - Every tool validates its own arguments (the model's arguments are untrusted input).
// - Data is read through `ctx.rest`, which calls PostgREST with the SIGNED-IN USER's token, so database access rules
//   (row-level security) apply exactly as they do in the app. Only GET requests are ever made.
// - Money, totals and readiness are computed here in code. The model only explains the results.
// - No tool takes SQL, code or a user id.
import { assess, DISPLAY_ACTIVITY, isFundingRequired, norm, STATUS_LABEL, TASK_RULES, taskStatusOf } from "./rules.ts";
import type { NormTask, TaskStatus } from "./rules.ts";

export type RestFn = (path: string) => Promise<any>;
export interface ToolContext { rest: RestFn; today: string; user: { email: string; name: string } }
export interface Source { type: "deal" | "task" | "allocation"; id: string; label: string; dealCode: string }
export interface ToolResult { data: unknown; sources: Source[] }
export class ToolError extends Error {}

// ---------- argument validation ----------
type Args = Record<string, unknown>;
const str = (a: Args, k: string, o: { max?: number; optional?: boolean } = {}): string | undefined => {
  const v = a[k];
  if (v == null || v === "") { if (o.optional) return undefined; throw new ToolError(`"${k}" is required`); }
  if (typeof v !== "string") throw new ToolError(`"${k}" must be a string`);
  if (v.length > (o.max ?? 200)) throw new ToolError(`"${k}" is too long`);
  return v.trim();
};
const int = (a: Args, k: string, o: { min: number; max: number; optional?: boolean }): number | undefined => {
  const v = a[k];
  if (v == null) { if (o.optional) return undefined; throw new ToolError(`"${k}" is required`); }
  if (typeof v !== "number" || !Number.isInteger(v) || v < o.min || v > o.max) throw new ToolError(`"${k}" must be an integer between ${o.min} and ${o.max}`);
  return v;
};
const oneOf = <T extends string>(a: Args, k: string, allowed: readonly T[], optional = true): T | undefined => {
  const v = a[k];
  if (v == null) { if (optional) return undefined; throw new ToolError(`"${k}" is required`); }
  if (typeof v !== "string" || !allowed.includes(v as T)) throw new ToolError(`"${k}" must be one of: ${allowed.join(", ")}`);
  return v as T;
};
const isoDate = (a: Args, k: string): string | undefined => {
  const v = str(a, k, { optional: true, max: 10 });
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ToolError(`"${k}" must be a date like 2026-12-31`);
  return v;
};
const strList = (a: Args, k: string, max = 20): string[] => {
  const v = a[k];
  if (!Array.isArray(v) || !v.length) throw new ToolError(`"${k}" must be a non-empty list of strings`);
  if (v.length > max || v.some((x) => typeof x !== "string" || x.length > 150)) throw new ToolError(`"${k}" must be at most ${max} short strings`);
  return v.map((x) => (x as string).trim());
};

// text that goes into a PostgREST filter: strip anything that has meaning there
const clean = (s: string) => s.replace(/[*%,()"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const alnum = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9@.]/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;
const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number) => c / 100;

// ---------- loading + normalising ----------
const DEAL_SELECT = [
  "*", "dealType:ref_deal_type(value)", "dealStatus:ref_deal_status(value)", "fundingRef:ref_funding_required(value)", "milestoneRef:ref_deal_milestone(value)",
  "task(*,name:ref_task_name(value),statusRef:ref_task_status(value),response:task_response(answers,answer,confirmation_date,confirmation_by,answered_by,answered_on))",
].join(",");

interface Activity { id: number; value: string }
export interface Deal {
  code: string; name: string; row: any; tasks: NormTask[]; activities: string[];
  facts: { icApproved: boolean; fundingRequired: boolean };
  milestone: string; path: string[]; isClosed: boolean; dealStatus: string; daysToTargetClose: number | null;
}

const PATH_NO_FUNDING = ["IC Approved", "Ready To Close", "Closed"];
const PATH_FUNDING = ["IC Approved", "Ready To Fund", "Funded"];

const daysBetween = (from: string, to: string | null | undefined): number | null => {
  if (!to) return null;
  const a = Date.parse(from), b = Date.parse(to);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000);
};

function buildDeal(row: any, activities: Activity[], today: string): Deal {
  const fundingRequired = isFundingRequired(row.fundingRef?.value);
  const path = fundingRequired ? PATH_FUNDING : PATH_NO_FUNDING;
  const milestone: string = row.milestoneRef?.value ?? "";
  const dealStatus: string = row.dealStatus?.value ?? "";
  const nameOfActivity = (t: any): string => {
    const forced = DISPLAY_ACTIVITY[norm(t.name?.value)];
    return (forced && activities.find((a) => norm(a.value) === forced)?.value) || activities.find((a) => a.id === t.activity_id)?.value || "Unassigned workstream";
  };
  const tasks: NormTask[] = (row.task ?? []).map((t: any): NormTask => {
    const status = taskStatusOf(t.statusRef?.value, t.due_date, today);
    return {
      id: t.id, name: t.name?.value ?? `Task ${t.id}`, key: norm(t.name?.value), activity: nameOfActivity(t), status, statusLabel: STATUS_LABEL[status],
      systemStatus: t.statusRef?.value ?? "", dueDate: t.due_date ?? null, completedDate: t.completed_date ?? null,
      assignedTo: t.assigned_to ? String(t.assigned_to) : null, completedBy: t.completed_by ?? null,
    };
  });
  const order = activities.map((a) => a.value);
  tasks.sort((a, b) => order.indexOf(a.activity) - order.indexOf(b.activity) || a.id - b.id);
  const isClosed = (!!milestone && milestone === path[path.length - 1]) || /closed|funded/i.test(dealStatus);
  return {
    code: row.deal_code, name: row.name || row.deal_code, row, tasks, activities: order,
    facts: { icApproved: !!row.ic_approval, fundingRequired }, milestone, path, isClosed, dealStatus,
    daysToTargetClose: daysBetween(today, row.target_closing_date),
  };
}

const loadActivities = (ctx: ToolContext): Promise<Activity[]> => ctx.rest("ref_deal_activity?select=id,value&is_active=eq.true&order=id");

async function loadDeals(ctx: ToolContext, extra: string, limit: number): Promise<Deal[]> {
  const [rows, acts] = await Promise.all([
    ctx.rest(`deal?select=${encodeURIComponent(DEAL_SELECT)}${extra}&order=created_on.desc&limit=${limit}`),
    loadActivities(ctx),
  ]);
  return (rows as any[]).map((r) => buildDeal(r, acts, ctx.today));
}

// "this deal" arrives as a deal code or a name; resolve it to exactly one deal or explain why not
async function oneDeal(ctx: ToolContext, text: string): Promise<Deal> {
  const t = clean(text);
  if (!t) throw new ToolError("Give a deal code or deal name.");
  let found = await loadDeals(ctx, `&deal_code=ilike.${encodeURIComponent(t)}`, 5);
  if (!found.length) found = await loadDeals(ctx, `&name=ilike.${encodeURIComponent(`*${t}*`)}`, 10);
  if (!found.length) throw new ToolError(`No deal found matching "${text}". Use list_deals to see deal codes and names.`);
  if (found.length > 1) {
    const exact = found.filter((d) => norm(d.name) === norm(t) || alnum(d.code) === alnum(t));
    if (exact.length === 1) return exact[0];
    throw new ToolError(`Several deals match "${text}": ${found.map((d) => `${d.name} (${d.code})`).join("; ")}. Ask the user which one they mean.`);
  }
  return found[0];
}

const dealSource = (d: Deal): Source => ({ type: "deal", id: d.code, label: d.name, dealCode: d.code });
const taskSource = (d: Deal, t: NormTask): Source => ({ type: "task", id: String(t.id), label: `${t.name} – ${d.name}`, dealCode: d.code });

const dealFacts = (d: Deal) => ({
  deal_code: d.code, deal_name: d.name, project_name: d.row.project_name ?? null, investment_type: d.row.dealType?.value ?? null,
  investment_type_detail: d.row.investment_type_detail ?? null, deal_status: d.dealStatus || null, milestone: d.milestone || null, milestone_path: d.path,
  is_closed: d.isClosed, ic_approved: d.facts.icApproved, funding_required: d.facts.fundingRequired, currency: d.row.currency ?? null,
  commitment_usd: d.row.commitment_usd ?? null, commitment_funding_currency: d.row.commitment_funding_currency ?? null,
  target_closing_date: d.row.target_closing_date ?? null, target_funding_date: d.row.target_funding_date ?? null, days_to_target_closing: d.daysToTargetClose,
  region: d.row.region ?? null, asset_class: d.row.asset_class ?? null, sponsor_gp: d.row.sponsor_gp ?? null, created_on: d.row.created_on ?? null,
});

const field = (row: any, ...names: string[]) => {
  for (const name of names) {
    const key = Object.keys(row ?? {}).find((k) => k.toLowerCase().replace(/[^a-z]/g, "") === name);
    if (key && row[key] != null && row[key] !== "") return row[key];
  }
  return "";
};
const legalLeadSummary = (row: any) => {
  const email = String(field(row, "email", "emailaddress", "mail"));
  return {
    id: field(row, "id", "userid"),
    name: String(field(row, "name", "fullname", "displayname", "username") || [field(row, "firstname"), field(row, "lastname")].filter(Boolean).join(" ") || email),
    email,
  };
};

// ---------- allocation ----------
async function loadAllocation(ctx: ToolContext, code: string) {
  const q = encodeURIComponent(code);
  const [headers, lines, legal, closes, entities] = await Promise.all([
    ctx.rest(`allocation?deal_code=eq.${q}&select=*`),
    ctx.rest(`allocation_line?deal_code=eq.${q}&select=*&order=line_no,id`),
    ctx.rest(`allocation_legal_map?deal_code=eq.${q}&select=*&order=id`),
    ctx.rest(`allocation_close?deal_code=eq.${q}&select=*&order=id`),
    ctx.rest("entity?select=Id,EntityName"),
  ]);
  return { header: (headers as any[])[0] ?? null, lines: lines as any[], legal: legal as any[], closes: closes as any[], entities: entities as any[] };
}

function allocationSummary(a: Awaited<ReturnType<typeof loadAllocation>>) {
  if (!a.header) return { exists: false, note: "No allocation has been saved for this deal yet (Initiate Allocations not started or never saved)." };
  const total = cents(a.header.total_adjusted_exposure);
  const allocated = a.lines.reduce((n, l) => n + cents(l.adjusted_exposure), 0);
  const expenses = a.lines.reduce((n, l) => n + cents(l.expenses_amount), 0);
  const clientFunding = a.lines.reduce((n, l) => n + cents(l.client_funding), 0);
  const entityName = (id: number) => a.entities.find((e) => e.Id === id)?.EntityName ?? null;
  return {
    exists: true, status: a.header.status, funding_currency: a.header.funding_currency,
    funding_required: a.header.funding_required === 1 ? "Yes" : a.header.funding_required === 0 ? "No" : null,
    partial_funding: a.header.partial_funding === 1 ? "Yes" : a.header.partial_funding === 0 ? "No" : null,
    expenses_pct: a.header.expenses_pct,
    total_adjusted_exposure: fromCents(total), total_allocated: fromCents(allocated), unallocated: fromCents(total - allocated),
    total_expenses: fromCents(expenses), total_client_funding: fromCents(clientFunding),
    fully_allocated: total > 0 && total === allocated,
    header_totals_match_lines: cents(a.header.total_allocated) === allocated,
    lines: a.lines.map((l) => ({
      client_account: l.client_account, allocating_entity: entityName(l.entity_id), adjusted_exposure: l.adjusted_exposure, percentage: l.percentage,
      expenses: l.expenses_amount, client_funding: l.client_funding, placeholder: l.is_placeholder === 1,
      amgo_review_required: l.amgo_review_required === 1, lux_review_required: l.lux_review_required === 1,
      additional_aml_review_required: l.additional_aml_review === 1, client_veto: l.client_veto === 1,
    })),
    legal_names: a.legal.map((m) => {
      const line = a.lines.find((l) => l.id === m.line_id);
      return { client_account: line?.client_account ?? null, allocating_entity: line ? entityName(line.entity_id) : null, investment_legal_name: m.investment_legal_name, amount: m.allocation_amount };
    }),
    closes: a.closes.map((c) => ({ close_date: c.close_date, type: c.close_type })),
  };
}

// ---------- tool definitions ----------
const DEAL_ARG = { type: "string", description: "A deal code (e.g. 7KQ2PX9WBT4LD1M) or all/part of the deal name." };

export const TOOLS: Record<string, { def: { name: string; description: string; input_schema: Record<string, unknown> }; run: (ctx: ToolContext, args: Args) => Promise<ToolResult> }> = {
  get_deal: {
    def: {
      name: "get_deal",
      description: "Full current picture of ONE deal: deal facts and dates, milestone, legal lead (reported only if Assign Legal Lead is completed), workstreams with every task (status, due date, assignee, completed-by person, locked reason), allocation summary and closing-readiness summary. Use for summaries and 'tell me about this deal'.",
      input_schema: { type: "object", properties: { deal: DEAL_ARG }, required: ["deal"], additionalProperties: false },
    },
    run: async (ctx, args) => {
      const deal = await oneDeal(ctx, str(args, "deal", { max: 100 })!);
      const a = assess(deal.tasks, deal.facts);
      const [allocationData, legalLeadRows] = await Promise.all([
        loadAllocation(ctx, deal.code),
        deal.row.legal_lead == null ? Promise.resolve([]) : ctx.rest(`users?id=eq.${encodeURIComponent(String(deal.row.legal_lead))}&select=*`),
      ]);
      const alloc = allocationSummary(allocationData);
      const legalLeadTaskCompleted = deal.tasks.some((t) => t.key === "assignlegallead" && t.status === "completed");
      const lockedById = new Map(a.outstanding_mandatory.map((t) => [t.task_id, t.locked_reason]));
      const workstreams = deal.activities.map((name) => {
        const ts = deal.tasks.filter((t) => t.activity === name);
        const w = a.workstreams.find((x) => x.workstream === name);
        return {
          workstream: name, status: w?.status ?? "Not Started", completed: w?.completed ?? 0, total: w?.total ?? 0,
          tasks: ts.map((t) => {
            const raw = (deal.row.task ?? []).find((row: any) => row.id === t.id);
            const response = Array.isArray(raw?.response) ? raw.response[0] : raw?.response;
            return {
              task_id: t.id, task: t.name, status: t.statusLabel, system_status: t.systemStatus, due_date: t.dueDate,
              assigned_to: t.assignedTo, completed_by: t.completedBy, completed_date: t.completedDate,
              locked_reason: lockedById.get(t.id) ?? null,
              saved_response: response?.answers ?? (response?.answer != null ? { answer: response.answer } : null),
              response_confirmation_date: response?.confirmation_date ?? null,
              response_confirmed_by: response?.confirmation_by ?? null,
              response_answered_by: response?.answered_by ?? null,
              response_answered_on: response?.answered_on ?? null,
            };
          }),
        };
      });
      return {
        data: {
          deal: dealFacts(deal),
          legal_lead_task_completed: legalLeadTaskCompleted,
          legal_lead: legalLeadTaskCompleted && legalLeadRows[0] ? legalLeadSummary(legalLeadRows[0]) : null,
          workstreams, allocation: alloc,
          readiness_summary: {
            ready_to_close: a.ready_to_close, basis: a.basis,
            outstanding_mandatory: a.outstanding_mandatory,
            not_yet_created: a.not_yet_created,
            unclassified_open_tasks: a.unclassified_open_tasks,
            next_actions: a.next_actions,
            totals: a.totals,
          },
          note: "Deal status (deal-level) and task statuses (task-level) are different things. Task 'Overdue' = past its due date and not finished.",
        },
        sources: [dealSource(deal), ...deal.tasks.slice(0, 25).map((t) => taskSource(deal, t)), ...(alloc.exists ? [{ type: "allocation" as const, id: deal.code, label: `Allocation – ${deal.name}`, dealCode: deal.code }] : [])],
      };
    },
  },

  get_closing_tracker: {
    def: {
      name: "get_closing_tracker",
      description: "The Deal Closing Tracker as live rows: one row per task per deal with deal name/code, investment type, deal status, target funding and closing dates, workstream, task, task status, due date and assignee. Filter by deal, workstream, assignee ('me' = the signed-in user), task status or due date. Use for 'which tasks...' questions across one deal or all deals.",
      input_schema: {
        type: "object",
        properties: {
          deal: { type: "string", description: "Limit to one deal (code or name). Omit for all deals." },
          activity: { type: "string", description: "Workstream name or part of it, e.g. 'Risk & Compliance', 'Allocations', 'Legal'." },
          assignee: { type: "string", description: "Person's name (partial ok), or 'me' for the signed-in user." },
          status: { type: "string", enum: ["open", "completed", "overdue", "in_progress", "not_started", "not_required"], description: "'open' = anything not completed or not required." },
          due_before: { type: "string", description: "ISO date; tasks due on or before it." },
          due_after: { type: "string", description: "ISO date; tasks due on or after it." },
          limit: { type: "integer", description: "Max rows (default 100, max 300)." },
        },
        additionalProperties: false,
      },
    },
    run: async (ctx, args) => {
      const dealText = str(args, "deal", { optional: true, max: 100 });
      const activity = str(args, "activity", { optional: true, max: 60 });
      const assignee = str(args, "assignee", { optional: true, max: 80 });
      const status = oneOf(args, "status", ["open", "completed", "overdue", "in_progress", "not_started", "not_required"] as const);
      const dueBefore = isoDate(args, "due_before");
      const dueAfter = isoDate(args, "due_after");
      const limit = int(args, "limit", { min: 1, max: 300, optional: true }) ?? 100;

      const deals = dealText ? [await oneDeal(ctx, dealText)] : await loadDeals(ctx, "", 300);
      const wantStatus: Record<string, TaskStatus[] | undefined> = {
        open: ["overdue", "inProgress", "pending"], completed: ["completed"], overdue: ["overdue"], in_progress: ["inProgress"], not_started: ["pending"], not_required: ["skipped"],
      };
      const me = [ctx.user.name, ctx.user.email];
      const rows: Record<string, unknown>[] = [];
      const sources: Source[] = [];
      const counts: Record<string, number> = {};
      let matches = 0;
      for (const d of deals) {
        for (const t of d.tasks) {
          if (activity && !norm(t.activity).includes(norm(activity))) continue;
          if (status && !wantStatus[status]!.includes(t.status)) continue;
          if (assignee) {
            const ok = alnum(assignee) === "me" ? me.some((v) => v && alnum(t.assignedTo) === alnum(v)) : alnum(t.assignedTo).includes(alnum(assignee));
            if (!t.assignedTo || !ok) continue;
          }
          if (dueBefore && !(t.dueDate && t.dueDate <= dueBefore)) continue;
          if (dueAfter && !(t.dueDate && t.dueDate >= dueAfter)) continue;
          matches++;
          counts[t.statusLabel] = (counts[t.statusLabel] ?? 0) + 1;
          if (rows.length < limit) {
            rows.push({
              deal_name: d.name, deal_code: d.code, investment_type: d.row.dealType?.value ?? null, deal_status: d.dealStatus || null,
              target_funding_date: d.row.target_funding_date ?? null, target_closing_date: d.row.target_closing_date ?? null,
              workstream: t.activity, task_id: t.id, task: t.name, task_status: t.statusLabel, due_date: t.dueDate, assigned_to: t.assignedTo, completed_date: t.completedDate,
            });
            if (sources.length < 25) sources.push(taskSource(d, t));
          }
        }
      }
      return {
        data: {
          report: "Deal Closing Tracker (live data)", filters: { deal: dealText ?? null, activity: activity ?? null, assignee: assignee ?? null, status: status ?? null, due_before: dueBefore ?? null, due_after: dueAfter ?? null },
          deals_searched: deals.length, total_matches: matches, rows_returned: rows.length, truncated: matches > rows.length, counts_by_task_status: counts, rows,
          not_recorded_in_this_system: ["Followed Up?", "Last Followed-up Date", "Pre/Post", "Target Signing Dates", "IC Approval Memo Uploaded", "Task-level comments (for most tasks)"],
        },
        sources,
      };
    },
  },

  list_deals: {
    def: {
      name: "list_deals",
      description: "List deals with dates, milestone, task counts, and (only after its task is completed) assigned legal lead. Use for upcoming closing deadlines, finding deal codes, legal leads across deals, or which deals are open/closed.",
      input_schema: {
        type: "object",
        properties: {
          status_group: { type: "string", enum: ["open", "closed", "all"], description: "Default 'open'." },
          investment_type: { type: "string", description: "Part of the investment type, e.g. 'Secondary'." },
          closing_within_days: { type: "integer", description: "Only deals whose target closing date is within this many days from today (also includes past-due target dates)." },
          closing_before: { type: "string", description: "ISO date; target closing on or before it." },
          limit: { type: "integer", description: "Max deals (default 50, max 200)." },
        },
        additionalProperties: false,
      },
    },
    run: async (ctx, args) => {
      const group = oneOf(args, "status_group", ["open", "closed", "all"] as const) ?? "open";
      const type = str(args, "investment_type", { optional: true, max: 60 });
      const within = int(args, "closing_within_days", { min: 0, max: 730, optional: true });
      const before = isoDate(args, "closing_before");
      const limit = int(args, "limit", { min: 1, max: 200, optional: true }) ?? 50;
      const loadedDeals = await loadDeals(ctx, "", 300);
      let deals = loadedDeals;
      deals = deals.filter((d) => (group === "all" || (group === "closed") === d.isClosed)
        && (!type || norm(d.row.dealType?.value).includes(norm(type)))
        && (within == null || (d.daysToTargetClose != null && d.daysToTargetClose <= within))
        && (!before || (d.row.target_closing_date && d.row.target_closing_date <= before)));
      deals.sort((a, b) => (a.row.target_closing_date ?? "9999").localeCompare(b.row.target_closing_date ?? "9999"));
      const visibleDeals = deals.slice(0, limit);
      const leadIds = new Set(visibleDeals.filter((d) => d.tasks.some((t) => t.key === "assignlegallead" && t.status === "completed") && d.row.legal_lead != null).map((d) => String(d.row.legal_lead)));
      const userRows: any[] = leadIds.size ? await ctx.rest("users?select=*").catch(() => []) : [];
      const rows = deals.slice(0, limit).map((d) => {
        const open = d.tasks.filter((t) => t.status !== "completed" && t.status !== "skipped");
        const legalLeadTask = d.tasks.find((t) => t.key === "assignlegallead");
        const legalLeadTaskCompleted = legalLeadTask?.status === "completed";
        const legalLeadUser = legalLeadTaskCompleted && d.row.legal_lead != null
          ? (userRows as any[]).find((u) => String(field(u, "id", "userid")) === String(d.row.legal_lead))
          : null;
        return {
          deal_name: d.name, deal_code: d.code, investment_type: d.row.dealType?.value ?? null, deal_status: d.dealStatus || null, milestone: d.milestone || null,
          target_funding_date: d.row.target_funding_date ?? null, target_closing_date: d.row.target_closing_date ?? null, days_to_target_closing: d.daysToTargetClose,
          assign_legal_lead_task_status: legalLeadTask?.statusLabel ?? "Not created",
          legal_lead: legalLeadUser ? legalLeadSummary(legalLeadUser) : null,
          target_date_passed: d.daysToTargetClose != null && d.daysToTargetClose < 0 && !d.isClosed, tasks_open: open.length, tasks_overdue: d.tasks.filter((t) => t.status === "overdue").length, tasks_total: d.tasks.length,
        };
      });
      return { data: { today: ctx.today, total_matches: deals.length, rows_returned: rows.length, rows }, sources: deals.slice(0, limit).slice(0, 25).map(dealSource) };
    },
  },

  get_allocation: {
    def: {
      name: "get_allocation",
      description: "Allocation position computed in code. With a deal: header, every account/entity line, legal-name mapping, closes, and totals (total adjusted exposure, allocated, UNALLOCATED). Without a deal: one row per deal showing total vs allocated vs unallocated. Never add up numbers yourself - use these totals.",
      input_schema: { type: "object", properties: { deal: DEAL_ARG }, additionalProperties: false },
    },
    run: async (ctx, args) => {
      const dealText = str(args, "deal", { optional: true, max: 100 });
      if (dealText) {
        const deal = await oneDeal(ctx, dealText);
        const summary = allocationSummary(await loadAllocation(ctx, deal.code));
        return {
          data: { deal_code: deal.code, deal_name: deal.name, allocation: summary, not_modelled: "Multiple closes / close-level allocations are not modelled yet, so Close 1 vs Close 2 comparisons and cross-close account limits are unavailable." },
          sources: [dealSource(deal), ...(summary.exists ? [{ type: "allocation" as const, id: deal.code, label: `Allocation – ${deal.name}`, dealCode: deal.code }] : [])],
        };
      }
      const [allocs, deals] = await Promise.all([ctx.rest("allocation?select=*&order=deal_code&limit=300"), loadDeals(ctx, "", 300)]);
      const lineRows = await ctx.rest("allocation_line?select=deal_code,adjusted_exposure&limit=5000");
      const rows = (allocs as any[]).map((h) => {
        const d = deals.find((x) => x.code === h.deal_code);
        const allocated = (lineRows as any[]).filter((l) => l.deal_code === h.deal_code).reduce((n, l) => n + cents(l.adjusted_exposure), 0);
        const total = cents(h.total_adjusted_exposure);
        return {
          deal_code: h.deal_code, deal_name: d?.name ?? null, allocation_status: h.status, funding_currency: h.funding_currency,
          total_adjusted_exposure: fromCents(total), total_allocated: fromCents(allocated), unallocated: fromCents(total - allocated), fully_allocated: total > 0 && total === allocated,
        };
      });
      return {
        data: {
          deals_with_allocation: rows.length, deals_total: deals.length, deals_without_allocation: deals.filter((d) => !rows.some((r) => r.deal_code === d.code)).map((d) => ({ deal_code: d.code, deal_name: d.name })).slice(0, 50),
          deals_with_unallocated_amount: rows.filter((r) => r.unallocated !== 0).length, rows,
        },
        sources: rows.slice(0, 25).map((r) => ({ type: "allocation" as const, id: r.deal_code, label: `Allocation – ${r.deal_name ?? r.deal_code}`, dealCode: r.deal_code })),
      };
    },
  },

  get_closing_readiness: {
    def: {
      name: "get_closing_readiness",
      description: "Deterministic closing-readiness check for ONE deal against the configured task rules: ready_to_close is true / false / null (cannot be determined), outstanding mandatory tasks (with owner, due date and what they are waiting on), tasks not created yet, unclassified open tasks, workstream status and rule-based next actions. Use for 'what is preventing this deal from closing?'.",
      input_schema: { type: "object", properties: { deal: DEAL_ARG }, required: ["deal"], additionalProperties: false },
    },
    run: async (ctx, args) => {
      const deal = await oneDeal(ctx, str(args, "deal", { max: 100 })!);
      const a = assess(deal.tasks, deal.facts);
      return {
        data: { deal: { deal_code: deal.code, deal_name: deal.name, deal_status: deal.dealStatus || null, milestone: deal.milestone || null, target_closing_date: deal.row.target_closing_date ?? null, is_closed: deal.isClosed }, simulation: false, ...a },
        sources: [dealSource(deal), ...a.outstanding_mandatory.slice(0, 20).map((t) => ({ type: "task" as const, id: String(t.task_id), label: `${t.task} – ${deal.name}`, dealCode: deal.code }))],
      };
    },
  },

  simulate_closing_readiness: {
    def: {
      name: "simulate_closing_readiness",
      description: "WHAT-IF only: re-run the readiness check as if the listed tasks or whole workstreams were completed. Nothing is saved or changed. Items can be task names or workstream names (e.g. 'Risk & Compliance'). Always present the result as a simulation.",
      input_schema: {
        type: "object",
        properties: { deal: DEAL_ARG, assume_completed: { type: "array", items: { type: "string" }, description: "Task names and/or workstream names to treat as completed." } },
        required: ["deal", "assume_completed"], additionalProperties: false,
      },
    },
    run: async (ctx, args) => {
      const deal = await oneDeal(ctx, str(args, "deal", { max: 100 })!);
      const items = strList(args, "assume_completed");
      const assume = new Set<number>();
      const unmatched: string[] = [];
      for (const item of items) {
        const n = norm(item);
        const hits = deal.tasks.filter((t) => norm(t.activity) === n || norm(t.activity).includes(n) || norm(t.name).includes(n) || n.includes(norm(t.name)));
        if (!hits.length) unmatched.push(item); else hits.forEach((t) => assume.add(t.id));
      }
      const before = assess(deal.tasks, deal.facts);
      const after = assess(deal.tasks, deal.facts, assume);
      return {
        data: {
          SIMULATION: "Hypothetical result. No data was changed.", deal: { deal_code: deal.code, deal_name: deal.name },
          assumed_completed_tasks: deal.tasks.filter((t) => assume.has(t.id) && t.status !== "completed").map((t) => ({ task_id: t.id, task: t.name, workstream: t.activity })),
          items_not_matched: unmatched,
          before: { ready_to_close: before.ready_to_close, outstanding_mandatory: before.outstanding_mandatory.length, not_yet_created: before.not_yet_created.length },
          after,
        },
        sources: [dealSource(deal)],
      };
    },
  },
};

export const toolDefs = () => Object.values(TOOLS).map((t) => t.def);
// kept so the test can assert the rules in this folder and the app's rules stay identical
export const RULES_FOR_TEST = TASK_RULES;
