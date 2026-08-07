# Fawri parallel integration status

## Coordination snapshot

- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Integration branch: `parallel/integration-coordinator`
- Coordinator remote HEAD before this update: `7e54dfc80fab235d95c76874f5c10a787811e2d0`
- Validated target after ordered integration: `hardening/postgresql-foundation`
- Direct modification of `main`: **not allowed**
- Replit Agent: **not allowed**
- Latest lane review: `2026-08-07 05:13 +03:00`
- Current project release decision: **NO-GO**

## Ordered integration queue

1. `parallel/auth-session-hardening`
2. `parallel/channels-messaging`
3. `parallel/orders-settings-finalization`
4. `parallel/catalog-inventory`
5. `parallel/knowledge-ai`
6. `parallel/db-migration-cutover` after all domain schema requests are reconciled
7. `parallel/quality-observability` after all domains and PostgreSQL
8. Shared wiring, full validation, final migration, and release-candidate checks

No execution lane has been merged into `parallel/integration-coordinator` yet.

## Lane status

| Lane | Branch | Status | Reviewed SHA | Integrated SHA | Notes |
|---|---|---|---|---|---|
| Auth/session/admin security | `parallel/auth-session-hardening` | waiting for implementation and handoff | — | — | First lane in integration order; must also resolve auth source/compiled-output drift reported by CI |
| Channels/messaging | `parallel/channels-messaging` | reviewed; queued after auth/session | `22857159593aebeea0a12e6782581da6358080b3` | — | Allowlist compliant; 13 documented tests passed; activation blocked pending shared routes, plaintext-token migration, key management, PostgreSQL, and CI |
| Orders/settings finalization | `parallel/orders-settings-finalization` | reviewed; queued after channels/messaging | `bde53f403f63d680fd96c1d8b8a5e264010d9b41` | — | Allowlist compliant; 5 runtime + 4 static-contract + 1 audit test passed; service and isolated page TypeScript checks passed; full workspace build/CI not run; shared queue/race/type wiring mandatory before production sign-off |
| Catalog/inventory | `parallel/catalog-inventory` | reviewed; queued after orders/settings | `ce363f7105f33e942c6c47ef8907dfb9b59658f6` | — | Allowlist compliant; 16 documented tests passed; full workspace validation pending |
| Knowledge/AI | `parallel/knowledge-ai` | waiting for implementation and handoff | — | — | Integrate after catalog/inventory |
| PostgreSQL migration/cutover | `parallel/db-migration-cutover` | waiting for implementation and handoff; blockers and domain requests assigned | — | — | Must resolve quality-discovered schema blockers plus final orders/settings, channels, catalog, and knowledge schema requests |
| Quality/observability | `parallel/quality-observability` | reviewed; accepted as final queued lane | `b473fb8397814aa7bd91e0e323dc6003f6ba96f6` | — | PR #4 open/draft/unmerged; allowlist compliant; red gates are real project blockers discovered by the lane, not a lane implementation failure |

## Review ledger

### 2026-08-07 03:15 +03:00 — initial scan

- All execution branches were at the coordination base and all handoffs were absent.
- No branch was eligible for review or merge.

### 2026-08-07 03:55 +03:00 — catalog/inventory

- Reviewed `parallel/catalog-inventory` at `ce363f7105f33e942c6c47ef8907dfb9b59658f6`.
- Branch ancestry: 10 commits ahead, zero behind, coordination base as merge base.
- All 10 changed paths were inside the catalog/inventory allowlist.
- No shared file, workflow, package/lockfile, database, auth, Meta, orders/settings, or legacy `ProductsPage.tsx` file was changed.
- Handoff reviewed: `docs/coordination/handoffs/catalog-inventory.md`.
- Static review confirmed session-derived tenant authority, optimistic versioning, idempotency, non-negative stock, image-reference-only persistence, server-authoritative UI, and read-only migration auditing.
- Documented evidence: 16 tests passed, 0 failed; isolated TypeScript checks passed; no GitHub Actions run existed.
- Decision: accepted into the ordered queue, not merged.

### 2026-08-07 04:20 +03:00 — channels/messaging

