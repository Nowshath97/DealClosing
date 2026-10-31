// The Ask AI request handler. It uses only web-standard APIs (Request / Response / fetch), so the same code runs
//   - as a Supabase Edge Function (index.ts), and
//   - on a developer's own machine (scripts/ask-ai-local.mjs) with the key kept in a local file.
import { runAgent } from "./agent.ts";
import type { AgentInput } from "./agent.ts";
import { validate } from "./validate.ts";

export interface HandlerEnv {
  supabaseUrl: string;
  anonKey: string;
  provider?: string;
  anthropicApiKey?: string;
  model?: string; // default claude-opus-5-5
  effort?: string; // low | medium | high (default medium)
  fallbacks?: boolean; // default true
  allowedOrigin?: string; // default "*"
}
// Anything shaped like the Anthropic SDK client: client.beta.messages.create(params)
export type ClientFactory = (apiKey: string) => { beta: { messages: { create(params: any): Promise<any> } } };

const stripFallbacks = (params: Record<string, unknown>) => {
  const { betas: _b, fallbacks: _f, ...rest } = params;
  return rest;
};

export async function handleAskAi(req: Request, env: HandlerEnv, createClient: ClientFactory, modelAdapter?: { create(params: Record<string, unknown>): Promise<any> }): Promise<Response> {
  const CORS = {
    "Access-Control-Allow-Origin": env.allowedOrigin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!modelAdapter && !env.anthropicApiKey) return json({ error: "Ask AI is not configured: the ANTHROPIC_API_KEY is missing." }, 500);

  // Who is calling? The identity always comes from the verified session token, never from the request body or the model.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in." }, 401);
  let who: Response;
  try {
    who = await fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` } });
  } catch (e: any) {
    console.error("ask-ai: cannot reach Supabase to check the login:", e?.cause?.code ?? e?.message);
    return json({ error: "Ask AI could not reach Supabase from the server (network or certificate problem). Details are in the Ask AI server window." }, 502);
  }
  if (!who.ok) return json({ error: "Your session has expired. Please sign in again." }, 401);
  const u = await who.json();
  const email = String(u.email ?? "");
  const user = { email, name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? email.split("@")[0]) };

  let input: AgentInput;
  try { input = validate(await req.json()); } catch (e) { return json({ error: (e as Error).message }, 400); }

  // Reads run as the signed-in user (row-level security applies). GET only.
  const rest = async (path: string) => {
    const r = await fetch(`${env.supabaseUrl}/rest/v1/${path}`, { method: "GET", headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`data request failed (${r.status})`);
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  };

  const client = modelAdapter ? null : createClient(env.anthropicApiKey!);
  let fallbacks = env.fallbacks !== false;
  const model = modelAdapter ?? {
    create: async (params: Record<string, unknown>) => {
      try {
        return await client!.beta.messages.create(fallbacks ? params : stripFallbacks(params));
      } catch (e: any) {
        // If the account can't use the fallback beta, retry once without it and stop asking for it.
      if (fallbacks && e?.status === 400 && /fallback|beta/i.test(String(e?.message))) { fallbacks = false; return await client!.beta.messages.create(stripFallbacks(params)); }
        throw e;
      }
    },
  };

  const started = Date.now();
  try {
    const out = await runAgent(input, {
      model, ctx: { rest, today: new Date().toISOString().slice(0, 10), user },
      modelName: env.model ?? (env.provider === "google" ? "gemini-3.8-flash" : "claude-opus-5-5"), effort: env.effort ?? "medium", fallbacks,
    });
    console.log(JSON.stringify({ ask_ai: true, user: user.email, scope: input.scope.mode, steps: out.steps, tools: out.tools.map((t) => t.name), ms: Date.now() - started, usage: out.usage, stopped: out.stopped ?? null }));
    return json({ answer: out.answer, sources: out.sources, tools: out.tools, model: out.model, usage: out.usage });
  } catch (e: any) {
    console.error("ask-ai failed", e?.status, e?.message, e?.cause?.code ?? "");
    if (e?.status === 429) return json({ error: env.provider === "google"
      ? "Gemini returned HTTP 429: this Google AI project has hit a request, token, or daily quota limit. Check the project's active limits in Google AI Studio; waiting only helps when the limit is temporary."
      : env.provider === "openai"
        ? "OpenAI returned HTTP 429: the API project has hit a request, token, or usage limit. Check the project's API usage and limits."
        : env.provider === "huggingface"
          ? "Hugging Face returned HTTP 429: the Inference Provider is rate-limited or unavailable for this account/model. Check the selected provider and your Hugging Face usage."
        : "The AI provider returned HTTP 429: its request or usage quota is currently exceeded. Check the configured provider's usage limits." }, 429);
    if (e?.status === 401 || e?.status === 403) return json({ error: `The AI service rejected the configured key. Check ${env.provider === "google" ? "GOOGLE_API_KEY" : env.provider === "openai" ? "OPENAI_API_KEY" : env.provider === "huggingface" ? "HF_TOKEN" : "ANTHROPIC_API_KEY"} and its permissions.` }, 502);
    return json({ error: "The AI service could not answer right now. Please try again." }, 502);
  }
}
