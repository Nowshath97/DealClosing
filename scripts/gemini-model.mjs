const schemaForGemini = (schema) => {
  if (Array.isArray(schema)) return schema.map(schemaForGemini);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue;
    out[key] = key === 'type' && typeof value === 'string' ? value.toUpperCase() : schemaForGemini(value);
  }
  return out;
};

function toGeminiContents(messages) {
  const toolNames = new Map();
  return messages.flatMap((message) => {
    if (message.role === 'assistant') {
      if (typeof message.content === 'string') return [{ role: 'model', parts: [{ text: message.content }] }];
      const parts = [];
      for (const block of message.content ?? []) {
        if (block.type === 'text' && block.text) parts.push({ text: block.text });
        if (block.type === 'tool_use') {
          toolNames.set(block.id, block.name);
          parts.push({ functionCall: { name: block.name, args: block.input ?? {}, id: block.id }, ...(block._thoughtSignature ? { thoughtSignature: block._thoughtSignature } : {}) });
        }
      }
      return parts.length ? [{ role: 'model', parts }] : [];
    }

    if (typeof message.content === 'string') return [{ role: 'user', parts: [{ text: message.content }] }];
    const parts = [];
    for (const block of message.content ?? []) {
        if (block.type === 'text' && block.text) parts.push({ text: block.text, ...(block._thoughtSignature ? { thoughtSignature: block._thoughtSignature } : {}) });
      if (block.type === 'tool_result') {
        const name = toolNames.get(block.tool_use_id);
        if (name) parts.push({ functionResponse: { name, id: block.tool_use_id, response: { result: block.content, is_error: Boolean(block.is_error) } } });
      }
    }
    return parts.length ? [{ role: 'user', parts }] : [];
  });
}

export function createGeminiModel(apiKey) {
  return {
    async create(params) {
      const system = (params.system ?? []).map((part) => part.text).filter(Boolean).join('\n\n');
      const declarations = (params.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: schemaForGemini(tool.input_schema),
      }));
      const modelName = params.model || 'gemini-3.8-flash';
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: toGeminiContents(params.messages ?? []),
          tools: declarations.length ? [{ functionDeclarations: declarations }] : undefined,
          generationConfig: { maxOutputTokens: params.max_tokens ?? 8000 },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body?.error?.message || `Gemini API error ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const candidate = body.candidates?.[0];
      const blocks = [];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.text) blocks.push({ type: 'text', text: part.text, ...(part.thoughtSignature ? { _thoughtSignature: part.thoughtSignature } : {}) });
        if (part.functionCall) blocks.push({
          type: 'tool_use',
          id: part.functionCall.id || `gemini-call-${crypto.randomUUID()}`,
          name: part.functionCall.name,
          input: part.functionCall.args ?? {},
          ...(part.thoughtSignature ? { _thoughtSignature: part.thoughtSignature } : {}),
        });
      }
      const calls = blocks.some((block) => block.type === 'tool_use');
      return {
        content: blocks,
        stop_reason: calls ? 'tool_use' : candidate?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
        model: body.modelVersion || modelName,
        usage: {
          input_tokens: body.usageMetadata?.promptTokenCount ?? 0,
          output_tokens: body.usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    },
  };
}
