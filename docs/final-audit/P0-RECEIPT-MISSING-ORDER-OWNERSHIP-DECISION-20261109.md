# P0-RECEIPT-OWNERSHIP-POLICY — one bounded business decision

**Decision state:** `OWNER_APPROVAL_REQUIRED`, not approved. **Date:** 2026-11-09. **Gate:** `P0-RECEIPT-OWNERSHIP-POLICY` (OPEN). **Parent:** issue #523; PR #550 draft.

## Exact current source boundary

- `artifacts/api-server/src/routes/auth-verified-receipts-postgres-routes.ts` already exposes operator receipt list, replay-review, and replay through separately authenticated and permissioned routes. This is **not** a general missing-order ownership repair endpoint.
- `artifacts/api-server/src/services/verifiedReceiptReplayReview.ts` explicitly requires `{authority,order_id}`, a matching reviewed database receipt, a provider-confirmation match, and a second authorization check. Review returns `applied:false`.
- `artifacts/api-server/src/services/verifiedReceiptReplayExecution.ts` requires privileged session/device authorization, independently re-authorizes during the financial transaction, and accepts only `applied` or `duplicate`. Existing-order fixture recovery is not proof that arbitrary missing-order financial ownership can be created.
- Existing accepted durable receipt inbox/immutable first-seen time and idempotence are **not** re-opened. See issue #523's 2026-10-24 reconciliation.

## Recommended narrow product policy — decision REQUIRED

**`HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH`**

1. A verified payment whose original, independently supported merchant-and-order binding does **not** exist remains a durable **unmatched receipt**. It never creates or activates a subscription, changes merchant balances, invents a missing order, or attaches to another merchant/order based solely on an operator's assertion or user-provided ID.
2. An operator with `manage_subscriptions` may **inspect a minimized/audited receipt** and submit a non-applying review of a **pre-existing** candidate order. Executable replay requires the separately authenticated execution authority, the same session/device and merchant scope safeguards, and a fresh confirmation from the payment provider. No new broad operator SQL grant or direct manual mapping UPDATE is authorized.
3. Where the original order truly cannot be established, record a case for **manual evidence gathering and provider-side payment resolution/refund decision**. Do not claim the code already performs refunds, or delete/retarget the immutable receipt. An actual refund, approved duration, privileged financial correction or final disposition would need its *own* approved procedure and auditable evidence.
4. If candidate merchant, order, amount, currency, event, provider reference, signature or time-history conflict: **fail closed** without financial mutation. Concurrent duplicate, lost ACK or replay must continue once-only.
5. No automatic orphan-to-new-order match, no guessing from receipt amount or customer name, no merchant self-service reassignment, no rewriting the original provider event or receipt timestamp.

This protects against cross-tenant payment theft and double application, while preserving real customer claims for manual resolution. It does **not** imply that indefinite retention is approved: expiry, deletion privilege and refund workflow belong to separate `P0-RETENTION-PRIVILEGED-DELETION-POLICY`/provider gates.

## Finite closure acceptance — no generic re-audit

**Policy acceptance must be explicit:** the product owner approves this specific choice `HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH` by comment / direct message. A generic instruction to continue work is NOT approval.

After the choice, verify exactly the remaining policy-specific cases on current PR source using targeted original suite:
- `R-OWN-1` Verified orphan survives retry, remains immutable and unassigned; zero entitlement/application.
- `R-OWN-2` Arbitrary candidate/new order, foreign tenant and mismatched amount/provider all denied with no side effects.
- `R-OWN-3` Existing uniquely proven mapped order can use present review-and-replay workflow with audited actor/session/device, fresh provider check and once-only application.
- `R-OWN-4` Duplicate, concurrency, lost-ACK and SQL fault preserve first verified receipt and never apply twice; reuse previously accepted evidence, do not regenerate generic cases.
- `R-OWN-5` Manual-resolution case cannot directly mutate order ownership and has a documented escalation path. If case intake is not implemented, document precisely that missing operation rather than falsely closing the gate.

## Evidence reuse completed now — no duplicate tests

