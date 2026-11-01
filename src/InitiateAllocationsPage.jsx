import React, { useEffect, useRef, useState } from 'react';
import { fetchAccountEntities } from './api';
import { currentUser } from './supabaseClient';
import { buildAllocationPayload, loadAllocation, saveAllocation } from './allocationApi';
import PrimaryCloseMappingPage from './PrimaryCloseMappingPage';
import './initiateAllocations.css';
import { ArrowLeft, BarChart3, CalendarCheck, Check, FileText, Files, HelpCircle, Link2, MessageSquare, PieChart, Plus, Save, Trash2, UploadCloud, User, Wallet, X, Zap } from 'lucide-react';

const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// The Initiate Allocations task opens this dedicated screen for every deal, whatever its investment type.
export const isMapAccountsToClose = task => norm(task.name) === 'mapaccountstoclose';
export const isInitiateAllocations = (deal, task) => norm(task.name).includes('initiateallocation') || isMapAccountsToClose(task);
export const isFinalizeAllocations = task => norm(task.name).includes('finalizeallocation');

// The same screen serves both tasks. Finalize opens the saved allocation; the deal facts and the funding answers given at
// initiation (funding required / partial funding) are locked there (locked: true); everything else stays editable.
const MODES = {
  map: { title: 'Map Accounts to Close', subtitle: 'Map accounts and allocations to the deal close dates.', action: 'Save Mapping', busyLabel: 'Saving…', finalStatus: 'Initiated', locked: false },
  initiate: { title: 'Initiate Allocations', subtitle: 'Define deal exposure, set funding requirements, and allocate across accounts.', action: 'Initiate', busyLabel: 'Initiating…', finalStatus: 'Initiated', locked: false },
  finalize: { title: 'Finalize Allocations', subtitle: 'Review the allocations agreed at initiation, make any final adjustments and finalize.', action: 'Finalize', busyLabel: 'Finalizing…', finalStatus: 'Finalized', locked: true }
};

// Placeholder lookups until these tables exist in the database. (Client accounts and entities now come from Supabase.)
const LEGAL_NAMES = ['Legal Name A LP', 'Legal Name B LP', 'Legal Name C LLC'];

const num = v => Number(String(v).replaceAll(',', '')) || 0;
const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currencyName = code => { try { return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) || code; } catch { return code; } };
let seq = 1;
const uid = () => `r${Date.now()}${seq++}`;
const newAlloc = (placeholder = false) => ({ id: uid(), account: '', entity: '', placeholder, exposure: '', pct: '', expenseOverride: '' });
const blankMapping = () => ({ id: uid(), allocId: '', legalName: '', amount: '' });

// Keep the legal-name mapping rows in step with the allocations: every complete account + entity gets a row.
function syncMappings(allocs, mappings) {
  let rows = mappings.filter(m => !m.allocId || allocs.some(a => a.id === m.allocId));
  for (const a of allocs.filter(x => x.account && x.entity)) {
    if (rows.some(m => m.allocId === a.id)) continue;
    const blank = rows.findIndex(m => !m.allocId && !m.legalName && !m.amount);
    rows = blank >= 0 ? rows.map((m, i) => (i === blank ? { ...m, allocId: a.id } : m)) : [...rows, { ...blankMapping(), allocId: a.id }];
  }
  return rows.length ? rows : [blankMapping()];
}

function Segmented({ value, onChange, options = ['Yes', 'No'], label }) {
  return <div className="ia-seg" role="radiogroup" aria-label={label}>{options.map(o => <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>)}</div>;
}

function RadioCards({ name, value, onChange, options, disabled = false }) {
  return <div className="ia-radios" role="radiogroup">{options.map(o => (
    <label key={o.value} className={`ia-radio-card ${value === o.value ? 'on' : ''} ${disabled ? 'disabled' : ''}`}>
      <input type="radio" name={name} checked={value === o.value} disabled={disabled} onChange={() => onChange(o.value)} />
      <span className="ia-dot" /><span><strong>{o.value}</strong><small>{o.sub}</small></span>
    </label>))}</div>;
}

