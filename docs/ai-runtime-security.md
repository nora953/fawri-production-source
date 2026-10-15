# Fawri AI runtime security

## Provider contract

The only AI provider implementation in this lane is `ConstrainedOpenAiProvider`, provider ID `openai_responses_constrained_v1`. It calls the OpenAI Responses API directly over `fetch` and requires both:

- `OPENAI_API_KEY`
- `FAWRI_OPENAI_MODEL`

No default model is guessed. If either value is absent, the provider returns no candidate and the decision engine hands off.

The request uses `store: false`, a bounded timeout, bounded output, and strict structured JSON output. Provider errors, malformed JSON, refusals, timeouts, and non-2xx responses fail closed to handoff. No real provider call is performed by this branch's tests.

## Prompt separation

The request has three separate trust zones:

1. **System**: immutable Fawri safety and answer rules.
2. **Developer**: a JSON envelope containing trusted merchant policy and server-selected approved knowledge. The envelope is labeled as data, not instructions.
3. **User**: a JSON envelope containing bounded, untrusted customer text and detected language. It is labeled as data only.

Customer text is never concatenated into system rules. Browser-supplied merchant policy is ignored by the public route. The future messaging integration must resolve policy and database facts server-side.

## Injection defenses

Before database, retrieval, or AI work, the engine detects common instruction override, prompt disclosure, role override, data exfiltration, and encoded-instruction patterns in Arabic, Sorani Kurdish, and English.

On a suspicious message:

- the provider is not called;
- no system or merchant-private content is returned;
- a redacted/hash-only training record is created;
- the response is a human handoff;
- audit output records signal codes, digest, and length only.

The provider's system rules independently state that customer content is untrusted and that insufficient evidence must produce `can_answer=false`.

## Knowledge trust and hallucination controls

- Database facts must meet the configured fact-confidence threshold.
- Semantic context contains only merchant-approved records for the authenticated tenant.
- The AI is forbidden from inventing prices, availability, delivery, payment, warranty, legal, medical, or financial facts.
- Generated candidates never become approved knowledge automatically.
- Default generated auto-reply is disabled.
- Generated candidates are persisted only for merchant review with explicit provenance and `safeToAutoReply=false`.
- Human handoff is the normal outcome when evidence is absent, ambiguous, risky, or provider execution fails.

## Privacy and observability

The decision audit stores:

- SHA-256 customer-text digest;
- input length;
- decision stage/source/confidence;
- injection signal codes;
- record/request IDs.

It does not store full customer text. Training records store only a bounded redacted preview and digest. Phone numbers, email addresses, bearer tokens, API-like keys, and long digit identifiers are redacted from previews and provider-approved context.

Application logs must not log request bodies, provider request bodies, provider response bodies, customer messages, or full knowledge records. The existing HTTP logger serializes method/path/status only; integration must preserve that behavior.

## Production integration requirements

Before enabling the engine in the Meta worker:

- inject a tenant-scoped `KnowledgeFactResolver` backed by catalog/settings/order facts;
- inject server-resolved merchant policy;
- replace JSON persistence with transactional PostgreSQL repositories;
- use tenant-filtered vector retrieval with approved-source predicates;
- keep generated auto-reply disabled unless separately approved as a product policy;
- add provider usage/latency counters without prompt or response bodies;
- add a kill switch that makes provider failure immediately hand off.