Mapped the five finite closure requirements directly onto **current already-accepted integration source**, rather than starting another 60-workflow audit. These are *bounded scenario matches*, not a blanket gate clearance:

| Case | Exact existing source evidence | Status |
|---|---|---|
| R-OWN-1, verified orphan held with no guessed tenant | `artifacts/api-server/tests/verified-provider-receipt-inbox-postgres.integration.test.mjs`, lines 39 and 126–170 (orphan survives concurrent redelivery, entitlement zero before restored existing order, replay once, first-received time preserved) | BOUNDED SOURCE EVIDENCE EXISTS |
| R-OWN-2, arbitrary reassignment, foreign, mismatched provider, no side effects | `artifacts/api-server/tests/verified-receipt-replay-execution-http-postgres.integration.test.mjs`, lines 139–173 and 207–212 (body injection denied, unassigned receipt 409 and provider not called, mapping-change denial); `artifacts/api-server/tests/verified-receipt-replay-review-http-postgres.integration.test.mjs`, lines 128–164 (mismatched order, cross-authority ambiguity, provider differences) | BOUNDED SOURCE EVIDENCE EXISTS; full production reassignment remains unsupported |
| R-OWN-3, reviewed existing-order replay | `artifacts/api-server/tests/verified-receipt-replay-review-http-postgres.integration.test.mjs`, lines 134–139, 149–154; `artifacts/api-server/tests/verified-receipt-replay-execution-http-postgres.integration.test.mjs`, lines 175–181 (real HTTP actor, provider reconfirmation, durable review/execution audit, once-only) | BOUNDED SOURCE EVIDENCE EXISTS |
| R-OWN-4, concurrency/fault/idempotence | `artifacts/api-server/tests/verified-receipt-replay-execution-http-postgres.integration.test.mjs`, lines 175–191; `artifacts/api-server/tests/receipt-execution-operator-pool-postgres.integration.test.mjs`, lines 152–201; `artifacts/api-server/tests/verified-provider-receipt-inbox-postgres.integration.test.mjs`, lines 126–170 | BOUNDED SOURCE EVIDENCE EXISTS |
| R-OWN-5, missing-original-order manual settlement and incident case owner | No approved official operational owner, refund execution route, case register/access/retention or signed manual settlement procedure exists in the reviewed current source. Must not infer this from an operator replay route or fixture. | **STILL OPEN: policy owner choice plus real operational disposition** |

**Narrow proposed manual case SOP for R-OWN-5, pending approval:**
- Intake only the verified receipt's provider event ID, original payment reference *minimized* as already projected, first-received timestamp, amount/currency, actor and contact/claim case reference in a restricted audit; never save raw credentials, customer payment secrets or a guessed merchant/order.
- Reconcile independently against original provider ledger and merchant/order history. Require audit of who reviewed, reviewed source reference, decision time, and second independent approval for irreversible settlement. No direct SQL/manual `UPDATE` to the immutable inbox or order ownership.
- If original order cannot be proved, keep the entitlement/payment unresolved and escalate to a provider-authorized refund or formal dispute mechanism; separate approval is required for any actual refund and retention/disposal.
- Close a manual case only on a provider-confirmed outcome plus independent audit evidence. If no safe mechanism exists, keep the case `UNRESOLVED_HOLD`; no automatic expiry or financial gain.

**What approval unlocks:** formal adoption of this *non-assignment* policy and a bounded verification of the remaining manual case channel. It does not authorize auto refunds, unrestricted retention, broad database grants or hosted migration. Until real R-OWN-5 operational evidence is available, the P0 parent gate remains OPEN even after choosing the policy.

The gate changes from `OPEN` to `CLOSED_SOURCE` **only when policy is approved and all R-OWN-1..5 are evidenced or explicitly approved inapplicable**. No percentage increase beforehand. The implementation, source-specific evidence and register change must occur together. No hosted SQL, actual provider refund, production/Neon/Railway write, role/grant change, merge or deployment is approved by this decision.

**Single product-owner choice requested:** Approve `HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH` for unlinked verified payments, with manual provider-side resolution rather than invented ownership? Approval is scoped to this policy only, not P0 launch or retention.
