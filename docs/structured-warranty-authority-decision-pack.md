# Structured Warranty Authority — Owner Decision Pack

Status: **decision/design only**  
Branch: `parallel/warranty-authority-decision-pack`  
Starting SHA reviewed: `bff5842083e327fce19c300671e5c27bb9da5944`

## 1. Scope and non-goals

This document records the current warranty behavior and proposes a minimal, tenant-safe server-side warranty authority for Owner decision.

This change **does not** authorize or implement:

- database schema changes;
- migrations or backfills;
- production runtime changes;
- route/API changes;
- frontend changes;
- workflow changes;
- promotion of legacy Saved Answers, product descriptions, product metadata, training answers, or generated content into warranty authority.

Until an Owner decision is made and a dedicated implementation is reviewed, warranty questions must remain fail-closed.

## 2. Current-state findings

### 2.1 Merchant Settings authority

The PostgreSQL `merchant_settings` authority contains versioned operational settings for:

- automatic reply enablement;
- reply language;
- delivery availability, fees, thresholds, estimated days, areas, and notes;
- cash/electronic payment enablement, payment methods, and payment instructions;
- timestamps.

There is no structured warranty status, period, start event, coverage rule, exclusion rule, or claim instruction in `merchant_settings`.

The historical/file-backed `MerchantOperationalSettings` runtime mirrors the same delivery/payment scope and its accepted root patch keys are limited to `auto_reply_enabled`, `reply_language`, `delivery`, and `payment`. It also has no warranty field.

**Consequence:** Merchant Settings cannot currently provide authoritative warranty facts.

### 2.2 Catalog authority

The PostgreSQL catalog authority contains product identity, merchant ownership, description/category, pricing, inventory, visibility/reply eligibility, version, variants/options, images, identifiers, and generic JSON `metadata`.

There is no structured warranty field on products or variants.

The catalog runtime and bot catalog adapter likewise expose product/variant identity, description, price, inventory, visibility, images, and version, but no warranty contract.

Generic product `description` or `metadata` cannot safely become warranty authority because:

1. they do not define a warranty schema or semantic contract;
2. they do not distinguish an explicit “no warranty” decision from missing/unknown data;
3. the Knowledge operational fact resolver does not read them as warranty provenance;
4. free-form metadata permits conflicting representations and stale values;
5. the bot-facing adapter does not define warranty semantics for them.

**Consequence:** Catalog cannot currently provide authoritative warranty facts even if a merchant happens to mention warranty in description/metadata.

### 2.3 Orders authority

The PostgreSQL order authority contains tenant-bound order lifecycle/payment state, versioning, totals, order items, product/variant references, product-name/variant snapshots, and payment-decision audit/provenance.

There is no warranty policy identifier, warranty version, warranty snapshot, warranty start date, or warranty entitlement state on orders/order items.

The historical/file-backed order operations runtime similarly contains product id/name/quantity/price snapshots and order/payment lifecycle state only.

**Consequence:** An order cannot currently prove which warranty policy applied when it was sold, nor can a later warranty-policy edit be reconciled against historical orders.

### 2.4 Saved Answers / merchant-facing warranty information

The Knowledge schema includes `warranty` as one allowed Saved Answer category. Merchant-facing Saved Answers allow a merchant to store approved question/answer text and a category.

That content is still **knowledge content**, not the structured operational warranty authority. In particular:

- category=`warranty` does not provide normalized warranty status/duration/scope/start semantics;
- Saved Answers may be phrased for a specific question and can become stale independently of catalog/settings/order state;
- they do not create an order-time entitlement snapshot;
- they are not permitted to override the authoritative-fact gate.

Legacy/training/generated knowledge is even less suitable as authority and must not be promoted automatically.

### 2.5 Knowledge fail-closed behavior

The PostgreSQL operational fact resolver explicitly detects warranty terms (including Arabic and English warranty/guarantee terms). When warranty is requested, it returns `null` with the code comment that PostgreSQL has no structured warranty-policy column and that unstructured text/metadata must not be guessed from.

The Knowledge decision engine then applies an authoritative-fact gate. `isAuthoritativeFactQuestion(...)` includes warranty terms. Therefore, when the operational resolver cannot produce a structured warranty fact, the request is converted to `AUTHORITATIVE_FACT_UNAVAILABLE` handoff/training rather than falling through to:

