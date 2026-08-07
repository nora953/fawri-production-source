# Knowledge & AI lane handoff

## Branch and ownership

- Repository: `nora953/fawri-production-source`
- Lane branch: `parallel/knowledge-ai`
- Required starting SHA: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Implementation commit: `f87607d5a25c49a9baf4df6e42a4baea487330b5`
- Integration status: **not merged**
- Scope respected: no edits to `app.ts`, shared `index.ts`, packages, workflows, `lib/db/**`, shared store/types/translations, Meta queue/worker, auth, orders/settings, or catalog.

## Delivered implementation

### Single decision engine

The only knowledge answer orchestration contract added by this lane is:

- class: `KnowledgeDecisionEngine`
- engine ID: `fawri_knowledge_decision_engine_v1`
- provider: `ConstrainedOpenAiProvider`
- provider ID: `openai_responses_constrained_v1`

The deterministic non-malicious decision order is:

1. tenant-scoped database facts through `KnowledgeFactResolver`;
2. active `merchant_approved` saved answers;
3. tenant-filtered semantic retrieval over approved knowledge only;
4. constrained OpenAI fallback;
5. human handoff or no answer.

Prompt-injection inspection is a security gate before the above sequence. Suspicious text never reaches the provider.

### Server-authoritative knowledge

Added server-owned operations for:

- saved answers;
- training requests;
- learned answers;
- audit records;
- knowledge decisions.

Merchant identity is obtained only from the authenticated server session in the isolated routes. Browser-supplied `merchantId`, source, approval state, or merchant policy is not trusted.

### Approval and provenance invariants

- Saved answers created through the new route are always `merchant_approved`.
- OpenAI candidates are always `openai_generated`, `pending_review`, and `safeToAutoReply=false`.
- Generated candidates are never converted to approved knowledge automatically.
- Approval creates/updates a learned answer with `source=merchant_approved`, `approvalStatus=approved`, and `safeToAutoReply=true`.
- Rejection marks linked learned candidates rejected and unsafe.
- Legacy saved answers import as approved only when `approved === true`; missing/false approval fails closed into pending review.

Training state machine:

```text
pending_merchant_reply --propose--> pending_review
pending_merchant_reply --approve with answer--> approved
pending_merchant_reply --reject--> rejected
pending_review --propose/edit--> pending_review
pending_review --approve--> approved
pending_review --reject--> rejected
rejected --propose--> pending_review
approved --> immutable; correction requires a new request
```

All post-create mutations require `expectedVersion` or `If-Match`. Stale writes return HTTP 409 plus the current record.

### Language, privacy, and security

- Arabic, Sorani Kurdish, and English are supported.
- Normalization covers Arabic variants, diacritics, tatweel, Kurdish characters, and Arabic/Persian digits.
- Injection detection covers instruction override, prompt disclosure, role override, data exfiltration, and encoded instructions in all three languages.
- OpenAI request trust zones are separated into system rules, trusted merchant-data JSON, and untrusted customer-text JSON.
- Provider requests use `store:false`, strict JSON schema output, bounded timeout/output, and fail closed.
- No model is guessed; `OPENAI_API_KEY` and `FAWRI_OPENAI_MODEL` are both required.
- Decision audits store customer-text SHA-256 digest and length, not full customer text.
- Training stores a bounded redacted preview plus digest.
- Phone numbers, emails, secrets/tokens, and long numeric identifiers are redacted from previews/context.

### Server-only pages

Added:

- `ServerSavedAnswersPage.tsx` and `SavedAnswersPage.ts`
- `ServerTrainingPage.tsx` and `TrainingPage.ts`
- `components/knowledge/KnowledgeStatusBadge.tsx`

The active pages call `/api/knowledge/**`, use optimistic versions, handle conflicts, and contain no operational `localStorage`, `sessionStorage`, or client-side merchant authority.

### Transitional persistence

The implementation uses an atomic mode-0600 `knowledge-runtime.json` adapter only because this lane was explicitly forbidden from modifying the shared database layer. It:

- imports legacy knowledge once;
- writes atomically through temporary file rename;
- caps audit retention;
- fails closed if JSON is unreadable instead of overwriting corruption;
- keeps all repository reads and mutations tenant-scoped.

This is not safe as the final multi-process production repository and must be replaced by the requested PostgreSQL implementation below before production cutover.

## Files added

### API routes

- `artifacts/api-server/src/routes/knowledge-operations.ts`
- `artifacts/api-server/src/routes/knowledge-route-utils.ts`
- `artifacts/api-server/src/routes/saved-answer-operations.ts`
- `artifacts/api-server/src/routes/training-operations.ts`

### Services

