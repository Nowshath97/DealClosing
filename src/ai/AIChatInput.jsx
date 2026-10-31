import React, { useState } from 'react';
import { Send } from 'lucide-react';

export function SuggestedQuestions({ questions, onPick, disabled }) {
  return (
    <div className="ai-suggest" aria-label="Suggested questions">
      <p>Try asking</p>
      <div>{questions.map(q => <button key={q} type="button" disabled={disabled} onClick={() => onPick(q)}>{q}</button>)}</div>
    </div>
  );
}

export default function AIChatInput({ onSend, disabled, inputRef }) {
  const [text, setText] = useState('');
  const send = () => { const q = text.trim(); if (!q || disabled) return; onSend(q); setText(''); };
  return (
    <form className="ai-input" onSubmit={e => { e.preventDefault(); send(); }}>
      <label className="ai-sr" htmlFor="ai-question">Your question</label>
      <textarea id="ai-question" ref={inputRef} rows={2} maxLength={2000} value={text} placeholder="Ask about this deal or the tracker…"
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <button type="submit" disabled={disabled || !text.trim()} aria-label="Send question"><Send size={16} /></button>
    </form>
  );
}
