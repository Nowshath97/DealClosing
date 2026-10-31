# Ask AI (Deal Closing Copilot)

A right-hand chat drawer on the **Deals report** and the **Deal page**. Management asks questions in plain English; the
answer is built from **live database records** retrieved through a small set of approved, read-only functions.

```
React drawer ──(user's login token)──▶ "ask-ai" (runs on your machine, or as a Supabase Edge Function) ──▶ AI provider (tool calling)
                                              │  ▲
                                              ▼  │ tool results (JSON)
                                   6 read-only lookups ──▶ Supabase REST (as the signed-in user, row-level security applies)
```

## What it can do

| Question type | Tool the model uses | Notes |
|---|---|---|
| Summarize a deal / executive summary | `get_deal` | facts, dates, workstreams, every task, allocation, readiness |
| What is blocking closing? | `get_closing_readiness` | deterministic: `true` / `false` / `null` (cannot be determined) |
| "If X is completed, can we close?" | `simulate_closing_readiness` | what-if only, nothing is saved |
| Tasks by deal / workstream / person / status / date | `get_closing_tracker` | the Deal Closing Tracker as live rows; `me` = signed-in user |
| Upcoming closing deadlines | `list_deals` | |
| Allocation position, unallocated amount | `get_allocation` | totals are computed in code, never by the model |

Every answer shows **Records used** (deals, tasks, allocations) that open the relevant deal.

## Run it on your own machine (no Supabase deployment) - recommended for the POC

The same code runs as a small server on your computer. Your model key stays in a file on this machine.

1. Put your Hugging Face User Access Token after `HF_TOKEN=` in **`ask-ai.local.env`** (same folder as `package.json`). The token needs the **Inference Providers** permission. That file is listed in `.gitignore` and is never read by the browser app.
2. Open a terminal in the project folder and run **`npm run ask-ai`**. Leave it running. You should see
   `Ask AI (local) is listening on http://127.0.0.1:8787/ask-ai`.
3. In a second terminal run **`npm run dev`** (restart it if it was already running) and use the **Ask AI** button as normal.

How it stays private: the server listens on `127.0.0.1` only (other computers can't reach it); the key is read by that server process only and is
never sent to the browser; the app tells the browser to use the local address through `VITE_ASK_AI_URL` in the project-root `.env` file (a URL, not a secret). Hugging Face is selected by `ASK_AI_PROVIDER=huggingface`. The default model is `openai/gpt-oss-120b`; override it with `ASK_AI_MODEL` if needed.
Nothing is deployed to Supabase. The server still checks the signed-in user's login and reads data with that login, exactly like the hosted version.

Optional: `npm install @anthropic-ai/sdk` to use the official package. If it can't be installed (for example the npm registry is blocked on your
network), the server automatically calls the same Claude Messages API directly, so it works either way.

To go back to the hosted version later, delete `.env.local` (or its `VITE_ASK_AI_URL` line) and deploy as below.

### Network / certificate errors ("fetch failed")

The local server runs on Node, which does not trust your company's security certificate unless told to (your browser does). `npm run ask-ai` already starts Node with
`--use-system-ca`, which makes it use the Windows certificate store. If you still see `fetch failed` with a code such as `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`
or `SELF_SIGNED_CERT_IN_CHAIN`, export your company's root certificate (a `.pem` / `.crt` file; IT can provide it) and start the server with:

```
set NODE_EXTRA_CA_CERTS=C:\path\to\company-root.pem
npm run ask-ai
```

A code such as `ENOTFOUND` or `ETIMEDOUT` means the address can't be reached at all (VPN or proxy). The server window prints which address failed
(Supabase for the login check, or api.anthropic.com for the answer).

## Alternative: deploy to Supabase (optional)