- Saved Answers;
- semantic retrieval/embeddings;
- legacy lexical knowledge;
- generated AI output.

Existing operational-fact tests explicitly assert that a warranty question returns no fact and does not query an unrelated database source.

**Current warranty contract:** warranty is recognized as authoritative-domain intent, but there is no authority to resolve it, so it remains fail-closed.

## 3. Design invariants for any accepted option

All options below must preserve these invariants:

1. **PostgreSQL server authority only.** Browser/local storage, JSON runtime files, Saved Answers, product descriptions, generic metadata, training data, and generated AI must never become warranty source-of-truth.
2. **Tenant isolation at every key/FK/query.** A warranty row must be bound to `merchant_id`; product-scoped rows must use a tenant-safe composite relationship to `(product_id, merchant_id)`.
3. **Explicit unknown vs explicit no-warranty.** Missing configuration must not be interpreted as “no warranty.” Missing/invalid/ambiguous state must hand off.
4. **Versioned optimistic concurrency.** Every mutable warranty policy must have a positive version and writes must require an expected version.
5. **No partial fallback on invalid state.** If the selected authority row exists but is malformed/stale/conflicting, Knowledge must fail closed instead of trying a lower-priority Saved Answer or metadata source.
6. **Audit every material write.** Create/update/disable/delete/override operations must emit a server-side audit event containing tenant, actor, entity, previous/resulting version, and reason/request identifiers where available. Do not store raw customer warranty questions in warranty configuration audit.
7. **Knowledge answers only what is represented.** If v1 stores only offered/not-offered + fixed period + start event, questions about exclusions, manufacturer coverage, repairs, claims, statutory rights, or exceptional terms must hand off.
8. **Visibility does not imply warranty.** Product visibility/`allow_fawri_reply` determines whether product facts may be used; it must not synthesize a warranty policy.
9. **No automatic legacy promotion.** Existing warranty Saved Answers can be reviewed by a merchant as migration input, but cannot be converted automatically into structured fields.
10. **No generated warranty authority.** AI may never fill missing duration, scope, start date, exclusions, or claim terms.

## 4. Minimal structured field vocabulary

The following vocabulary is intentionally narrow. It is sufficient to answer only basic “is there a warranty / how long / when does it start?” questions.

### Policy state

`policy_state`:

- `offered`
- `not_offered`

Absence of a policy row is **unknown**, not `not_offered`.

### Fixed period

For `offered`:

- `duration_value`: positive integer
- `duration_unit`: `day | month | year`

For `not_offered`, both duration fields must be `NULL`.

No “lifetime” or open-ended warranty is proposed in v1. If the business requires it, that is an explicit Owner decision and schema extension rather than an inference.

### Start event

`starts_on` should be an Owner-approved enum chosen from business events that the platform can prove. Candidate values for decision are:

- `order_confirmed`
- `delivered`

`starts_on` is required for `offered` and `NULL` for `not_offered`.

`order_created`, payment date, device activation, manufacturer registration, or another event are **not** assumed. If required commercially, the Owner must select/add the correct event before implementation.

### Optional display/claim text

A v1 policy may optionally include bounded merchant-authored `claim_instructions` only if the Owner wants the bot to repeat claim routing instructions. It must not be required to determine offered/not-offered or duration.

Free-form `coverage`, `exclusions`, and legal terms are deliberately excluded from the minimal recommendation. If needed, they require a separate product/legal decision because they create much broader answer semantics.

## 5. Option A — Merchant-level warranty policy

### Intended meaning

One warranty policy applies to every warranty-eligible product sold by the merchant.

### Proposed source of truth

A dedicated PostgreSQL table such as `merchant_warranty_policies`.

A separate table is preferred over silently adding nullable fields to `merchant_settings` because row absence gives a clean “not configured / unknown” state and avoids inventing a migration default.

### Proposed fields

- `merchant_id` — PK + FK to merchants, tenant authority;
- `version` — positive integer;
- `policy_state` — `offered | not_offered`;
- `duration_value` — nullable positive integer;
- `duration_unit` — nullable `day | month | year`;
- `starts_on` — nullable Owner-approved enum;
- `claim_instructions` — optional bounded text, only if approved for v1;
- `created_at`;
- `updated_at`.

