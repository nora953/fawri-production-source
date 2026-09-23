# Fawri Current Checkpoint

Status: Main integration complete; cashier reports/export polish and repository hardening are merged and validated; repository release candidate remains green.

## Repository state

- Default branch: `main`
- Integrated main SHA: `5f402a332ef6b9d145aeec326f7800a4e8147ffb`
- Final validated cashier reports/export SHA before merge: `f4cdf348655ba0c9370eb5e275b4c212683ffab2`
- Immutable release-candidate checkpoint: `checkpoint/final-release-candidate-green-2026-09-20`
- Immutable post-merge checkpoint: `checkpoint/main-integrated-green-2026-09-20`
- Immutable cashier reports/export checkpoint: `checkpoint/cashier-reports-exports-complete-2026-09-23`
- Immutable repository-hardening checkpoint: `checkpoint/repository-hardening-complete-2026-09-24`
- Latest repository-hardening PR: #281
- Latest reports/export integration PR: #271
- Earlier full integration PR: #256
- Integration result: merged through a normal merge commit; no force push and no direct write to `main`.

The original release-candidate checkpoint remains the immutable runtime safety reference. Later repository-hardening work was intentionally behavior-preserving but changed source organization, so the current `main` tree is no longer byte-for-byte identical to that earlier checkpoint. PR #281 revalidated the changed tree through repository typechecks, focused source contracts, translation-structure audits, and the full GitHub Actions suite.

## Final repository validation

PR #256 validated the full accumulated checkpoint chain against `main`.

Repository hardening on PR #281 subsequently closed the repository-maintenance blockers without intentional runtime behavior changes:

- localized copy outside translation authority: 0 files / 0 objects,
- high-confidence visible hardcoded UI copy: 0,
- general i18n parity remains 768/768/768 with 0 missing / 0 extra,
- admin i18n parity remains 299/299/299 with 0 missing / 0 extra,
- executable files at or above the 1,800-line critical threshold: 0,
- final Fawri typecheck passed,
- focused cashier source-contract tests passed 18/18,
- all 13 GitHub Actions workflows on the final PR head passed.

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

Integrated and manually validated work includes:

- location authority,
- language parity,
- detail transparency,
- server-side detail filters,
- live refresh,
- online/offline parity,
- manual-discount return allocation and pricing corrections,
- custom date ranges,
- Excel export with RTL worksheet presentation for Arabic/Kurdish,
- PDF print/export layout hardening,
- day-first operation dates,
- partial-profit disclosure beside the profit summary,
- explicit historical operation-attribution coverage without inventing missing staff/location/station data,
- final manual Excel/PDF review completed before PR #271 merge.

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
- `checkpoint/cashier-reports-exports-complete-2026-09-23`

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

1. `main` at or after `5f402a332ef6b9d145aeec326f7800a4e8147ffb` is the current integrated code source of truth.
2. `checkpoint/repository-hardening-complete-2026-09-24` is the latest immutable repository-maintenance milestone; `checkpoint/cashier-reports-exports-complete-2026-09-23` remains the latest feature-complete safety reference and `checkpoint/main-integrated-green-2026-09-20` remains the earlier full-integration safety reference.
3. New work must branch from the current verified `main` or an explicitly later checkpoint.
4. No force push.
5. No direct feature writes to `main`; use reviewed branches/PRs.
6. Production credentials and external-provider configuration stay outside source control.
7. Database changes must continue to use the canonical migration -> validate -> apply -> verify process.

## Immediate next phase

The immediate next phase is **staging and production-environment readiness**, not another large code-authority rewrite.

The release sequence is documented in `docs/production-release-readiness.md` and the remaining blocker register is `docs/FAWRI_RELEASE_BLOCKERS.md`.
