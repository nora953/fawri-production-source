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
2. Exact or contained active saved answers whose source is `merchant_approved`.
3. Tenant-filtered semantic retrieval over active `merchant_approved` saved/learned answers only.
4. Constrained AI fallback using system rules plus approved merchant context.
5. Human handoff or no answer.

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
