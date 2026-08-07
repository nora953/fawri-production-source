# Fawri parallel integration status

## Coordination snapshot

- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Integration branch: `parallel/integration-coordinator`
- Coordinator remote HEAD before this update: `99084135fb698c13ab1678bc1163b61e8be16ca6`
- Validated target after ordered integration: `hardening/postgresql-foundation`
- Direct modification of `main`: **not allowed**
- Replit Agent / Production DB: **not allowed**
- Latest coordinator review: `2026-08-07 15:54 +03:00` — PostgreSQL cross-lane schema reconciliation
- Current project release decision: **NO-GO**

## Ordered integration queue

1. `parallel/auth-session-hardening` — **reviewed and merged into coordinator**
2. `parallel/channels-messaging` — reviewed; next eligible lane
3. `parallel/orders-settings-finalization` — reviewed; queued after channels
4. `parallel/catalog-inventory` — reviewed; queued after orders/settings
5. `parallel/knowledge-ai` — reviewed; correction required before merge
6. `parallel/db-migration-cutover` — reviewed from DB-gate perspective; **cross-lane schema reconciliation required before merge**
7. `parallel/quality-observability` — reviewed; integrate after domains and PostgreSQL
8. Final shared wiring, complete validation, final migration candidate, backup/restore, and release-candidate checks

No merge to `main` or `hardening/postgresql-foundation` is authorized or performed by this coordinator.

## Lane status

| Lane | Branch | Status | Reviewed SHA | Integrated SHA | Notes |
|---|---|---|---|---|---|
| Auth/session/admin security | `parallel/auth-session-hardening` | reviewed; merged first; shared auth cutover implemented; validation pending | `d4f4ce2e3bd3cb1e27deb28a30249ce87bb0d25b` | `dc57eb52a4cae97730248897ebd314317f252b75` | 24 allowlisted files; documented TypeScript PASS and 15/15 focused tests; integrated HTTP/DB/full-build proof still pending |
| Channels/messaging | `parallel/channels-messaging` | reviewed; next in order | `22857159593aebeea0a12e6782581da6358080b3` | — | Allowlist compliant; 13 documented tests passed; activation requires shared token migration/key management/DB/fake-transport validation |
| Orders/settings | `parallel/orders-settings-finalization` | reviewed; queued third | `bde53f403f63d680fd96c1d8b8a5e264010d9b41` | — | 14 allowlisted files; 5 runtime + 4 static + 1 audit passed; central queue/race/type/router integration mandatory |
| Catalog/inventory | `parallel/catalog-inventory` | reviewed; queued fourth | `ce363f7105f33e942c6c47ef8907dfb9b59658f6` | — | 10 allowlisted files; 16 documented tests passed; full workspace validation pending |
| Knowledge/AI | `parallel/knowledge-ai` | reviewed; position 5 reserved; lane correction required | `a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744` | — | 32 allowlisted files; 13 runtime + 5 audit/static documented passes; parseable-invalid JSON runtime can silently drop state and must be fixed before merge |
| PostgreSQL migration/cutover | `parallel/db-migration-cutover` | **reviewed / reopened for cross-lane schema reconciliation / not merge-eligible yet** | final `b7f3756f907fec3ead05be6c5450c857f073a75c`; tested DB code `4dca348d33f827e3f53a26c993768f741accd525` | — | DB-owned migration safety gates pass, but final auth/channels/orders/catalog/knowledge schema requests are only partially represented; PR #5 remains draft/open/unmerged |
| Quality/observability | `parallel/quality-observability` | reviewed; accepted as final queued lane | `b473fb8397814aa7bd91e0e323dc6003f6ba96f6` | — | final quality/security runs red, backup/restore green; red gates are real release blockers |

## Auth integration status

