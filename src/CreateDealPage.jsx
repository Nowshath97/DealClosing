import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { fetchDealTypes } from './api';

const EMPTY = {
  investmentName: '', projectName: '', sponsor: '', investmentType: '', investmentTypeDetail: '', assetClass: '', executionType: 'Direct',
  currency: 'USD', commitment: '', targetCloseDate: '', region: 'North America', icApproved: 'No', fundingRequired: 'No'
};

export default function CreateDealPage({ onCancel, onCreate }) {
  const [form, setForm] = useState(EMPTY);
  const [types, setTypes] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }));

  // Investment types come from ref_deal_type only.
  useEffect(() => {
    let live = true;
    fetchDealTypes().then(rows => { if (live) setTypes(rows); }).catch(e => { if (live) { setTypes([]); setError(`Could not load investment types: ${e.message}`); } });
    return () => { live = false; };
  }, []);

  const submit = async e => {
    e.preventDefault();
    if (!form.investmentName.trim() || !form.projectName.trim() || !form.investmentType || !form.commitment || !form.targetCloseDate) {
      setError('Please complete all required fields.');
      return;
    }
    if (!(Number(form.commitment) > 0)) { setError('Commitment Amount must be a positive number.'); return; }
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
            <select value={form.investmentType} onChange={e => set('investmentType', e.target.value)} disabled={types === null}>
              <option value="">{types === null ? 'Loading…' : 'Select investment type'}</option>
              {(types || []).map(t => <option key={t.id} value={t.value}>{t.value}</option>)}
            </select>
          </label>
          <label><span>Investment Type Detail</span><input value={form.investmentTypeDetail} onChange={e => set('investmentTypeDetail', e.target.value)} placeholder="e.g. Secondary - GP Led (optional)" /></label>
          <label><span>Asset Class</span><input value={form.assetClass} onChange={e => set('assetClass', e.target.value)} placeholder="e.g. Private Equity (optional)" /></label>
          <label><span>Execution Type</span><select value={form.executionType} onChange={e => set('executionType', e.target.value)}><option>Direct</option><option>Brokered</option><option>Structured</option></select></label>
          <label><span>Commitment Currency</span><select value={form.currency} onChange={e => set('currency', e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>JPY</option></select></label>
          <label><span>Commitment Amount *</span><input type="number" min="0" step="any" value={form.commitment} onChange={e => set('commitment', e.target.value)} placeholder="50000000" /></label>
          <label><span>Target Closing Date *</span><input type="date" value={form.targetCloseDate} onChange={e => set('targetCloseDate', e.target.value)} /></label>
          <label><span>Region</span><select value={form.region} onChange={e => set('region', e.target.value)}><option>North America</option><option>Europe</option><option>Asia Pacific</option><option>Latin America</option><option>Middle East & Africa</option></select></label>
          <label><span>IC Approved</span><select value={form.icApproved} onChange={e => set('icApproved', e.target.value)}><option>No</option><option>Yes</option></select></label>
          <label><span>Funding Required</span><select value={form.fundingRequired} onChange={e => set('fundingRequired', e.target.value)}><option>No</option><option>Yes</option></select></label>
        </div></div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="secondary-action" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="primary-action" type="submit" disabled={saving || types === null}><Save size={16} /> {saving ? 'Creating…' : 'Create Deal'}</button>
        </div>
      </form>
    </div>
  );
}