Recommended constraints:

- `offered` => duration and start event are all present;
- `not_offered` => duration and start event are all null;
- version > 0;
- updated_at >= created_at;
- bounded text length for claim instructions.

### Inheritance / override

None. The merchant policy is the complete policy.

### Versioning

Every update increments version atomically using expected-version concurrency.

### Audit

Use server-side `audit_events` with entity type `merchant_warranty_policy` and include previous/resulting version and changed field names in bounded metadata. Do not put raw customer text in configuration audit.

### Tenant isolation

The policy row is keyed by merchant. Resolver query must use `WHERE merchant_id = $1 LIMIT 2`, require exactly one row when configured, and re-validate returned tenant id.

### Knowledge resolution

For a warranty question:

1. require normal merchant Knowledge policy to allow use;
2. load the merchant warranty policy;
3. missing row => `AUTHORITATIVE_FACT_UNAVAILABLE` handoff;
4. malformed/inconsistent row => fail closed;
5. `not_offered` => reply only that this merchant policy states warranty is not offered;
6. `offered` => reply only with configured period and start event;
7. questions outside represented fields => handoff;
8. never consult warranty Saved Answers/semantic/AI as fallback.

### Ambiguous/missing warranty

Always fail closed. There is no fallback source.

### Catalog impact

No schema impact is required for the policy itself. Catalog is used only to identify whether the customer is asking about a visible product if the product context is required; catalog does not modify warranty semantics.

**Limitation:** this model is unsafe commercially if products have different warranty terms.

### Orders impact

No order change is required for pre-sale generic questions. However, if the system must answer warranty questions about historical orders after the merchant changes the policy, a policy snapshot/version link becomes necessary. See the Owner decisions section.

### Migration implications

- add one new table + enum/check constraints;
- do **not** default existing merchants to offered/not-offered;
- all merchants begin as warranty unknown until explicitly configured;
- do not parse Saved Answers/descriptions into the new table automatically.

### Frontend impact

A small merchant Warranty settings card/page can support:

- not configured status;
- offered / not offered;
- fixed duration;
- start event;
- optional claim instructions;
- save with expected version.

This is the smallest UI surface.

### Strengths

- smallest safe authority;
- simplest resolver and audit model;
- easiest fail-closed rollout;
- no product-edit UI expansion.

### Risks

- incorrect if products differ;
- cannot represent manufacturer-specific/product-specific warranty;
- historical-order correctness still requires a snapshot decision.

## 6. Option B — Product-level warranty policy

### Intended meaning

Each product has its own complete warranty policy. There is no merchant default.

### Proposed source of truth

A dedicated PostgreSQL table such as `product_warranty_policies`.

### Proposed fields

- `id` — policy id;
- `merchant_id` — tenant id;
- `product_id` — product id;
- `version` — positive integer;
- `policy_state` — `offered | not_offered`;
- `duration_value` — nullable positive integer;
- `duration_unit` — nullable `day | month | year`;
- `starts_on` — nullable Owner-approved enum;
- `claim_instructions` — optional bounded text if approved;
- `created_at`;
- `updated_at`.

Recommended keys/constraints:

- unique `(merchant_id, product_id)`;
- tenant-safe FK `(product_id, merchant_id)` -> products `(id, merchant_id)`;
- the same state/duration/start consistency checks as Option A;
- version > 0.

### Inheritance / override

None. Missing product policy = unknown => fail closed.

### Versioning

Each product policy has its own optimistic version.

### Audit

Audit entity `product_warranty_policy` with merchant id, product id, actor, previous/resulting version, and reason/request id.

### Tenant isolation

The resolver must first resolve one unambiguous visible product inside the requesting merchant, then read only a warranty policy with the same merchant/product composite identity.

Cross-tenant product ids must be rejected even if a faulty SQL adapter returns them.

### Knowledge resolution

1. detect warranty intent;
2. resolve exactly one tenant-safe product using current catalog identity rules;
3. ambiguous/missing product => handoff;
4. load exactly one product warranty policy;
5. missing/invalid policy => handoff;
6. answer only represented fields;
7. never fall back to merchant Saved Answers/metadata/AI.

### Ambiguous/missing warranty