- Auth lane was the only execution lane merged so far, through internal PR #6 into `parallel/integration-coordinator` only.
- Secure merchant/admin cookie/session v2 authority is mounted before protected domain routes; client legacy admin Bearer is rejected and client legacy merchant cookie is discarded at the cutover boundary.
- Frontend login is cookie-based with stable non-secret `X-Fawri-Device-Id`; forced admin password change revokes sessions and requires reauthentication.
- Work Monitor now uses v2 session/device state.
- Auth remains **not release-green** until repository-native build/typecheck, mounted HTTP abuse/tenant/role tests, browser-storage cleanup, and PostgreSQL transaction/concurrency proof pass on an integrated SHA.

## Knowledge/AI lane correction before merge

`parallel/knowledge-ai` at `a09f1a3b1b72d9dd7834db8ae6a4c0e971e38744` is reviewed but not merge-eligible because `KnowledgeStateStore.validateState()` currently filters/drops structurally invalid records in parseable JSON instead of failing closed. Before a corrected SHA is accepted:

1. structurally invalid runtime roots/schema/records must fail closed;
2. no mutation may overwrite a parseable-but-invalid runtime;
3. tests must prove the original file remains unchanged on refusal;
4. ambiguous legacy suggestion provenance must remain untrusted.

After that correction and when position 5 is reached, shared wiring must mount the knowledge router behind auth v2, activate Saved Answers/Training server pages, remove legacy dual authority, and keep Meta activation blocked until PostgreSQL/vector/fact/policy integration is complete.

# PostgreSQL lane review — 2026-08-07

## Identity, ancestry, and PR

- Branch: `parallel/db-migration-cutover`
- Coordination base: `b08c854f177953d3690c5dffde905fdb0c93eb09`
- Tested DB gate code SHA: `4dca348d33f827e3f53a26c993768f741accd525`
- Final lane SHA: `b7f3756f907fec3ead05be6c5450c857f073a75c`
- Final SHA is one documentation-only successor of the tested DB code SHA; `4dca348d... -> b7f3756...` changes only `docs/coordination/handoffs/db-migration-cutover.md`.
- Base-to-final ancestry: 27 commits ahead, 0 behind, coordination base is the merge base.
- Final diff: 33 files, all inside DB/migration ownership.
- PR #5: open, draft, unmerged, mergeable, base `hardening/postgresql-foundation`, head `parallel/db-migration-cutover`.
- No Force Push, no Production DB, no Replit DB.

## GitHub Actions evidence

Authoritative tested DB code SHA `4dca348d33f827e3f53a26c993768f741accd525`:

- PostgreSQL migration candidate `31179087597`: **SUCCESS**
- Complete migration safety `31179087427`: **SUCCESS**
- Complete schema candidate `31179087430`: **SUCCESS**
- PostgreSQL schema validation `31179087428`: **FAILURE**
  - migration tests: 76 total / 74 passed / 2 failed / 0 skipped inside the test suite;
  - the two failures are integration-only contracts owned by Orders/Settings activation:
    1. active Orders page is not yet resolving to the server-authoritative page in that DB-tree merge context;
    2. Settings path still exposes legacy `saveSettings` authority in that DB-tree merge context.
  - DB acceptance tests ran before those two failures and passed.
  - workflow steps after the aggregate test step are marked **SKIPPED**, not green.

The handoff-only final SHA `b7f3756f...` also triggered fresh runs with the same overall topology:

- PostgreSQL migration candidate `31179436419`: **SUCCESS**
- Complete migration safety `31179436715`: **SUCCESS**
- Complete schema candidate `31179436400`: **SUCCESS**
- PostgreSQL schema validation `31179437178`: **FAILURE**; later standalone workflow steps skipped after the aggregate test failure.

No broad-schema-validation Green claim is recorded.

## PostgreSQL-owned gate conclusion

The following DB-owned capabilities are accepted as demonstrated on disposable PostgreSQL for the tested DB code tree:

- deterministic committed migration reproducibility;
- dry-run safety;
- migration application;
- tenant/composite FK integrity for the schema actually present in the DB lane;
- migration idempotency;
- rollback rehearsal;
- commit-test rehearsal;
- source-hash/source-lineage revalidation immediately before writes;
- source/schema mutation fail-closed behavior;
- reconciliation;
- cleanup / restoration.

