import React from 'react';

// Status is always icon + text (text is visually hidden where only the icon is shown).
export function StatusIcon({ meta, size = 18, showLabel = false }) {
  const Icon = meta.icon;
  return (
    <span className={`wf-sicon ${meta.tone}`} title={meta.label}>
      <Icon size={size} aria-hidden="true" />
      <span className={showLabel ? '' : 'wf-sr'}>{meta.label}</span>
    </span>
  );
}

export function StatusBadge({ meta, size = 'md' }) {
  return <span className={`wf-badge ${meta.tone} ${size}`}>{meta.label}</span>;
}
