# Fawri Current Checkpoint

Status: Main integration complete; repository release candidate is green.

## Repository state

- Default branch: `main`
- Integrated main SHA: `515dc33404e517d11060fa60cb6ef20d986b09ef`
- Final validated release-candidate SHA before merge: `92290d3f97e3ece81525a0b92d668d129e9df5ed`
- Immutable release-candidate checkpoint: `checkpoint/final-release-candidate-green-2026-09-20`
- Immutable post-merge checkpoint: `checkpoint/main-integrated-green-2026-09-20`
- Integration PR: #256
- Integration result: merged through a normal merge commit; no force push and no direct write to `main`.

The merged main tree is byte-for-byte identical to the validated release-candidate tree. The merge commit adds history only and changes no files relative to the validated release candidate.

## Final repository validation

PR #256 validated the full accumulated checkpoint chain against `main`.

Result:

- 38/38 current release-candidate checks passed.
- 0 failed checks.
- full repository build passed.
- full repository typecheck passed.
- repository security and dependency gates passed.
- lockfile integrity passed.
- canonical Drizzle history and migration reproducibility passed.
- committed migrations applied successfully to disposable PostgreSQL.
- migration rollback/reconciliation checks passed.
- Catalog UI cutover validation passed.
- online-order PostgreSQL authority validation passed.
- location routing engine validation passed.
- cashier lifecycle and operational cutoff validation passed.
- merchant, global merchant, admin, and subscription journeys passed.
- settings PostgreSQL authority validation passed.
- Meta webhook ingress and OAuth operational cutoff gates passed.
- dashboard/channel coherence passed.
- Knowledge embedding readiness passed.
- regional authority and physical-media lifecycle gates passed.
- storage audit and release-safety gates passed.

This establishes repository-level production-release code readiness for the integrated main tree. It does not establish that external production providers, credentials, infrastructure, or live traffic are ready.

## Completed integrated architecture

The current integrated tree includes the following completed code-owned areas:

### Cashier and employees

- cashier and employee management behavior completed,
- Arabic reference and English/Kurdish parity work integrated,
- pairing code uses ASCII/English letters and digits with LTR behavior where required,
- cashier lifecycle, shifts, sessions, permissions, reports, returns, voids, offline operations, and reconciliation preserved.

### Merchant locations and inventory

- canonical merchant locations,
- location-scoped inventory authority,
- cashier-to-location binding,
- bot location inventory cutover,
- default location behavior,
- PostgreSQL authority for location inventory.

### Routing and online fulfillment

- service-area resolution,
- location routing engine,
- PostgreSQL routing adapter,
- online-order fulfillment planner,
- atomic inventory commit,
- cancellation inventory compensation,
- single-location fulfillment behavior,
- fail-closed routing when context or inventory freshness is insufficient.

### Bot stock availability

Multi-location stock availability now uses the same canonical fulfillment/routing path as online orders instead of aggregating stock across locations.

Validated behavior includes:

- customer-area-aware routing,
- requested quantity checked against a single eligible location,
- stale inventory fails closed,
- no internal total stock disclosure,
- single-location behavior remains supported.

### Cashier reports

Integrated work includes:

- location authority,
- language parity,
- detail transparency,
- server-side detail filters,
- live refresh,
- online/offline parity,
- manual-discount return allocation and pricing corrections.

### Knowledge, Saved Answers, and Training

Integrated work includes:

- server-authoritative Saved Answers and Training management,
- pagination and server-side search,
- conflict and mutation coherence,
- learned-answer management pagination,
- knowledge audit pagination,
- fail-closed bounded retrieval behavior,
- approved-answer revocation and draft/conflict preservation,
- merchant-facing Knowledge cutover to `/api/knowledge`.

### Production credential provider hardening

AWS KMS is the selected production Meta credential provider architecture.

Repository safeguards now include:

- production requires explicit `FAWRI_META_CREDENTIAL_PROVIDER=aws-kms`,
- no implicit production fallback to the environment provider,
- KMS region must match the selected key ARN,
- AWS/network errors are sanitized into Fawri-owned error codes,
- production activation preflight coverage is part of CI,
- plaintext DEKs remain process-memory only and are zeroized on disposal.

## Important checkpoint chain

Historical safety checkpoints remain available and must not be rewritten.

Key checkpoints include:

- `checkpoint/cashier-employees-complete-2026-09-18`
- `checkpoint/multi-location-foundation-complete-2026-09-19`
- `checkpoint/location-inventory-authority-complete-2026-09-19`
- `checkpoint/cashier-location-inventory-cutover-complete-2026-09-19`
- `checkpoint/bot-location-inventory-cutover-complete-2026-09-19`
- `checkpoint/location-routing-engine-core-complete-2026-09-19`
- `checkpoint/online-order-atomic-commit-complete-2026-09-19`
- `checkpoint/cashier-reports-online-offline-parity-complete-2026-09-19`
- `checkpoint/knowledge-audit-pagination-complete-2026-09-20`
- `checkpoint/bot-multilocation-stock-routing-complete-2026-09-20`
- `checkpoint/aws-kms-production-activation-complete-2026-09-20`
- `checkpoint/final-release-candidate-green-2026-09-20`
- `checkpoint/main-integrated-green-2026-09-20`

## Remaining work

The remaining work is no longer a repository architecture rebuild. The main remaining items are production-environment and release-operations work plus final manual UX validation.

### Manual UI/UX validation

Still required before general launch:

- desktop/tablet/mobile responsive review,
- Arabic/Kurdish/English visual parity,
- RTL/LTR behavior,
- loading/empty/error states,
- accessibility and keyboard behavior,
- final performance/chunk-warning review,
- full-stack staging browser smoke validation.

### External production activation

Still requires real infrastructure/provider evidence:

- production PostgreSQL preparation and deployment migration execution,
- production secret-store configuration,
- AWS account/region, KMS key, workload IAM role and key policy,
- wrapped production DEK manifest and rotation policy,
- Meta production app credentials/callback/webhook approval and configuration,
- OpenAI production API credential and Knowledge readiness,
- real production backup/restore mechanism and recovery proof,
- supported production SaaS subscription billing provider/onboarding,
- production readiness gate and controlled smoke rollout.

These items must not be simulated by committing credentials or inventing provider behavior.

## Source-of-truth rule

From this checkpoint forward:

1. `main` at or after `515dc33404e517d11060fa60cb6ef20d986b09ef` is the integrated code source of truth.
2. `checkpoint/main-integrated-green-2026-09-20` is the immutable safety reference for this integration.
3. New work must branch from the current verified `main` or an explicitly later checkpoint.
4. No force push.
5. No direct feature writes to `main`; use reviewed branches/PRs.
6. Production credentials and external-provider configuration stay outside source control.
7. Database changes must continue to use the canonical migration -> validate -> apply -> verify process.

## Immediate next phase

The immediate next phase is **staging and production-environment readiness**, not another large code-authority rewrite.

The release sequence is documented in `docs/production-release-readiness.md` and the remaining blocker register is `docs/FAWRI_RELEASE_BLOCKERS.md`.
