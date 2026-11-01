import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { fetchCreateDealOptions } from './api';

const EMPTY = {
  investmentName: '', projectName: '', sponsor: '', investmentType: '', investmentTypeDetail: '', assetClass: '',
  currency: 'USD', commitment: '', targetCloseDate: '', region: 'North America', icApproved: 'No', icApprovedDate: '', investmentTypeDetailId: '', relationshipLead: '', executionTeamMember: '', executionLocation: ''
};

export default function CreateDealPage({ onCancel, onCreate }) {
  const [form, setForm] = useState(EMPTY);
  const [options, setOptions] = useState(null);
  const types = options?.types ?? null;
  const selectedType = types?.find(type => type.value === form.investmentType);
  const details = options?.details.filter(detail => detail.deal_type_id === selectedType?.id) || [];
  const [loadError, setLoadError] = useState(false); // Disable submission if required lookups fail.
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  // Load type-dependent details, people and saved locations from the database.
  useEffect(() => {
    let live = true;
    fetchCreateDealOptions().then(data => { if (live) setOptions(data); }).catch(e => { if (live) { setLoadError(true); setError(`Could not load deal options: ${e.message}`); } });
    return () => { live = false; };
  }, []);

  const submit = async e => {
    e.preventDefault();
    if (!form.investmentName.trim() || !form.projectName.trim() || !form.investmentType || !form.commitment || !form.targetCloseDate || !form.relationshipLead || !form.executionTeamMember || !form.executionLocation.trim()) {
      setError('Please complete all required fields.');
      return;
    }
    if (!(Number(form.commitment) > 0)) { setError('Commitment Amount must be a positive number.'); return; }
    if (form.icApproved === 'Yes' && !form.icApprovedDate) { setError('IC Approval Date is required when IC Approved is Yes.'); return; }
    setError(''); setSaving(true);
    try { await onCreate(form); } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div className="workspace-page">
      <button className="back-link" onClick={onCancel}><ArrowLeft size={16} /> Back to Deals</button>
      <div className="page-title-row"><div><p className="eyebrow">NEW INVESTMENT</p><h1>Create Deal</h1><p>Capture the commercial, operational and closing information required to initialize the deal workflow.</p></div></div>
      <form className="workspace-card create-deal-form" onSubmit={submit}>
        <div className="form-section"><div className="form-grid three-col">
          <label><span>Investment Name *</span><input value={form.investmentName} onChange={e => set('investmentName', e.target.value)} placeholder="e.g. Secondary_3009_1" /></label>
          <label><span>Project Name *</span><input value={form.projectName} onChange={e => set('projectName', e.target.value)} placeholder="e.g. Project Aurora" /></label>
          <label><span>Sponsor / GP</span><input value={form.sponsor} onChange={e => set('sponsor', e.target.value)} placeholder="Sponsor or fund manager (optional)" /></label>
          <label><span>Investment Type *</span>
            <select value={form.investmentType} onChange={e => setForm(f => ({ ...f, investmentType: e.target.value, investmentTypeDetail: '', investmentTypeDetailId: '' }))} disabled={types === null}>
              <option value="">{types === null ? 'Loading…' : 'Select investment type'}</option>
              {(types || []).map(t => <option key={t.id} value={t.value}>{t.value}</option>)}
            </select>
          </label>
          <label><span>Investment Type Detail</span><select value={form.investmentTypeDetailId} disabled={!selectedType || !details.length} onChange={e => { const detail = details.find(d => String(d.id) === e.target.value); setForm(f => ({ ...f, investmentTypeDetailId: e.target.value, investmentTypeDetail: detail?.value || '' })); }}><option value="">{!selectedType ? 'Select investment type first' : details.length ? 'Select investment type detail' : 'No details configured'}</option>{details.map(detail => <option key={detail.id} value={detail.id}>{detail.value}</option>)}</select></label>
          <label><span>Asset Class</span><input value={form.assetClass} onChange={e => set('assetClass', e.target.value)} placeholder="e.g. Private Equity (optional)" /></label>
          <label><span>Commitment Currency</span><select value={form.currency} onChange={e => set('currency', e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>JPY</option></select></label>
          <label><span>Commitment Amount *</span><input type="number" min="0" step="any" value={form.commitment} onChange={e => set('commitment', e.target.value)} placeholder="50000000" /></label>
          <label><span>Target Closing Date *</span><input type="date" value={form.targetCloseDate} onChange={e => set('targetCloseDate', e.target.value)} /></label>
          <label><span>Region</span><select value={form.region} onChange={e => set('region', e.target.value)}><option>North America</option><option>Europe</option><option>Asia Pacific</option><option>Latin America</option><option>Middle East & Africa</option></select></label>
          <label><span>Relationship Lead *</span><select required value={form.relationshipLead} onChange={e => set('relationshipLead', e.target.value)} disabled={!options}><option value="">Select relationship lead</option>{options?.users.map(person => <option key={person.id} value={person.id}>{person.name}{person.email ? ` (${person.email})` : ''}</option>)}</select></label>
          <label><span>Execution Team Member *</span><select required value={form.executionTeamMember} onChange={e => set('executionTeamMember', e.target.value)} disabled={!options}><option value="">Select execution team member</option>{options?.users.map(person => <option key={person.id} value={person.id}>{person.name}{person.email ? ` (${person.email})` : ''}</option>)}</select></label>
          <label><span>Execution Location *</span><select required value={form.executionLocation} onChange={e => set('executionLocation', e.target.value)} disabled={!options}><option value="">Select execution location</option>{options?.locations.map(location => <option key={location.id} value={location.value}>{location.value}</option>)}</select></label>
          <label><span>IC Approved</span><select value={form.icApproved} onChange={e => { set('icApproved', e.target.value); if (e.target.value !== 'Yes') set('icApprovedDate', ''); }}><option>No</option><option>Yes</option></select></label>
          <label><span>IC Approval Date{form.icApproved === 'Yes' ? ' *' : ''}</span><input type="date" value={form.icApprovedDate} onChange={e => set('icApprovedDate', e.target.value)} required={form.icApproved === 'Yes'} /></label>
        </div></div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="primary-action" type="submit" disabled={saving || types === null || loadError}><Save size={16} /> {saving ? 'Creating…' : 'Create Deal'}</button>
        </div>
      </form>
    </div>
  );
}
