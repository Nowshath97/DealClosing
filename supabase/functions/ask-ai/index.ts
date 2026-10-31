// @ts-nocheck  (this file runs on Deno, whose types the editor doesn't load)
// Supabase Edge Function: POST /functions/v1/ask-ai   (optional - you can run Ask AI locally instead, see README)
//
// Secrets (Dashboard -> Edge Functions -> Secrets, or `supabase secrets set`):
//   ANTHROPIC_API_KEY     required. Never put this in the React app.
//   ASK_AI_MODEL          optional, default claude-opus-5-5
//   ASK_AI_EFFORT         optional, low | medium | high (default medium)
//   ASK_AI_FALLBACKS      optional, set to "off" to disable the refusal-fallback beta
//   ASK_AI_ALLOWED_ORIGIN optional, default "*" (set to your site URL in production)
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.
import Anthropic from "npm:@anthropic-ai/sdk";
import { handleAskAi } from "./handler.ts";

Deno.serve((req) =>
  handleAskAi(
    req,
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL")!,
      anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
      anthropicApiKey: Deno.env.get("ANTHROPIC_API_KEY"),
      model: Deno.env.get("ASK_AI_MODEL"),
      effort: Deno.env.get("ASK_AI_EFFORT"),
      fallbacks: (Deno.env.get("ASK_AI_FALLBACKS") ?? "on") !== "off",
      allowedOrigin: Deno.env.get("ASK_AI_ALLOWED_ORIGIN") ?? "*",
    },
    (apiKey) => new Anthropic({ apiKey }) as any,
  )
);
