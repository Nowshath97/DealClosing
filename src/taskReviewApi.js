import { rest, currentUser } from './supabaseClient';

// Answers belong to a task; comments/documents belong to its deal, with optional task context.

export async function loadReview(taskId, dealCode) {
  const q = `task_id=eq.${Number(taskId)}`;
  const [resp, comments, documents] = await Promise.all([
    rest(`task_response?${q}&select=*`),
    rest(`deal_comment?deal_code=eq.${encodeURIComponent(dealCode)}&select=*&order=created_on,id`),
    rest(`deal_document?deal_code=eq.${encodeURIComponent(dealCode)}&select=*&order=uploaded_on,id`)
  ]);
  return { answers: resp[0]?.answers || null, answer: resp[0]?.answer || '', confirmationDate: resp[0]?.confirmation_date || '', confirmationBy: resp[0]?.confirmation_by || '', answeredOn: resp[0]?.answered_on || null, comments, documents };
}

// answers = { questionKey: value }. `answer` keeps the first answer for simple reporting.
export const saveAnswers = (taskId, answers, { confirmationDate = null, confirmationBy = null } = {}) => rest('task_response?on_conflict=task_id', {
  method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
  body: { task_id: Number(taskId), answer: Object.values(answers)[0] ?? null, answers, confirmation_date: confirmationDate || null, confirmation_by: confirmationBy, answered_by: currentUser()?.email ?? null, answered_on: new Date().toISOString() }
});

export async function addComment(dealCode, taskId, text) {
  const rows = await rest('deal_comment?select=*', { method: 'POST', prefer: 'return=representation', body: { deal_code: dealCode, task_id: Number(taskId), comment_text: text, created_by: currentUser()?.email ?? null } });
  return rows[0];
}

// Stores document details only; the file itself is not uploaded anywhere yet.
export const addDocuments = (dealCode, taskId, files) => rest('deal_document?select=*', {
  method: 'POST', prefer: 'return=representation',
  body: [...files].map(f => ({ deal_code: dealCode, task_id: Number(taskId), file_name: f.name, file_type: f.type || 'File', uploaded_by: currentUser()?.email ?? null }))
});

export const removeDocument = (dealCode, id) => rest(`deal_document?id=eq.${Number(id)}&deal_code=eq.${encodeURIComponent(dealCode)}`, { method: 'DELETE', prefer: 'return=minimal' });
