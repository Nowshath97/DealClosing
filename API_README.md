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

### Primary deal close-level tasks

Primary deals use a separate deal/close summary. To persist tasks for an individual close, run `supabase/primary_close_tasks.sql` after `supabase/allocation_tables.sql`; new task rows can then set `close_id` to the matching `allocation_close.id`. Existing task rows remain at deal level. Re-run `supabase/save_allocation.sql` so saving an allocation preserves the IDs of existing closes (removed closes and their close-linked tasks are deleted).
- Do not deploy with an unrestricted CORS origin or use an admin/service-role key as a substitute for appropriate RLS.

## Ask AI: deal task questions

The deal-scoped Ask AI drawer now calls `GET /api/deals/:dealCode/tasks` for pending, completed and overdue task questions. Other questions still use the existing Ask AI agent. The API verifies the user's Supabase bearer token and queries with that token (RLS applies).

Start `npm run api` and `npm run dev` in separate terminals. Optionally set `VITE_DEAL_API_URL=http://localhost:3001` in the Vite environment. On a deployed frontend, set this to a reachable HTTPS API address and configure `CORS_ORIGIN` on the backend.


## Normalized client accounts

Run `supabase/normalize_client_accounts.sql` before deploying this frontend. It uses the existing snake_case destination tables and creates them if absent. Existing installations should migrate their current data without reseeding. New installations: existing entity/account schema, `seed_entities.sql`, `normalize_client_accounts.sql`, then `allocation_tables.sql`.

- `client_account`: one record per `account_name`, keyed by `id`. Account attributes use snake_case names (for example `minimum_investment`, `account_notes`, `group_id`).
- `client_entity_map`: three relationship keys (`id`, `client_id`, `entity_id`) plus the existing audit fields and active flag. Multiple entities reference one account ID; the existing one-account-per-entity rule remains enforced.
- `entity.ClientAccountSubjectToVeto` and `entity.ClientAccountIsPlaceholder`: preserve the entity-specific source flags.

The transaction preserves mapping IDs, retargets foreign keys such as `allocation_line.account_map_id` to `client_entity_map(id)`, and archives the original table as `entity_account_map_legacy`. Existing account IDs remain intact. Contradictory account values or mapping IDs cause rollback. Successful reruns skip data migration, so later account updates are preserved. Seed scripts support the original and normalized schemas.

Deploy the migration and frontend together. Update account details in `client_account`; new mappings use IDs. Allocation `client_account` and close `account_name` fields remain historical labels on saved transactions.


## Fund allocations

Run `supabase/fund_allocations.sql`, then re-run `supabase/save_allocation.sql`, before deploying the frontend. The first script creates all 47 reference fields and backfills existing `allocation_line` financial values without overwriting existing fund allocations.

Initiate Allocations saves investment amount, allocation percentage and expenses to `fund_allocations` inside the existing transaction. It upserts deal-level rows by `(deal_code, entity_id)` where `fund_close_id` is null, preserving record IDs, initial investment amount and unrelated funding/veto workflow fields. Removing an entity from the form deletes its corresponding deal-level fund record. Close-specific records remain independent; deleting a referenced close requires handling those records first.

The form retains `allocation_line` for row order, expense override settings, review fields and legal-name mapping references. Load/view and the API read financial amounts from `fund_allocations`. Header totals and legal mappings continue to be maintained by the existing screen; direct database edits to fund amounts do not automatically recalculate them. The Primary close editor still uses its existing persistence; it is not wired to the new fund table.

`tinyint(4)` reference fields use nullable `smallint` to preserve status codes; `IsPIPCOTeamPopulated` uses nullable boolean. Percentage precision is `numeric(19,14)`; amounts are `numeric(19,2)`. `client_account` is a historical label and `client_id` references the master.


## Deal-level comments and documents

Run `supabase/deal_collaboration.sql`, then re-run `supabase/save_allocation.sql` before deploying this frontend. The migration copies existing task and allocation collaboration into `deal_comment` and `deal_document`. It preserves text, authors, dates and storage paths; legacy IDs are recorded with the source table to prevent migration duplicates. Original tables remain for recovery and are no longer used by the application.

