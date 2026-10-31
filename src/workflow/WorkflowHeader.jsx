import React from 'react';
import { ArrowLeft, Briefcase, Check, ChevronRight } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

const dealStatusMeta = status => (/closed|funded/i.test(status) ? { label: status, tone: 'green' } : /dead|declin/i.test(status) ? { label: status, tone: 'red' } : { label: status, tone: 'blue' });

export default function WorkflowHeader({ deal, onBack, detailsOpen, onToggleDetails }) {
  const kpis = [
    ['Commitment USD', deal.commitment], [`Commitment ${deal.currency}`, deal.commitmentFunding], ['Target Funding', deal.targetFundingDate],
    ['Target Closing', deal.targetCloseDate], ['Deal Type', deal.investmentType], ['Created', deal.dateCreated]
  ];
  return (
    <header className="wf-header">
      <nav className="wf-crumbs" aria-label="Breadcrumb">
        <button onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Deals</button><ChevronRight size={13} aria-hidden="true" /><span aria-current="page">{deal.investmentName}</span>
      </nav>
      <div className="wf-header-row">
        <span className="wf-deal-icon" aria-hidden="true"><Briefcase size={20} /></span>
        <h1>{deal.investmentName}</h1>
        <StatusBadge meta={dealStatusMeta(deal.status)} />
        <span className="wf-code">{deal.id}</span>
        <button className="wf-outline" aria-expanded={detailsOpen} aria-controls="wf-deal-details" onClick={onToggleDetails}>View Deal Details</button>
      </div>
      {detailsOpen && (
        <div className="wf-details" id="wf-deal-details">
          <ol className="wf-path" aria-label="Deal milestones">
            {deal.path.map((m, i) => {
              const done = i < deal.milestoneIndex || (i === deal.path.length - 1 && i === deal.milestoneIndex);
              return <li key={m} className={done ? 'done' : i === deal.milestoneIndex ? 'current' : ''} aria-current={i === deal.milestoneIndex ? 'step' : undefined}>{done && <Check size={14} aria-hidden="true" />}<span>{m}</span></li>;
            })}
          </ol>
          <dl className="wf-kpis">{kpis.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      )}
    </header>
  );
}
