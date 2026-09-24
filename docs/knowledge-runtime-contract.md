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
    | "fawri_encyclopedia"
    | "clarification"
    | "ai_fallback"
    | "handoff";
  answerText: string | null;
  language: "ar" | "ku" | "en";
  source:
    | "database_fact"
    | "merchant_approved"
    | "fawri_curated"
    | "openai_generated"
    | null;
  confidence: number;
  requiresMerchantApproval: boolean;
  trainingRequestId: string | null;
  matchedRecordId: string | null;
  reasonCode: string;
  injectionSignals: string[];
  groundingRecordIds?: string[];
};
```

## Deterministic precedence

Prompt-injection inspection is a security gate before content resolution. Suspicious customer text is treated as untrusted data, creates a redacted training request, and is handed to a human without invoking the AI provider.

For non-malicious text, the engine evaluates exactly this order:

1. Direct database facts through `KnowledgeFactResolver`.
2. If a safe authoritative fact is missing only customer-selectable context (product, variant, or area), ask a deterministic clarification and keep the conversation in automatic mode.
3. Exact or contained active saved answers whose source is `merchant_approved`.
4. Tenant-filtered semantic retrieval over active `merchant_approved` saved/learned answers only.
5. Fawri activity encyclopedia selected from the merchant's server-side activity type.
6. Fawri global encyclopedia.
7. Constrained AI fallback using trusted context.
8. Human handoff or no answer.

The constrained OpenAI provider may synthesize a customer-facing answer automatically when—and only when—it can cite one or more merchant-approved knowledge records supplied by the server, every cited ID belongs to the current tenant's bounded approved context, the response language matches the customer, risk is low, confidence clears the server threshold, and factual tokens such as numbers, currencies, SKUs, IDs, and URLs are supported by the cited approved answers. This path exists to combine and phrase already-trusted information in a clear, natural, concise, professional way; it does not grant AI authority to invent facts.

A grounded automatic synthesis does not create a pending training request and does not ask the merchant to approve the same trusted information again. If any grounding condition fails, the generated candidate is recorded as `openai_generated`, `pending_review`, and `safeToAutoReply=false`, and the conversation is handed off. Browser/environment input cannot relax the grounding rule. A future merchant-specific tone/style setting may customize wording, but it must not change factual authority, grounding, or safety rules.

## Fawri encyclopedia

Fawri ships with a curated bootstrap encyclopedia so a newly activated merchant is not starting from an empty bot. Curated entries use the provenance `fawri_curated` and are lower priority than merchant-specific knowledge.

The launch corpus includes global product terminology plus activity packs for fashion, electronics, food, perfumes, and jewelry. Activity selection comes from the server-side merchant profile, never from browser input. Custom activities receive the global pack until a dedicated pack exists.

The encyclopedia is intentionally excluded from current operational authority. It cannot supply current price, stock, order status, merchant delivery/payment settings, or another structured fact that belongs to the merchant database. Merchant-approved corrections can override an encyclopedia answer on future questions because merchant knowledge is evaluated first.

The detailed architecture and expansion rules are documented in `docs/fawri-knowledge-architecture.md`.

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

## Merchant correction review

When Fawri has already answered and the merchant takes over to send a correction, that manual message is **not** silently promoted into permanent knowledge. For non-operational knowledge replies, the conversation UI asks the merchant whether this correction should be adopted by Fawri.

- **Approve:** the correction becomes merchant-approved knowledge for the customer question. An existing exact saved answer is updated instead of duplicated. If the corrected Fawri reply came directly from an approved learned semantic answer in the same language, that learned answer is retired so it cannot continue auto-replying with the superseded text.
- **Dismiss:** the correction applies only to the current conversation and is not stored as reusable knowledge.
- Database-authoritative operational facts are excluded from this flow. Price, stock, order, delivery, payment, and other structured facts must be corrected in their source authority rather than overridden by conversational knowledge.
- The review record stores message IDs and status in message metadata; it does not copy the customer question into review metadata. All reads and writes remain tenant- and conversation-scoped.

This confirmation is intentionally different from the handoff-learning path. If Fawri had no trusted answer and handed the conversation to the merchant, an eligible merchant reply can teach the unresolved knowledge gap directly. If Fawri already answered and the merchant corrects it, explicit merchant confirmation is required before the correction becomes permanent.

## Tenant isolation

All repository reads, updates, deletes, exact matches, semantic documents, training transitions, learned-answer lookups, and audit queries include the authenticated `merchantId`. Cross-tenant IDs return not found rather than exposing the other tenant's current record. Semantic retrieval filters documents by tenant before scoring.

Customer-private operational facts add a second boundary. Order-status lookup is eligible only when the trusted messaging pipeline supplies the active `conversationId` and/or channel `customerExternalId`; the query then requires the order to belong to that conversation/customer identity. Browser-supplied identity is not trusted for this purpose, and an order ID by itself is insufficient to disclose status, payment state, or totals.

The messaging pipeline may also supply a bounded recent conversation context. It is loaded server-side from the same tenant/conversation and excludes the current inbound message, failed messages, queued replies, and system messages. At most eight prior delivered/received customer/Fawri/merchant messages are exposed to the decision engine. Their text is never written into decision audit metadata; only the bounded context count is recorded. If AI fallback is used, the whole conversation history remains in the untrusted user-data trust zone and sensitive values are redacted before provider transport.

A Fawri clarification reply stores its stable reason code in message metadata. When the next customer turn is not itself a new authoritative question, the decision engine may combine that follow-up with the immediately preceding customer question for deterministic fact resolution. This is intentionally limited to safe clarification codes for missing/ambiguous product, variant, or location context. Database outages, stale inventory, provenance failures, and other authority errors are never converted into clarification prompts.

A single customer message may request multiple authoritative facts. The operational fact resolver composes all requested trusted facts into one reply instead of rejecting the message merely because it contains more than one intent. Examples include price + availability, delivery + payment, or weight + dimensions. Composition is all-or-nothing: if any requested fact lacks trusted structured authority, the resolver returns no combined answer rather than silently omitting that part. Existing clarification and fail-closed rules still apply to each component fact.

Warranty has two separate trust domains. Fawri subscription/service-guarantee questions remain server-authoritative and cannot fall through to merchant Saved Answers, embeddings, or AI. Merchant product-warranty questions are not treated as platform operational facts until a dedicated structured warranty authority exists; they may be answered only from explicit `merchant_approved` Saved Answers or approved learned knowledge. Generated/unapproved warranty text remains ineligible for automatic retrieval.

The production database and vector adapter must preserve this rule at the query and schema level; see the handoff requests.

## Language handling

The runtime supports:

- Arabic: `ar`
- Sorani Kurdish: `ku`
- English: `en`

Normalization handles Arabic letter variants, Arabic/Persian digits, diacritics, tatweel, and Kurdish characters. Language detection is explicit and every knowledge record stores its source language. Exact Saved Answer matching remains same-language first. Approved semantic retrieval may match an approved record written in another supported language. When that happens, Fawri may translate only the already-approved answer into the customer's language through the configured approved-knowledge translation provider. The translation must preserve meaning, numbers, prices, dates, conditions, identifiers, URLs, and other factual tokens; it may improve professionalism and natural phrasing but may not add or remove facts. The original approved record remains the authority and the translated wording is not promoted into new knowledge. If faithful translation is unavailable, Fawri hands off instead of answering with a guessed translation.

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
