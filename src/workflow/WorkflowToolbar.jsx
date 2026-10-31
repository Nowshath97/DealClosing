import React from 'react';
import { ChevronsDownUp, ChevronsUpDown, Search, X } from 'lucide-react';
import { SORTS, STATUS_FILTERS } from './statusConfig';

export default function WorkflowToolbar({ query, onQuery, filter, onFilter, sort, onSort, onExpandAll, onCollapseAll, resultText }) {
  return (
    <div className="wf-toolbar" role="search">
      <label className="wf-search">
        <Search size={16} aria-hidden="true" />
        <span className="wf-sr">Search tasks by name or assignee</span>
        <input value={query} onChange={e => onQuery(e.target.value)} placeholder="Search tasks or assignee" />
        {query && <button type="button" aria-label="Clear search" onClick={() => onQuery('')}><X size={14} /></button>}
      </label>
      <div className="wf-filters" role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map(f => <button key={f.key} type="button" className={filter === f.key ? 'on' : ''} aria-pressed={filter === f.key} onClick={() => onFilter(f.key)}>{f.label}</button>)}
      </div>
      <div className="wf-toolbar-right">
        <label className="wf-sort"><span>Sort</span>
          <select value={sort} onChange={e => onSort(e.target.value)}>{SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
        <button type="button" className="wf-text-btn" onClick={onExpandAll}><ChevronsUpDown size={15} aria-hidden="true" /> Expand all</button>
        <button type="button" className="wf-text-btn" onClick={onCollapseAll}><ChevronsDownUp size={15} aria-hidden="true" /> Collapse all</button>
      </div>
      <p className="wf-sr" role="status" aria-live="polite">{resultText}</p>
    </div>
  );
}