Fail closed. A question that does not identify a product cannot be answered by this option unless the merchant asks a human.

### Catalog impact

Catalog product identity becomes a dependency for all warranty resolution. Product delete/cascade semantics and hidden/disabled product handling must be defined consistently with current catalog authority.

No warranty fields should be placed in generic catalog `metadata` as a substitute for the dedicated policy table.

### Orders impact

Order items already hold product references/snapshots, so order-context warranty resolution can identify the sold product. For historically correct terms, the order still needs a warranty policy version/snapshot decision.

### Migration implications

- new product warranty table + enums/check constraints;
- potentially many merchant edits after launch;
- existing products have no policy until merchant explicitly configures them;
- no automatic conversion from descriptions/Saved Answers.

### Frontend impact

Product editor/list needs warranty status and policy editing, plus a visible “not configured” state and bulk workflows if merchants have many products.

### Strengths

- accurate when terms differ by product;
- natural product/order linkage;
- no inheritance ambiguity.

### Risks

- much more merchant configuration effort;
- generic “do you offer warranty?” questions cannot be answered without a product;
- bulk management and completeness UX become important;
- variants with different warranty terms remain unsupported unless explicitly added later.

## 7. Option C — Merchant default + full product override

### Intended meaning

A merchant has one default warranty policy. A product may optionally replace that default with a complete product-specific policy.

### Proposed source of truth

Two PostgreSQL authorities:

- `merchant_warranty_policies` — same shape as Option A;
- `product_warranty_policies` — same shape as Option B.

### Inheritance / override

Use **full replacement only**, not field-by-field merging:

- product override row exists => the product row is the complete authority;
- no product override row => inherit the merchant default;
- product override with `not_offered` explicitly overrides an offered merchant default;
- malformed product override => fail closed and do not silently fall back to merchant default;
- no product override + no merchant policy => fail closed.

Full replacement is recommended because partial merging creates difficult version/provenance questions such as “duration from product, start event from merchant” after independent edits.

### Proposed fields

Merchant table: Option A fields.  
Product override table: Option B fields.

No extra `inherit` state is required; absence of a product row means inherit.

### Versioning

Merchant default and each product override version independently.

For a resolved answer, the Knowledge provenance should identify exactly which authority was used:

- `merchant_warranty:<merchant_id>:v<version>`; or
- `product_warranty:<product_id>:v<version>`.

### Audit

Audit writes independently for merchant defaults and product overrides.

### Tenant isolation

Same protections as Options A+B. Product override lookup must use the tenant-safe product relationship.

### Knowledge resolution

For product-specific warranty questions:

1. resolve one tenant-safe product;
2. attempt exact product override;
3. if valid override exists, use it;
4. if no override exists, load merchant default;
5. if either selected authority is invalid, fail closed;
6. missing selected authority => handoff;
7. answer only represented fields.

For generic merchant warranty questions with no product, only the merchant default can be stated, and the answer must make clear that product-specific overrides may exist if the Owner chooses to allow generic responses. Alternatively, the Owner may require a product before any warranty reply.

### Ambiguous/missing warranty

Fail closed. There is no Saved Answer/metadata/AI fallback.

### Catalog impact

Catalog identity is required when a product is present. Product UI needs override state (“uses merchant default” vs “custom override”).

### Orders impact

Best fit for order-context policy selection, but historical correctness still requires a snapshot/version strategy.

### Migration implications

- two new tables;
- default policy can reduce per-product merchant work;
- existing merchants/products remain unknown until merchant default and/or explicit product policies are entered;
- no inferred overrides from product descriptions or Saved Answers.

### Frontend impact

- merchant-level default Warranty settings;
- per-product “inherit default / custom warranty” control;
- clear effective-policy preview and source/version;
- warnings for products with no effective policy.

### Strengths

- flexible and merchant-friendly when most products share a policy;
- supports explicit no-warranty exceptions;
- clear precedence if full replacement is enforced.

### Risks

- largest implementation/test surface;
- UI must explain inheritance clearly;
- policy changes plus order history make snapshot semantics important;
- generic warranty replies can be misleading unless phrased/scoped carefully.

## 8. Technical recommendation (not an Owner decision)