- Reviewed current remote tree at `22857159593aebeea0a12e6782581da6358080b3`.
- Branch ancestry: 6 commits ahead, zero behind, coordination base as merge base.
- Initial implementation: `baa3f2ab74b6fd308b6631d0dc0a94d2c7e230e7`.
- Operational allowlist correction: `ef6296de2fbbebc872c5b1822d3466180103c957`.
- The previously reported `f9cef32e25d0bb4e44f67d254633534173a6715d` is not an ancestor of the current tip. Current documentation lineage is recorded without rejecting the reviewed operational tree.
- All final 29 paths were inside the channels/messaging allowlist; the root `scripts/manage-durable-jobs.ts` was removed and the API-server CLI plus channel-specific admin route names were corrected.
- Static review confirmed raw-body HMAC, fail-closed transient handling, enqueue-before-ack, layered idempotency, durable leases/reconciliation, blocked uncertain DLQ replay, one-time refunds, tenant/session authority, token-envelope encryption, and payload-free default inspection.
- Documented evidence: 13 tests passed, 0 failed; targeted TypeScript, audit, syntax, and relocated CLI checks passed; no GitHub Actions run existed.
- Decision: accepted immediately after auth/session, not merged and not activated.

### 2026-08-07 04:29 +03:00 — quality/observability

#### Branch, PR, and ancestry

- Reviewed branch: `parallel/quality-observability`.
- Rechecked remote HEAD: `b473fb8397814aa7bd91e0e323dc6003f6ba96f6`.
- Ancestry: 6 commits ahead of the coordination base, zero behind, coordination base as merge base.
- Draft PR #4 is open, draft, mergeable, unmerged, and targets `hardening/postgresql-foundation`.
- PR #4 contains 44 changed files, 2,771 additions, and 852 deletions.
- All 44 paths are inside the quality/observability ownership boundary; no domain logic, `app.ts`, `index.ts`, package/lockfile, `lib/db/**`, shared frontend code, another lane, or `main` was modified.
- Nine overlapping workflows were replaced by `quality-gates.yml`, `security-supply-chain.yml`, and `backup-restore-drill.yml` with least privilege, non-persistent checkout credentials, bounded timeouts, cancellation/concurrency, artifact scanning, disposable PostgreSQL, and synthetic object fixtures.
- The observability router remains isolated and unmounted.
- Handoff historical evidence and PR #4 final-head evidence are intentionally recorded together; no documentation-only commit is required merely to copy run IDs.
- Final-head GitHub Actions:
  - quality gates `31137063434`: **FAILURE**;
  - security/supply chain `31137063654`: **FAILURE**;
  - backup/restore `31137063594`: **SUCCESS**.
- Red quality/security results are real project blockers and must not be weakened to manufacture green.
- Decision: accepted into the final queue position after all domains and PostgreSQL; current release decision remains **NO-GO**.

### 2026-08-07 05:13 +03:00 — orders/settings finalization

#### Branch and allowlist

- Reviewed branch: `parallel/orders-settings-finalization`.
- Submitted and rechecked remote HEAD: `bde53f403f63d680fd96c1d8b8a5e264010d9b41`; the branch ref was identical immediately before the coordinator update.
- Ancestry: 18 commits ahead of `b08c854f177953d3690c5dffde905fdb0c93eb09`, zero behind, coordination base as merge base.
- Final diff contains 14 changed paths, all inside the lane allowlist:
  - `artifacts/api-server/src/routes/merchant-settings.ts`
  - `artifacts/api-server/src/routes/order-operations.ts`
  - `artifacts/api-server/src/services/merchantSettingsRuntime.ts`
  - `artifacts/api-server/src/services/orderOperationsRuntime.ts`
  - `artifacts/api-server/tests/order-payment-hardening.integration.test.mjs`
  - `artifacts/api-server/tests/orders-settings-runtime.test.ts`
  - `artifacts/api-server/tests/orders-settings-static-contract.test.mjs`
  - `artifacts/fawri/src/pages/dashboard/OrdersPage.ts`
  - `artifacts/fawri/src/pages/dashboard/ServerOrdersPage.tsx`
  - `docs/coordination/handoffs/orders-settings-finalization.md`
  - `docs/order-settings-server-authority.md`
  - `scripts/audit-merchant-settings.mjs`
  - `scripts/audit-order-operations.mjs`
  - `scripts/tests/orders-settings-audits.test.mjs`
