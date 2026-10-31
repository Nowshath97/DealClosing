import { callFunction, apiRequest } from '../supabaseClient';

async function lookupSavedTaskResponse(question, scope, dealCodeHint) {
  let dealCode = dealCodeHint;
  if (!dealCode && scope?.mode === 'all') {
    const index = await apiRequest('/api/deal-context?limit=300&includeTasks=false');
    const q = question.toLowerCase();
    const matches = (index.deals || []).filter(d => {
      const name = String(d.dealName || '').trim().toLowerCase();
      const code = String(d.dealCode || '').trim().toLowerCase();
      return (name && q.includes(name)) || (code && q.includes(code));
    });
    if (matches.length !== 1) return null;
    dealCode = matches[0].dealCode;
  }
  if (!dealCode) return null;

  const { deals = [] } = await apiRequest(`/api/deal-context?dealCode=${encodeURIComponent(dealCode)}&limit=1`);
  const deal = deals[0];
  if (!deal) return null;
  const words = question.toLowerCase().replace(/\bcounterpary\b/g, 'counterparty').replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !['what','answer','response','value','for','the','this','that','deal','yes','and','was','has','been','are','test'].includes(w));
  const score = task => {
    const name = String(task.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/);
    return words.reduce((n, word) => n + (name.some(part => part === word || (word.length >= 5 && part.startsWith(word)) || (part.length >= 5 && word.startsWith(part))) ? 1 : 0), 0);
  };
  const task = (deal.tasks || []).map(t => ({ ...t, matchScore: score(t) })).filter(t => t.matchScore > 0).sort((a, b) => b.matchScore - a.matchScore)[0];
  if (!task) return null;
  const savedAnswers = task.answers && Object.keys(task.answers).length ? task.answers : task.answer ? { answer: task.answer } : null;
  const detail = savedAnswers ? Object.entries(savedAnswers).map(([key, value]) => `${key}: **${value}**`).join('; ') : 'No answer is saved for this task.';
  return { answer: `**${task.name}** for **${deal.dealName} (${deal.dealCode})**: ${detail} (task status: ${task.status}).`, sources: [], tools: ['deal_context_api'] };
}

