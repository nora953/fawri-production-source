# P0-RECEIPT-OWNERSHIP-POLICY — one bounded business decision

**Decision state:** `OWNER_APPROVED_POLICY_ONLY` (explicit owner authorization received in Fawri conversation on 2026-11-09); implementation/operations gate remains OPEN. **Date:** 2026-11-09. **Gate:** `P0-RECEIPT-OWNERSHIP-POLICY` (OPEN). **Parent:** issue #523; PR #550 draft.

## Current bounded R-OWN-5 status — hosted gate STILL OPEN

- **Owner policy:** `HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH` approved. **Real isolated PG18 + mounted HTTP source acceptance:** [evidence / exact SHA / CI](./evidence/P0-R-OWN5-RESTRICTED-CASE-PG18-HTTP-20261109.md). A separate **held post-0052** immutable case/event schema and two authenticated operator HTTP paths now exist in draft PR source. Restricted LOGIN, session and trusted-device checks, durable case retry, no guessed merchant/order assignment and non-applying escalation were proven in disposable PG18.
- **Do not confuse with commercial readiness:** held `0053` is NOT in the canonical 53-stage migration journal, not deployed, not production-granted; original staging/production untouched. No actual provider reconciliation, verified two-person outcome, final refund/dispute, approved retention/authorized final disposition or hosted SQL+HTTP parity. **R-OWN-5 and parent P0 gate remain OPEN; no percentage change; NO-GO**.
- This checkpoint **supersedes earlier below statements that case intake does not exist in source**. They described the state before the later held implementation; they remain valid for the absence of a *deployed* case-intake channel.

## Latest bounded P0 receipt acceptance — 2026-11-09