function Switch({ checked, onChange, children }) {
  return <label className="ia-switch"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /><span className="ia-track"><i /></span>{children}</label>;
}

function Field({ label, hint, required, helper, children, className = '' }) {
  return <div className={`ia-f ${className}`}><label>{label}{required && <em> *</em>}{hint && <HelpCircle size={13} className="ia-help" title={hint} />}</label>{children}{helper && <small className="ia-helper">{helper}</small>}</div>;
}

function Section({ id, icon: Icon, tone = 'blue', title, desc, actions, children }) {
  return (
    <section className="ia-section" id={`ia-sec-${id}`}>
      <header><span className={`ia-ico ${tone}`}><Icon size={20} /></span><div className="ia-sec-title"><h3>{title}</h3>{desc && <p>{desc}</p>}</div>{actions && <div className="ia-sec-actions">{actions}</div>}</header>
      <div className="ia-body">{children}</div>
    </section>
  );
}

function AllocationForm({ deal, task, mode = 'initiate', onBack, onComplete, initial, initialStatus }) {
  const cfg = MODES[mode === 'initiate' && isMapAccountsToClose(task) ? 'map' : mode];
  const locked = cfg.locked;
  const [s, setS] = useState(() => ({
    totalExposure: '',
    fundingRequired: deal.fundingRequired ? 'Yes' : '', partialFunding: '', expensesPct: '', override: false,
    allocs: [newAlloc()], aggregators: false, legalNames: [], mappings: [blankMapping()],
    bulkName: '', closes: [{ id: uid(), date: '', final: '' }], comments: [], docs: [],
    ...(initial || {})
  }));
  const statusRef = useRef(initialStatus || 'Draft'); // stays 'Initiated' once initiated, even on later saves
  const [errors, setErrors] = useState([]);
  const [lookups, setLookups] = useState({ accounts: [], byAccount: {}, loading: true, error: '' });
  useEffect(() => {
    let live = true;
    fetchAccountEntities()
      .then(r => live && setLookups({ ...r, loading: false, error: '' }))
      .catch(e => live && setLookups({ accounts: [], byAccount: {}, loading: false, error: e.message }));
    return () => { live = false; };
  }, []);
  const [newName, setNewName] = useState('');
  const [addingName, setAddingName] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState('');
  const fileRef = useRef(null);
  const set = patch => setS(p => ({ ...p, ...patch }));

  const changeRows = (key, rows) => set(key === 'allocs' ? { allocs: rows, mappings: syncMappings(rows, s.mappings) } : { [key]: rows });
  const updateRow = (key, id, patch) => changeRows(key, s[key].map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeRows = (key, ids) => changeRows(key, s[key].filter(r => !ids.includes(r.id)));

  const expenseOf = a => (s.override && a.expenseOverride !== '' ? num(a.expenseOverride) : (num(a.exposure) * num(s.expensesPct)) / 100);
  const totalAlloc = s.allocs.reduce((n, a) => n + num(a.exposure), 0);
  // Percentage = adjusted exposure / total adjusted exposure. With Calculation override on it can be typed in, and then sets the exposure.
  const totalTarget = num(s.totalExposure);
  const pctOf = a => (totalTarget ? Math.round((num(a.exposure) / totalTarget) * 10000) / 100 : 0);
  const pctShown = a => (s.override && a.pct !== '' ? num(a.pct) : pctOf(a));
  const setExposure = (a, v) => updateRow('allocs', a.id, { exposure: v, pct: totalTarget ? String(pctOf({ exposure: v })) : a.pct });
  const setPct = (a, v) => updateRow('allocs', a.id, { pct: v, ...(totalTarget ? { exposure: String(Math.round(totalTarget * num(v)) / 100) } : {}) });
  const totalPct = s.allocs.reduce((n, a) => n + pctShown(a), 0);
  const totalExpenses = s.allocs.reduce((n, a) => n + expenseOf(a), 0);
  const target = num(s.totalExposure);
  const remaining = target - totalAlloc;
  const allocPct = target ? Math.min(100, (totalAlloc / target) * 100) : 0;
  // Entities selectable for a row: only those mapped to its account, and not already used on another row (an entity can sit under one account only).
  const entitiesFor = a => (lookups.byAccount[a.account] || []).filter(e => e.name === a.entity || !s.allocs.some(o => o.id !== a.id && o.entity === e.name));
  const entityInfo = a => lookups.byAccount[a.account]?.find(e => e.name === a.entity);
  const flagCells = a => {
    const info = entityInfo(a);
    return ['amgo', 'lux', 'aml', 'veto'].map(k => (info
      ? <span key={k} className={`ia-flag-cell ${info[k] ? 'yes' : 'no'}`}>{info[k] ? 'Yes' : 'No'}</span>
      : <span key={k} className="ia-flag-cell">-</span>));
  };
  const completeAllocs = s.allocs.filter(a => a.account && a.entity);
  const entityOptionLabel = a => (completeAllocs.filter(x => x.entity === a.entity).length > 1 ? `${a.entity} (${a.account})` : a.entity);
  const legalOptions = [...LEGAL_NAMES, ...s.legalNames];
  const entityAmount = id => num(s.allocs.find(a => a.id === id)?.exposure);
  const mappedFor = id => s.mappings.filter(m => m.allocId === id).reduce((n, m) => n + num(m.amount), 0);
  const cur = deal.currency;

  const checks = [
    ['Total adjusted exposure entered', target > 0],
    ['Funding questions answered', !!s.fundingRequired && (s.fundingRequired !== 'Yes' || !!s.partialFunding)],
    ['Allocation rows complete', s.allocs.filter(a => !a.placeholder).length > 0 && s.allocs.filter(a => !a.placeholder).every(a => a.account && a.entity && num(a.exposure))],
    ['Allocated equals total exposure', target > 0 && Math.abs(remaining) < 0.005],
    ['Legal names mapped', s.mappings.every(m => m.allocId && m.legalName)],
    ['Close dates set', s.closes.every(c => c.date && c.final)]
  ];
  const goTo = id => document.getElementById(`ia-sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Everything on the screen is stored in one transaction through the save_allocation() database function.
  const persist = async (status = statusRef.current) => {
    if (lookups.loading) throw new Error('Client accounts are still loading — try again in a moment.');
    const unmatched = s.allocs.find(a => a.account && a.entity && !entityInfo(a));
    if (unmatched) throw new Error(`Entity "${unmatched.entity}" is no longer available under ${unmatched.account}. Please reselect it.`);
    await saveAllocation(buildAllocationPayload({ deal, s, status, lookups, expenseOf, pctShown }));
    const refreshed = await loadAllocation(deal.id);
    if (refreshed) set({ comments: refreshed.state.comments, docs: refreshed.state.docs, initialDocumentIds: refreshed.state.initialDocumentIds, closes: refreshed.state.closes });
    statusRef.current = status;
    setSavedAt(new Date().toLocaleTimeString());
  };
  const run = async fn => {
    setSaving(true); setErrors([]);
    try { await fn(); return true; } catch (e) { setErrors([e.message]); window.scrollTo({ top: 0, behavior: 'smooth' }); return false; } finally { setSaving(false); }
  };
  const saveDraft = () => run(() => persist());
  const saveExit = async () => { if (await run(() => persist())) onBack(); };

  const autoAllocate = () => {
    if (!target) { setErrors(['Enter Total adjusted exposure before using Auto allocate.']); goTo(1); return; }
    setErrors([]);
    const n = s.allocs.length;
    const share = Math.floor((target / n) * 100) / 100;
    changeRows('allocs', s.allocs.map((a, i) => {
      const amount = i === n - 1 ? Math.round((target - share * (n - 1)) * 100) / 100 : share;
      return { ...a, exposure: String(amount), pct: (Math.round((amount / target) * 10000) / 100).toFixed(2) };
    }));
  };

  const validate = () => {
    const e = [];
    if (!checks[0][1]) e.push('Total Adjusted Exposure is required.');
    if (!s.fundingRequired) e.push('Answer whether funding is required for this deal.');
    else if (s.fundingRequired === 'Yes' && !s.partialFunding) e.push('Answer Partial Funding or Overfunding.');
    if (!checks[2][1]) e.push('Every allocation needs a Client Account, Allocating Entity and Adjusted Exposure.');
    if (target && !checks[3][1]) e.push(`Allocated exposure (${fmt(totalAlloc)}) must equal Total Adjusted Exposure (${fmt(target)}).`);
    if (!checks[4][1]) e.push('Please enter an investment legal name for all entities.');
    if (!checks[5][1]) e.push('Every close needs a Close Date and a Final? selection (Estimate or Final).');
    return e;
  };

  const initiate = async () => {
    const e = validate();
    setErrors(e);
    if (e.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setBusy(true);
    try { await persist(cfg.finalStatus); await onComplete?.(task.id, { fundingRequired: s.fundingRequired === 'Yes' }); onBack(); } catch (err) { setErrors([err.message]); setBusy(false); }
  };

  const closeAddName = () => { setNewName(''); setAddingName(false); };
  const addLegalName = () => { const n = newName.trim(); if (n && !legalOptions.includes(n)) set({ legalNames: [...s.legalNames, n] }); closeAddName(); };
  const addComment = () => { if (comment.trim()) { set({ comments: [...s.comments, { id: uid(), text: comment.trim(), by: currentUser()?.email, iso: new Date().toISOString(), at: new Date().toLocaleString() }] }); setComment(''); } };
  const addFiles = files => set({ docs: [...s.docs, ...[...files].map(f => ({ id: uid(), name: f.name, type: f.type || 'File', by: currentUser()?.email, iso: new Date().toISOString(), date: new Date().toLocaleDateString('en-US') }))] });

  return (
    <div className="workspace-page ia-page">
      <header className="ia-top">
        <button className="ia-back" aria-label="Back to deal" onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="ia-top-title">
          <h1>{cfg.title}</h1>
          <p>{cfg.subtitle}</p>
          <small>{deal.investmentName} · {deal.id} · Due {task.date}</small>
        </div>
        <div className="ia-top-actions">
          {savedAt && <span className="ia-saved">Draft saved {savedAt}</span>}
          <button className="ia-outline with-icon" onClick={saveDraft} disabled={saving || busy}><Save size={15} /> {saving ? 'Saving…' : 'Save as draft'}</button>
          <button className="ia-close" aria-label="Close" onClick={onBack}><X size={20} /></button>
        </div>
      </header>

      <ol className="ds-path ia-path" aria-label="Deal milestones">
        {deal.path.map((m, i) => {
          const done = i < deal.milestoneIndex || (i === deal.path.length - 1 && i === deal.milestoneIndex);
          return <li key={m} className={done ? 'done' : i === deal.milestoneIndex ? 'current' : ''} aria-current={i === deal.milestoneIndex ? 'step' : undefined}>{done && <Check size={15} aria-hidden="true" />}<span>{m}</span></li>;
        })}
      </ol>

      {errors.length > 0 && <div className="form-error ia-errors"><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></div>}

      {locked && <p className="ia-locked-note">The funding answers were set when allocations were initiated, so they are read-only here. Total adjusted exposure, expenses, allocations, legal-name mapping and closes can still be adjusted.</p>}
      <div className="ia-top-grid">
        <Section id={1} icon={FileText} title="Deal information" desc="Provide core details for this allocation.">
          <div className="ia-grid3">
            <Field label="Funding currency">
              <div className="ia-currency"><span className="ia-cur-badge">{cur.slice(0, 2)}</span><span><strong>{cur}</strong><small>{currencyName(cur)}</small></span></div>
            </Field>
            <Field label="Total adjusted exposure" hint="Total exposure across all allocations" required helper={`Enter the total exposure amount in ${cur}`}>
              <div className="ia-affix"><span>{cur}</span><input inputMode="decimal" value={s.totalExposure} onChange={e => set({ totalExposure: e.target.value })} placeholder="0.00" /></div>
            </Field>
            <Field label="Asset class"><span className="ia-readonly">{deal.assetClass || '-'}</span></Field>
            <Field label="Investment focus region"><span className="ia-readonly">{deal.region || '-'}</span></Field>
            <Field label="Execution team"><div className="ia-avatars"><span><User size={15} /></span></div></Field>
          </div>
        </Section>

        <aside className="ia-summary">
          <h4><span className="ia-ico blue sm"><BarChart3 size={16} /></span> Allocation summary</h4>
          <dl>
            <div><dt>Currency</dt><dd>{cur}</dd></div>
            <div><dt>Total adjusted exposure</dt><dd>{fmt(target)}</dd></div>
            <div><dt>Asset class</dt><dd>{deal.assetClass || '-'}</dd></div>
            <div><dt>Funding required</dt><dd>{s.fundingRequired || '-'}</dd></div>
            <div><dt>No. of allocations</dt><dd>{s.allocs.length}</dd></div>
          </dl>
          <div className="ia-sum-foot">
            <div className="ia-sum-line"><span>Funding allocation <HelpCircle size={13} className="ia-help" /></span><b>{fmt(totalAlloc)} / {fmt(target)} ({Math.round(allocPct)}%)</b></div>
            <div className="ia-sum-bar"><i style={{ width: `${allocPct}%` }} className={target && Math.abs(remaining) < 0.005 ? 'ok' : remaining < 0 ? 'bad' : ''} /><b>{Math.round(allocPct)}%</b></div>
          </div>
        </aside>
      </div>

      <div className="ia-stack">
        <Section id={2} icon={Wallet} tone="purple" title="Funding requirement" desc="Specify whether this deal requires funding.">
          <div className="ia-fund">
            <div className="ia-fund-box">
              <h5>Is funding required for this deal? <em>*</em></h5><p>"Yes" initiates funding tasks for finance teams.</p>
              <RadioCards name="funding" disabled={locked} value={s.fundingRequired} onChange={v => set({ fundingRequired: v })} options={[{ value: 'Yes', sub: 'Initiate funding process' }, { value: 'No', sub: 'No funding required' }]} />
            </div>
            <div className="ia-fund-box">
              <h5>Partial funding or overfunding? <HelpCircle size={14} className="ia-help" /></h5><p>Yes if not funded at exactly its commitment.</p>
              <RadioCards name="partial" disabled={locked} value={s.partialFunding} onChange={v => set({ partialFunding: v })} options={[{ value: 'Yes', sub: 'Allow partial or overfunding' }, { value: 'No', sub: 'Exact funding at commitment' }]} />
            </div>
            <div className="ia-fund-box ia-fund-exp">
              <h5>Expenses %</h5>
              <div className="ia-affix right"><input aria-label="Expenses %" inputMode="decimal" value={s.expensesPct} onChange={e => set({ expensesPct: e.target.value })} placeholder="0.00" /><span>%</span></div>
              <p>Percentage of expenses to include</p>
            </div>
          </div>
        </Section>

        <Section id={3} icon={PieChart} tone="green" title="Allocations" desc="Enter values in funding currency amount (not millions)."
          actions={<><Switch checked={s.override} onChange={v => set({ override: v })}>Calculation override</Switch>{!locked && <button className="ia-tonal" onClick={autoAllocate}><Zap size={15} /> Auto allocate</button>}</>}>
          {lookups.error && <div className="form-error" role="alert">Could not load client accounts and entities: {lookups.error}</div>}
          <div className="ia-gridtable" role="table" aria-label="Allocations">
            <div className="ia-gt-head" role="row">
              <span>#</span><span>Client account</span><span>Allocating entity</span><span>Adjusted exposure</span><span>%</span>
              <span>Expenses</span><span>Client funding</span><span className="c">AMGO</span><span className="c">LUX</span><span className="c">AML</span><span className="c">VETO</span><span className="c">Actions</span>
            </div>
            {s.allocs.map((a, i) => (
              <div key={a.id} role="row" className={`ia-gt-row ${a.placeholder ? 'placeholder' : ''}`}>
                <span className="ia-idx" title={a.placeholder ? 'Placeholder entity' : undefined}>{a.placeholder ? 'P' : i + 1}</span>
                <select aria-label="Client account" value={a.account} disabled={lookups.loading} onChange={e => updateRow('allocs', a.id, { account: e.target.value, entity: '' })}><option value="">{lookups.loading ? 'Loading…' : 'Select account'}</option>{lookups.accounts.map(c => <option key={c}>{c}</option>)}</select>
                <select aria-label="Allocating entity" value={a.entity} disabled={!a.account} onChange={e => updateRow('allocs', a.id, { entity: e.target.value })}><option value="">{a.account ? 'Select entity' : 'Select account first'}</option>{entitiesFor(a).map(e => <option key={e.id}>{e.name}</option>)}</select>
                <div className="ia-affix"><span>{cur}</span><input aria-label="Adjusted exposure" inputMode="decimal" value={a.exposure} onChange={e => setExposure(a, e.target.value)} placeholder="0.00" /></div>
                {s.override
                  ? <div className="ia-affix right"><input aria-label="Percentage" inputMode="decimal" value={a.pct} onChange={e => setPct(a, e.target.value)} placeholder="0.00" /><span>%</span></div>
                  : <span className="ia-calc" title="Adjusted exposure ÷ Total adjusted exposure">{fmt(pctOf(a))}%</span>}
                {s.override
                  ? <div className="ia-affix"><span>{cur}</span><input aria-label="Expenses amount" inputMode="decimal" value={a.expenseOverride} placeholder={fmt(expenseOf({ ...a, expenseOverride: '' }))} onChange={e => updateRow('allocs', a.id, { expenseOverride: e.target.value })} /></div>
                  : <span className="ia-calc">{fmt(expenseOf(a))}</span>}
                <span className="ia-calc">{a.exposure ? fmt(num(a.exposure) + expenseOf(a)) : '0.00'}</span>
                {flagCells(a)}
                <span className="c"><button className="ia-icon danger" aria-label="Remove allocation" disabled={s.allocs.length === 1} onClick={() => removeRows('allocs', [a.id])}><Trash2 size={16} /></button></span>
              </div>
            ))}
            <div className="ia-gt-row ia-gt-total" role="row">
              <span /><span>Total</span><span />
              <span className="ia-tot">{fmt(totalAlloc)}</span><span className="ia-tot">{fmt(totalPct)}%</span>
              <span className="ia-tot">{fmt(totalExpenses)}</span><span className="ia-tot">{fmt(totalAlloc + totalExpenses)}</span>
              <span className="ia-flag-cell">-</span><span className="ia-flag-cell">-</span><span className="ia-flag-cell">-</span><span className="ia-flag-cell">-</span><span />
            </div>
          </div>
          <div className="ia-add-row">
            <button className="ia-ghost" onClick={() => set({ allocs: [...s.allocs, newAlloc()] })}><Plus size={15} /> Add account / entity</button>
            <button className="ia-ghost" onClick={() => set({ allocs: [...s.allocs, newAlloc(true)] })}><Plus size={15} /> Add placeholder entity</button>
          </div>
        </Section>

        <Section id={4} icon={Link2} tone="orange" title="Map investment legal name" desc="The GP / sponsor vehicle that NB funds invest in. Multiple entities can be linked per legal name."
          actions={<Switch checked={s.aggregators} onChange={v => set({ aggregators: v })}>Aggregators formed</Switch>}>
          <div className="ia-names">
            <div className="ia-name-chips">{s.legalNames.length ? s.legalNames.map(n => <span key={n} className="ia-chip">{n}<button aria-label={`Remove ${n}`} onClick={() => set({ legalNames: s.legalNames.filter(x => x !== n), mappings: s.mappings.map(m => (m.legalName === n ? { ...m, legalName: '' } : m)) })}><X size={12} /></button></span>) : <span className="ia-hint">Pick a legal name from the list in each row, or add a new one below.</span>}</div>
            <div className="ia-bulk"><select value={s.bulkName} onChange={e => set({ bulkName: e.target.value })}><option value="">Bulk apply legal name…</option>{legalOptions.map(n => <option key={n}>{n}</option>)}</select>
              <button className="ia-outline" disabled={!s.bulkName} onClick={() => set({ mappings: s.mappings.map(m => ({ ...m, legalName: s.bulkName })) })}>Apply to all</button></div>
          </div>
          <div className="ia-map">
            <div className="ia-map-head"><span>Account</span><span>Entity</span><span>Entity amount</span><span>Remaining entity amount</span><span>Investment legal name</span><span>Allocation - Funding Currency</span><span /></div>
            {s.mappings.map(m => (
              <div key={m.id} className="ia-map-row">
                <span className="ia-readonly" title="Set in Allocations">{s.allocs.find(a => a.id === m.allocId)?.account || '-'}</span>
                <select aria-label="Entity" value={m.allocId} onChange={e => updateRow('mappings', m.id, { allocId: e.target.value })}><option value="">Select entity</option>{completeAllocs.map(a => <option key={a.id} value={a.id}>{entityOptionLabel(a)}</option>)}</select>
                <span className="ia-mono">{m.allocId ? fmt(entityAmount(m.allocId)) : '-'}</span>
                <span className={`ia-mono ${m.allocId && entityAmount(m.allocId) - mappedFor(m.allocId) < 0 ? 'neg' : ''}`}>{m.allocId ? fmt(entityAmount(m.allocId) - mappedFor(m.allocId)) : '-'}</span>
                <select aria-label="Investment legal name" value={m.legalName} onChange={e => updateRow('mappings', m.id, { legalName: e.target.value })}><option value="">Select legal name</option>{legalOptions.map(n => <option key={n}>{n}</option>)}</select>
                <div className="ia-affix"><span>{cur}</span><input aria-label="Allocation - Funding Currency" inputMode="decimal" value={m.amount} onChange={e => updateRow('mappings', m.id, { amount: e.target.value })} placeholder="0.00" /></div>
                <button className="ia-icon danger" aria-label="Remove row" disabled={s.mappings.length === 1} onClick={() => removeRows('mappings', [m.id])}><X size={16} /></button>
              </div>
            ))}
          </div>
          <div className="ia-add-row">
            <button className="ia-ghost" onClick={() => set({ mappings: [...s.mappings, blankMapping()] })}><Plus size={15} /> Add row</button>
            {addingName
              ? <div className="ia-names-add">
                  <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLegalName(); if (e.key === 'Escape') closeAddName(); }} placeholder="Investment legal name" aria-label="New investment legal name" />
                  <button className="ia-solid sm" disabled={!newName.trim()} onClick={addLegalName}>Add</button>
                  <button className="ia-outline" onClick={closeAddName}>Cancel</button>
                </div>
              : <button className="ia-ghost" onClick={() => setAddingName(true)}><Plus size={15} /> Add Investment Legal Name</button>}
          </div>
        </Section>

        <Section id={5} icon={CalendarCheck} tone="teal" title="Close details" desc="Planned close dates for this deal.">
          <div className="ia-closes">
            {s.closes.map(c => (
              <div key={c.id} className="ia-close-row">
                <Field label="Close date"><input type="date" value={c.date} onChange={e => updateRow('closes', c.id, { date: e.target.value })} /></Field>
                <Field label="Final?"><select value={c.final} onChange={e => updateRow('closes', c.id, { final: e.target.value })}><option value="">Select</option><option>Estimate</option><option>Final</option></select></Field>
                <Field label="Close status"><span className={`ia-tag ${c.final === 'Final' ? 'ok' : c.final ? 'info' : ''}`}>{c.final || '-'}</span></Field>
                <button className="ia-icon danger" aria-label="Remove close" disabled={s.closes.length === 1} onClick={() => removeRows('closes', [c.id])}><X size={16} /></button>
              </div>
            ))}
          </div>
          <div className="ia-add-row"><button className="ia-ghost" onClick={() => set({ closes: [...s.closes, { id: uid(), date: '', final: '' }] })}><Plus size={15} /> Add close</button></div>
        </Section>

        <div className="ia-two">
          <Section id={6} icon={MessageSquare} tone="blue" title="Comments">
            {s.comments.length ? s.comments.map(c => <div key={c.id} className="ia-comment"><span className="ia-avatar"><User size={14} /></span><div><p>{c.text}</p><small>{c.at}</small></div></div>) : <p className="ia-hint">No comments yet.</p>}
            <div className="ia-composer"><textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="Write a comment…" /><button className="ia-solid sm" disabled={!comment.trim()} onClick={addComment}>Post</button></div>
          </Section>
          <Section id={7} icon={Files} tone="purple" title="Documents">
            <div className="ia-drop" onClick={() => fileRef.current.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
              <UploadCloud size={22} /><strong>Drop files or click to upload</strong><small>Supporting allocation documents</small>
              <input ref={fileRef} type="file" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {s.docs.length ? <ul className="ia-docs">{s.docs.map(d => <li key={d.id}><FileText size={15} /><div><strong>{d.name}</strong><small>{d.type} · {d.date}</small></div><button className="ia-icon danger" aria-label="Remove document" onClick={() => removeRows('docs', [d.id])}><Trash2 size={15} /></button></li>)}</ul> : <p className="ia-hint">No documents uploaded.</p>}
          </Section>
        </div>
      </div>

      <footer className="ia-footer">
        <button className="ia-outline" onClick={onBack}>Cancel</button>
        <div><button className="ia-outline" onClick={saveExit} disabled={saving || busy}>Save and exit</button><button className="ia-solid" onClick={initiate} disabled={busy || saving}>{busy ? cfg.busyLabel : cfg.action}</button></div>
      </footer>
    </div>
  );
}

// Stored allocation -> initial form state (empty lists get one blank row, like a new form).
function toInitial(r) {
  if (!r) return { initial: null, status: 'Draft', hasAllocation: false };
  const st = r.state;
  const custom = [...new Set(st.mappings.map(m => m.legalName).filter(n => n && !LEGAL_NAMES.includes(n)))];
  return {
    status: r.status,
    hasAllocation: r.hasAllocation,
    initial: {
      ...st, bulkName: '', legalNames: custom,
      allocs: st.allocs.length ? st.allocs : [newAlloc()],
      mappings: st.mappings.length ? st.mappings : [blankMapping()],
      closes: st.closes.length ? st.closes : [{ id: uid(), date: '', final: '' }]
    }
  };
}

function AllocationTaskPage(props) {
  const { deal, onBack } = props;
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState({ loading: true, error: '', data: null });
  useEffect(() => {
    let live = true;
    setLoad({ loading: true, error: '', data: null });
    loadAllocation(deal.id)
      .then(r => live && setLoad({ loading: false, error: '', data: toInitial(r) }))
      .catch(e => live && setLoad({ loading: false, error: e.message, data: null }));
    return () => { live = false; };
  }, [deal.id, attempt]);

  if (load.loading) return <div className="workspace-page"><p className="ia-hint">Loading allocation…</p></div>;
  if (load.error) {
    return (
      <div className="workspace-page">
        <div className="form-error" role="alert">Could not load the allocation: {load.error}
          <div className="ia-add-row" style={{ marginTop: 10 }}>
            <button className="ia-outline" onClick={() => setAttempt(a => a + 1)}>Retry</button>
            <button className="ia-outline" onClick={onBack}>Back</button>
          </div>
        </div>
      </div>
    );
  }
  if (props.mode === 'finalize' && !load.data.hasAllocation) {
    return (
      <div className="workspace-page">
        <div className="form-error" role="alert">There is no saved allocation for this deal yet. Complete Initiate Allocations first.
          <div className="ia-add-row" style={{ marginTop: 10 }}><button className="ia-outline" onClick={onBack}>Back</button></div>
        </div>
      </div>
    );
  }
  return <AllocationForm key={`${deal.id}-${props.mode || 'initiate'}`} {...props} initial={load.data.initial} initialStatus={load.data.status} />;
}

export default function InitiateAllocationsPage(props) {
  if (isFinalizeAllocations(props.task) && props.task.closeId != null && ['primary', 'primaries'].includes(norm(props.deal.investmentType))) return <PrimaryCloseMappingPage {...props} closeId={props.task.closeId} />;
  if (isMapAccountsToClose(props.task)) return <PrimaryCloseMappingPage {...props} />;
  return <AllocationTaskPage {...props} />;
}
