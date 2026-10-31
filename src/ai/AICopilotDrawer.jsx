import React, { useEffect, useReducer, useRef, useState } from 'react';
import './ai.css';
import { Lightbulb, Sparkles, Trash2, X } from 'lucide-react';
import { SUGGESTIONS, askAI } from './askAi';
import AIChatMessages from './AIChatMessages';
import AIChatInput, { SuggestedQuestions } from './AIChatInput';

// Conversations are kept for the browser session, one per scope (each deal, or the whole report), so closing the drawer
// or moving between pages doesn't lose the thread.
const store = new Map();
let seq = 0;
const uid = () => `m${Date.now()}-${seq++}`;
const MAX_HISTORY = 20;

function useThread(key) {
  const [, force] = useReducer(x => x + 1, 0);
  const messages = store.get(key) || [];
  const update = (k, fn) => { store.set(k, fn(store.get(k) || [])); force(); };
  return [messages, update];
}

// deal: { code, name } when opened from a deal page; pageFilters: the report page's current filters (all-deals scope)
export default function AICopilotDrawer({ open, onClose, deal, pageFilters, onOpenDeal }) {
  const [mode, setMode] = useState(deal ? 'deal' : 'all');
  const [loading, setLoading] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Opening from a different page can change what "this deal" means.
  useEffect(() => { setMode(deal ? 'deal' : 'all'); }, [deal?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveMode = deal ? mode : 'all';
  const key = effectiveMode === 'deal' ? `deal:${deal.code}` : 'all';
  const [messages, update] = useThread(key);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open, key]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, loading, open]);

  if (!open) return null;

  const scope = effectiveMode === 'deal' ? { mode: 'deal', dealCode: deal.code, dealName: deal.name } : { mode: 'all' };

  const run = async base => {
    const threadKey = key; // the answer lands in the thread that asked, even if the user switches scope meanwhile
    setLoading(true);
    try {
      const history = base.filter(m => m.role === 'user' || m.role === 'assistant').slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
      const res = await askAI({ messages: history, scope, pageFilters: effectiveMode === 'all' ? pageFilters : null });
      update(threadKey, m => [...m, { id: uid(), role: 'assistant', content: res.answer, sources: res.sources || [], tools: res.tools || [] }]);
    } catch (e) {
      update(threadKey, m => [...m, { id: uid(), role: 'error', content: e.message || 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const send = question => {
    const next = { id: uid(), role: 'user', content: question };
    update(key, m => [...m, next]);
    setShowSuggest(false);
    run([...messages.filter(m => m.role !== 'error'), next]);
  };

  const retry = () => {
    const clean = messages.filter(m => m.role !== 'error');
    update(key, () => clean);
    if (clean.length && clean[clean.length - 1].role === 'user') run(clean);
  };

  const clear = () => { store.delete(key); update(key, () => []); };
  const empty = messages.length === 0;

  return (
    <aside className="ai-drawer" role="dialog" aria-modal="false" aria-label="Ask AI" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <header className="ai-head">
        <span className="ai-logo" aria-hidden="true"><Sparkles size={16} /></span>
        <div>
          <h2>Ask AI</h2>
          <p>Answers come from live application data</p>
        </div>
        <div className="ai-head-actions">
          {!empty && <button type="button" className="ai-icon" onClick={clear} aria-label="Clear conversation" title="Clear conversation"><Trash2 size={16} /></button>}
          <button type="button" className="ai-icon" onClick={onClose} aria-label="Close Ask AI"><X size={18} /></button>
        </div>
      </header>

      {deal && (
        <div className="ai-scope" role="group" aria-label="What are you asking about?">
          <button type="button" className={effectiveMode === 'deal' ? 'on' : ''} aria-pressed={effectiveMode === 'deal'} onClick={() => setMode('deal')} title={deal.name}>This deal</button>
          <button type="button" className={effectiveMode === 'all' ? 'on' : ''} aria-pressed={effectiveMode === 'all'} onClick={() => setMode('all')}>All deals</button>
        </div>
      )}
      <p className="ai-context">{effectiveMode === 'deal' ? <>Asking about <b>{deal.name}</b></> : <>Asking about the <b>Deal Closing Tracker</b> (all deals)</>}</p>

      <div className="ai-body">
        {empty && !loading ? (
          <div className="ai-empty">
            <p>Ask a question about {effectiveMode === 'deal' ? 'this deal' : 'your deals and tasks'}. I look up the current data each time, so answers reflect the latest changes.</p>
            <SuggestedQuestions questions={SUGGESTIONS[effectiveMode]} onPick={send} disabled={loading} />
          </div>
        ) : (
          <AIChatMessages messages={messages} loading={loading} onRetry={retry} onOpenDeal={onOpenDeal} endRef={endRef} />
        )}
      </div>

      <footer className="ai-foot">
        {!empty && (
          <>
            <button type="button" className="ai-suggest-toggle" aria-expanded={showSuggest} onClick={() => setShowSuggest(s => !s)}><Lightbulb size={13} aria-hidden="true" /> Suggested questions</button>
            {showSuggest && <SuggestedQuestions questions={SUGGESTIONS[effectiveMode]} onPick={send} disabled={loading} />}
          </>
        )}
        <AIChatInput onSend={send} disabled={loading} inputRef={inputRef} />
        <p className="ai-disclaimer">AI can make mistakes. Check the records used before acting on an answer.</p>
      </footer>
    </aside>
  );
}
