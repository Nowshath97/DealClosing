import React from 'react';

// A small, safe markdown renderer for assistant answers: paragraphs, headings, bullet/numbered lists, tables, **bold**, *italic*, `code`.
// It builds React elements (never raw HTML), so text from the model or from the database cannot inject markup.

function inline(text, keyPrefix) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${keyPrefix}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${keyPrefix}-${i++}`}>{t.slice(1, -1)}</code>);
    else out.push(<em key={`${keyPrefix}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableRow = l => /^\s*\|.*\|\s*$/.test(l);
const isSeparator = l => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');
const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

export function parseBlocks(src) {
  const lines = String(src ?? '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (isTableRow(line) && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      const head = cells(line);
      const rows = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', head, rows });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: 'heading', level: Math.min(h[1].length + 2, 5), text: h[2] }); i++; continue; }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push({ type: 'ol', items });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !isTableRow(lines[i]) && !/^(#{1,4})\s/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) para.push(lines[i++]);
    blocks.push({ type: 'p', text: para.join(' ') });
  }
  return blocks;
}

export default function Markdown({ text }) {
  return (
    <div className="ai-md">
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'heading') { const H = `h${b.level}`; return <H key={i}>{inline(b.text, i)}</H>; }
        if (b.type === 'ul') return <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ul>;
        if (b.type === 'ol') return <ol key={i}>{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ol>;
        if (b.type === 'table') {
          return (
            <div className="ai-table-wrap" key={i}>
              <table className="ai-table">
                <thead><tr>{b.head.map((c, j) => <th key={j}>{inline(c, `${i}h${j}`)}</th>)}</tr></thead>
                <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c, `${i}-${j}-${k}`)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
        return <p key={i}>{inline(b.text, i)}</p>;
      })}
    </div>
  );
}
