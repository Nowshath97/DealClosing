// Runs Ask AI on THIS machine only - nothing is deployed to Supabase.
//
//   1. Put your OpenAI API key in ask-ai.local.env. That file stays on this computer.
//   2. npm run ask-ai          (leave it running)
//   3. npm run dev             (in a second terminal) and use the Ask AI button as normal.
//
// The server listens on 127.0.0.1 only, so it is unreachable from other computers. It runs the same handler as the Supabase
// function: it checks the signed-in user's Supabase token and reads data with that token (row-level security applies).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env', 'ask-ai.local.env']) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

const env = process.env;
const huggingFaceToken = env.HF_TOKEN || env.HUGGINGFACEHUB_API_TOKEN || env.HUGGINGFACE_API_KEY;
const openaiApiKey = env.OPENAI_API_KEY;
const googleApiKey = env.GOOGLE_API_KEY || env.GEMINI_API_KEY;
const provider = (env.ASK_AI_PROVIDER || (huggingFaceToken ? 'huggingface' : openaiApiKey ? 'openai' : 'google')).toLowerCase();
const apiKey = provider === 'huggingface' ? huggingFaceToken : provider === 'openai' ? openaiApiKey : googleApiKey;
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const port = Number(env.ASK_AI_PORT || 8787);
const modelName = env.ASK_AI_MODEL || (provider === 'huggingface' ? 'openai/gpt-oss-120b' : provider === 'openai' ? 'gpt-6-luna' : 'gemini-3.8-flash');

if (!['huggingface', 'hf', 'openai', 'google'].includes(provider)) { console.error('ASK_AI_PROVIDER must be huggingface, openai, or google.'); process.exit(1); }
const normalizedProvider = provider === 'hf' ? 'huggingface' : provider;
if (!apiKey) { console.error(`${normalizedProvider === 'huggingface' ? 'HF_TOKEN' : normalizedProvider === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_API_KEY'} is missing. Put it in ask-ai.local.env.`); process.exit(1); }
if (!supabaseUrl || !anonKey) { console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or their VITE_ equivalents) in .env.'); process.exit(1); }

const { handleAskAi } = await import(pathToFileURL(path.join(root, 'supabase/functions/ask-ai/handler.ts')).href);
const adapterPath = normalizedProvider === 'huggingface' ? 'huggingface-model.mjs' : normalizedProvider === 'openai' ? 'openai-model.mjs' : 'gemini-model.mjs';
const factoryName = normalizedProvider === 'huggingface' ? 'createHuggingFaceModel' : normalizedProvider === 'openai' ? 'createOpenAIModel' : 'createGeminiModel';
const { [factoryName]: createModel } = await import(pathToFileURL(path.join(root, 'scripts', adapterPath)).href);

const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const origin = req.headers.origin;
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')),
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined
    });
    const pathname = new URL(request.url).pathname;
    // A visit from a browser address bar (GET) just reports that the server is up; questions are POSTed by the app.
    if (request.method === 'GET' && (pathname === '/ask-ai' || pathname === '/')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'Ask AI is running on this computer', note: 'Questions are sent by the Ask AI button in the app (POST). Nothing to do here.' }));
      return;
    }
    if (pathname !== '/ask-ai') { res.writeHead(404).end('Not found'); return; }
    const response = await handleAskAi(request, {
      supabaseUrl, anonKey, provider: normalizedProvider, model: modelName, effort: env.ASK_AI_EFFORT, fallbacks: false,
      allowedOrigin: origin && localOrigin.test(origin) ? origin : 'http://localhost:5173'
    }, () => { throw new Error(`Anthropic client is not used by the local ${normalizedProvider} server.`); }, createModel(apiKey));
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(await response.text());
  } catch (e) {
    console.error('local ask-ai error:', e?.message, e?.cause?.code ?? '');
    res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Ask AI hit an unexpected error.' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Ask AI (local, ${normalizedProvider}/${modelName}) is listening on http://127.0.0.1:${port}/ask-ai   [key loaded: yes]`);
  console.log('Leave this window open, and start the app with "npm run dev" in another one.');
});
