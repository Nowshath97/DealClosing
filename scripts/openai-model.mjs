// Adapter for the OpenAI Responses API using the same model interface as the Gemini adapter.
// The API key stays in the local Ask AI server process; it is never sent to the browser.
const schemaForOpenAI = schema => {
  if (Array.isArray(schema)) return schema.map(schemaForOpenAI);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, schemaForOpenAI(value)]));
};

function toInput(messages) {
  return messages.flatMap(message => {
    if (typeof message.content === 'string') return [{ role: message.role, content: message.content }];
    const items = [];
    const seenRaw = new Set();
    for (const block of message.content ?? []) {
      if (block._openaiItem && !seenRaw.has(block._openaiItem)) {
        seenRaw.add(block._openaiItem);
        items.push(block._openaiItem);
      } else if (block.type === 'openai_item' && block.item && !seenRaw.has(block.item)) {
        seenRaw.add(block.item);
        items.push(block.item);
      } else if (message.role === 'assistant' && block.type === 'tool_use') {
        items.push({ type: 'function_call', call_id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) });
      } else if (message.role === 'assistant' && block.type === 'text') {
        items.push({ role: 'assistant', content: block.text });
      } else if (message.role === 'user' && block.type === 'tool_result') {
        items.push({ type: 'function_call_output', call_id: block.tool_use_id, output: String(block.content ?? '') });
      } else if (message.role === 'user' && block.type === 'text') {
        items.push({ role: 'user', content: block.text });
      }
    }
    return items;
  });
}

export function createOpenAIModel(apiKey) {
  return {
    async create(params) {
      const instructions = (params.system ?? []).map(part => part.text).filter(Boolean).join('\n\n');
      const tools = (params.tools ?? []).map(tool => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: schemaForOpenAI(tool.input_schema),
      }));
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: params.model || 'gpt-6-luna',
          instructions,
          input: toInput(params.messages ?? []),
          tools: tools.length ? tools : undefined,
          max_output_tokens: params.max_tokens ?? 8000,
          store: false,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body?.error?.message || `OpenAI API error ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const blocks = [];
      let refused = false;
      for (const item of body.output ?? []) {
        if (item.type === 'function_call') {
          let input = {};
          try { input = JSON.parse(item.arguments || '{}'); } catch { /* tool validation will reject malformed input */ }
          blocks.push({ type: 'tool_use', id: item.call_id, name: item.name, input, _openaiItem: item });
        } else if (item.type === 'reasoning') {
          blocks.push({ type: 'openai_item', item });
        } else if (item.type === 'message') {
          for (const part of item.content ?? []) {
            if (part.type === 'output_text' && part.text) blocks.push({ type: 'text', text: part.text, _openaiItem: item });
            if (part.type === 'refusal') { refused = true; blocks.push({ type: 'text', text: part.refusal, _openaiItem: item }); }
          }
        }
      }
      const hasCalls = blocks.some(block => block.type === 'tool_use');
      return {
        content: blocks,
        stop_reason: refused ? 'refusal' : hasCalls ? 'tool_use' : body.status === 'incomplete' ? 'max_tokens' : 'end_turn',
        model: body.model || params.model || 'gpt-6-luna',
        usage: { input_tokens: body.usage?.input_tokens ?? 0, output_tokens: body.usage?.output_tokens ?? 0 },
      };
    },
  };
}
