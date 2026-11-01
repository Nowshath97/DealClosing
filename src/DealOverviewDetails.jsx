import React, { useState } from 'react';
import { Banknote, CalendarDays, Check, ChevronDown, ChevronRight, FileText, Flag, Target } from 'lucide-react';
import './dealOverviewDetails.css';
import DealProgressPath from './DealProgressPath';

export default function DealOverviewDetails({ deal, primary = false }) {
  const [expanded, setExpanded] = useState(false);
  const currency = String(deal.currency || 'USD').toUpperCase();
  const metrics = [
    ...(primary ? [] : currency === 'USD'
      ? [{ label: 'Commitment USD', value: deal.commitmentFunding !== '-' && deal.commitmentFunding ? deal.commitmentFunding : deal.commitment, icon: Banknote }]
      : [{ label: 'Commitment USD', value: deal.commitment, icon: Banknote }, { label: `Commitment ${currency}`, value: deal.commitmentFunding, icon: Banknote }]),
    { label: 'Deal Status', value: deal.status, icon: Flag },
    { label: 'Target Funding', value: deal.targetFundingDate, icon: CalendarDays },
    { label: 'Target Closing', value: deal.targetCloseDate, icon: Target },
    { label: 'Docs Deadline (GP)', value: deal.docsDeadlineGp, icon: FileText }
  ];
  return <div className="deal-overview-details">
    {primary && <DealProgressPath deal={deal} />}
    <div className="deal-overview-metrics">{metrics.map(({ label, value, icon: Icon }) => <div className="deal-overview-metric" key={label}><span className="deal-overview-icon"><Icon size={17} /></span><div><span>{label}</span><strong>{value || '-'}</strong></div></div>)}</div>
    <button type="button" className="ds-more" aria-expanded={expanded} onClick={() => setExpanded(open => !open)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Deal details</button>
    {expanded && <div className="ds-details">{[['Deal Code', deal.id], ['Project', deal.projectName], ['Deal Type', deal.investmentType], ['Investment Type Detail', deal.investmentTypeDetail], ['Sponsor / GP', deal.sponsor], ['Status', deal.status], ['Milestone', deal.milestone], ['IC Approved', deal.icApproved], ['Ready to Close', deal.readyToClose], ['Closed', deal.closed], ['Currency', currency], ['Region', deal.region], ['Asset Class', deal.assetClass], ['Target Funding', deal.targetFundingDate], ['Target Closing', deal.targetCloseDate], ['Docs Deadline (GP)', deal.docsDeadlineGp], ['Created', deal.dateCreated]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || '-'}</strong></div>)}</div>}
  </div>;
}
