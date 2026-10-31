// Hugging Face Inference Providers expose an OpenAI-compatible Chat Completions API.
// The Hugging Face token is used only by this local server and never reaches the browser.
const schemaForHuggingFace = schema => {
  if (Array.isArray(schema)) return schema.map(schemaForHuggingFace);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, schemaForHuggingFace(value)]));
};

function toMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const message of messages ?? []) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    const blocks = message.content ?? [];
    if (message.role === 'assistant') {
      const text = blocks.filter(block => block.type === 'text').map(block => block.text).filter(Boolean).join('\n');
      const toolCalls = blocks.filter(block => block.type === 'tool_use').map(block => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      }));
      if (text || toolCalls.length) out.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    } else {
      const text = blocks.filter(block => block.type === 'text').map(block => block.text).filter(Boolean).join('\n');
      if (text) out.push({ role: 'user', content: text });
      for (const block of blocks) {
        if (block.type === 'tool_result') out.push({ role: 'tool', tool_call_id: block.tool_use_id, content: String(block.content ?? '') });
      }
    }
  }
  return out;
}

export function createHuggingFaceModel(token) {
  return {
    async create(params) {
      const tools = (params.tools ?? []).map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: schemaForHuggingFace(tool.input_schema),
        },
      }));
      const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: params.model || 'openai/gpt-oss-120b',
          messages: toMessages((params.system ?? []).map(part => part.text).filter(Boolean).join('\n\n'), params.messages),
          ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
          max_tokens: params.max_tokens ?? 8000,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = typeof body?.error === 'string' ? body.error : body?.error?.message;
        const error = new Error(detail || `Hugging Face API error ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const choice = body.choices?.[0];
      const message = choice?.message ?? {};
      const blocks = [];
      if (typeof message.content === 'string' && message.content) blocks.push({ type: 'text', text: message.content });
      for (const [index, call] of (message.tool_calls ?? []).entries()) {
        let input = {};
        try { input = JSON.parse(call.function?.arguments || '{}'); } catch { /* tool validation will reject malformed input */ }
        blocks.push({
          type: 'tool_use',
          id: call.id || `hf-call-${Date.now()}-${index}`,
          name: call.function?.name,
          input,
        });
      }
      const hasCalls = blocks.some(block => block.type === 'tool_use');
      return {
        content: blocks,
        stop_reason: hasCalls ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : choice?.finish_reason === 'content_filter' ? 'refusal' : 'end_turn',
        model: body.model || params.model || 'openai/gpt-oss-120b',
        usage: { input_tokens: body.usage?.prompt_tokens ?? 0, output_tokens: body.usage?.completion_tokens ?? 0 },
      };
    },
  };
}