This acceptance is **not** equivalent to accepting the lane for merge, because the current DB schema predates several final cross-lane contracts.

# Cross-lane schema reconciliation result

## Decision

**DB lane is not merge-eligible yet.** The coordinator must not invent missing schema in shared integration files. `parallel/db-migration-cutover` is reopened only for a final schema reconciliation pass against the reviewed handoffs. PR #5 remains Draft/Open/Unmerged. A coordinator review comment records the exact requested deltas.

## Auth/session — partial, reconciliation required

Existing DB tree already contains generic `accounts`, separate `merchants`/`admin_profiles`, `account_sessions`, `trusted_devices`, and `login_attempts`. However the final auth contract is not fully represented.

Required DB follow-up:

- add OTP challenge persistence equivalent to final `auth_otp_challenges` contract: hashed target/code/IP, purpose, expiry, resend cooldown, attempts/max, used/revoked/supersession semantics;
- extend session storage to prove idle expiry + absolute expiry + rotation deadline/successor linkage + revocation reason/time, and preserve account/session security-version enforcement and required role/permission snapshot semantics;
- use trusted-device fingerprint semantics and enforce final trust/revoke contract and cap transactionally;
- make login-abuse storage bounded/privacy-safe rather than relying on raw phone/IP as the security record contract;
- provide sanitized auth audit storage that cannot persist password/OTP/token/secret/hash/cookie/authorization/customer payload fields;
- add a DB-enforced invariant so one account cannot simultaneously own merchant and admin profiles; separate per-table unique account IDs alone are insufficient;
- migration must abort on duplicate phone/ambiguous roles, never migrate weak legacy sessions, and use transactions/locking for rotation/revoke-all, OTP/reset, device and permission/security-version changes.

## Channels/messaging — partial, reconciliation required

Existing `merchant_channels`, `background_jobs`, `processed_channel_events`, messages and reply ledger cover part of the requirement, but final channel contracts are not complete.

Required DB follow-up:

- channel connection optimistic version and encrypted credential envelope/key-ID lifecycle contract;
- durable jobs lease-expiry/database-time claim semantics, requeue policy, settings-version observation for reply jobs, and privileged/encrypted payload handling;
- inbound event dedupe plus enqueue in one transaction with an explicit durable marker, scoped to provider/external event semantics;
- dedicated reply reservation/debit contract with unique external event and exact source/batch/balance provenance;
- dedicated reply refund state machine keyed uniquely to reservation, including pending/refunded/conflict and confirmed-failure provenance;
- outbound delivery result contract with `pending/sent/confirmed_failed/uncertain` and unique inbound-event/reply intent;
- transactionally atomic debit/refund and `FOR UPDATE SKIP LOCKED` worker claims;
- default administrative inspection must remain payload-free.

## Orders/settings — partial, reconciliation required

Existing DB tree has `merchant_settings`, tenant-safe `orders` with positive version/payment checks, and `background_jobs`. Final Orders/Settings contract still has important gaps.

Required DB follow-up:

- add `order_payment_decisions` with composite `(merchant_id, order_id)` FK, `confirm|reject|legacy_import`, payment channel/outcome, previous/result state, immutable actor provenance, expected/resulting version, idempotent request ID, and tenant/version uniqueness;
- add/link `last_payment_decision_id` or equivalent verified linkage from terminal order state to decision provenance;
- confirm/reject must lock the tenant order and update order/version + insert decision atomically;
- add background-job settings-version contract and transactional suppression of queued/retry reply jobs when auto-reply is disabled;
- complete settings consistency and bounded-length checks for delivery/payment notes and allowed payment-method combinations;
- implement requested RLS/transaction-local tenant policy for settings, orders, payment decisions and jobs with separately audited administrative access;
- migration must create `legacy_import` system decisions with source hash/file and migration batch for legacy terminal rows; do not invent merchant actors.

## Catalog/inventory — incomplete relative to final handoff

Existing `products`/`product_variants` contain tenant FKs, prices, stock and some identifiers, but they do not represent the final catalog runtime contract.

