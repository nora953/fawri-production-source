# Fawri knowledge runtime contract

## Scope

This document defines the single active server-side contract for saved answers, training requests, learned answers, semantic retrieval, and constrained AI fallback. The implementation entry point is `KnowledgeDecisionEngine` with engine ID `fawri_knowledge_decision_engine_v1`.

The browser is a client only. Merchant identity comes from the authenticated server session. A body/query `merchantId` is never an authority. Saved answers and training operations use server-side versions and reject stale writes.

## Decision contract

Input:

```ts
type KnowledgeDecisionInput = {
  merchantId: string; // trusted server context only
  customerText: string;
  languageHint?: "ar" | "ku" | "en";
  merchantPolicy?: MerchantPolicyContext; // trusted server resolver only
  requestId?: string;
  conversationId?: string; // trusted messaging-pipeline context only
  customerExternalId?: string; // trusted channel identity only
  recentMessages?: KnowledgeConversationMessage[]; // trusted server-loaded history only
};
```

Output:

```ts
type KnowledgeDecisionResult = {
  action: "reply" | "handoff" | "no_answer";
  stage:
    | "database_fact"
    | "approved_saved_answer"
    | "semantic_retrieval"
    | "clarification"
    | "ai_fallback"
    | "handoff";
  answerText: string | null;
  language: "ar" | "ku" | "en";
  source: "database_fact" | "merchant_approved" | "openai_generated" | null;
  confidence: number;
  requiresMerchantApproval: boolean;
  trainingRequestId: string | null;
  matchedRecordId: string | null;
  reasonCode: string;
  injectionSignals: string[];
};
```

## Deterministic precedence

Prompt-injection inspection is a security gate before content resolution. Suspicious customer text is treated as untrusted data, creates a redacted training request, and is handed to a human without invoking the AI provider.

For non-malicious text, the engine evaluates exactly this order:

1. Direct database facts through `KnowledgeFactResolver`.
2. If a safe authoritative fact is missing only customer-selectable context (product, variant, or area), ask a deterministic clarification and keep the conversation in automatic mode.
3. Exact or contained active saved answers whose source is `merchant_approved`.
4. Tenant-filtered semantic retrieval over active `merchant_approved` saved/learned answers only.
5. Constrained AI fallback using system rules plus approved merchant context.
6. Human handoff or no answer.

The default runtime never auto-sends generated text. A generated candidate is recorded as `openai_generated`, `pending_review`, and `safeToAutoReply=false`. Even when an internal deployment explicitly enables low-risk generated replies, the decision declares `requiresMerchantApproval=true`, and the candidate cannot enter approved retrieval until a merchant approval transition converts its provenance to `merchant_approved`.

## Provenance invariants

- Saved answers are always `merchant_approved`; the public create route has no `approved` or `source` switch.
- AI candidates are always `openai_generated`, `pending_review`, and unsafe.
- A learned answer is eligible for automatic retrieval only when all are true:
  - `source === "merchant_approved"`
  - `approvalStatus === "approved"`
  - `safeToAutoReply === true`
- Rejecting a training request disables and rejects its linked learned candidate.
- Legacy saved answers are imported as approved only when the legacy record explicitly has `approved === true`; unknown or false approval is fail-closed into pending review.

## Training state machine

```text
pending_merchant_reply --propose--> pending_review
pending_merchant_reply --approve with explicit answer--> approved
pending_merchant_reply --reject--> rejected
pending_review --propose/edit--> pending_review
pending_review --approve--> approved
pending_review --reject--> rejected
rejected --propose--> pending_review
approved --> immutable; corrections require a new training request
```

Every mutating operation requires `expectedVersion` (or `If-Match`) after creation. A stale version returns HTTP 409 with the current server record. Invalid state transitions return HTTP 422.

## Tenant isolation

All repository reads, updates, deletes, exact matches, semantic documents, training transitions, learned-answer lookups, and audit queries include the authenticated `merchantId`. Cross-tenant IDs return not found rather than exposing the other tenant's current record. Semantic retrieval filters documents by tenant before scoring.

Customer-private operational facts add a second boundary. Order-status lookup is eligible only when the trusted messaging pipeline supplies the active `conversationId` and/or channel `customerExternalId`; the query then requires the order to belong to that conversation/customer identity. Browser-supplied identity is not trusted for this purpose, and an order ID by itself is insufficient to disclose status, payment state, or totals.

The messaging pipeline may also supply a bounded recent conversation context. It is loaded server-side from the same tenant/conversation and excludes the current inbound message, failed messages, queued replies, and system messages. At most eight prior delivered/received customer/Fawri/merchant messages are exposed to the decision engine. Their text is never written into decision audit metadata; only the bounded context count is recorded. If AI fallback is used, the whole conversation history remains in the untrusted user-data trust zone and sensitive values are redacted before provider transport.

A Fawri clarification reply stores its stable reason code in message metadata. When the next customer turn is not itself a new authoritative question, the decision engine may combine that follow-up with the immediately preceding customer question for deterministic fact resolution. This is intentionally limited to safe clarification codes for missing/ambiguous product, variant, or location context. Database outages, stale inventory, provenance failures, and other authority errors are never converted into clarification prompts.

The production database and vector adapter must preserve this rule at the query and schema level; see the handoff requests.

## Language handling

The runtime supports:

- Arabic: `ar`
- Sorani Kurdish: `ku`
- English: `en`

Normalization handles Arabic letter variants, Arabic/Persian digits, diacritics, tatweel, and Kurdish characters. Language detection is explicit and every knowledge record stores its language. Same-language matches receive a retrieval boost; a language mismatch is penalized rather than silently translated.

## HTTP surface

The isolated router is designed to be mounted at `/api/knowledge`:

- `GET /runtime`
- `POST /decision`
- `GET|POST /saved-answers`
- `PATCH|DELETE /saved-answers/:id`
- `GET|POST /training-requests`
- `POST /training-requests/:id/propose`
- `POST /training-requests/:id/approve`
- `POST /training-requests/:id/reject`
- `GET /learned-answers`
- `GET /audit`

The `/decision` route intentionally ignores browser-supplied merchant policy. A trusted server-side settings resolver must populate merchant policy when the messaging pipeline invokes the engine.

## Transitional persistence

`KnowledgeRepository` uses an atomic, mode-0600 JSON file named `knowledge-runtime.json` only as a migration-safe server-side adapter while the database lane creates the requested schema. It imports legacy files once, uses record versions, caps audit events, and fails closed if the runtime JSON is unreadable rather than overwriting corrupted knowledge.

This adapter is not the final multi-process persistence mechanism. PostgreSQL transactions, constraints, tenant-safe foreign keys, and vector storage are required before production activation.