Comments and document metadata are owned by `deal_code` and shared across review tasks and allocation screens. Optional `task_id` records their originating review task; deleting that task clears its context without deleting the deal record. Answers stay in `task_response`. Allocation saves append new collaboration and delete only explicitly removed document IDs, retaining records added from other tasks or sessions. Client references protect against duplicate inserts on save retries. Document handling still stores metadata only; actual file upload behavior is unchanged.


## Create Deal dropdowns and required ownership

Run `supabase/create_deal_options.sql` after `deal_columns.sql` before deploying the updated Create Deal screen. It seeds eight Investment Type Detail options under the existing deal type IDs, adds `investment_type_detail_id`, `relationship_lead`, `execution_team_member`, `execution_location` and `execution_location_id` to `deal`, and validates new deal inserts. Existing deals can remain unassigned and their normal status updates continue to work.

Relationship Lead and Execution Team Member are required single selections from existing active `users` records. Execution Location is a required dropdown backed by active `ref_execution_location` records. The migration seeds New York, Dallas, London, Hong Kong and Boston. Manage additional choices in the database. Investment Type Detail choices are filtered by `deal_type_id`; changing investment type clears the previous detail. Its label is also retained in `deal.investment_type_detail` for existing summaries.

Clients creating deals through the API must now supply `relationshipLead`, `executionTeamMember` and `executionLocation`. `investmentTypeDetailId` is optional; when supplied it must be active and belong to `investmentType`. Edit reference values in the database to manage future choices.


## Switch the close master to fund_closes

For existing installations, run **`supabase/migrate_to_fund_closes.sql`** in full before deploying this frontend. It includes the fund-close schema/numbering, migration, close-task trigger and current save RPC; no separate rerun of those files is needed. It expects the previously deployed allocation, normalized account, fund allocation, task-reference and deal collaboration schemas.

Existing `allocation_close` IDs are retained in `fund_closes`. New per-deal close numbers are assigned by date then ID, without altering existing fund close numbers. Conflicting destination IDs/data stop the transaction. All foreign keys referencing the old close table are retargeted, including `task.close_id`, `fund_allocations.fund_close_id`, `map_account_to_close.fund_close_id` and `allocation_close_account.close_id`. Editor metadata is copied. The source is renamed `allocation_close_legacy` and is no longer used by the app. Successful reruns preserve later edits in the new master.

The frontend, server and Ask AI edge-function source now query `fund_closes`; `estimate_or_final_close` replaces `close_type` in storage. The existing `save_allocation` payload still accepts `close_type` for compatibility and translates it in SQL. Redeploy the Ask AI edge function along with the frontend/backend. Primary close account detail rows remain in `allocation_close_account`, now linked to `fund_closes`; this migration does not move those financial rows to a different table.

Fresh setup: allocation schema, `fund_closes.sql`, account/fund mapping schemas and collaboration schema, then `primary_close_tasks.sql` and `save_allocation.sql`.


## Entity-driven review tasks

Run `supabase/entity_review_tasks.sql` after the close-master migration and fund allocation/account schemas. It stores configurable rules in `entity_review_task_rule`, initially mapping `IsAmgoReviewRequired`, `IsLuxReviewRequired` and `IsAddtnlAMLReviewRequired` to their review task references under Risk & Compliance.

The close editor selects entities by ID from those mapped to each account. Saving close `editor_data` evaluates the selected entities. Any selected entity with the flag set to 1 makes that review applicable. Primary reviews are created only at close level; other deal types evaluate deal-level `fund_allocations`. Changing the entity flags also re-evaluates tasks. Nonapplicable managed tasks remain in the database with `is_applicable=false` to retain IDs and completed answers, and are hidden by the UI. Restoring a requirement reuses the original task and status. Existing legacy Primary deal-level entity-review tasks are marked nonapplicable.

The migration seeds missing review task references, reuses matching existing names, and backfills saved selections. Extend or change rules in `entity_review_task_rule` for other supported entity flags; run `sync_entity_review_tasks(deal_code, close_id)` after changing rule configuration. No review is inferred from merely mapping an account without selecting an entity.
