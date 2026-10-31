import React from 'react';
import { Sparkles } from 'lucide-react';
import './ai.css';

export default function AskAIButton({ onClick, open }) {
  return (
    <button type="button" className="ai-btn" onClick={onClick} aria-haspopup="dialog" aria-expanded={!!open}>
      <Sparkles size={15} aria-hidden="true" /> Ask AI
    </button>
  );
}