- The former out-of-allowlist documentation path `docs/architecture/orders-settings-server-authority.md` is absent at the final SHA. The final commit `bde53f403f63d680fd96c1d8b8a5e264010d9b41` is documentation-only and removes the stale path reference from the handoff.
- No legacy order/settings `.tsx` page, shared store/type/translation file, `app.ts`, `index.ts`, package/lockfile, workflow, `lib/db/**`, Meta implementation file, auth implementation file, catalog/knowledge file, target branch, or `main` was changed.
- Handoff reviewed: `docs/coordination/handoffs/orders-settings-finalization.md`.

#### Static behavior review

- Order routes derive merchant identity from the authenticated merchant session; the legacy merchant-ID route explicitly rejects a mismatched path merchant.
- Runtime order buckets and order records fail closed on missing/duplicate/cross-tenant identity.
- Every mutation requires a positive `expected_version`; stale writes return `ORDER_VERSION_CONFLICT` with current server state.
- Server-side order transition rules are explicit.
- Generic payment-state mutation rejects terminal `paid`/`failed`; terminal electronic outcomes require dedicated confirm/reject operations, and cash-on-delivery confirmation requires delivered state.
- Terminal order overlay plus payment-decision audit are written under the same order-operations lock/atomic replacement. Merchant deletion removes overlays and payment decisions.
- Merchant settings validate tenant key, patch shape, allowed fields, types, ranges, payment consistency, and optimistic version.
- Disabling auto reply suppresses queued/retry Meta reply jobs before the settings write returns, records `credit_consumed: false` and the resulting settings version, and observes rather than stealing processing leases.
- Active `OrdersPage.ts` points to `ServerOrdersPage`; the static contract verifies active order/settings modules contain no LocalStorage/SessionStorage authority.
- Added audits cover tenant/version/payment provenance and migration readiness for orders plus settings ownership/suppression/orphan-job conditions.

#### Mandatory cross-lane integration findings

These findings do not reject the lane because the affected files are reserved/shared and the handoff explicitly requests their coordinator-owned integration. They are mandatory before production sign-off:

1. **Queue store/API compatibility:** the reviewed channels lane defines durable queue store version 2, while this isolated settings runtime currently reads/writes `background-jobs.json` directly with a version-1-only shape. Because channels is integrated before orders/settings, direct queue-file coordination must be removed at the orders/settings integration turn. Add `suppressMerchantJobs(...)` and `deleteMerchantJobs(...)` to the final `durableJobQueue.ts` using its existing lock and make `merchantSettingsRuntime` consume those APIs.
2. **Claimed-reply disable race:** queued/retry suppression cannot stop an already-processing worker. The final Meta worker must re-read settings/version immediately before reply-credit reservation and again immediately before external Meta delivery. If disabled/version-invalidated, suppress, avoid new credit consumption, roll back same-attempt reservation if needed, and report `MERCHANT_AUTO_REPLY_DISABLED` with `credit_consumed: false`.
3. **Shared frontend payment type:** `ServerOrdersPage.tsx` imports `PaymentStatus` from shared `lib/types.ts`, but the current shared contract exports `OrderPaymentStatus`. This matches the existing Quality Gates `PaymentStatus` blocker. Resolve the shared type/import consistently during integration; do not change the shared file on the domain branch.
4. **Router mount/order:** `merchant-settings` is not mounted in the current shared `app.ts`. At integration, mount it beside `orderOperationsRouter`, after merchant retention/OAuth/operational guards and before the legacy root router, preserving the current protection chain.

#### Verification evidence

- Documented strict TypeScript check for services/direct dependencies/runtime test: **PASS**.
- Runtime tests: **5/5 PASS**.
- Static contracts: **4/4 PASS**.
- Audit fixture tests: **1/1 PASS**.
- Isolated `ServerOrdersPage.tsx` TypeScript/JSX check with local module shims: **PASS**.
- Full Workspace Build: **not run**.
- Bundled API build/spawned-server integration suite: **not rerun on the final correction environment**; the integration test source is present and must be executed after shared wiring.
- Independent GitHub review found no combined commit statuses and no GitHub Actions workflow runs for `bde53f403f63d680fd96c1d8b8a5e264010d9b41`; no CI green claim is recorded.
- Handoff states no production/Replit database, real Meta endpoint, customer data, or other real external service was contacted.

#### Review decision

- Accepted into the ordered integration queue at position 3, after auth/session and channels/messaging.
- Not merged during this review.
- Shared queue APIs, Meta-worker race closure, shared payment type, router mount, package/workflow scripts, PostgreSQL requests, and full integrated validation remain mandatory.
- No routine owner decision is required for accepting the lane into the queue.
- Current release decision remains **NO-GO**.