- `artifacts/api-server/src/services/ai/constrainedOpenAiProvider.ts`
- `artifacts/api-server/src/services/ai/knowledgeDecisionEngine.ts`
- `artifacts/api-server/src/services/knowledge/types.ts`
- `artifacts/api-server/src/services/knowledge/normalization.ts`
- `artifacts/api-server/src/services/knowledge/redaction.ts`
- `artifacts/api-server/src/services/knowledge/promptInjection.ts`
- `artifacts/api-server/src/services/knowledge/semanticRetriever.ts`
- `artifacts/api-server/src/services/knowledge/knowledgeStateStore.ts`
- `artifacts/api-server/src/services/knowledge/savedAnswerStore.ts`
- `artifacts/api-server/src/services/knowledge/trainingRequestStore.ts`
- `artifacts/api-server/src/services/knowledge/trainingApprovalStore.ts`
- `artifacts/api-server/src/services/knowledge/trainingStore.ts`
- `artifacts/api-server/src/services/knowledge/knowledgeRepository.ts`
- `artifacts/api-server/src/services/knowledge/knowledgeLifecycle.ts`
- `artifacts/api-server/src/services/savedAnswerRuntime.ts`
- `artifacts/api-server/src/services/trainingRuntime.ts`

### Tests, UI, audit, and docs

- `artifacts/api-server/tests/knowledge-ai-runtime.test.ts`
- `artifacts/api-server/tests/knowledge-ai-security.test.ts`
- `artifacts/fawri/src/pages/dashboard/ServerSavedAnswersPage.tsx`
- `artifacts/fawri/src/pages/dashboard/SavedAnswersPage.ts`
- `artifacts/fawri/src/pages/dashboard/ServerTrainingPage.tsx`
- `artifacts/fawri/src/pages/dashboard/TrainingPage.ts`
- `artifacts/fawri/src/components/knowledge/KnowledgeStatusBadge.tsx`
- `scripts/audit-knowledge-operations.mjs`
- `scripts/tests/audit-knowledge-operations.test.mjs`
- `docs/knowledge-runtime-contract.md`
- `docs/ai-runtime-security.md`

## Required integration requests

### 1. Router owner: mount the isolated router

In the shared API router, add:

```ts
import knowledgeOperationsRouter from "./knowledge-operations.js";
router.use("/knowledge", knowledgeOperationsRouter);
```

The app already mounts the shared router under `/api`, so the resulting surface is `/api/knowledge/**`.

After migration verification, remove/deactivate legacy saved-answer and bot-training route mounts so two knowledge engines cannot remain active simultaneously. Do not route live messages to both the legacy engine and `fawri_knowledge_decision_engine_v1`.

### 2. Frontend app owner: activate the training page

The existing saved-answers import can resolve through the new `SavedAnswersPage.ts` wrapper. Change the training route lazy import from the legacy `BotTrainingPage` to:

```ts
const TrainingPage = lazy(() => import("./pages/dashboard/TrainingPage"));
```

Keep the existing route path unless product routing decides otherwise.

### 3. PostgreSQL/schema owner: replace JSON adapter

Create transactional tables with tenant-safe constraints. Recommended minimum shape:

```text
knowledge_saved_answers
  id uuid primary key
  merchant_id uuid not null references merchants(id) on delete cascade
  category text not null
  question_pattern text not null
  normalized_question text not null
  answer_text text not null
  language text not null check (language in ('ar','ku','en'))
  source text not null check (source = 'merchant_approved')
  active boolean not null default true
  version integer not null check (version > 0)
  created_at timestamptz not null
  updated_at timestamptz not null
  unique (merchant_id, language, normalized_question)

knowledge_training_requests
  id uuid primary key
  merchant_id uuid not null references merchants(id) on delete cascade
  customer_text_preview text not null
  customer_text_hash text not null
  detected_intent text not null
  detected_language text not null check (...)
  reason text not null
  suggested_reply text null
  suggested_reply_source text null check (... in ('merchant_draft','openai_generated'))
  status text not null check (... in ('pending_merchant_reply','pending_review','approved','rejected'))
  rejection_reason text null
  version integer not null check (version > 0)
  created_at timestamptz not null
  updated_at timestamptz not null

knowledge_learned_answers
  id uuid primary key
  merchant_id uuid not null references merchants(id) on delete cascade
  training_request_id uuid null
  intent text not null
  language text not null check (...)
  examples jsonb not null default '[]'
  keywords jsonb not null default '[]'
  answer_text text not null
  source text not null check (... in ('merchant_approved','openai_generated'))
  approval_status text not null check (... in ('pending_review','approved','rejected'))
  confidence numeric not null check (confidence between 0 and 1)
  safe_to_auto_reply boolean not null default false
  version integer not null check (version > 0)
  created_at timestamptz not null
  updated_at timestamptz not null
```

Use a composite tenant-safe foreign key for learned answers:

```text
unique (id, merchant_id) on knowledge_training_requests
foreign key (training_request_id, merchant_id)
  references knowledge_training_requests(id, merchant_id)
```

