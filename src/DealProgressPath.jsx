import React from 'react';
import { Check } from 'lucide-react';

export default function DealProgressPath({ deal }) {
  const stages = deal.path || [];
  const current = deal.milestoneIndex ?? 0;
  return <ol className="ds-path" aria-label="Deal progress">
    {stages.map((stage, index) => {
      const completed = index < current || (index === stages.length - 1 && index === current);
      return <li key={stage} className={completed ? 'done' : index === current ? 'current' : ''} aria-current={index === current ? 'step' : undefined}>
        {completed && <Check size={15} aria-hidden="true" />}<span>{stage}</span>
      </li>;
    })}
  </ol>;
}