## Blocker ownership and routing

| Blocker | Assigned owner | Required resolution |
|---|---|---|
| Generated PostgreSQL schema drift | `parallel/db-migration-cutover` | Reconcile generated schema and committed artifacts against the final integrated domain model |
| Composite foreign-key failure for `manual_reply_requests` to `conversations(id, merchant_id)` | `parallel/db-migration-cutover` | Add/reconcile the required tenant-safe unique target and prove apply/smoke behavior |
| Migration candidate apply failure and 3 migration test failures | `parallel/db-migration-cutover` | Correct migration ordering/contracts and pass disposable PostgreSQL apply/tests |
| Orders/settings PostgreSQL contract | `parallel/db-migration-cutover` | Implement tenant-safe orders/settings/payment-decision/background-job contracts, optimistic versions, composite keys/FKs, RLS, migration provenance, and legacy-import rules after all domain requests are reconciled |
| Auth source/compiled-output drift | `parallel/auth-session-hardening` | Reconcile source and compiled/runtime output without weakening auth checks |
| Orders/settings queue v1 direct coordination vs channels queue v2 | Integration coordinator at shared wiring | Add central queue suppression/deletion APIs using the final queue lock; remove direct queue-file ownership from settings runtime |
| Auto-reply disable race for already-processing Meta reply | Integration coordinator using channels + orders/settings contracts | Recheck settings/version before credit reservation and before Meta send; suppress/rollback without new credit consumption when disabled |
| `PaymentStatus` contract/export failure | Integration coordinator plus orders/frontend contract owner | Resolve `PaymentStatus` vs `OrderPaymentStatus` consistently and update consumers without creating duplicate authority |
| Frontend build `PORT` contract | Integration coordinator plus frontend owner | Restore the documented build environment contract and prove workspace build |
| Public schema docs, browser-storage count/path drift, database source-hash drift, nested frontend package missing `build` | Integration coordinator plus each owning lane | Correct shared contracts and generated expectations after ordered integration |
| 22 dependency vulnerabilities, including 14 high | Integration coordinator | Review and update reserved package manifests/lockfiles; document unavoidable transitive risk; do not lower `pnpm audit --audit-level=high` |
| Native dependency review unavailable | Repository owner | Enable Dependency Graph/Advanced Security/native dependency review as appropriate and make the check operational |
| Observability router, readiness, metrics, dashboards, alerts, on-call routing | Shared wiring by integration coordinator; external settings by owner | Mount internally with access control, register real checks/metrics, test-fire alerts, assign ownership/escalation |
| Production backup schedule, encryption, retention, WAL/PITR, object versioning, credentials, and restore evidence | Repository/system owner with integration coordinator | Configure approved production services and verify a release-candidate restore drill without customer-data leakage |
| Privacy, consent, legal, retention, deletion, subprocessor, and support approvals | Owner/legal/support | Record named approvals before launch; CI cannot substitute for them |

## Shared-file decisions

### Orders/settings — received and mandatory at integration turn

| Shared path/area | Decision | Validation required |
|---|---|---|
| `artifacts/api-server/src/app.ts` | Mount `merchantSettingsRouter` beside `orderOperationsRouter` behind the existing merchant retention/OAuth/operational guards and before the legacy root router. | Authenticated settings GET/PATCH, suspended/rejected merchant, route-order, and tenant tests |
| `artifacts/api-server/src/services/durableJobQueue.ts` | Add `suppressMerchantJobs({ merchantId, type, statuses, result })` and `deleteMerchantJobs(merchantId)` using the final queue lock/store contract; return exact changed/processing counts. Replace settings direct queue-file coordination. | Queue v2 compatibility, cross-tenant isolation, processing lease preservation, deletion, crash/lock tests |
| `artifacts/api-server/src/services/metaWebhookWorker.ts` and entitlement/refund boundary | Re-read settings/version before credit reservation and immediately before external Meta delivery; if disabled/version-invalidated, suppress and do not consume new credit; roll back same-attempt reservation where necessary. | Claimed-job disable race, no-send, no-new-charge, rollback, `credit_consumed:false`, retry/crash tests |
| `artifacts/fawri/src/lib/types.ts` / `ServerOrdersPage.tsx` | Resolve shared payment status naming (`PaymentStatus` vs `OrderPaymentStatus`) once, using the existing canonical shared type rather than creating a competing contract. | Full frontend typecheck/build and payment-state UI tests |
| API/root package scripts | Add lane-requested unit, static-contract, spawned-server integration, and audit scripts without weakening tests. | Frozen install, exact scripts, full server build/typecheck/tests |
| `.github/workflows/**` | Quality lane owns final workflow integration. Run all four orders/settings script groups and preserve safe audit artifacts. | Quality Gates on exact integrated SHA; no real external services; artifact secret/PII scan |

