import React, { useEffect, useRef, useState } from 'react';
import './reviewTask.css';
import { ArrowLeft, Check, CheckCircle2, FileText, MessageSquare, Plus, Save, Trash2, UploadCloud, User, X } from 'lucide-react';
import { addComment, addDocuments, loadReview, removeDocument, saveAnswers } from './taskReviewApi';
import { visibleQuestions } from './reviewTasks';

const fmtTime = iso => (iso ? new Date(iso).toLocaleString() : '');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Shared page for review tasks. What it asks comes from reviewTasks.js.
export default function ReviewTaskPage({ deal, module, task, config, user, onBack, onComplete }) {
  const [load, setLoad] = useState({ loading: true, error: '' });
  const [answers, setAnswers] = useState({});
  const [confirmDate, setConfirmDate] = useState(todayIso());
  const [confirmBy, setConfirmBy] = useState(user?.name || '');
  const [comments, setComments] = useState([]);
  const [docs, setDocs] = useState([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fileRef = useRef(null);

  const finished = task.taskStatus === 'completed' || task.taskStatus === 'skipped';
  const visible = visibleQuestions(config, answers);
  const firstKey = config.questions[0].key;

  useEffect(() => {
    let live = true;
    setLoad({ loading: true, error: '' });
    loadReview(task.id, deal.id)
      .then(r => {
        if (!live) return;
        // Older rows only have the single `answer` column.
        setAnswers(r.answers && Object.keys(r.answers).length ? r.answers : r.answer ? { [firstKey]: r.answer } : {});
        if (r.confirmationDate) setConfirmDate(r.confirmationDate);
        if (r.confirmationBy) setConfirmBy(r.confirmationBy);
        setComments(r.comments); setDocs(r.documents);
        setLoad({ loading: false, error: '' });
      })
      .catch(e => live && setLoad({ loading: false, error: e.message }));
    return () => { live = false; };
  }, [task.id, deal.id, attempt, firstKey]);

  const choose = (key, value) => { setAnswers(a => ({ ...a, [key]: value })); setError(''); };

  // Only answers to questions that are currently shown are kept (a follow-up answer is dropped if its trigger changes).
  const keptAnswers = () => Object.fromEntries(visible.filter(q => answers[q.key]).map(q => [q.key, answers[q.key]]));
  const confirmation = () => (config.confirmation ? { confirmationDate: confirmDate, confirmationBy: confirmBy } : {});

  const finalize = async () => {
    const missing = visible.find(q => !answers[q.key]);
    if (missing) { setError(visible.length > 1 && missing !== visible[0] ? 'Answer the follow-up question to continue.' : 'Select an answer to continue.'); return; }
    if (config.confirmation && !confirmDate) { setError('Enter the confirmation date.'); return; }
    const outcome = visible.some(q => q.options.find(o => o.value === answers[q.key])?.outcome === 'notRequired') ? 'notRequired' : 'complete';
    setError(''); setBusy(true);
    try {
      await saveAnswers(task.id, keptAnswers(), confirmation());
      await onComplete?.(task.id, { outcome });
      onBack();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  const saveAndExit = async () => {
    setError(''); setBusy(true);
    try { await saveAnswers(task.id, keptAnswers(), confirmation()); onBack(); } catch (e) { setError(e.message); setBusy(false); }
  };

  const post = async () => {
    const text = comment.trim();
    if (!text) return;
    try { const row = await addComment(deal.id, task.id, text); setComments(c => [...c, row]); setComment(''); } catch (e) { setError(e.message); }
  };
  const upload = async files => {
    if (!files?.length) return;
    try { const rows = await addDocuments(deal.id, task.id, files); setDocs(d => [...d, ...rows]); } catch (e) { setError(e.message); }
  };
  const dropDoc = async id => {
    try { await removeDocument(deal.id, id); setDocs(d => d.filter(x => x.id !== id)); } catch (e) { setError(e.message); }
  };

  if (load.loading) return <div className="workspace-page"><p className="rv-hint">Loading task…</p></div>;
  if (load.error) {
    return (
      <div className="workspace-page">
        <div className="form-error" role="alert">Could not load this task: {load.error}
          <div className="rv-row"><button className="rv-outline" onClick={() => setAttempt(a => a + 1)}>Retry</button><button className="rv-outline" onClick={onBack}>Back</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page rv-page">
      <header className="rv-top">
        <button className="rv-back" aria-label="Back to deal" onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="rv-title">
          <p className="eyebrow">{module.title.toUpperCase()}</p>
          <h1>{config.title}</h1>
          <small>{deal.investmentName} · {deal.id}</small>
        </div>
        <div className="rv-top-right">
          {finished && <span className="rv-done"><CheckCircle2 size={15} /> {task.taskStatus === 'skipped' ? 'Not required' : 'Completed'}</span>}
          <span className="rv-due">Due {task.date}</span>
        </div>
      </header>

      <ol className="ds-path rv-path" aria-label="Deal milestones">
        {deal.path.map((m, i) => {
          const done = i < deal.milestoneIndex || (i === deal.path.length - 1 && i === deal.milestoneIndex);
          return <li key={m} className={done ? 'done' : i === deal.milestoneIndex ? 'current' : ''} aria-current={i === deal.milestoneIndex ? 'step' : undefined}>{done && <Check size={15} aria-hidden="true" />}<span>{m}</span></li>;
        })}
      </ol>

      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="rv-card">
        <fieldset disabled={finished || busy}>
          {visible.map(q => (
            <div key={q.key} className="rv-question">
              <p className="rv-legend">{q.text} <em aria-hidden="true">*</em></p>
              {q.notes?.map((n, i) => <p key={i} className="rv-note">{n}</p>)}
              {q.bullets?.length > 0 && <ul className="rv-bullets">{q.bullets.map(b => <li key={b}>{b}</li>)}</ul>}
              <div className={`rv-options ${q.options.some(o => o.label) ? 'stack' : ''}`} role="radiogroup" aria-label={q.text}>
                {q.options.map(o => (
                  <label key={o.value} className={`rv-option ${answers[q.key] === o.value ? 'on' : ''}`}>
                    <input type="radio" name={q.key} checked={answers[q.key] === o.value} onChange={() => choose(q.key, o.value)} />
                    <span className="rv-dot" />{o.label || o.value}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {config.confirmation && answers[firstKey] && (
            <div className="rv-confirm">
              <label className="rv-field"><span>Confirmation Date</span><input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} /></label>
              <label className="rv-field"><span>Confirmation By</span><input value={confirmBy} readOnly aria-readonly="true" /></label>
            </div>
          )}
        </fieldset>
        {finished && <p className="rv-hint">This task is already {task.taskStatus === 'skipped' ? 'marked not required' : 'completed'}, so the answers can no longer be changed.</p>}
      </section>

      {config.extras && (
        <div className="rv-two">
          <section className="rv-card">
            <h2><span className="rv-ico"><MessageSquare size={16} /></span> Comments</h2>
            <div className="rv-body">
              {comments.length
                ? comments.map(c => <div key={c.id} className="rv-comment"><span className="rv-avatar"><User size={14} /></span><div><p>{c.comment_text}</p><small>{c.created_by ? `${c.created_by} · ` : ''}{fmtTime(c.created_on)}</small></div></div>)
                : <p className="rv-hint">No comments yet.</p>}
              <div className="rv-composer">
                <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Write a comment…" aria-label="New comment" />
                <button className="rv-solid sm" onClick={post} disabled={!comment.trim()}><Plus size={14} /> Add comment</button>
              </div>
            </div>
          </section>

          <section className="rv-card">
            <h2><span className="rv-ico purple"><FileText size={16} /></span> Documents</h2>
            <div className="rv-body">
              <div className="rv-drop" role="button" tabIndex={0} onClick={() => fileRef.current.click()} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current.click()}
                onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }}>
                <UploadCloud size={22} /><strong>Drop files or click to upload</strong><small>Supporting documents for this task</small>
                <input ref={fileRef} type="file" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
              </div>
              {docs.length
                ? <ul className="rv-docs">{docs.map(d => <li key={d.id}><FileText size={15} /><div><strong>{d.file_name}</strong><small>{d.file_type} · {d.uploaded_by ? `${d.uploaded_by} · ` : ''}{fmtTime(d.uploaded_on)}</small></div><button className="rv-icon" aria-label={`Remove ${d.file_name}`} onClick={() => dropDoc(d.id)}><Trash2 size={15} /></button></li>)}</ul>
                : <p className="rv-hint">No documents uploaded.</p>}
            </div>
          </section>
        </div>
      )}

      <footer className="rv-footer">
        <button className="rv-outline" onClick={onBack} disabled={busy}><X size={15} /> Cancel</button>
        <div className="rv-actions">
          {config.saveAndExit && !finished && <button className="rv-outline" onClick={saveAndExit} disabled={busy}><Save size={15} /> Save and exit</button>}
          <button className="rv-solid" onClick={finalize} disabled={busy || finished}>{busy ? 'Saving…' : config.actionLabel}</button>
        </div>
      </footer>
    </div>
  );
}