- Two separate live admin accounts and devices now prove a `PROVIDER_DISPUTE_REVIEWED` *nonterminal* milestone: SQL checks an independently active second reviewer, distinct from case opener/dispute actor, same immutable SHA-256 evidence and forbids replay. Real SQL+mounted HTTP [#42683116288](https://github.com/nora953/fawri-production-source/actions/runs/42683116288) **SUCCESS**. [Evidence](./evidence/P0-R-OWN5-INDEPENDENT-DISPUTE-SECOND-REVIEW-20261109.md).
- Exact narrowly scoped **held 0053** operator grant artifact targets `fawri_operator_issuer` and just five case EXECUTEs. Disposable PostgreSQL18 restricted LOGIN [#42684077867](https://github.com/nora953/fawri-production-source/actions/runs/42684077867) **SUCCESS**, including direct-table-denial and forged session/actor rejection. [Evidence](./evidence/P0-R-OWN5-HELD-0053-OPERATOR-ISSUER-GRANTS-20261109.md).
- **Not a provider settlement:** this review only acknowledges an operator-submitted digest. No independently validated provider confirmation, refunded payment, final financial disposition, commercial retention, hosted 0053 adoption/backup or real Neon role grants. `R-OWN-5` **OPEN**, `P0-RECEIPT-OWNERSHIP-POLICY` **OPEN**, PR #550 draft, NO-GO; known-row fraction unchanged at 64.4%. Older chronological notes below are source-state snapshots and are superseded where they describe missing isolated intake or second-review logic.

## Latest FT-01 / R-OWN-5 combined first-commercial migration review — 2026-11-09

- Prior accepted HELD receipt SQL/HTTP, auditable read, two-admin nonterminal dispute evidence review and restricted issuer grants remain valid. A **new separately named held** `_journal_with_0053.json` now pins the distinct 0052 variant plus one additive 0053 stage. [Source-only SHA admission #42687571793](https://github.com/nora953/fawri-production-source/actions/runs/42687571793) **SUCCESS**. [True combined non-superuser PG18 0000–0053 migrate-twice and 54 ledger proof #42688213492](https://github.com/nora953/fawri-production-source/actions/runs/42688213492) **SUCCESS**. [Exact evidence](./evidence/P0-R-OWN5-HELD-0053-COMPOSITE-54-STAGE-PG18-20261109.md).
- **Critical distinction:** this is source and isolated migration/role compatibility. It did not execute a hosted migration, obtain a real provider transaction/dispute confirmation, verify commercial data recovery, run mounted HTTP *on that combined 54-stage database*, or settle/refund funds. **R-OWN-5 and parent P0 gate remain OPEN**, historical 64.4% known-row source ratio unchanged and release NO-GO; no merge or hosted Neon/Railway change.

## Exact current source boundary

- `artifacts/api-server/src/routes/auth-verified-receipts-postgres-routes.ts` exposes operator receipt list, replay-review and replay, and now draft held-case intake/escalation HTTP routes. None is a general missing-order ownership repair endpoint.
- `artifacts/api-server/src/services/verifiedReceiptReplayReview.ts` explicitly requires `{authority,order_id}`, a matching reviewed database receipt, a provider-confirmation match, and a second authorization check. Review returns `applied:false`.
- `artifacts/api-server/src/services/verifiedReceiptReplayExecution.ts` requires privileged session/device authorization, independently re-authorizes during the financial transaction, and accepts only `applied` or `duplicate`. Existing-order fixture recovery is not proof that arbitrary missing-order financial ownership can be created.
- Existing accepted durable receipt inbox/immutable first-seen time and idempotence are **not** re-opened. See issue #523's 2026-10-24 reconciliation.

## Adopted narrow product policy — owner approved 2026-11-09

**`HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH`**

1. A verified payment whose original, independently supported merchant-and-order binding does **not** exist remains a durable **unmatched receipt**. It never creates or activates a subscription, changes merchant balances, invents a missing order, or attaches to another merchant/order based solely on an operator's assertion or user-provided ID.
2. An operator with `manage_subscriptions` may **inspect a minimized/audited receipt** and submit a non-applying review of a **pre-existing** candidate order. Executable replay requires the separately authenticated execution authority, the same session/device and merchant scope safeguards, and a fresh confirmation from the payment provider. No new broad operator SQL grant or direct manual mapping UPDATE is authorized.
3. Where the original order truly cannot be established, record a case for **manual evidence gathering and provider-side payment resolution/refund decision**. Do not claim the code already performs refunds, or delete/retarget the immutable receipt. An actual refund, approved duration, privileged financial correction or final disposition would need its *own* approved procedure and auditable evidence.
4. If candidate merchant, order, amount, currency, event, provider reference, signature or time-history conflict: **fail closed** without financial mutation. Concurrent duplicate, lost ACK or replay must continue once-only.
5. No automatic orphan-to-new-order match, no guessing from receipt amount or customer name, no merchant self-service reassignment, no rewriting the original provider event or receipt timestamp.

This protects against cross-tenant payment theft and double application, while preserving real customer claims for manual resolution. It does **not** imply that indefinite retention is approved: expiry, deletion privilege and refund workflow belong to separate `P0-RETENTION-PRIVILEGED-DELETION-POLICY`/provider gates.

## Finite closure acceptance — no generic re-audit

**Policy approval RECEIVED (2026-11-09):** owner explicitly stated: «أوافق رسمياً على سياسة HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH في مشروع فوري، ضمن حدودها المذكورة. واصل تنفيذ متطلبات الإغلاق المتبقية على GitHub دون إعادة الفحوصات المقبولة، ولا تعتبر القسم مغلقاً قبل اكتمال أدلته.» This authorizes only the bounded nonassignment policy, not automatic refunds, permanent retention, hosted SQL, schema grants, broad reassignment or release. Do not treat this as approval of a distinct operational refund/retention/deletion workflow.

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
| R-OWN-5, missing-original-order manual settlement and incident case owner | A held additive case register, event ledger and bounded intake/escalation HTTP implementation now exist and passed disposable PG18/HTTP, but no adopted hosted grant/migration, operational owner and provider-confirmed two-person final settlement, refund execution, retention or signed procedure is accepted. | **PARTIAL HELD SOURCE ACCEPTED; STILL OPEN hosted admission, provider-confirmed two-person final disposition and operations** |

**Narrow manual case SOP proposal for R-OWN-5 — operational implementation and approvals still unverified:**
- Intake only the verified receipt's provider event ID, original payment reference *minimized* as already projected, first-received timestamp, amount/currency, actor and contact/claim case reference in a restricted audit; never save raw credentials, customer payment secrets or a guessed merchant/order.
- Reconcile independently against original provider ledger and merchant/order history. Require audit of who reviewed, reviewed source reference, decision time, and second independent approval for irreversible settlement. No direct SQL/manual `UPDATE` to the immutable inbox or order ownership.
- If original order cannot be proved, keep the entitlement/payment unresolved and escalate to a provider-authorized refund or formal dispute mechanism; separate approval is required for any actual refund and retention/disposal.
- Close a manual case only on a provider-confirmed outcome plus independent audit evidence. If no safe mechanism exists, keep the case `UNRESOLVED_HOLD`; no automatic expiry or financial gain.

**What approval unlocks:** formal adoption of this *non-assignment* policy and a bounded verification of the remaining manual case channel. It does not authorize auto refunds, unrestricted retention, broad database grants or hosted migration. Until real R-OWN-5 operational evidence is available, the P0 parent gate remains OPEN even after choosing the policy.

The gate changes from `OPEN` to `CLOSED_SOURCE` **only when policy is approved and all R-OWN-1..5 are evidenced or explicitly approved inapplicable**. No percentage increase beforehand. The implementation, source-specific evidence and register change must occur together. No hosted SQL, actual provider refund, production/Neon/Railway write, role/grant change, merge or deployment is approved by this decision.

**Decision resolved:** the owner approved `HOLD_WITHOUT_ORDER; NO_ARBITRARY_ATTACH` on 2026-11-09. **Next measurable blocker:** admit the held case ledger through reviewed first-commercial migration/role/HTTP proof, then prove provider reconciliation and independently authorized final disposition (`R-OWN-5`) or obtain a separately justified, documented nonapplicability decision. A written SOP alone is not evidence of a functioning intake route. Four other cases remain bounded to already accepted source evidence; do not rerun broad CI. **Gate remains OPEN**, release NO-GO, PR draft. The original approval-only commit added no runtime; its later held restricted SQL/HTTP implementation and disposable acceptance are recorded in the current checkpoint above.


## R-OWN-5 source implementation checkpoint — 2026-11-09

- New side-effect-free production domain contract: [verifiedReceiptManualCasePolicy.ts](../../artifacts/api-server/src/services/verifiedReceiptManualCasePolicy.ts), source commit [\`ff0a2bc4\`](https://github.com/nora953/fawri-production-source/commit/ff0a2bc492f2e941d11f3bacd2bd87fc4ce174cc). Allows held, non-applying unmatched receipt case intake and a strict provider-review/dispute/evidence-only transition contract. Rejects arbitrary merchant/order/amount/refund fields, guessed entitlement and self-approved provider outcomes. A second independent actor plus provider evidence digest is required to record an outcome *in the domain contract only*.
- New targeted source negative/positive tests: [verified-receipt-manual-case-policy.test.ts](../../artifacts/api-server/tests/verified-receipt-manual-case-policy.test.ts), commit [\`e22b30a4\`](https://github.com/nora953/fawri-production-source/commit/e22b30a45fda2c3a6a97c266e7dfb2afff6552f1); and [dedicated GitHub Actions workflow](../../.github/workflows/p0-receipt-manual-case-policy.yml), commit [\`c6e9d3bb\`](https://github.com/nora953/fawri-production-source/commit/c6e9d3bbbb62ae9ccc63dfdc0d707d7754d6878b).
- **NOT OPERATIONAL:** these changes do **not** create a database table, write cases, add an HTTP route, authorize a provider API, persist immutable audit records, execute a refund or prove reviewer/approver independent SQL identities. Test suite status must be linked to exact committed CI run before marking the contract accepted. No existing broad tests were deliberately rerun. Avoid treating a DTO/state-machine as proof of an auditable real operator workflow.
- **R-OWN-5 remains OPEN:** durable append-only case journal + narrowly scoped operator SQL capability, authenticated HTTP intake, replay/idempotency, independent actor/reviewer enforcement at SQL authority, provider settlement evidence and retention procedure remain to be implemented/reviewed. First-commercial 0052 and hosted role provisioning remain independently BLOCKED: do not silently append a migration to the frozen canonical journal or execute hosted SQL.
- **Release remains NO-GO; historical registry unchanged** (29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, known-row fraction 64.4%, global P0% unknown).