### Catalog/inventory — deferred

- Mount `catalogOperationsRouter` only after final auth/session wiring.
- Replace legacy bot product authority with the tenant-scoped catalog adapter and remove dual authority.
- Add scripts/workflow coverage through final workspace conventions.
- Carry catalog backup and PostgreSQL requirements into quality/database integration.

### Channels/messaging — deferred and activation-blocked

- Mount merchant channel routes only after auth integration and correct route ordering.
- Bind the DLQ admin router to method/path-sensitive admin permissions.
- Replace plaintext OAuth token persistence and send-path token reads/logging with encrypted channel storage.
- Require production key management, rotation, PostgreSQL queue/refund contracts, CI, and fake-transport validation before activation.

### Quality/observability — deferred until final shared wiring

- Keep `createObservabilityRouter` unmounted until internal access control is defined.
- Add real readiness checks for PostgreSQL, durable queue persistence, object-storage metadata, migration state, and key-management readiness.
- Instrument authoritative queue/DLQ, webhook-signature, login-abuse, migration, and HTTP outcomes using bounded labels only.
- Configure dashboards, alert destinations, primary/backup on-call, incident channel, and escalation timers.
- Preserve strict security, dependency, migration, artifact, and release gates.
- Re-run all three workflows on the exact integrated SHA after domain/database merges and shared wiring.

## Database/schema request ledger

### Orders/settings

Forward the full handoff contract to `parallel/db-migration-cutover` and reconcile it with the final integrated domain model. Minimum required scope:

- `merchant_operational_settings` keyed by merchant with positive optimistic `version`, auto-reply/reply-language, bounded delivery/payment settings, timestamps, and `ON DELETE CASCADE` ownership;
- tenant-safe effective orders with unique/primary `(merchant_id, id)`, positive version, constrained order/payment states, terminal payment metadata consistency, and all mutation predicates including tenant/id/version;
- `order_payment_decisions` with composite tenant FK, immutable actor/provenance, confirm/reject/`legacy_import`, resulting-version constraint, request idempotency, and atomic linkage to the terminal order mutation;
- `background_jobs` settings-version contract, tenant ownership, dedupe/status/lease fields, result metadata, and indexed merchant/type/status/availability access;
- transactional auto-reply disable suppression for queued/retry jobs; claimed jobs rely on the worker-side recheck above;
- RLS for settings, orders, payment decisions, and background jobs with transaction-local merchant context and a separate audited administrative role;
- frozen JSON audits before migration, idempotent settings defaults, materialization of effective orders from base plus overlays, v2 decision import, and legacy terminal rows represented as `legacy_import` with `actor_type='system'`, source hash/file and migration batch ID rather than invented merchant actors;
- tenant counts/hashes before cutover, SQL-equivalent post-cutover audits, deterministic source manifests/hashes, and a frozen write window or transactional outbox/idempotency if dual-write is unavoidable.

### Catalog/inventory

Require tenant-safe catalog products/variants/options/identifiers/images, durable idempotency keys, transactional inventory mutations, composite tenant foreign keys, deterministic manifests/source hashes, reviewed cascade/retention, and aggregate variant-stock reconciliation.

### Channels/messaging

Require transactional durable jobs, channel connections with encrypted credential envelope/key ID, inbound-event dedupe plus enqueue, reply reservations/refunds, outbound delivery outcomes, tenant-safe constraints, database-time leases, `FOR UPDATE SKIP LOCKED`, and payload-free default administration.

### Quality-discovered PostgreSQL blockers

The database lane must also resolve and evidence:

- generated schema drift;
- missing unique target for the composite `conversations(id, merchant_id)` reference;
- PostgreSQL `42830` during migration candidate apply;
- all migration test failures;
- database source-hash/contract drift;
- deterministic generation and clean-tree validation on the final integrated model.

No database request is complete until the database handoff, generated migration, disposable PostgreSQL tests, backup/restore prerequisites, and final source-manifest reconciliation are reviewed.

