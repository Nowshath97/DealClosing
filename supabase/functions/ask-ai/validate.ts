// Request validation for the ask-ai function. Everything in the request body is untrusted.
import type { AgentInput, ChatMessage, Scope } from "./agent.ts";

const MAX_MESSAGES = 24;
const MAX_CHARS = 4000;

export function validate(body: any): AgentInput {
  if (!body || typeof body !== "object") throw new Error("Invalid request body.");
  const raw = body.messages;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_MESSAGES) throw new Error("messages must be a list of 1-24 items.");
  const messages: ChatMessage[] = raw.map((m: any) => {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim() || m.content.length > MAX_CHARS) throw new Error("Each message needs a role (user/assistant) and text up to 4000 characters.");
    return { role: m.role, content: m.content };
  });
  if (messages[messages.length - 1].role !== "user") throw new Error("The last message must be from the user.");
  if (messages[0].role !== "user") messages.shift();
  const s = body.scope ?? {};
  const mode = s.mode === "deal" ? "deal" : "all";
  const dealCode = typeof s.dealCode === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(s.dealCode) ? s.dealCode : null;
  if (mode === "deal" && !dealCode) throw new Error("A valid scope.dealCode is required for deal questions.");
  const scope: Scope = { mode, dealCode, dealName: typeof s.dealName === "string" ? s.dealName.slice(0, 120) : null };
  const pf = body.pageFilters && typeof body.pageFilters === "object" && !Array.isArray(body.pageFilters) ? body.pageFilters : null;
  return { messages, scope, pageFilters: pf };
}