**Recommendation: Option A — dedicated merchant-level warranty policy — is the simplest technically safe v1, but only if the Owner confirms that one warranty policy is commercially valid across the merchant’s products.**

Why this is the smallest safe implementation:

- one authoritative row per tenant;
- explicit configured vs unknown state;
- no product matching required for basic warranty questions;
- smallest schema/API/frontend/audit/resolver surface;
- preserves the current authoritative-fact fail-closed behavior during gradual rollout;
- avoids unsafe parsing of Saved Answers, descriptions, or metadata.

If product warranty terms can differ in the intended product behavior, **do not implement Option A as a temporary shortcut**. In that case, Option C is the safer long-term model because it provides a merchant default with complete product overrides and explicit provenance.

Option B is appropriate only if the Owner specifically wants every product to be configured independently and accepts that generic warranty questions remain unresolved without a product.

## 9. Exact Owner decisions required before implementation

The Owner must answer all applicable questions below. No production schema/runtime activation should proceed from this document alone.

### Authority scope

1. Is warranty policy merchant-wide, product-specific, or merchant-default + product override?
2. If product-specific policies are allowed, can variants of one product have different warranty terms?
3. If variants may differ, is variant-level warranty required in v1 or should such cases hand off?

### Meaning of a warranty policy

4. Is explicit `not_offered` required as a supported state? (Recommended: yes, distinct from missing/unknown.)
5. Are fixed periods (`N day/month/year`) sufficient for v1?
6. Is an open-ended/lifetime policy required? If yes, define its business/legal meaning; do not map it to a numeric period.
7. Which start event is authoritative: `order_confirmed`, `delivered`, or another server-verifiable event?
8. Should v1 auto-answer only existence + period + start event, or also claim instructions?
9. Are coverage/exclusions/manufacturer terms in scope for auto-reply? If yes, they need a separate structured/legal contract and are not covered by the minimal v1 recommendation.

### Generic vs product-specific questions

10. If using Option C, may a generic “do you have warranty?” question return the merchant default even though product overrides may exist, or must the bot first obtain a product?
11. If using Option B, should all generic warranty questions hand off until one product is identified? (Recommended if Option B is chosen.)

### Historical orders and entitlement

12. Must warranty questions about an existing order use the policy that was effective when that item was sold, rather than today’s policy?
13. If yes, at what event is the policy frozen: order creation, confirmation, delivery, or another event?
14. Is storing a warranty policy version reference sufficient, or must the order item store a normalized immutable snapshot so later policy-row edits/deletion cannot change historical meaning? Technical recommendation for durable historical correctness: immutable normalized snapshot.
15. If an order contains multiple products with different warranties, should the bot answer per item only?

### Merchant UX and migration

16. Should existing warranty Saved Answers be shown to the merchant as **review-only migration hints**? They must not be auto-promoted.
17. Is bulk product warranty editing required at launch if Option B/C is selected?
18. Are merchants allowed to leave warranty unconfigured indefinitely, with all warranty questions handing off? (Technically safe default: yes.)
19. Is there an activation gate requiring explicit merchant confirmation before a configured policy can become reply-authoritative?

### Language and wording

20. Should system-localized wording be generated from structured fields for Arabic/Kurdish/English, or may merchants supply per-language claim text?
21. If merchant-authored text is allowed, which fields are repeatable verbatim and what maximum lengths are acceptable?

### Legal/product ownership

22. Is this field intended to represent the merchant’s commercial warranty only, manufacturer warranty, statutory/legal rights, or some combination? The system must not conflate them.
23. Is legal review required before enabling automated warranty wording in the target jurisdictions?
24. Is a disclaimer required, and if so, what exact Owner/legal-approved wording should be used? Do not invent legal disclaimer text in runtime.

## 10. Proposed implementation scope after Owner decision

The exact paths depend on the selected option, but a safe implementation should be staged as follows.

### Phase 1 — schema and migration candidate

- add dedicated warranty enum/table(s) under `lib/db/src/schema/**`;
- add tenant-safe FK/check/version/timestamp constraints;
- add migration candidate only after Owner approves semantics;
- no default/backfill that converts unknown to no-warranty or offered;
- update schema/constraint tests.

### Phase 2 — server authority and merchant writes