## Conflict and deviation ledger

- No unresolved product-behavior conflict was introduced by the quality lane.
- Quality handoff final-run metadata intentionally trails the PR head. PR #4 and GitHub Actions are authoritative for `b473fb8397814aa7bd91e0e323dc6003f6ba96f6`.
- Red CI results remain blocking and must not be waived, suppressed, marked optional, or converted to green by reducing coverage/severity.
- Orders/settings final tree is allowlist compliant after documentation-path correction.
- Orders/settings has an expected integration incompatibility with channels queue storage: isolated settings runtime assumes queue store v1 while reviewed channels queue authority is v2. This must be eliminated through central queue APIs before the lane is considered integrated.
- `ServerOrdersPage.tsx` currently depends on a non-existent shared `PaymentStatus` export; the repository currently exports `OrderPaymentStatus`. This is a shared integration blocker already visible in Quality Gates, not grounds to let the domain branch edit reserved shared types.
- Processing Meta replies remain subject to the documented disablement race until the coordinator wires the two settings/version rechecks and same-attempt reservation rollback contract.
- The successful synthetic restore drill proves script behavior only; it does not prove production scheduling, credentials, encryption, retention, PITR, provider versioning, or legal approval.
- Observability components are inactive until secure shared wiring is completed.
- No Force Push or merge to `main` is authorized.

## Validation ledger

- Catalog review: 16 documented tests passed, 0 failed; isolated TypeScript checks passed; no CI run.
- Channels review: 13 documented tests passed, 0 failed; targeted TypeScript/audit/syntax/CLI checks passed; no CI run.
- Orders/settings review: 5 runtime + 4 static-contract + 1 audit test passed; service and isolated page TypeScript checks passed; full workspace build and GitHub Actions did not run on final SHA; spawned-server integration source exists and remains mandatory after shared wiring.
- Quality local/static evidence: 12 quality/security tool tests passed, workflow policy found 3 workflows and 0 violations, and high-confidence repository scanning found no secrets.
- Quality final CI:
  - `31137063434` quality gates: failure with browser-storage/observability and artifact safety passing;
  - `31137063654` security/supply chain: failure with static-security/lockfile integrity passing;
  - `31137063594` backup/restore: success.
- Full integrated workspace typecheck/build/tests, spawned-server orders/settings integration, tenant/auth/idempotency/payment/queue/refund tests, claimed-reply disable race tests, fake Meta transport, final PostgreSQL migration, production-like backup/restore, logs/artifact review, and owner/legal readiness remain pending.

## Owner requirements before release

- Enable and verify Dependency Graph/Advanced Security/native dependency review as appropriate.
- Verify branch protection, required checks, secret scanning/push protection, artifact access policy, and controlled dependency updates.
- Approve production backup destinations, encryption, retention, PITR, object versioning, credentials, RPO/RTO, and restore procedure.
- Provide named privacy, legal, consent, retention/deletion, subprocessor, and support approvals.
- Approve any future merge to `main` explicitly.

## Final go/no-go checklist

- [ ] All lane handoffs reviewed.
- [ ] Allowlist compliance verified for every lane.
- [ ] Domains integrated in the mandated order.
- [ ] Orders/settings central queue APIs and claimed-reply disable race are resolved.
- [ ] Shared payment-status contract compiles across the frontend.
- [ ] Plaintext Meta token persistence/fallback/logging removed.
- [ ] Production credential key management and rotation verified.
- [ ] PostgreSQL blockers and all schema requests resolved.
- [ ] Final migration generated and applied successfully to disposable PostgreSQL.
- [ ] Shared routes, observability, readiness, metrics, and alerts securely wired.
- [ ] Dependency vulnerabilities remediated or explicitly risk-reviewed without weakening gates.
- [ ] Dependency Graph/native review operational.
- [ ] Full server/frontend/database/contracts matrices pass on the exact integrated SHA.
- [ ] Browser operational-storage audit passes.
- [ ] Tenant/auth/idempotency/payment/queue/refund tests pass.
- [ ] Production backup/restore/rollback evidence verified.
- [ ] Logs and artifacts checked for secrets/PII/payloads.
- [ ] Legal/privacy/support approvals recorded.
- [ ] Draft PR status and release documentation updated accurately.
- [ ] Owner explicitly approved any merge to `main`.

**Current release decision: NO-GO.**