1. **Run the SQL** you already have for the app (`access.sql`, `allocation_tables.sql`, `save_allocation.sql`, …). Ask AI reads those tables.
2. **Store the key as a secret** (never in the React app or `.env`):
   - Dashboard → *Edge Functions* → *Secrets* → add `ANTHROPIC_API_KEY`, **or**
   - `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
3. **Deploy the function** (folder `supabase/functions/ask-ai/`):
   - CLI: `supabase functions deploy ask-ai`
   - No CLI? Dashboard → *Edge Functions* → *Deploy a new function* → name it `ask-ai` and add the six files (`index.ts`, `handler.ts`, `agent.ts`, `tools.ts`, `rules.ts`, `validate.ts`).
4. Make sure `VITE_ASK_AI_URL` is not set, reload the app and click **Ask AI**.

For local inference, set `ASK_AI_PROVIDER=huggingface` and `HF_TOKEN` in the ignored `ask-ai.local.env` file. `HUGGINGFACEHUB_API_TOKEN` and `HUGGINGFACE_API_KEY` are accepted as token aliases. The service uses Hugging Face's OpenAI-compatible Chat Completions endpoint and the existing read-only deal tools. The default model is `openai/gpt-oss-120b`; select another supported model with `ASK_AI_MODEL`. Google and OpenAI adapters remain available by setting `ASK_AI_PROVIDER=google` or `ASK_AI_PROVIDER=openai`. Hosted Supabase settings remain Anthropic-based: `ANTHROPIC_API_KEY`, `ASK_AI_MODEL` (default `claude-opus-5-5`), `ASK_AI_EFFORT` (`low` / `medium` / `high`, default `medium`),
`ASK_AI_FALLBACKS=off` (turn off the automatic refusal-fallback beta), `ASK_AI_ALLOWED_ORIGIN` (hosted only; set to your site URL in production).

## Demo script (maps to the six POC scenarios)

Open a deal, click **Ask AI**, then:

1. **Deal summary** – "Give me a management summary of this deal." Compare with the deal page: same dates, milestone, task statuses, allocation totals.
2. **Task intelligence** – switch to **All deals** and ask "Which tasks are assigned to Test NDC?" (or "assigned to me"). Compare with the *Assigned To* column.
3. **Closing readiness** – "What is preventing this deal from closing?" Check each listed blocker is an unfinished task, with the owner and due date shown on the deal page. Locked tasks say what they are waiting for.
4. **Report intelligence** – on the Deals page: "Summarize the Deal Closing Tracker report" and "Which tasks are overdue?" Click a *Records used* chip to open the deal.
5. **Live data** – complete a task (e.g. AML Counterparty Screening), come back and ask the same readiness question again. The answer changes because nothing is cached.
6. **What-if** – "If Risk & Compliance is completed, can we close the deal?" The answer starts "Simulation (nothing was changed)". Check the task statuses are unchanged afterwards.

## How accuracy and safety are enforced

- **No free-form data access.** The model can only call the six functions above. Each validates its arguments; unknown functions and bad arguments return an error to the model.
- **Read-only.** The server only issues `GET` requests. There is no SQL, code execution or write path (the test suite scans for one).
- **Runs as the user.** The function verifies the login token, and reads data *with that token*, so database access rules apply. The user identity never comes from the request body or the model.
- **The model doesn't do the maths or the rules.** Totals, unallocated amounts, overdue-ness and closing readiness are computed in `tools.ts` / `rules.ts`.
- **Honest about gaps.** If the data can't answer (see below), the model is instructed to say so, and readiness returns `null` instead of guessing.
- **Prompt injection.** Task names, comments and names are passed to the model only as tool-result data, never as instructions; the key never reaches the browser.

## Known gaps in the data (the assistant says "not recorded" for these)

- Follow-up tracking: "Followed Up?", "Last Followed-up Date"
- Multiple closes / close-level allocations (so no *Close 1 vs Close 2*) – arrives with the Primary flow
- Target signing dates, IC memo uploaded, Pre/Post flag
- A separate approvals / exceptions register (an approval is a completed task)
- Report snapshots (all answers are live)
- **"Mandatory" tasks**: `rules.ts` marks every rule-defined task as required to close (`blocksClose: true`). **Confirm this with the business** and edit the flag per task. Tasks with no rule are listed as *unclassified*, never as blockers.
- Row-level security is currently open to every signed-in user, so "deal-level access control" is not yet enforced by the database.

## Keeping the rules in sync

`rules.ts` copies the unlock rules from `src/taskRules.js`. A test fails if the two ever differ.

## Tests

```
npm run test:ai
```
Runs without the network or an API key (fake database, scripted fake model): validation, read-only access, rules, readiness and what-if, tracker filters,
allocation maths, live-data change, source references, the tool loop (errors, step limit, refusal, hostile text in data), and the React drawer/markdown.