- create a server-only warranty repository/service using PostgreSQL;
- tenant-bound reads/writes;
- optimistic expected-version updates;
- explicit not-configured behavior;
- audit events on every mutation;
- no JSON/local-storage operational authority;
- no Saved Answer/metadata fallback.

### Phase 3 — Knowledge resolution

- extend the PostgreSQL operational fact resolver to read only the approved warranty authority;
- keep warranty in `isAuthoritativeFactQuestion`;
- return provenance record id/version/source scope;
- ambiguous/missing/invalid product or policy => handoff;
- unsupported warranty detail => handoff;
- add tests proving Saved Answers/semantic/AI cannot answer warranty when structured authority is missing or invalid.

### Phase 4 — Catalog/Orders integration as selected

If product scope is selected:

- tenant-safe product policy lookup;
- product visibility/identity behavior;
- optional bulk configuration UX.

If historical-order warranty is selected:

- immutable policy/version snapshot at the Owner-selected lifecycle event;
- order item-level resolution;
- tests proving later policy edits do not rewrite historical entitlement.

### Phase 5 — frontend

- merchant configuration UI;
- explicit “not configured” status;
- expected-version conflict handling;
- effective policy/source preview for Option C;
- no browser-side authority or inferred defaults.

### Phase 6 — rollout gate

- feature remains fail-closed until schema, migration, API/runtime, Knowledge, audit, and frontend tests pass;
- merchants without explicit valid configuration continue to hand off;
- activation must not import legacy warranty text automatically.

## 11. Required test matrix after decision

At minimum:

- tenant A cannot read/write tenant B warranty policy;
- cross-tenant product id is rejected;
- missing policy => handoff;
- explicit not-offered => deterministic structured reply;
- offered fixed period => deterministic structured reply;
- invalid duration/state/start combination => fail closed;
- stale expected version => conflict, no overwrite;
- ambiguous product => handoff;
- hidden/not-reply-eligible product does not leak warranty facts;
- malformed override in Option C does not fall back to merchant default;
- absence of override in Option C does inherit merchant default;
- explicit product not-offered overrides merchant offered default;
- Saved Answer category `warranty` cannot bypass structured authority;
- semantic/embedding match cannot bypass structured authority;
- AI candidate cannot bypass structured authority;
- audit records contain actor/entity/version but no raw customer warranty question;
- if snapshots are selected, later policy edits do not change historical order warranty resolution.

## 12. Privacy, legal, and product implications

### Privacy

Warranty configuration is primarily merchant business-policy data, not customer PII. The main privacy risks arise from:

- audit actor/account identifiers;
- optional merchant claim instructions that could contain personal contact details;
- order-context warranty lookups that may touch customer/order data.

Controls:

- do not store raw customer warranty questions in configuration audit;
- reuse the Knowledge audit pattern of hashes/lengths where customer-query evidence is needed;
- return only warranty facts necessary for the answer;
- do not expose customer address/phone/payment data while resolving warranty;
- bound and sanitize any merchant-authored claim instructions.

### Legal

Warranty language may create or describe commercial obligations. The platform must not infer:

- statutory consumer rights;
- manufacturer warranty;
- eligibility based on payment, registration, serial number, damage type, or use conditions;
- exclusions not explicitly represented in the approved authority.

If those concepts are required, they need explicit Owner/legal semantics and a broader structured model. A generic AI or Saved Answer must not supply them.

### Product

The largest product decision is not technical: whether warranty is genuinely uniform per merchant or varies by product/variant. That decision directly determines whether Option A is safe or misleading.

The second major decision is temporal: whether today’s policy or the policy at sale/delivery governs order-specific answers. If historical correctness matters, an immutable order-item warranty snapshot should be treated as part of the product contract, not an implementation detail.

## 13. Decision summary

- **Current authority:** none for structured warranty.
- **Current user-entered warranty content:** possible through Saved Answers/free text, but non-authoritative for operational warranty facts.
- **Current Knowledge behavior:** warranty is authoritative-domain intent and fails closed to handoff because no structured source exists.
- **Simplest technical recommendation:** Option A, merchant-level dedicated policy, **only after Owner confirms merchant-wide semantics**.
- **If products differ:** prefer Option C, merchant default + full product override.
- **No implementation should begin until the Owner decisions in section 9 are answered.**