// One question (with the conversation so far) -> { answer, sources, tools }.
// `messages` are { role: 'user' | 'assistant', content } only; the server adds the deal / report context.
// With VITE_ASK_AI_URL set (e.g. http://127.0.0.1:8787/ask-ai) the question goes to Ask AI running on this computer instead of Supabase.
export const askAI = async ({ messages, scope, pageFilters }) => {
  const question = messages.at(-1)?.content?.trim() || '';
  // A question from Home/All Deals can still target a specific deal by code.
  // Generated deal codes are 10+ characters and always contain both letters and digits.
  // Requiring both prevents long task words (including misspellings) being mistaken for IDs.
  const explicitDealCode = scope?.mode === 'all'
    ? question.match(/\b(?=[A-Z0-9]{10,24}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]+\b/i)?.[0]
    : null;
  const questionDealCode = scope?.mode === 'deal' ? scope.dealCode : explicitDealCode;
  const asksDealStatus = /\b(status|stage|milestone)\b/i.test(question);
  if (asksDealStatus && (questionDealCode || scope?.mode === 'all')) {
    const query = questionDealCode
      ? `?dealCode=${encodeURIComponent(questionDealCode)}&limit=1&includeTasks=false`
      : '?limit=300&includeTasks=false';
    const data = await apiRequest(`/api/deal-context${query}`);
    let matches = data.deals || [];
    if (!questionDealCode) {
      const normalizedQuestion = question.toLowerCase();
      matches = matches.filter(d => {
        const name = String(d.dealName || '').trim().toLowerCase();
        const code = String(d.dealCode || '').trim().toLowerCase();
        return (name && normalizedQuestion.includes(name)) || (code && normalizedQuestion.includes(code));
      });
    }
    if (matches.length === 1) {
      const deal = matches[0];
      const status = deal.dealStatus || 'No status recorded';
      const milestone = deal.milestone ? ` (milestone: **${deal.milestone}**)` : '';
      return { answer: `**${deal.dealName} (${deal.dealCode})** is **${status}**${milestone}.`, sources: [], tools: ['deal_context_api'] };
    }
    if (questionDealCode) return { answer: `I couldn't find deal **${questionDealCode}** in the deals available to your account.`, sources: [], tools: ['deal_context_api'] };
    return { answer: 'I couldn’t identify which deal you mean. Include its deal code or full name and I’ll fetch its current status.', sources: [], tools: ['deal_context_api'] };
  }
  if (/\b(legal\s+lead|who\s+leads\s+legal)\b/i.test(question)) {
    const query = scope?.mode === 'deal'
      ? `?dealCode=${encodeURIComponent(scope.dealCode)}&limit=1&includeTasks=false`
      : '?limit=300&includeTasks=false';
    const data = await apiRequest(`/api/deal-context${query}`);
    const deals = data.deals || [];
    if (scope?.mode === 'deal' && deals.length === 1) {
      const deal = deals[0];
      const answer = deal.legalLead
        ? `The legal lead for **${deal.dealName} (${deal.dealCode})** is **${deal.legalLead.name}**${deal.legalLead.email ? ` (${deal.legalLead.email})` : ''}. The Assign Legal Lead task is completed.`
        : /^(completed|complete|done)$/i.test(deal.assignLegalLeadTaskStatus)
          ? `The Assign Legal Lead task is completed for **${deal.dealName} (${deal.dealCode})**, but no legal lead name is recorded.`
          : `The legal lead for **${deal.dealName} (${deal.dealCode})** is not assigned yet because the Assign Legal Lead task is not completed.`;
      return { answer, sources: [], tools: ['deal_context_api'] };
    }
    const normalizedQuestion = question.toLowerCase();
    const named = deals.filter(d => {
      const name = String(d.dealName || '').trim().toLowerCase();
      const code = String(d.dealCode || '').trim().toLowerCase();
      return (name && normalizedQuestion.includes(name)) || (code && normalizedQuestion.includes(code));
    });
    const selectedDeals = named.length === 1 && !/\b(all|every|each)\b/i.test(question) ? named : deals;
    const matching = selectedDeals;
    const rows = matching.map(d => `- **${d.dealName} (${d.dealCode})**: ${d.legalLead ? `${d.legalLead.name}${d.legalLead.email ? ` (${d.legalLead.email})` : ''}` : /^(completed|complete|done)$/i.test(d.assignLegalLeadTaskStatus) ? 'task completed; lead name not recorded' : 'not assigned yet'}`);
    return { answer: rows.length ? `**Legal leads across ${matching.length} deals**\n${rows.join('\n')}` : 'No legal lead assignments are recorded for these deals.', sources: [], tools: ['deal_context_api'] };
  }
  // Allow an explicit deal code to scope live task-answer lookups from the All Deals screen.
  const isWhoCompleted = /\bwho\b.*\b(completed|finished)\b|\b(completed|finished)\s+by\s+whom\b/i.test(question);
  if (scope?.mode === 'deal' && isWhoCompleted && /\btask\b/i.test(question)) {
    const data = await apiRequest(`/api/deals/${encodeURIComponent(scope.dealCode)}/tasks`);
    const normalizedQuestion = question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const matches = data.tasks
      .filter(t => normalizedQuestion.includes(t.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()))
      .sort((a, b) => b.name.length - a.name.length);
    const task = matches[0];
    if (!task) return { answer: `I couldn't find a task in **${data.dealName} (${data.dealCode})** matching that name.`, sources: [], tools: ['deal_tasks_api'] };
    const answer = !/^(completed|complete|done)$/i.test(task.status)
      ? `**${task.name}** is currently marked **${task.status}** in **${data.dealName} (${data.dealCode})**; it has not been recorded as completed.`
      : task.completedBy
        ? `**${task.name}** in **${data.dealName} (${data.dealCode})** was completed by **${task.completedBy}**.`
        : `**${task.name}** is marked completed in **${data.dealName} (${data.dealCode})**, but the record does not include who completed it.`;
    return { answer, sources: [], tools: ['deal_tasks_api'] };
  }
  if (scope?.mode === 'deal' && !isWhoCompleted && /\btask\b/i.test(question) && /\b(how many|which|show|list|pending|outstanding|overdue|completed|finished)\b/i.test(question)) {
    const data = await apiRequest(`/api/deals/${encodeURIComponent(scope.dealCode)}/tasks`);
    const overdueOnly = /overdue/i.test(question);
    const completedOnly = /completed|finished/i.test(question) && !/pending/i.test(question);
    const selected = data.tasks.filter(t => overdueOnly ? t.overdue : completedOnly ? !t.pending : t.pending);
    const label = overdueOnly ? 'overdue' : completedOnly ? 'completed or excluded' : 'pending';
    const lines = selected.map(t => `- ${t.name} (${t.status}${t.assignedTo ? `; owner: ${t.assignedTo}` : ''}${t.completedBy ? `; completed by: ${t.completedBy}` : ''}${t.dueDate ? `; due: ${t.dueDate}` : ''})`);
    return {answer: `**${data.dealName} (${data.dealCode})** has **${data.summary.pending} pending tasks** out of ${data.summary.total} total (${data.summary.completed} completed; ${data.summary.overdue} overdue).\n\n${selected.length ? `${label[0].toUpperCase()+label.slice(1)} tasks:\n${lines.join('\n')}` : `No ${label} tasks found.`}`,sources:[],tools:['deal_tasks_api']};
  }
  try {
    return await callFunction('ask-ai', { messages, scope, pageFilters }, { url: import.meta.env.VITE_ASK_AI_URL || undefined });
  } catch (error) {
    // Prefer AI interpretation; if Gemini is rate-limited, keep saved task-response lookups available via the live API.
    if (error.status === 429 && /task|avoidance|aml|screen|confirmation|response|answer|value/i.test(question)) {
      try {
        const fallback = await lookupSavedTaskResponse(question, scope, questionDealCode);
        if (fallback) return fallback;
      } catch { /* preserve the original AI error when the fallback API is unavailable */ }
    }
    throw error;
  }
};

export const SUGGESTIONS = {
  deal: [
    'Summarize the current deal.',
    'Which tasks are pending?',
    'What is preventing this deal from closing?',
    'Show all Risk & Compliance activities.',
    'Generate an executive summary for this deal.',
    'If Risk & Compliance is completed, can we close the deal?',
    'What is the allocation position, and how much is unallocated?'
  ],
  all: [
    'Summarize the Deal Closing Tracker report.',
    'Which tasks are assigned to me?',
    'Which tasks are overdue?',
    'What are the upcoming closing deadlines?',
    'Which deals have outstanding allocations?',
    'Which tasks have not been followed up?',
    'What should management prioritize?'
  ]
};
