import React, { useEffect, useMemo, useRef, useState } from 'react';
import './reviewTask.css';
import './assignLegalLead.css';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Search, User, X } from 'lucide-react';
import { assignLegalLead, fetchUsers } from './api';

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9@.]/g, '');

// The Assign Legal Lead task opens this dedicated page.
export const isAssignLegalLead = task => norm(task.name).replace(/[^a-z]/g, '') === 'assignlegallead';

const isOpenDeal = d => d.closed !== 'Yes' && !/closed|dead|declin/i.test(d.status);

// Searchable pick list of users: shows everyone on focus, narrows as you type.
function UserPicker({ users, value, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const selected = users.find(u => String(u.id) === String(value));
  const q = query.trim().toLowerCase();
  const matches = users.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(q));

  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const pick = u => { onChange(u.id); setOpen(false); setQuery(''); };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="alp-picker" ref={boxRef}>
      <div className="alp-input">
        <Search size={16} aria-hidden="true" />
        <input
          role="combobox" aria-expanded={open} aria-controls="alp-list" aria-autocomplete="list" aria-label="Legal Lead"
          aria-activedescendant={open && matches[active] ? `alp-opt-${matches[active].id}` : undefined}
          disabled={disabled} placeholder="Search for a legal lead" autoComplete="off"
          value={open ? query : selected?.name || ''}
          onFocus={() => { setOpen(true); setQuery(''); setActive(0); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKey}
        />
        {selected && !disabled && <button type="button" className="alp-clear" aria-label="Clear selection" onClick={() => { onChange(''); setQuery(''); }}><X size={14} /></button>}
      </div>
      {open && (
        <ul className="alp-list" id="alp-list" role="listbox">
          {matches.length === 0 && <li className="alp-none">No matching users</li>}
          {matches.map((u, i) => (
            <li key={u.id} id={`alp-opt-${u.id}`} role="option" aria-selected={String(u.id) === String(value)} className={`${i === active ? 'active' : ''} ${String(u.id) === String(value) ? 'on' : ''}`}
              onMouseDown={e => e.preventDefault()} onClick={() => pick(u)} onMouseEnter={() => setActive(i)}>
              <span className="alp-avatar"><User size={14} /></span>
              <span><strong>{u.name}</strong>{u.email && <small>{u.email}</small>}</span>
              {String(u.id) === String(value) && <Check size={15} className="alp-tick" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AssignLegalLeadPage({ deal, deals, module, task, onBack, onComplete }) {
  const [users, setUsers] = useState(null); // null = loading
  const [loadError, setLoadError] = useState('');
  const [lead, setLead] = useState(deal.legalLeadId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [readOnlyOpen, setReadOnlyOpen] = useState(true);
  const [attempt, setAttempt] = useState(0);

  const finished = task.taskStatus === 'completed' || task.taskStatus === 'skipped';

  useEffect(() => {
    let live = true;
    setUsers(null); setLoadError('');
    fetchUsers().then(u => live && setUsers(u)).catch(e => { if (live) { setUsers([]); setLoadError(e.message); } });
    return () => { live = false; };
  }, [attempt]);

  // Workload per user, from the deals already loaded in the app.
  const rows = useMemo(() => {
    const open = deals.filter(isOpenDeal);
    const openTasks = deals.flatMap(d => d.modules.flatMap(m => m.tasks)).filter(t => t.taskStatus !== 'completed' && t.taskStatus !== 'skipped');
    return (users || []).map(u => {
      const mine = open.filter(d => String(d.legalLeadId) === String(u.id));
      const tasks = openTasks.filter(t => t.assignedTo !== '-' && [u.name, u.email].some(v => v && norm(v) === norm(t.assignedTo)));
      return { user: u, tasks: tasks.length, deals: mine, pct: open.length ? (mine.length / open.length) * 100 : 0 };
    });
  }, [users, deals]);

  const assign = async () => {
    if (lead === '' || lead == null) { setError('Select a legal lead to continue.'); return; }
    setError(''); setBusy(true);
    try {
      await assignLegalLead(deal.id, lead);
      await onComplete?.(task.id, {});
      onBack();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div className="workspace-page rv-page">
      <header className="rv-top">
        <button className="rv-back" aria-label="Back to deal" onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="rv-title">
          <p className="eyebrow">{module.title.toUpperCase()}</p>
          <h1>Assign Legal Lead</h1>
          <small>{deal.investmentName} · {deal.id}</small>
        </div>
        <div className="rv-top-right">
          {finished && <span className="rv-done"><CheckCircle2 size={15} /> Completed</span>}
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
      {loadError && <div className="form-error" role="alert">Could not load users: {loadError} <button className="rv-outline" onClick={() => setAttempt(a => a + 1)}>Retry</button></div>}

      <section className="rv-card">
        <h2>Assign Legal Lead</h2>
        <div className="rv-field alp-field">
          <span>Legal Lead <em className="alp-req" aria-hidden="true">*</em></span>
          {users === null ? <p className="rv-hint">Loading users…</p> : <UserPicker users={users} value={lead} onChange={v => { setLead(v); setError(''); }} disabled={finished || busy} />}
        </div>
        {finished && <p className="rv-hint">The legal lead has already been assigned for this deal.</p>}
      </section>

      <section className="rv-card alp-readonly">
        <button type="button" className="alp-ro-head" aria-expanded={readOnlyOpen} aria-controls="alp-ro-body" onClick={() => setReadOnlyOpen(o => !o)}>
          <span>Read only</span><ChevronDown size={18} className={readOnlyOpen ? 'open' : ''} aria-hidden="true" />
        </button>
        {readOnlyOpen && (
          <div id="alp-ro-body" className="alp-ro-body">
            <h3>Legal Team Members with Open Tasks</h3>
            <div className="alp-table-wrap">
              <table className="alp-table">
                <thead><tr><th>Name</th><th className="c">Open Tasks</th><th className="c">Open Deals</th><th>Percentage of Open Deals</th><th>Deal Name - Investment Type - Detail</th></tr></thead>
                <tbody>
                  {users === null && <tr><td colSpan={5} className="alp-empty">Loading…</td></tr>}
                  {users && !rows.length && <tr><td colSpan={5} className="alp-empty">No users found.</td></tr>}
                  {rows.map(({ user, tasks, deals: ds, pct }) => (
                    <tr key={user.id} className={String(user.id) === String(lead) ? 'sel' : ''}>
                      <td><strong>{user.name}</strong>{user.email && <small>{user.email}</small>}</td>
                      <td className="c">{tasks}</td>
                      <td className="c">{ds.length}</td>
                      <td><div className="alp-bar" role="img" aria-label={`${Math.round(pct)} percent of open deals`}><i style={{ width: `${Math.min(100, pct)}%` }} /><b>{Math.round(pct)}%</b></div></td>
                      <td>{ds.length ? <ul>{ds.map(d => <li key={d.id}><strong>{d.investmentName}</strong> - {d.investmentType}{d.investmentTypeDetail && d.investmentTypeDetail !== '-' ? ` - ${d.investmentTypeDetail}` : ''}</li>)}</ul> : <span className="rv-hint">No open deals</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <footer className="rv-footer">
        <button className="rv-outline" onClick={onBack} disabled={busy}><X size={15} /> Cancel</button>
        <button className="rv-solid" onClick={assign} disabled={busy || finished || users === null}>{busy ? 'Assigning…' : 'Assign'}</button>
      </footer>
    </div>
  );
}
