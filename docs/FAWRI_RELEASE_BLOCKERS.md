# Fawri Release Blockers

Status: Living release-blocker register for the finishing phase.

This file separates confirmed blockers from completed readiness work. A blocker is not considered closed until the repository contains evidence and the current checkpoint records validation.

## Blocker severity model

- `CRITICAL`: prevents a production release.
- `HIGH`: prevents declaring the affected subsystem production-ready.
- `MEDIUM`: must be resolved or explicitly accepted before release candidate sign-off.
- `EXTERNAL`: depends on a provider, credential, permission, approval, or deployment action that cannot be invented in code.

## Open blockers

### POS Global Hardening

Severity: HIGH

Status: OPEN

The cashier/POS is operational again, but final production hardening has not yet been completed across the whole lifecycle.

Required closure evidence includes:

- station pairing/re-pairing behavior,
- staff/manager permission enforcement,
- PIN lock/recovery behavior,
- shift lifecycle,
- operator session expiry/re-authentication,
- multi-device and station contention behavior,
- offline/online transitions,
- catalog synchronization,
- sale creation,
- inventory impact,
- retry/idempotency behavior,
- return/void/compensation behavior,
- pending-operation recovery,
- process/browser restart recovery,
- reporting/profit/cost authorization,
- tenant isolation,
- no duplicate sale or double inventory mutation under retry/race conditions.

### Catalog / Variants / Inventory Finalization

Severity: HIGH

Status: OPEN

The current Catalog/Variants implementation is preserved, but final product-editor and authority hardening remains part of the finishing plan.

Closure requires validation of product media, variant/options UX, SKU/barcode uniqueness, variant pricing, inventory set/adjust flows, error states, and Catalog-to-POS continuity.

### Global Merchant Journey / End-to-End Gate

Severity: HIGH

Status: OPEN

The project now has static and runtime consistency gates, but the final golden end-to-end journey suite has not yet been completed.

The target journey must prove, at minimum:

merchant authentication -> product/variant -> inventory -> cashier staff/station -> cashier login -> sale -> inventory effect -> reporting/order visibility -> safe session/shift completion.

Equivalent golden journeys are also required for Admin and Subscription lifecycle behavior.

### Merchant Dashboard Global Hardening

Severity: HIGH

Status: OPEN

All major merchant surfaces must be validated together against server/PostgreSQL authority, including dashboard overview, products, orders, conversations, cashier management, cashier reports, settings, channels, subscription, support, and related error/loading/unavailable states.

### Auth / Admin / Subscription Final Hardening

Severity: HIGH

Status: OPEN

Known preview authority-cutover defects have been fixed, but release sign-off still requires golden runtime coverage for merchant, Owner Admin, Assistant Admin, session rotation/revocation, password/security operations, lifecycle/access state, and subscription status transitions.

### Remaining Operational Authority Hardening

Severity: HIGH

Status: OPEN

Orders, Settings, Channels, Conversations, Knowledge, and related runtime authorities still require final integrated hardening and golden-path validation before release candidate sign-off.

### Final Database / Security / Operations Validation

Severity: HIGH

Status: OPEN

Final release validation must include migration/schema continuity, tenant isolation, idempotency/concurrency, observability, backup/restore rehearsal, security/supply-chain gates, and log/secret hygiene.

### UI/UX Final Polish

Severity: MEDIUM

Status: OPEN

Final responsive and interaction polish remains after authority/runtime hardening. It must cover desktop/tablet/mobile, RTL/LTR, Arabic/Kurdish/English, overflow, forms, loading/empty/error states, accessibility, and performance-sensitive large bundles.

## External blockers

### Production KMS/HSM provider activation

Severity: EXTERNAL / CRITICAL for production credential-vault activation

Status: OPEN

Provider-neutral envelope encryption and provider abstraction exist, but a real production KMS/HSM provider, credentials, permissions, operational ownership, and rotation configuration are not established in the repository checkpoint. Do not assume AWS, GCP, Azure, or another provider until explicitly selected and provisioned.

### Meta production OAuth / credential / live-send activation

Severity: EXTERNAL / CRITICAL for live Meta channel release

Status: OPEN

Meta connection/live-send behavior remains activation-gated. Production-safe OAuth configuration, credential storage/provider readiness, permissions, and live transport activation must be explicitly supplied and validated. Do not enable real Meta sends as part of tests.

## Closed blockers at current checkpoint

### Preview PostgreSQL authority mismatch

Status: CLOSED at `4cb6e262517841cea0174f31dd2693791e03d4e0`

The unified preview now requires operational, Auth session, and Subscription PostgreSQL authority rather than depending on manual exports that could leave the runtime in a partial cutover state.

### Cashier dashboard surfaces missing from active tree

Status: CLOSED at `746a5d08fb9f41c9085a6cc7244cc41c658449be`

Cashier staff management, cashier central reports, cashier operator routes, and related database/runtime authority were restored without replacing recent Catalog work.

### Stale cashier runtime expiry state

Status: CLOSED at `4cb6e262517841cea0174f31dd2693791e03d4e0`

Expired pairing challenges, station credentials, and operator sessions now have deterministic reconciliation. Open shifts are not closed merely because an authentication session expires.

### Invalid local cashier station binding produced generic failure

Status: CLOSED at `4cb6e262517841cea0174f31dd2693791e03d4e0`

The cashier client can recover from an invalid station credential by clearing only station-binding fields and returning to pairing while preserving stable device identity and local commerce stores.

### Static and runtime global consistency findings

Status: CLOSED for current checkpoint

Validated result at the checkpoint:

- Static: `critical=0 warning=0 review=0`
- PostgreSQL runtime: `critical=0 warning=0 review=0`

These audits must remain repeatable gates; a future non-zero result reopens the relevant blocker.

## Release candidate rule

A release candidate may be declared only when:

1. all code-owned CRITICAL/HIGH blockers are closed,
2. remaining EXTERNAL blockers are either completed or explicitly documented as intentionally disabled release surfaces,
3. static and runtime consistency gates pass,
4. golden end-to-end journeys pass,
5. database/security/backup/observability gates pass,
6. final browser and responsive validation passes,
7. the current checkpoint is updated to the release-candidate SHA.