Add DB checks/triggers so `safe_to_auto_reply=true` is possible only when source is `merchant_approved` and approval status is `approved`; `openai_generated` must never be approved/safe in-place. Approval should transactionally convert provenance and increment versions.

For audit storage, persist only digest/length/signal codes/decision metadata. Do not create a raw customer-message column in the knowledge audit table.

### 4. Vector/search owner: production semantic adapter

Add a pgvector-backed document table or equivalent:

```text
knowledge_embeddings
  merchant_id
  knowledge_kind ('saved_answer'|'learned_answer')
  knowledge_id
  language
  source
  approval_status
  active
  embedding_model
  content_hash
  embedding vector(<chosen dimension>)
  updated_at
```

Requirements:

- apply `merchant_id = $tenant` before scoring;
- include only active `merchant_approved` records and approved/safe learned answers;
- use a composite unique key including merchant, kind, knowledge ID, model, and content hash;
- rebuild embedding when normalized question/examples change;
- use an appropriate HNSW/IVFFlat index after measuring corpus size;
- embed customer query ephemerally and do not persist raw query text;
- return record ID, language, and score so the decision contract stays unchanged;
- test exact cross-tenant records to prove no leakage.

### 5. Catalog/settings/orders owners: fact resolver

Implement one tenant-scoped `KnowledgeFactResolver` adapter that reads authoritative facts from catalog/inventory, merchant settings, and order policy/status services. It must return only facts belonging to the authenticated merchant and include a fact type, confidence, and record ID. Product price/stock, delivery/payment/warranty/order facts must never be invented by the AI fallback.

### 6. Settings owner: merchant policy resolver

Resolve `MerchantPolicyContext` server-side. The public browser route intentionally ignores policy fields from the request. Recommended fields:

- business name;
- allowed/prohibited topics;
- localized handoff text;
- generated auto-reply policy (keep `false` for production launch).

### 7. Shared types/API contract owner

Promote the DTOs from `services/knowledge/types.ts` into the shared API validation/types layer once ownership permits. Add runtime validation for request/response payloads and preserve:

- `source` provenance;
- `requiresMerchantApproval`;
- `reasonCode`;
- `trainingRequestId`;
- optimistic `version`.

### 8. Translation owner

Move the page-local Arabic/Kurdish/English copy into the shared translation dictionaries. Do not change message meanings that distinguish generated/unapproved from merchant-approved content. Add a localized label for the training status filter value `all`.

### 9. Package/workflow owner

No package dependency was added; the provider uses built-in `fetch`. Add project-native scripts/CI steps for:

```bash
node --test artifacts/api-server/tests/knowledge-ai-*.test.ts
node --test scripts/tests/audit-knowledge-operations.test.mjs
node scripts/audit-knowledge-operations.mjs
```

Use the repository's TypeScript test runner/build convention if raw `.ts` tests are not directly executable. Run the audit against a seeded valid runtime and include malicious-prompt and cross-tenant suites in CI.

### 10. Meta worker owner

After router, DB, vector, fact, and policy integration, call the single decision engine from the message pipeline. Respect `action` exactly:

- send only when `action === 'reply'` and product policy permits the source;
- create/retain training work when `trainingRequestId` is present;
- route `handoff` to the human queue;
- never send a pending generated candidate as approved merchant knowledge;
- do not log customer/provider bodies.

## Validation completed

Local focused verification after the final code split:

```text
TypeScript service compile: PASS
Knowledge/AI runtime tests: 13 passed, 0 failed
Audit/static contract tests: 5 passed, 0 failed
Knowledge route typecheck: PASS
Knowledge frontend typecheck: PASS
```

Coverage includes:

- Arabic/Kurdish/English normalization and injection prompts;
- Arabic/Persian digit redaction;
- separated OpenAI trust zones, `store:false`, strict JSON schema;
- approval state machine and stale-version conflicts;
- duplicate approved-answer conflicts;
- corrupted runtime fail-closed behavior;
- generated-answer non-trust;
- decision precedence;
- malicious prompt blocking before provider invocation;
- exact cross-tenant retrieval isolation;
- hash/length-only decision audits;
- no LocalStorage/sessionStorage or client merchant authority in active pages.

## Known limitations / production gates

- The new router is not mounted because the shared router is outside this lane.
- The Meta worker still uses the pre-existing path until its owner integrates this engine.
- Database facts currently use a no-op resolver until the fact adapter is injected.
- JSON storage is transitional and not multi-process safe.
- Current semantic retrieval is a deterministic local similarity fallback, not vector search.
- No live OpenAI request was made; provider tests use a fake fetch implementation.
- Environment variables and production model choice remain deployment decisions.

## Rollback

Before shared integration, rollback is simply reverting the knowledge implementation commit and this handoff commit on `parallel/knowledge-ai`. After integration, first unmount `/api/knowledge` and restore the previous message-engine route, then revert schema/vector adapters using the database lane's migration rollback. Do not delete merchant knowledge before exporting/migrating it.
