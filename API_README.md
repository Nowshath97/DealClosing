# Deal Closing API (Node.js, Supabase)

The API is an additional server. Existing React pages are unchanged and continue to call Supabase directly until you choose to migrate them. The API uses the caller's Supabase JWT and the project's **anon** key, so database RLS still applies. Never use the service-role key in the browser.

## Start

From the project directory, install dependencies (`npm install`). The UI, API, and local Ask AI read configuration from the project-root `.env` file. Use the unprefixed Supabase variable names below; `vite.config.js` exposes them to the browser build. Variables already set in the terminal take precedence over `.env`.

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase publishable/anon key
- `API_PORT`: optional, defaults to `3001`
- `CORS_ORIGIN`: optional, defaults to `http://localhost:5173`
- `VITE_ASK_AI_URL`: optional, for example `http://127.0.0.1:8787/ask-ai` when using the local Ask AI service

Run `npm run api` in one terminal and `npm run dev` in another.

## Routes

Every route except `/api/health` needs `Authorization: Bearer <supabase-user-access-token>`.

- `GET /api/health`
- `GET /api/deal-context` (live deal facts, task statuses/owners/completers, saved review answers, and legal lead assignments; accepts `dealCode`, `limit` (max 300), and `includeTasks=false`)
- `GET /api/deals`
- `POST /api/deals` (same camelCase fields as CreateDealPage)
- `GET /api/deals/:dealCode`
- `POST /api/deals/:dealCode/allocations/initiate` (body uses `buildAllocationPayload` from `src/allocationApi.js`)
- `GET /api/deals/:dealCode/allocations`

### Example: create deal

```bash
curl -X POST http://localhost:3001/api/deals \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"investmentName":"Secondary_3009_1","projectName":"Aurora","investmentType":"<value from ref_deal_type>","commitment":50000000,"currency":"USD","targetCloseDate":"2026-12-15","icApproved":"No","fundingRequired":"Yes"}'
```

### Example: initiate allocations

The request body must be the full payload returned by `buildAllocationPayload({deal,s,status,lookups,expenseOf,pctShown})` from the existing page. It contains `header`, `lines`, `legal_map`, `closes`, `comments`, `documents`. The API forces `header.status` to `Initiated` and calls the existing transactional Supabase `save_allocation` RPC.

```js
const payload = buildAllocationPayload({deal,s,status:'Initiated',lookups,expenseOf,pctShown});
await fetch(`http://localhost:3001/api/deals/${deal.id}/allocations/initiate`, {
  method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
  body:JSON.stringify(payload)
});
```

## Important limitations

- Deal insertion and task creation currently require separate Supabase requests. If task creation fails, the deal may exist without tasks; the API reports this explicitly. For production, move both operations into one transactional database RPC.
- Initiating an allocation saves its data and status but **does not complete the workflow task**. The existing page's `onComplete(task.id, ...)` is still needed. A production endpoint should atomically save allocation, complete the task, and create any funding tasks in one transaction.
- This has been syntax-checked, but live Supabase integration has not been tested. Ensure the existing SQL schema and `save_allocation` function are deployed and RLS grants permit the logged-in user.
- Do not deploy with an unrestricted CORS origin or use an admin/service-role key as a substitute for appropriate RLS.

## Ask AI: deal task questions

The deal-scoped Ask AI drawer now calls `GET /api/deals/:dealCode/tasks` for pending, completed and overdue task questions. Other questions still use the existing Ask AI agent. The API verifies the user's Supabase bearer token and queries with that token (RLS applies).

Start `npm run api` and `npm run dev` in separate terminals. Optionally set `VITE_DEAL_API_URL=http://localhost:3001` in the Vite environment. On a deployed frontend, set this to a reachable HTTPS API address and configure `CORS_ORIGIN` on the backend.
