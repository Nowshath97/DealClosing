import { rest, currentUser } from './supabaseClient';
import { DISPLAY_ACTIVITY, TASK_RULES, lockInfo, tasksForNewDeal } from './taskRules';

export { signIn, signOut, restoreSession } from './supabaseClient';

// The progress path depends on whether the deal needs funding (ref_funding_required).
// ref_deal_milestone supplies the rows; its sort_order isn't usable, so the order is defined here.
const PATH_NO_FUNDING = ['IC Approved', 'Ready To Close', 'Closed'];
const PATH_FUNDING = ['IC Approved', 'Ready To Fund', 'Funded'];
const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const isFundingRequired = refValue => { const v = norm(refValue); return v === 'yes' || v === 'true' || (v.includes('required') && !v.includes('not') && !v.includes('no')); };

const fmtDate = d => { if (!d) return '-'; const [y, m, day] = d.split('-'); return `${m}/${day}/${y}`; };
const yn = b => (b ? 'Yes' : 'No');
const fmtNum = n => (n == null ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const daysUntil = d => (d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null);
const today = () => new Date().toISOString().slice(0, 10);

// ref_task_status: Not Started, Assigned, Accepted, Completed, Skipped
function uiStatus(refValue, dueDate) {
  const v = norm(refValue);
  if (v.includes('complete')) return 'completed';
  if (v.includes('skip')) return 'skipped';
  if (dueDate && dueDate < today()) return 'overdue';
  if (v.includes('assigned') || v.includes('accepted')) return 'inProgress';
  return 'pending';
}

// Activity status is derived from its tasks.
export function activityStatus(tasks) {
  if (!tasks.length) return 'Not Started';
  const live = tasks.filter(t => t.taskStatus !== 'skipped');
  if (!live.length) return 'Not Required';
  if (live.every(t => t.taskStatus === 'completed')) return 'Completed';
  if (live.some(t => t.taskStatus === 'overdue')) return 'Overdue';
  if (live.some(t => t.taskStatus !== 'pending')) return 'In Progress';
  return 'Not Started';
}

// Every deal gets every activity (ref_deal_activity); tasks are grouped under their activity.
// Not-started tasks whose trigger conditions aren't met are marked locked (visible, not clickable).
function buildModules(activities, tasks, primary = false) {
  const mapped = tasks.map(t => ({
    id: String(t.id), activityId: activities.find(a => norm(a.value) === DISPLAY_ACTIVITY[norm(t.name?.value)])?.id ?? t.activity_id, key: norm(t.name?.value), name: t.name?.value || `Task ${t.id}`, date: fmtDate(t.due_date),
    closeId: t.close_id == null ? null : String(t.close_id),
    completedDate: fmtDate(t.completed_date), completedBy: t.completed_by || '', assignedTo: t.assigned_to ? String(t.assigned_to) : '-',
    taskStatus: uiStatus(t.statusRef?.value, t.due_date), statusLabel: t.statusRef?.value
  }));
  const byScope = new Map();
  for (const task of mapped) {
    const scope = task.closeId || 'deal';
    if (!byScope.has(scope)) byScope.set(scope, {});
    byScope.get(scope)[task.key] = task;
  }
  const withLocks = mapped.map(t => {
    const lock = t.taskStatus === 'pending' ? lockInfo(t.key, primary && t.closeId != null ? { ...(byScope.get('deal') || {}), ...(byScope.get(t.closeId) || {}) } : byScope.get(t.closeId || 'deal') || {}, primary) : null;
    return lock ? { ...t, ...lock } : t;
  });
  return activities.map(a => {
    const mine = withLocks.filter(t => t.activityId === a.id);
    return { id: `activity-${a.id}`, title: a.value, desc: '', status: activityStatus(mine), tasks: mine };
  });
}

function fromRow(r, activities, milestones) {
  const fundingRequired = isFundingRequired(r.fundingRef?.value);
  const primary = norm(r.dealType?.value) === 'primary';
  let taskRows = (r.task || []).filter(task => task.is_applicable !== false);
  if (primary) {
    const hasMapTask = taskRows.some(t => norm(t.name?.value) === 'mapaccountstoclose');
    // Older Primary deals already have Initiate/Finalize rows. Present the existing
    // initiation row as the new deal-level mapping task, and suppress the obsolete
    // separate finalization task. If the new task already exists, suppress both legacy rows.
    taskRows = taskRows
      .filter(t => {
        const key = norm(t.name?.value);
        if (key === 'finalizeallocations') return t.close_id != null;
        if (key === 'initiateallocations') return !hasMapTask;
        return true;
      })
      .map(t => norm(t.name?.value) === 'initiateallocations'
        ? { ...t, name: { ...t.name, value: 'Map Accounts to Close' } }
        : t);
  }
  const path = (fundingRequired ? PATH_FUNDING : PATH_NO_FUNDING).map(name => milestones.find(m => norm(m.value) === norm(name))).filter(Boolean);
  const idx = Math.max(0, path.findIndex(m => m.id === r.milestone));
  const at = name => path.findIndex(m => norm(m.value) === norm(name));
  const reached = name => at(name) >= 0 && idx >= at(name);
  const finalStep = path.length > 0 && idx === path.length - 1; // Closed (no funding) or Funded (funding) => deal is closed
  return {
    id: r.deal_code, investmentName: r.name || r.deal_code, projectName: r.project_name || '-', investmentType: r.dealType?.value || '-',
    investmentTypeDetail: r.investment_type_detail || '-', sponsor: r.sponsor_gp || '-', region: r.region || '-', executionType: r.execution_type || '-', legalLeadId: r.legal_lead ?? null, assetClass: r.asset_class || '-',
    currency: r.currency || 'USD', commitment: fmtNum(r.commitment_usd), commitmentFunding: fmtNum(r.commitment_funding_currency),
    dateCreated: fmtDate(r.created_on?.slice(0, 10)), targetCloseDate: fmtDate(r.target_closing_date), targetFundingDate: fmtDate(r.target_funding_date), docsDeadlineGp: '-' /* Supplied by the future funding task. */,
    daysToClose: daysUntil(r.target_closing_date), icApproved: yn(r.ic_approval || reached('IC Approved')),
    readyToClose: yn(reached('Ready To Close') || reached('Ready To Fund')), closed: yn(finalStep), fundingRequired,
    status: finalStep ? 'Closed' : r.dealStatus?.value || '-', milestone: path[idx]?.value || '-', path: path.map(m => m.value), milestoneIndex: idx,
    modules: buildModules(activities, taskRows, primary)
  };
}

const DEAL_SELECT = [
  '*', 'dealType:ref_deal_type(value)', 'dealStatus:ref_deal_status(value)', 'fundingRef:ref_funding_required(value)',
  'task(*,name:ref_task_name(value),statusRef:ref_task_status(value))'
].join(',');

export async function fetchDeals() {
  const [rows, activities, milestones] = await Promise.all([
    rest(`deal?select=${encodeURIComponent(DEAL_SELECT)}&order=created_on.desc`),
    rest('ref_deal_activity?select=id,value&is_active=eq.true&order=id'),
    rest('ref_deal_milestone?select=id,value&is_active=eq.true')
  ]);
  return rows.map(r => fromRow(r, activities, milestones));
}

export const fetchDealTypes = () => refRows('ref_deal_type');
export async function fetchCreateDealOptions() {
  const [types, details, users, locations] = await Promise.all([
    fetchDealTypes(),
    rest('ref_investment_type_detail?select=id,deal_type_id,value&is_active=eq.true&order=sort_order,id'),
    fetchUsers(),
    rest('ref_execution_location?select=id,value&is_active=eq.true&order=value')
  ]);
  return { types, details, users, locations };
}


// Account master and ID-only entity mappings (client_account -> client_entity_map -> entity).
// The tables use quoted PascalCase column names, so they are referenced exactly as created.
export async function fetchAccountEntities() {
  const [maps, entities, accountRows] = await Promise.all([
    rest('client_entity_map?select=id,client_id,entity_id,is_active'),
    rest('entity?select=Id,name,EntityName,FundStatus,IsActive,IsDeleted,HasVetoRights,IsAmgoReviewRequired,IsLuxReviewRequired,IsAddtnlAMLReviewRequired,ClientAccountSubjectToVeto,ClientAccountIsPlaceholder'),
    rest('client_account?select=id,account_name,is_active')
  ]);
  const usable = new Map(entities
    .filter(e => e.IsActive !== 0 && e.IsActive !== false && e.IsDeleted !== 1 && e.IsDeleted !== true)
    .map(e => [String(e.Id), e]));
  const accountById = new Map(accountRows.filter(a => a.is_active !== false).map(a => [String(a.id), a]));
  const byAccount = {};
  for (const m of maps) {
    const e = usable.get(String(m.entity_id));
    const account = String(accountById.get(String(m.client_id))?.account_name || '').trim();
    if (m.is_active === false || !e || !account) continue;
    (byAccount[account] ||= []).push({
      id: e.Id, mapId: m.id, name: String(e.name || '').trim() || String(e.EntityName || '').trim() || `Entity ${e.Id}`, fundStatus: e.FundStatus, placeholder: e.ClientAccountIsPlaceholder === 1,
      amgo: e.IsAmgoReviewRequired === 1, lux: e.IsLuxReviewRequired === 1, aml: e.IsAddtnlAMLReviewRequired === 1,
      veto: e.HasVetoRights === 1 || e.ClientAccountSubjectToVeto === 'Yes'
    });
  }
  Object.values(byAccount).forEach(list => list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
  const accounts = Object.keys(byAccount).sort((a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true }));
  return { accounts, byAccount };
}

// Account choices come from the master, including accounts without entity mappings.
// This intentionally does not require an active entity row for the account to appear.
export async function fetchClientAccounts() {
  const rows = await rest('client_account?select=account_name,is_active');
  return [...new Set(rows
    .filter(row => row.is_active !== false)
    .map(row => String(row.account_name || '').trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// People who can be picked as legal lead. The users table's column names aren't fixed here, so id / name / email are found
// case-insensitively (name, full_name, display_name, first_name + last_name ...). Only those three values leave this function.
const field = (row, ...names) => {
  for (const n of names) {
    const key = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z]/g, '') === n);
    if (key && row[key] != null && row[key] !== '') return row[key];
  }
  return '';
};
export async function fetchUsers() {
  const rows = await rest('users?select=*');
  return rows
    .filter(u => ![0, false].includes(field(u, 'isactive', 'active')) && field(u, 'isdeleted') !== 1)
    .map(u => {
      const email = String(field(u, 'email', 'emailaddress', 'emailid', 'mail')).trim();
      const name = String(field(u, 'name', 'fullname', 'displayname', 'username')
        || [field(u, 'firstname'), field(u, 'lastname')].filter(Boolean).join(' ') || email);
      return { id: field(u, 'id', 'userid'), authUserId: field(u, 'authuserid'), name, email };
    })
    .filter(u => u.id !== '')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export const assignLegalLead = (dealCode, userId) =>
  rest(`deal?deal_code=eq.${encodeURIComponent(dealCode)}`, { method: 'PATCH', prefer: 'return=minimal', body: { legal_lead: Number(userId) } });

export const modulesForDeal = deal => deal.modules || [];

async function refRows(table) {
  return rest(`${table}?select=id,value&is_active=eq.true&order=id`);
}
const pick = (rows, match) => (rows.find(match) || rows[0])?.id ?? null;
const findId = (rows, key) => rows.find(r => norm(r.value) === key)?.id ?? null;

const databaseUserIds = new Map();
async function currentDatabaseUserId() {
  const signedInUser = currentUser();
  const email = String(signedInUser?.email || '').trim();
  if (!email || !signedInUser?.id) throw new Error('Please sign in again before creating records.');
  const cacheKey = String(signedInUser.id);
  if (databaseUserIds.has(cacheKey)) return databaseUserIds.get(cacheKey);
  let users;
  try { users = await fetchUsers(); }
  catch (e) { throw new Error(`Could not look up your app user ID for the integer created_by field. Check users-table access and supabase/legal_lead.sql. ${e.message}`); }
  const user = users.find(u => u.authUserId && String(u.authUserId) === String(signedInUser.id))
    || users.find(u => u.email.trim().toLowerCase() === email.toLowerCase());
  const id = Number(user?.id);
  if (!Number.isSafeInteger(id)) throw new Error(`Your signed-in account (${email}) is not linked to a public.users row. Check auth_user_id or email_id in public.users.`);
  databaseUserIds.set(cacheKey, id);
  return id;
}

// Insert the given task keys for a deal. Returns the keys that have no matching row in ref_task_name.
async function createTasks(dealCode, keys, createdBy = null) {
  if (!keys.length) return [];
  const creatorId = createdBy ?? await currentDatabaseUserId();
  const [names, activities, statuses, map] = await Promise.all([
    refRows('ref_task_name'), refRows('ref_deal_activity'), refRows('ref_task_status'),
    rest('task_activity_map?select=*')
  ]);
  const notStarted = pick(statuses, r => norm(r.value) === 'notstarted');
  const missing = [];
  const rows = keys.flatMap(key => {
    const taskId = findId(names, key);
    if (taskId == null) { missing.push(key); return []; }
    // The database enforces this pair through task_definition_activity_fk, so never
    // guess an activity when the required mapping is absent.
    const mapped = map.find(m => m.task_id === taskId && m.activity_id != null);
    if (!mapped) { missing.push(`${TASK_RULES[key].label} (task_activity_map entry)`); return []; }
    return [{ task_id: taskId, deal_code: dealCode, activity_id: mapped.activity_id, status: notStarted, created_by: creatorId }];
  });
  if (missing.length) throw new Error(`Cannot create tasks: add the missing task-to-activity mappings in public.task_activity_map: ${missing.join(', ')}.`);
  if (rows.length) await rest('task', { method: 'POST', prefer: 'return=minimal', body: rows });
  return missing;
}

async function validateTaskActivityMappings(keys) {
  const [names, map] = await Promise.all([refRows('ref_task_name'), rest('task_activity_map?select=*')]);
  const missing = keys.filter(key => {
    const taskId = findId(names, key);
    return taskId != null && !map.some(m => m.task_id === taskId && m.activity_id != null);
  });
  if (missing.length) throw new Error(`Cannot create deal: public.task_activity_map is missing mappings for ${missing.map(key => TASK_RULES[key].label).join(', ')}. Add those mappings, then retry.`);
}

// 16-character codes: a required leading zero, then a shuffled mix of uppercase, lowercase and digits.
const CODE_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CODE_DIGITS = '0123456789';
const CODE_CHARS = CODE_UPPER + CODE_LOWER + CODE_DIGITS;
function generateDealCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const body = [
    CODE_UPPER[bytes[0] % CODE_UPPER.length],
    CODE_LOWER[bytes[1] % CODE_LOWER.length],
    CODE_DIGITS[bytes[2] % CODE_DIGITS.length],
    ...[...bytes.slice(3)].map(b => CODE_CHARS[b % CODE_CHARS.length])
  ];
  // Shuffle so the required character classes are not fixed at the start of the body.
  for (let i = body.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [body[i], body[j]] = [body[j], body[i]];
  }
  return `0${body.join('')}`;
}

export async function createDeal(form) {
  if (!form.relationshipLead || !form.executionTeamMember || !String(form.executionLocation || '').trim()) throw new Error('Relationship Lead, Execution Team Member and Execution Location are required.');
  const [types, statuses, milestones, funding] = await Promise.all([refRows('ref_deal_type'), refRows('ref_deal_status'), refRows('ref_deal_milestone'), refRows('ref_funding_required')]);
  const createdBy = await currentDatabaseUserId();
  const icApproved = form.icApproved === 'Yes';
  const fundingRequired = form.fundingRequired === 'Yes';
  const primary = norm(form.investmentType) === 'primary';
  const taskKeys = tasksForNewDeal({ icApproved, fundingRequired, primary });
  await validateTaskActivityMappings(taskKeys);
  const typeId = types.find(r => r.value === form.investmentType)?.id;
  if (typeId == null) throw new Error(`Unknown investment type "${form.investmentType}".`);
  const blank = v => (String(v ?? '').trim() || null);
  const dealBody = code => ({
    deal_code: code, name: form.investmentName.trim(), project_name: blank(form.projectName), sponsor_gp: blank(form.sponsor),
    investment_type_detail: blank(form.investmentTypeDetail), execution_type: blank(form.executionType), asset_class: blank(form.assetClass), region: blank(form.region),
    type: typeId,
    investment_type_detail_id: form.investmentTypeDetailId ? Number(form.investmentTypeDetailId) : null,
    relationship_lead: Number(form.relationshipLead), execution_team_member: Number(form.executionTeamMember),
    execution_location: form.executionLocation.trim(),
    status: pick(statuses, r => norm(r.value) === 'active'),
    milestone: pick(milestones, r => norm(r.value) === norm('IC Approved')), // new deals start at IC Approved
    currency: form.currency,
    is_funding_required: funding.find(r => isFundingRequired(r.value) === fundingRequired)?.id ?? null,
    commitment_funding_currency: Number(form.commitment), commitment_usd: form.currency === 'USD' ? Number(form.commitment) : null,
    created_by: createdBy,
    target_closing_date: form.targetCloseDate || null, ic_approval: icApproved,
    ic_approved_date: icApproved ? (form.icApprovedDate || null) : null
  });

  // deal_code is the primary key: on a clash, try a fresh 16-character code.
  let code;
  for (let attempt = 0; ; attempt++) {
    code = generateDealCode();
    try { await rest('deal', { method: 'POST', prefer: 'return=minimal', body: dealBody(code) }); break; }
    catch (e) { if (attempt >= 4 || !/409|23505|duplicate/i.test(e.message)) throw e; }
  }

  const missing = await createTasks(code, taskKeys, createdBy);
  if (missing.length) console.warn(`Deal ${code}: no ref_task_name row for ${missing.map(k => TASK_RULES[k].label).join(', ')}; those tasks were not created.`);
  return code;
}

export async function setTaskStatus(taskRowId, statusMatch = 'complete') {
  const statuses = await refRows('ref_task_status');
  const statusId = pick(statuses, r => norm(r.value).includes(statusMatch));
  const user = currentUser();
  const who = user?.email;
  const url = `task?id=eq.${encodeURIComponent(taskRowId)}`;
  const body = { status: statusId, completed_by: who, completed_date: today(), modified_by: who, modified_on: new Date().toISOString() };
  // The person who completes a task is shown as its assignee. If task.assigned_to doesn't exist yet, complete without it.
  try {
    await rest(url, { method: 'PATCH', prefer: 'return=minimal', body: { ...body, assigned_to: user?.name || who } });
  } catch (e) {
    if (!/assigned_to/.test(e.message)) throw e;
    console.warn('task.assigned_to column is missing; run supabase/deal_columns.sql to record who completed tasks.');
    await rest(url, { method: 'PATCH', prefer: 'return=minimal', body });
  }
}

// Complete a task, then apply the rules that react to it.
// ctx.fundingRequired comes from the Initiate Allocations screen: "Yes" creates the Complete Funding task.
export async function completeTask(deal, taskRowId, ctx = {}) {
  const task = modulesForDeal(deal).flatMap(m => m.tasks).find(t => t.id === String(taskRowId));
  await setTaskStatus(taskRowId, ctx.outcome === 'notRequired' ? 'skip' : 'complete'); // 'Not Required' answers mark the task Skipped
  if (task && ['initiateallocations', 'mapaccountstoclose'].includes(norm(task.name)) && ctx.fundingRequired) {
    const exists = modulesForDeal(deal).flatMap(m => m.tasks).some(t => norm(t.name) === 'completefunding');
    if (!exists) await createTasks(deal.id, ['completefunding']);
    const yes = pick(await refRows('ref_funding_required'), r => isFundingRequired(r.value));
    if (yes != null) await rest(`deal?deal_code=eq.${encodeURIComponent(deal.id)}`, { method: 'PATCH', prefer: 'return=minimal', body: { is_funding_required: yes } });
  }
}