Required DB follow-up:

- product optimistic positive version, stable `external_ref`, low-stock threshold and compare-at/current-price constraints aligned to the runtime;
- variant price/stock/version/identity contract with tenant composite FK;
- variant option table with normalized option-name uniqueness and deterministic option-signature uniqueness per product;
- one tenant-scoped normalized SKU/barcode registry spanning both products and variants;
- image reference ownership table with URL/storage-key references only and no binary content columns;
- durable catalog idempotency key table with request hash/result reference/retention;
- inventory mutation ledger with before/after quantity, expected/result version, actor/reason/idempotency and transactional row locking/optimistic update;
- aggregate product stock vs variant stock invariant/reconciliation;
- all cross-table references remain tenant-composite and migration keeps deterministic source manifests/hash revalidation.

## Knowledge/AI — stale schema; replacement required

The current DB `knowledge.ts` is materially older than the reviewed Knowledge/AI handoff: it stores raw `training_requests.customer_message`, lacks the new optimistic/provenance constraints, and has no production vector store.

Required DB follow-up:

- saved answers: tenant/language/normalized-question uniqueness, positive version, active state, and hard `merchant_approved` provenance;
- training requests: store only bounded redacted customer preview + digest, intent/language/reason, suggested-reply provenance, status/rejection reason and positive version; **no raw customer message column** in the final knowledge training/audit authority;
- learned answers: positive version, explicit `approval_status`, source provenance, confidence, `safe_to_auto_reply`, examples/keywords, and tenant-composite FK to the training request;
- DB check/trigger: `safe_to_auto_reply=true` only when source=`merchant_approved` and approval status=`approved`; `openai_generated` never becomes approved/safe in-place;
- approval/rejection and provenance conversion occur transactionally with version increments;
- knowledge audit storage contains digest/length/signal/decision metadata only and forbids raw customer text;
- pgvector or equivalent embedding table keyed by merchant/kind/knowledge/model/content hash; tenant predicate must be applied before scoring; only active approved/safe knowledge is eligible; raw customer query must not be persisted;
- migration must fail closed on ambiguous legacy provenance and be rechecked against the corrected Knowledge lane SHA when available.

## Cross-domain RLS and migration generation

The currently promoted incremental SQL has no `ENABLE ROW LEVEL SECURITY` statements and does not contain the missing final contracts such as `order_payment_decisions`, auth OTP challenges, reply reservation/refund tables, or knowledge embeddings. The reopened DB pass must therefore:

1. reconcile the Drizzle source schema first;
2. add required RLS and audited administrative boundaries where requested;
3. regenerate deterministic snapshot/migration artifacts from committed schema rather than hand-editing generated SQL;
4. preserve dependency-safe application ordering without altering the SQL statement multiset;
5. extend migration source lineage/materialization for the new domain stores;
6. keep dry-run as default and all write modes explicitly guarded.

# DB lane acceptance criteria after reopening

A new DB SHA is required. The coordinator will not merge `b7f3756f...` as the final database lane. The corrected DB handoff must provide exact evidence for:

- all five reviewed cross-lane schema requests mapped to concrete tables/columns/enums/checks/FKs/indexes/transactions;
- deterministic migration and committed snapshot reproducibility;
- disposable PostgreSQL apply and second-pass idempotency;
- tenant-composite FK and RLS tests;
- Auth OTP/session rotation/revoke-all/device/permission concurrency tests;
- Channels enqueue/dedupe/lease/reservation/refund/outbound-delivery transaction tests;
- Orders payment-decision/legacy-import/settings-version/suppression tests;
- Catalog identifier/idempotency/inventory/variant-stock invariant tests;
- Knowledge privacy/provenance/version/composite-FK/pgvector cross-tenant tests;
- source mutation fail-closed;
- rollback;
- commit-test;
- reconciliation;
- cleanup/restoration;
- no Production or Replit DB.

After the corrected domain lanes and DB lane are integrated in the mandated order, rerun on the **actual integration coordinator SHA**:

1. broad PostgreSQL schema validation: target **76/76 PASS or a newer equivalent complete suite**, with no unexplained failures/skips;
2. standalone committed-migration reproducibility;
3. standalone migration apply/idempotency;
4. rollback;
5. commit/reconciliation/cleanup;
6. final source-hash/mutation gates.

The two current Orders/Settings integration-only broad-suite failures are to be fixed when Orders/Settings is integrated, not by weakening or falsifying the DB lane.

# Shared integration gates still pending

## Channels integration (#2)

- mount merchant/admin channel surfaces behind auth v2;
- remove plaintext Meta OAuth/send token persistence/fallback/logging and use encrypted credentials;
- enforce method/path-sensitive admin DLQ permissions;
- retain fake Meta transport and no payload exposure.

## Orders/settings integration (#3)

- mount settings router behind secure merchant operational access;
- add queue-v2 central `suppressMerchantJobs(...)` / `deleteMerchantJobs(...)` and remove direct settings ownership of queue file;
- re-read settings/version before reply credit reservation and again before Meta send; suppress/rollback without new credit on disable;
- resolve shared `PaymentStatus`/`OrderPaymentStatus` contract;
- rerun spawned-server/domain audits and broad contracts.

## Catalog integration (#4)

- mount catalog router behind auth v2;
- replace legacy bot product authority with tenant-safe server catalog adapter;
- do not keep dual product authority active.

## Knowledge integration (#5)

- first review the lane's structural fail-closed correction;
- mount router behind auth v2 and remove legacy dual knowledge/training authority;
- activate server pages/shared translations;
- inject authoritative fact resolver and server-only merchant policy;
- do not connect Meta decision engine until corrected PostgreSQL/vector/fact/policy integration passes.

# Quality / release blockers retained

Quality/observability final reviewed SHA: `b473fb8397814aa7bd91e0e323dc6003f6ba96f6`.

- Quality Gates `31137063434`: **FAILURE**
- Security/supply-chain `31137063654`: **FAILURE**
- Backup/restore `31137063594`: **SUCCESS**
- dependency audit previously reported 22 vulnerabilities including 14 high; do not lower `pnpm audit --audit-level=high`;
- Dependency Graph/native review, production key management/backups/observability/legal approvals remain owner/system prerequisites.

# Final go/no-go checklist

- [x] Auth lane reviewed and merged first into coordinator.
- [ ] Auth integrated build/HTTP/abuse/tenant-role/PostgreSQL tests pass.
- [ ] Historical browser token/session authority cleanup passes.
- [ ] Channels integrated second with plaintext-token/key-management gates closed.
- [ ] Orders/settings integrated third with queue-v2 APIs and reply-disable race closed.
- [ ] Catalog integrated fourth and dual bot-product authority removed.
- [x] Knowledge/AI reviewed at position 5.
- [ ] Knowledge/AI structural-runtime correction reviewed and integrated fifth.
- [x] DB lane `b7f3756f...` reviewed; tested DB code `4dca348d...` evidence recorded.
- [ ] DB cross-lane schema reconciliation completed on a new reviewed SHA.
- [ ] All five domain/auth DB contracts represented and migration regenerated reproducibly.
- [ ] Broad PostgreSQL validation passes completely on integrated coordinator SHA.
- [ ] Standalone migration reproducibility/apply/rollback/commit/reconciliation/cleanup passes on integrated coordinator SHA.
- [ ] Quality lane integrated after domains + DB and all matrices rerun on exact release SHA.
- [ ] Dependency vulnerabilities remediated/risk-reviewed without weakening gates.
- [ ] Dependency Graph/native review operational.
- [ ] Observability/readiness/metrics/alerts securely wired.
- [ ] Production backup/restore/rollback evidence verified.
- [ ] Logs/artifacts checked for secrets/PII/payloads.
- [ ] Legal/privacy/support approvals recorded.
- [ ] Owner explicitly approves any future merge to `main`.

**Current release decision: NO-GO.**
