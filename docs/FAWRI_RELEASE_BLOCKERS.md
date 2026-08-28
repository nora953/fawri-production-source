# Fawri Release Blockers

Status: Living release-blocker register for the finishing phase.

This file separates confirmed blockers from completed readiness work. A blocker is not considered closed until the repository contains evidence and the current checkpoint records validation.

## Blocker severity model

- `CRITICAL`: prevents a production release.
- `HIGH`: prevents declaring the affected subsystem production-ready.
- `MEDIUM`: must be resolved or explicitly accepted before release candidate sign-off.
- `EXTERNAL`: depends on a provider, credential, permission, approval, or deployment action that cannot be invented in code.

## Open blockers

### Merchant Dashboard Global Hardening

Severity: HIGH

Status: OPEN

All major merchant surfaces must be validated together against server/PostgreSQL authority, including dashboard overview, products, orders, conversations, cashier management, cashier reports, settings, channels, subscription, support, navigation, and related loading/error/unavailable states.

Closure must also prove that no operational surface silently falls back to stale/local authority when a canonical server authority exists.

### Catalog / Variants / Inventory Finalization

Severity: HIGH

Status: OPEN

The current Catalog/Variants implementation is preserved, but final product-editor and authority hardening remains part of the finishing plan.

Closure requires validation of product media, variant/options UX, SKU/barcode uniqueness, variant pricing, inventory set/adjust flows, error states, and Catalog-to-POS continuity.

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

### Global Merchant Journey / End-to-End Gate

Severity: HIGH

Status: OPEN

The project has static/runtime consistency gates and the POS subsystem now has a completed golden lifecycle, but the final cross-subsystem golden journey suite has not yet been completed.

The target merchant journey must prove, at minimum:

merchant authentication -> product/variant -> inventory -> cashier staff/station -> cashier login -> sale -> inventory effect -> reporting/order visibility -> safe session/shift completion.

Equivalent golden journeys are also required for Admin and Subscription lifecycle behavior.

### UI/UX Final Polish

Severity: MEDIUM

Status: OPEN

Final responsive and interaction polish remains after authority/runtime hardening. It must cover desktop/tablet/mobile, RTL/LTR, Arabic/Kurdish/English, overflow, forms, loading/empty/error states, accessibility, and performance-sensitive large bundles.

Known non-blocking candidates include existing production-build sourcemap reporting warnings and large-chunk advisory warnings; these are not current POS correctness blockers but should be assessed during final polish/performance work.

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

### POS Global Hardening

Severity: HIGH

Status: CLOSED at operational close SHA `596333f3aad459f8e4fdc96a5837bfd7c9c9395d`

Closure evidence recorded in `docs/FAWRI_CURRENT_CHECKPOINT.md` includes:

- station pairing and stable binding behavior,
- staff/manager permission enforcement,
- PIN login and operator-session authorization,
- one-open-shift and one-live-session concurrency protection,
- server-mapped concurrent login conflicts,
- session expiry/invalidation behavior without deleting pending local operations,
- existing-station offline inventory authority management,
- heartbeat-independent optimistic configuration ETag and stale-write rejection,
- prevention of legacy endpoint bypass around versioned station configuration,
- offline tracked-inventory sale authority,
- local-first sale commit while disconnected,
- full operation outbox boundaries,
- strict ACK validation before durable local deletion,
- reconnect and automatic outbox upload,
- inventory reconciliation after ACK,
- no duplicate sale in the browser golden journey,
- online sale, return, and void lifecycle,
- returnability/void mutual consistency,
- report/profit/cost permission boundaries,
- History read-side operator visibility checks,
- Offline History navigation without generic failure,
- one cashier connectivity authority shared by POS/History/runtime,
- truthful Online/Offline browser state after actual cashier transport evidence.

Final browser golden evidence includes the tracked-inventory journey:

`stock 2 -> Offline sale 12,000 IQD -> reconnect -> auto-sync -> one completed/synced sale -> stock 1 -> Offline History opens and shows غير متصل`.

Focused validations in the closing sequence included `21/21`, `12/12`, and final connectivity `26/26` regression passes, successful Fawri typecheck/build, applicable API typecheck/build passes earlier in the phase, and clean `git diff --check` results.

### Preview PostgreSQL authority mismatch

Status: CLOSED at `4cb6e262517841cea0174f31dd2693791e03d4e0`

The unified preview requires operational, Auth session, and Subscription PostgreSQL authority rather than depending on manual exports that could leave the runtime in a partial cutover state.

### Cashier dashboard surfaces missing from active tree

Status: CLOSED at `746a5d08fb9f41c9085a6cc7244cc41c658449be`

Cashier staff management, cashier central reports, cashier operator routes, and related database/runtime authority were restored without replacing recent Catalog work.

### Stale cashier runtime expiry state

Status: CLOSED at `4cb6e262517841cea0174f31dd2693791e03d4e0`

Expired pairing challenges, station credentials, and operator sessions have deterministic reconciliation. Open shifts are not closed merely because an authentication session expires.

### Invalid local cashier station binding produced generic failure

Status: CLOSED at `4cb6e262517841cea0174f31dd2693791e03d4e0`

The cashier client can recover from an invalid station credential by clearing only station-binding fields and returning to pairing while preserving stable device identity and local commerce stores.

### Static and runtime global consistency findings

Status: CLOSED for the recorded checkpoint baseline

Validated baseline result:

- Static: `critical=0 warning=0 review=0`
- PostgreSQL runtime: `critical=0 warning=0 review=0`

These audits remain repeatable gates; a future non-zero result reopens the relevant blocker.

## Release candidate rule

A release candidate may be declared only when:

1. all code-owned CRITICAL/HIGH blockers are closed,
2. remaining EXTERNAL blockers are either completed or explicitly documented as intentionally disabled release surfaces,
3. static and runtime consistency gates pass,
4. golden end-to-end journeys pass,
5. database/security/backup/observability gates pass,
6. final browser and responsive validation passes,
7. the current checkpoint is updated to the release-candidate SHA.
