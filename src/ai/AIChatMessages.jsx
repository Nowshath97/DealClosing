import React, { useState } from 'react';
import { AlertCircle, Briefcase, ListChecks, RotateCcw, Sparkles, User, Wallet } from 'lucide-react';
import Markdown from './Markdown';

const ICON = { deal: Briefcase, task: ListChecks, allocation: Wallet };
const TOOL_LABEL = {
  get_deal: 'deal details', get_closing_tracker: 'tracker report', list_deals: 'deal list', get_allocation: 'allocations',
  get_closing_readiness: 'closing readiness', simulate_closing_readiness: 'what-if simulation'
};

// The records the answer was built from; each one opens its deal.
function SourceReferences({ sources, onOpen }) {
  const [all, setAll] = useState(false);
  if (!sources?.length) return null;
  const shown = all ? sources : sources.slice(0, 6);
  return (
    <div className="ai-sources">
      <span className="ai-sources-title">Records used</span>
      <ul>
        {shown.map(s => {
          const Icon = ICON[s.type] || Briefcase;
          return (
            <li key={`${s.type}:${s.id}`}>
              <button type="button" onClick={() => onOpen?.(s.dealCode)} title={`Open ${s.label}`}><Icon size={12} aria-hidden="true" /><span>{s.label}</span></button>
            </li>
          );
        })}
      </ul>
      {sources.length > 6 && <button type="button" className="ai-more" onClick={() => setAll(a => !a)}>{all ? 'Show fewer' : `Show ${sources.length - 6} more`}</button>}
    </div>
  );
}

export default function AIChatMessages({ messages, loading, onRetry, onOpenDeal, endRef }) {
  return (
    <div className="ai-messages" role="log" aria-live="polite" aria-label="Conversation">
      {messages.map(m => (
        <div key={m.id} className={`ai-msg ${m.role}`}>
          <span className="ai-avatar" aria-hidden="true">{m.role === 'user' ? <User size={14} /> : m.role === 'error' ? <AlertCircle size={14} /> : <Sparkles size={14} />}</span>
          <div className="ai-bubble">
            {m.role === 'assistant' ? <Markdown text={m.content} /> : <p>{m.content}</p>}
            {m.role === 'assistant' && m.tools?.length > 0 && (
              <p className="ai-looked">Looked up: {[...new Set(m.tools.filter(t => t.ok).map(t => TOOL_LABEL[t.name] || t.name))].join(', ') || 'nothing'}</p>
            )}
            {m.role === 'assistant' && <SourceReferences sources={m.sources} onOpen={onOpenDeal} />}
            {m.role === 'error' && <button type="button" className="ai-retry" onClick={onRetry}><RotateCcw size={13} aria-hidden="true" /> Try again</button>}
          </div>
        </div>
      ))}
      {loading && (
        <div className="ai-msg assistant" aria-label="Ask AI is looking up your data">
          <span className="ai-avatar" aria-hidden="true"><Sparkles size={14} /></span>
          <div className="ai-bubble ai-typing"><span /><span /><span /><em>Looking up your deal data…</em></div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
