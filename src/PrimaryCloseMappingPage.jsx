import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleDollarSign, Info, Layers3, ShieldCheck, ChevronDown, Plus, Pencil, Save, Search, Users, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { loadPrimaryCloseMapping, savePrimaryCloseMapping } from './primaryCloseMappingApi';
import './primaryCloseMapping.css';

const uid = () => `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const money = (n, currency) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2 });
const dateLabel = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-US') : 'Date not set';

function AccountPicker({ accounts, selected, onChange, closeNumber }) {
  const [query, setQuery] = useState('');
  const filtered = accounts.filter(name => name.toLowerCase().includes(query.trim().toLowerCase()));
  return <details className="pcm-picker" onToggle={event => { if (!event.currentTarget.open) setQuery(''); }}>
    <summary aria-label={`Select accounts for close ${closeNumber}`}>
      <span className="pcm-picker-value"><Users size={15} /><span>{selected.length ? `${selected.length} account${selected.length === 1 ? '' : 's'} selected` : 'Select accounts'}</span></span>
      <ChevronDown className="pcm-picker-chevron" size={15} />
    </summary>
    <div className="pcm-picker-list">
      <div className="pcm-picker-search"><Search size={15} /><input aria-label={`Search accounts for close ${closeNumber}`} placeholder="Search accounts..." value={query} onChange={event => setQuery(event.target.value)} /></div>
      <div className="pcm-picker-options">
        {filtered.map(name => <label className={selected.includes(name) ? 'is-selected' : ''} key={name}>
          <input type="checkbox" checked={selected.includes(name)} onChange={event => onChange(event.target.checked ? [...selected, name] : selected.filter(account => account !== name))} />
          <span>{name}</span>{selected.includes(name) && <Check className="pcm-option-check" size={15} />}
        </label>)}
        {!filtered.length && <p className="pcm-picker-empty">{accounts.length ? 'No accounts match your search.' : 'No accounts available.'}</p>}
      </div>
      <div className="pcm-picker-footer"><span>{selected.length} of {accounts.length} selected</span><button type="button" disabled={!selected.length} onClick={() => onChange([])}>Clear selection</button></div>
    </div>
  </details>;
}

const detailColumns = [
  ['nbAgeVintageYear', 'NB Alts Vintage Year', 'text'],
  ['icApproval', 'IC Approval', 'select'],
  ['icApprovedDate', 'Account IC Approval Date', 'date'],
  ['allocationFundingCurrency', 'Allocation', 'number'],
  ['expensesAmount', 'Expenses Amount', 'number'],
  ['receiveSignoffFromPm', 'Received Final Signoff From PMs?', 'select'],
  ['subjectToClientReview', 'Subject to Client Review?', 'select'],
  ['clientReviewInformation', 'Client Review Information', 'text'],
  ['clientApproved', 'Client Approved?', 'select'],
];

function ApprovalToggle({ label, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const choose = answer => { onChange(answer); setEditing(false); };
  if (value && !editing) return <div className="pcm-approval-answer" role="group" aria-label={label}>
    <span className={`pcm-answer-pill ${value === 'Yes' ? 'yes' : value === 'No' ? 'no' : 'confirm'}`}>{value}</span>
    <button type="button" className="pcm-answer-change" aria-label={`Change ${label}`} title="Edit answer" onClick={() => setEditing(true)}><Pencil size={12} /></button>
  </div>;
  return <div className="pcm-approval-control">
    <div className="pcm-approval-toggle" role="group" aria-label={label}>
      {['Yes', 'No'].map(option => <button key={option} type="button" className={`pcm-approval-option ${option.toLowerCase()} ${value === option ? 'is-active' : ''}`} aria-pressed={value === option} onClick={() => choose(option)}>{option}</button>)}
    </div>
  </div>;
}

function CloseEditor({ close, names: initialNames, availableAccounts = [], entitiesByAccount = {}, tranches = [], draft, currency = 'USD', onChange: persistChange, onCancel, onApply, allowFinalize = false }) {
  const [names, setNames] = useState(initialNames);
  const [addingAccounts, setAddingAccounts] = useState(false);
  const [accountQuery, setAccountQuery] = useState('');
  const [accountsToAdd, setAccountsToAdd] = useState([]);
  const dialogRef = useRef(null);
  const settings = draft._settings || {};
  const [saving, setSaving] = useState(false);
  const [unassignedMappings, setUnassignedMappings] = useState([]);
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify({ draft, names }));
  const [userEdited, setUserEdited] = useState(false);
  const onChange = (name, key, value) => {
    setUserEdited(true);
    persistChange(name, key, value);
  };
  const hasChanges = (userEdited && JSON.stringify({ draft, names }) !== savedSnapshot) || unassignedMappings.length > 0;
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  const entitiesFor = name => {
    const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const key = Object.keys(entitiesByAccount).find(account => normalize(account) === normalize(name));
    return key ? entitiesByAccount[key] : [];
  };
  const entityIdFor = (name, row) => row.entityId || entitiesFor(name).find(entity => entity.name === row.allottingEntity)?.id || '';
  const tranchesFor = (name, row) => tranches.filter(tranche => String(tranche.entity_id) === String(entityIdFor(name, row)));
  const rowsFor = name => draft[name]?.allocationMappings || [{ id: `initial-${name}`, allottingEntity: '', tranche: '', subscriptionCurrency: currency, fxRate: '1', allocation: draft[name]?.allocationFundingCurrency || '', subscriptionAllocation: '', expensesAmount: draft[name]?.expensesAmount || '' }];
  const updateRows = (name, rows) => {
    onChange(name, 'allocationMappings', rows);
    onChange(name, 'allocationFundingCurrency', String(rows.reduce((total, row) => total + Number(row.allocation || 0), 0)));
    onChange(name, 'allocationUsd', String(rows.reduce((total, row) => total + Number(row.allocation || 0) * Number(row.fxRate || 0), 0)));
    onChange(name, 'expensesAmount', String(rows.reduce((total, row) => total + Number(row.expensesAmount || 0), 0)));
  };
  const allocationRows = [
    ...names.flatMap(name => rowsFor(name).map(row => ({ ...row, accountName: name }))),
    ...unassignedMappings.map(row => ({ ...row, accountName: '' }))
  ];
  const changeMappingAccount = (row, nextName) => {
    if (!nextName || row.accountName === nextName) return;
    const { accountName, ...mapping } = row;
    if (accountName) updateRows(accountName, rowsFor(accountName).filter(item => item.id !== row.id));
    else setUnassignedMappings(rows => rows.filter(item => item.id !== row.id));
    updateRows(nextName, [...rowsFor(nextName), { ...mapping, entityId: '', allottingEntity: '', trancheId: '', tranche: '' }]);
  };
  const changeMappingField = (name, id, key, value) => {
    if (name) updateRows(name, rowsFor(name).map(row => row.id === id ? { ...row, [key]: value } : row));
    else setUnassignedMappings(rows => rows.map(row => row.id === id ? { ...row, [key]: value } : row));
  };
  const removeMapping = (name, id) => {
    if (name) updateRows(name, rowsFor(name).filter(row => row.id !== id));
    else setUnassignedMappings(rows => rows.filter(row => row.id !== id));
  };
  const saveEditor = async (exit, complete = false) => {
    if (unassignedMappings.length) { setError('Select an account for each new entity / tranche mapping before saving.'); return; }
    setSaving(true); setError('');
    try { await onApply(exit, complete, names); setSavedSnapshot(JSON.stringify({ draft, names })); setUserEdited(false); } catch (e) { setError(e.message || 'Could not save close.'); }
    finally { setSaving(false); }
  };
  return createPortal(<dialog ref={dialogRef} className="pcm-editor" aria-labelledby="pcm-editor-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}>
    <form className="pcm-editor-layout" onSubmit={event => { event.preventDefault(); saveEditor(false); }}>
      <header className="pcm-editor-header"><div className="pcm-editor-heading"><div className="pcm-heading-icon"><CalendarDays size={23} /></div><div><p>DEAL CLOSING <span>/</span> CLOSE WORKSPACE</p><h1 id="pcm-editor-title">Close {dateLabel(close.date)}</h1></div></div><div className="pcm-header-actions"><span className="pcm-status-pill">{close.final || 'Estimate'}</span><button type="button" className="secondary-action" disabled={saving} aria-label="Close editor" onClick={onCancel}><X size={18} /></button></div></header>
      {hasChanges && <div className="pcm-unsaved-banner" role="status"><Info size={16} aria-hidden="true" /><strong>Please click Save to register changes</strong></div>}
      <div className="pcm-editor-body">
        {error && <p className="form-error" role="alert">{error}</p>}
        <section className="pcm-editor-section pcm-funding-section" aria-labelledby="pcm-funding-title"><div className="pcm-section-heading"><span className="pcm-section-icon"><CircleDollarSign size={16} /></span><h2 id="pcm-funding-title">Funding Requirement</h2></div><div className="pcm-funding-grid">
          <fieldset className="pcm-funding"><legend>Is funding required for this deal? *</legend><div className="pcm-funding-options">{['Yes', 'No'].map(value => <label className={settings.fundingRequired === value ? 'is-active' : ''} key={value}><input type="radio" name="close-funding" required checked={settings.fundingRequired === value} onChange={() => onChange('_settings', 'fundingRequired', value)} />{value}</label>)}</div><span className="pcm-funding-help" title="Selecting Yes initiates funding tasks when the mapping is completed." aria-label="Selecting Yes initiates funding tasks when the mapping is completed." tabIndex={0}><Info size={14} /></span></fieldset>
          <label className="pcm-expenses">Expenses % *<input aria-label="Expenses percentage" type="number" required min="0" max="100" step="any" value={settings.expensesPct ?? ''} onChange={event => onChange('_settings', 'expensesPct', event.target.value)} /></label>
        </div></section>
        <section className="pcm-editor-section" aria-labelledby="pcm-account-title"><div className="pcm-section-heading"><span className="pcm-section-icon"><ShieldCheck size={18} /></span><div><h2 id="pcm-account-title">Account details</h2></div><span className="pcm-section-count">{names.length} accounts</span><button type="button" className="secondary-action pcm-add-accounts-button" disabled={saving} onClick={() => { setAddingAccounts(open => !open); setAccountsToAdd([]); setAccountQuery(''); }} aria-expanded={addingAccounts}><Plus size={14} /> Add Accounts</button></div>
        {addingAccounts && <div className="pcm-add-accounts-panel"><label>Search accounts<input type="search" value={accountQuery} onChange={event => setAccountQuery(event.target.value)} placeholder="Search by account name" /></label><div className="pcm-add-account-options">{availableAccounts.filter(name => !names.includes(name) && name.toLowerCase().includes(accountQuery.trim().toLowerCase())).map(name => <label key={name}><input type="checkbox" checked={accountsToAdd.includes(name)} onChange={event => setAccountsToAdd(selected => event.target.checked ? [...selected, name] : selected.filter(account => account !== name))} />{name}</label>)}{!availableAccounts.some(name => !names.includes(name) && name.toLowerCase().includes(accountQuery.trim().toLowerCase())) && <p>No additional accounts available.</p>}</div><div className="pcm-add-accounts-actions"><button type="button" className="secondary-action" onClick={() => setAddingAccounts(false)}>Cancel</button><button type="button" className="primary-action" disabled={!accountsToAdd.length} onClick={() => { setUserEdited(true); setNames(current => [...new Set([...current, ...accountsToAdd])]); setAccountsToAdd([]); setAddingAccounts(false); }}>Add selected ({accountsToAdd.length})</button></div></div>}
        <div className="pcm-editor-table-wrap"><table className="pcm-editor-table"><thead><tr><th>Account Name</th>{detailColumns.map(([key, label]) => <th key={key}>{label}{['allocationFundingCurrency', 'expensesAmount'].includes(key) ? ` (${currency})` : ''}</th>)}</tr></thead><tbody>
          {names.map(name => <tr key={name}><td>{name}</td>{detailColumns.map(([key, label, type]) => <td key={key}>{type === 'select' && ['icApproval', 'receiveSignoffFromPm', 'subjectToClientReview', 'clientApproved'].includes(key) ? <ApprovalToggle label={`${name} ${label}`} value={draft[name]?.[key] ?? ''} onChange={value => onChange(name, key, value)} /> : type === 'select' ? <div className="pcm-choice-group" role="group" aria-label={`${name} ${label}`}>
            {(key === 'subjectToClientReview' ? ['Yes', 'No'] : ['Yes', 'No']).map(option => <button key={option} type="button" className={`pcm-choice ${draft[name]?.[key] === option ? 'is-selected' : ''}`} aria-pressed={draft[name]?.[key] === option} onClick={() => onChange(name, key, draft[name]?.[key] === option ? '' : option)}><span className="pcm-choice-check" aria-hidden="true">{draft[name]?.[key] === option && <Check size={10} strokeWidth={3} />}</span>{option}</button>)}
          </div> : <input aria-label={`${name} ${label}`} type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? 'any' : undefined} readOnly={['allocationFundingCurrency', 'expensesAmount'].includes(key)} value={draft[name]?.[key] ?? ''} onChange={event => onChange(name, key, event.target.value)} />}</td>)}</tr>)}
        </tbody></table></div>
        </section><section className="pcm-editor-section" aria-labelledby="pcm-allocation-title"><div className="pcm-section-heading"><span className="pcm-section-icon"><Layers3 size={18} /></span><div><h2 id="pcm-allocation-title">Account allocation</h2></div></div>
        <div className="pcm-editor-table-wrap"><table className="pcm-editor-table pcm-allocation-table"><thead><tr>{['Account Name', 'Allotting Entity', 'Tranche', 'Subscription Currency', 'FX Rate (to USD)', `Allocation (${currency})`, 'Subscription Allocation', 'Allocation USD', `Expenses Amount (${currency})`, ''].map((label, i) => <th key={i}>{label}</th>)}</tr></thead><tbody>
          {allocationRows.map((row, index) => { const name = row.accountName; return <tr key={row.id}><td><select required aria-label={`Account for mapping ${index + 1}`} value={name} onChange={event => changeMappingAccount(row, event.target.value)}><option value="" disabled>Select account</option>{names.map(account => <option key={account} value={account}>{account}</option>)}</select></td>{['allottingEntity', 'tranche', 'subscriptionCurrency', 'fxRate', 'allocation', 'subscriptionAllocation'].map(key => <td key={key}>{key === 'allottingEntity' ? <select aria-label={`${name || 'New row'} mapping ${index + 1} entity`} disabled={!name} value={row.entityId || entitiesFor(name).find(entity => entity.name === row.allottingEntity)?.id || ''} onChange={event => { const entity = entitiesFor(name).find(entity => String(entity.id) === event.target.value); updateRows(name, rowsFor(name).map(item => item.id === row.id ? { ...item, entityId: entity?.id || '', allottingEntity: entity?.name || '', trancheId: '', tranche: '' } : item)); }}><option value="">{!name ? 'Select account first' : entitiesFor(name).length ? 'Select entity' : 'No active entities mapped'}</option>{entitiesFor(name).map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select> : key === 'tranche' ? <select aria-label={`${name || 'New row'} mapping ${index + 1} tranche`} disabled={!entityIdFor(name, row)} value={row.trancheId || tranchesFor(name, row).find(tranche => tranche.name === row.tranche)?.id || ''} onChange={event => { const tranche = tranchesFor(name, row).find(item => String(item.id) === event.target.value); updateRows(name, rowsFor(name).map(item => item.id === row.id ? { ...item, entityId: entityIdFor(name, row), trancheId: tranche?.id || '', tranche: tranche?.name || '' } : item)); }}><option value="">{!entityIdFor(name, row) ? 'Select entity first' : tranchesFor(name, row).length ? 'Select tranche' : 'No active tranches'}</option>{tranchesFor(name, row).map(tranche => <option key={tranche.id} value={tranche.id}>{tranche.name}</option>)}</select> : <input aria-label={`${name || 'New row'} mapping ${index + 1} ${key}`} type={['fxRate', 'allocation', 'subscriptionAllocation'].includes(key) ? 'number' : 'text'} min="0" step="any" value={row[key] ?? ''} onChange={event => changeMappingField(name, row.id, key, event.target.value)} />}</td>)}<td className="pcm-calculated">{money(Number(row.allocation || 0) * Number(row.fxRate || 0), 'USD')}</td><td><input aria-label={`${name || 'New row'} mapping ${index + 1} expenses`} type="number" min="0" step="any" value={row.expensesAmount ?? ''} onChange={event => changeMappingField(name, row.id, 'expensesAmount', event.target.value)} /></td><td><button type="button" className="pcm-delete-mapping" aria-label={`Remove ${name || 'new'} mapping ${index + 1}`} onClick={() => removeMapping(name, row.id)}><X size={14} /></button></td></tr>; })}
        </tbody></table></div>
        <div className="pcm-add-mapping"><button type="button" disabled={!names.length || saving} onClick={() => setUnassignedMappings(rows => [...rows, { id: uid(), subscriptionCurrency: currency, fxRate: '1' }])}><Plus size={15} /> Add entity / tranche mapping</button></div>
      </section></div>
      <footer className="pcm-editor-footer"><button type="button" className="secondary-action" disabled={saving} onClick={onCancel}>Cancel</button><span className="pcm-editor-save-state" role="status"><Info size={14} />{saving ? 'Saving your changes...' : hasChanges ? 'You have unsaved changes' : 'All changes saved'}</span><div><button type="submit" className="secondary-action" disabled={saving}><Save size={15} />{saving ? 'Saving...' : 'Save'}</button><button type="button" className="primary-action" disabled={saving} onClick={event => { if (event.currentTarget.form.reportValidity()) saveEditor(true); }}>Save and exit <ArrowRight size={15} /></button>{allowFinalize && <button type="button" className="primary-action" disabled={saving} onClick={event => { if (event.currentTarget.form.reportValidity()) saveEditor(true, true); }}><Check size={15} /> Finalize</button>}</div></footer>
    </form>
  </dialog>, document.body);
}

export default function PrimaryCloseMappingPage({ deal, task, onBack, onComplete, closeId = null }) {
  const [data, setData] = useState(null);
  const [closes, setCloses] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [details, setDetails] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [closeDrafts, setCloseDrafts] = useState({});

  useEffect(() => {
    const closePickers = event => {
      document.querySelectorAll('.pcm-page .pcm-picker[open]').forEach(picker => {
        if (!picker.contains(event.target)) picker.removeAttribute('open');
      });
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') document.querySelectorAll('.pcm-page .pcm-picker[open]').forEach(picker => picker.removeAttribute('open'));
    };
    document.addEventListener('pointerdown', closePickers);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closePickers);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    let live = true;
    loadPrimaryCloseMapping(deal.id)
      .then(result => {
        if (!live) return;
        setData(result);
        const target = deal.targetCloseDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const targetDate = target ? `${target[3]}-${target[1].padStart(2, '0')}-${target[2].padStart(2, '0')}` : '';
        const rows = result.closes.length ? result.closes : [{ id: uid(), date: targetDate, final: 'Estimate' }];
        setCloses(rows);
        setAssignments(result.assignments);
        setDetails(result.details);
        if (closeId != null) {
          const match = rows.find(row => String(row.id) === String(closeId));
          if (!match) { setError('This close no longer exists. Return to the deal and refresh.'); return; }
          setCloseDrafts({ [match.id]: { ...structuredClone(result.details[match.id] || {}), _settings: { fundingRequired: deal.fundingRequired === true ? 'Yes' : 'No', expensesPct: '', ...result.details[match.id]?._settings } } });
        }
      })
      .catch(e => live && setError(e.message || 'Could not load close mapping.'));
    return () => { live = false; };
  }, [deal.id, deal.targetCloseDate, closeId]);

  const accountNames = data?.accounts || [];
  const selectedFor = id => assignments[id] || [];
  const setSelected = (id, names) => {
    setAssignments(s => ({ ...s, [id]: names }));
    setDetails(s => ({ ...s, [id]: { ...(s[id] || {}), ...Object.fromEntries(names.map(name => [name, s[id]?.[name] || {}])) } }));
  };
  const detailFor = (closeId, account) => details[closeId]?.[account] || {};
  const setDetail = (closeId, account, key, value) => setCloseDrafts(s => ({ ...s, [closeId]: { ...s[closeId], [account]: { ...s[closeId]?.[account], [key]: value } } }));
  const finishEditing = (id, apply) => {
    if (apply) {
      setDetails(s => ({ ...s, [id]: closeDrafts[id] }));
      setSaved(false);
    }
    setCloseDrafts(s => { const next = { ...s }; delete next[id]; return next; });
  };
  const addClose = () => setCloses(rows => [...rows, { id: uid(), date: '', final: 'Estimate' }]);
  const updateClose = (id, patch) => setCloses(rows => rows.map(c => c.id === id ? { ...c, ...patch } : c));
  const removeClose = id => { setCloses(rows => rows.filter(c => c.id !== id)); setAssignments(s => { const n = { ...s }; delete n[id]; return n; }); };
  const save = async complete => {
    if (Object.keys(closeDrafts).length) { setError('Apply or cancel your close edits before saving.'); return; }
    setBusy(true); setError(''); setSaved(false);
    try {
      if (!closes.length) throw new Error('Add at least one close date.');
      if (closes.some(c => !c.date || !c.final)) throw new Error('Enter a date and Estimate or Final status for every close.');
      const result = await savePrimaryCloseMapping(deal, closes, assignments, details);
      setCloses(result.closes);
      setAssignments(result.assignments);
      setDetails(result.details);
      setSaved(true);
      if (complete) { await onComplete?.(task.id, { fundingRequired: closes.some(c => details[c.id]?._settings?.fundingRequired === 'Yes') || deal.fundingRequired === true }); onBack(); }
    } catch (e) { setError(e.message || 'Could not save close mapping.'); }
    finally { setBusy(false); }
  };

  if (closeId != null) {
    const selectedClose = closes.find(row => String(row.id) === String(closeId));
    if (error) return <main className="workspace-page pcm-page"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to Primary Deal</button><p className="form-error" role="alert">{error}</p></main>;
    if (!data || !selectedClose || !closeDrafts[selectedClose.id]) return <main className="workspace-page pcm-page">Loading close...</main>;
    return <CloseEditor key={selectedClose.id} availableAccounts={accountNames} entitiesByAccount={data?.entitiesByAccount || {}} tranches={data?.tranches || []} close={selectedClose} names={selectedFor(selectedClose.id)} draft={closeDrafts[selectedClose.id]} currency={deal.currency} allowFinalize
      onChange={(name, key, value) => setDetail(selectedClose.id, name, key, value)} onCancel={onBack}
      onApply={async (exit, complete, editorNames) => {
        const result = await savePrimaryCloseMapping(deal, closes, { ...assignments, [selectedClose.id]: editorNames }, { ...details, [selectedClose.id]: closeDrafts[selectedClose.id] }, { onlyCloseId: selectedClose.id });
        setDetails(previous => ({ ...previous, ...result.details }));
        setAssignments(previous => ({ ...previous, ...result.assignments }));
        setCloseDrafts({ [selectedClose.id]: structuredClone(result.details[selectedClose.id]) });
        if (complete) await onComplete?.(task.id, { closeId: selectedClose.id });
        if (exit) await onBack();
      }} />;
  }

  return <main className="workspace-page pcm-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Back to Primary Deal</button>
    <header className="pcm-title"><div><p className="eyebrow">PRIMARY DEAL · {deal.id}</p><h1>Map Accounts to Close</h1></div><div className="pcm-title-meta">{deal.investmentName}<span>·</span> {task?.date ? `Due ${task.date}` : 'Deal level'}</div></header>
    <div className="pcm-instructions"><span>i</span><p>Map each account to a close date. To assign an account to multiple close dates, select it in each close row.</p></div>
    {error && <div className="form-error pcm-error" role="alert">{error}</div>}
    {!data ? <section className="pcm-card pcm-loading">{error ? 'Could not load mapping data. See the error above.' : 'Loading account and close data…'}</section> : <>
      <section className="pcm-card pcm-map-card">
        <div className="pcm-card-head"><h2><CalendarDays size={16} /> Account Mapping</h2><button className="secondary-action" onClick={addClose}><Plus size={15} /> Add New Close</button></div>
        {!accountNames.length && <p className="pcm-note">No client accounts are available. Add account mappings in the entity setup first.</p>}
        <div className="pcm-map-table-wrap"><table className="pcm-map-table"><thead><tr><th>Close</th><th>Account Name</th><th>Actions</th></tr></thead><tbody>
          {closes.map((c, i) => <tr key={c.id}><td><input aria-label={`Close ${i + 1} date`} type="date" value={c.date} onChange={e => updateClose(c.id, { date: e.target.value })} /></td><td><AccountPicker accounts={accountNames} selected={selectedFor(c.id)} onChange={names => setSelected(c.id, names)} closeNumber={i + 1} />{selectedFor(c.id).length > 0 && <div className="pcm-chips">{selectedFor(c.id).map(name => <span key={name}>{name}<button aria-label={`Remove ${name}`} onClick={() => setSelected(c.id, selectedFor(c.id).filter(a => a !== name))}><X size={11} /></button></span>)}</div>}</td><td className="pcm-row-actions"><select aria-label="Close type" value={c.final || 'Estimate'} onChange={e => updateClose(c.id, { final: e.target.value })}><option>Estimate</option><option>Final</option></select><button className="secondary-action" onClick={() => removeClose(c.id)} disabled={closes.length === 1}><X size={13} /> Remove</button></td></tr>)}
        </tbody></table></div>
      </section>
      <section className="pcm-close-list">
        {closes.map((c, i) => {
          const names = selectedFor(c.id);
          const totalFunding = names.reduce((sum, name) => sum + Number(detailFor(c.id, name).allocationFundingCurrency || 0), 0);
          const totalUsd = names.reduce((sum, name) => sum + Number(detailFor(c.id, name).allocationUsd || 0), 0);
          return <article className="pcm-card pcm-close-card" key={c.id}>
            <div className="pcm-close-head"><div><h2><CalendarDays size={15} /> Close: {dateLabel(c.date)}</h2><span className={names.length ? 'pcm-count mapped' : 'pcm-count'}>{names.length ? `${names.length} Account${names.length === 1 ? '' : 's'} Mapped` : 'No Accounts Mapped'}</span></div><div className="pcm-totals"><span>Total Allocation {deal.currency}: <b>{money(totalFunding, deal.currency || 'USD')}</b></span><span>Total Allocation USD: <b>{money(totalUsd, 'USD')}</b></span></div><div className="pcm-close-actions"><button className="secondary-action" disabled={busy || !names.length} onClick={() => setCloseDrafts({ [c.id]: { ...structuredClone(details[c.id] || {}), _settings: { fundingRequired: deal.fundingRequired === true ? 'Yes' : 'No', expensesPct: '', ...details[c.id]?._settings } } })}><Pencil size={14} /> Update Close</button></div></div>
            <div className="pcm-detail-table-wrap"><table className="pcm-detail-table"><thead><tr><th>Account Name</th><th>NB Age Vintage Year</th><th>IC Approval</th><th>IC Approval Date</th><th>Allocation ({deal.currency})</th><th>Allocation (USD)</th><th>Receive Sign off from PM?</th><th>Subject to Client Review?</th><th>Client Review Information</th><th>Client Approved?</th></tr></thead><tbody>
              {names.length ? names.map(name => { const d = detailFor(c.id, name); return <tr key={name}>
                <td>{name}</td>
                <td><span className="pcm-read-value">{d.nbAgeVintageYear || '\u2014'}</span></td>
                <td><span className="pcm-read-value">{d.icApproval || '\u2014'}</span></td>
                <td><span className="pcm-read-value">{d.icApprovedDate ? dateLabel(d.icApprovedDate) : '\u2014'}</span></td>
                <td><span className="pcm-read-value">{d.allocationFundingCurrency === '' || d.allocationFundingCurrency == null ? '\u2014' : money(d.allocationFundingCurrency, deal.currency || 'USD')}</span></td>
                <td><span className="pcm-read-value">{d.allocationUsd === '' || d.allocationUsd == null ? '\u2014' : money(d.allocationUsd, 'USD')}</span></td>
                <td><span className="pcm-read-value">{d.receiveSignoffFromPm || '\u2014'}</span></td>
                <td><span className="pcm-read-value">{d.subjectToClientReview || '\u2014'}</span></td>
                <td><span className="pcm-read-value">{d.clientReviewInformation || '\u2014'}</span></td>
                <td><span className="pcm-read-value">{d.clientApproved || '\u2014'}</span></td>
              </tr>; }) : <tr><td colSpan={10} className="pcm-empty">No accounts mapped for this close.</td></tr>}
            </tbody></table></div>
            <p className="pcm-showing">Showing {names.length ? 1 : 0} to {names.length} of {names.length} accounts</p>
          </article>;
        })}
      </section>
      {closes.filter(c => Object.hasOwn(closeDrafts, c.id)).map(c => <CloseEditor availableAccounts={accountNames} entitiesByAccount={data?.entitiesByAccount || {}} tranches={data?.tranches || []} key={c.id} close={c} names={selectedFor(c.id)} draft={closeDrafts[c.id]} currency={deal.currency} onChange={(name, key, value) => setDetail(c.id, name, key, value)} onCancel={() => finishEditing(c.id, false)} onApply={async (exit, _complete, editorNames) => {
        if (closes.some(row => !row.date || !row.final)) throw new Error('Enter a date and Estimate or Final status for every close before saving.');
        const result = await savePrimaryCloseMapping(deal, closes, { ...assignments, [c.id]: editorNames }, { ...details, [c.id]: closeDrafts[c.id] });
        setCloses(result.closes); setAssignments(result.assignments); setDetails(result.details); setSaved(true);
        const savedClose = result.closes[closes.findIndex(row => row.id === c.id)];
        setCloseDrafts(exit ? {} : { [savedClose.id]: structuredClone(result.details[savedClose.id]) });
      }} />)}
      <footer className="pcm-footer"><button className="secondary-action" onClick={onBack}>Cancel</button><div>{saved && <span className="pcm-saved"><Check size={14} /> Saved</span>}<button className="secondary-action" disabled={busy} onClick={() => save(false)}><Save size={14} /> Save</button><button className="primary-action" disabled={busy} onClick={() => save(true)}><Check size={14} /> {busy ? 'Saving…' : 'Save and Complete'}</button></div></footer>
    </>}
  </main>;
}
