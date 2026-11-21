# CASHIER-OFFLINE-001 — decision and acceptance contract (2026-10-17)

Status: **PRODUCT DECISION REQUIRED; P0 OPEN; release NO-GO.** This document does **not** select a policy, change source code, or claim tests passed.

## Two mutually exclusive product policies

**A — Local sales expire:** An authenticated, server-signed offline license binds merchant, cashier/device, validity and server-issued time; local sales remain available only until the authorized expiry plus the proposed seven-day offline grace. After grace, block new local sales but preserve read/export/reconciliation of existing transactions and clearly display recovery steps. Grace and offline behavior must be explicitly approved, not inferred from implementation.

**B — Local sales remain available:** Subscription expiry restricts cloud-backed features only. The local POS continues recording sales offline. Reconnection, cloud upload and cloud entitlements must enforce server-side subscription checks, and the UI must not misrepresent local sales as synced or cloud-authorized.

## Required tests common to either policy

- Distinct merchant, cashier and device identities; no cross-tenant or cloned-device entitlement reuse.
- Client clock rollback/fast-forward, timezone change, browser storage clearing, corrupt/expired/tampered cached license and revoked session/device.
- Seven-day boundary where applicable: just before, exactly at, and just after expiry/grace; offline/reconnect transitions.
- Multiple cashiers and pro-rated common expiry after subscription consolidation; server authority on renewal, cancellation and revocation.
- Duplicate/replayed sale IDs, queued-sale reconciliation, eventual upload, refunds/returns and no silent data loss.
- Actual browser/POS integration and restricted-role server tests, not only structural cache validation.

## Decision owner questions

1. Choose A or B. Under A, confirm seven-day grace and whether sales created while offline during grace can sync after expiry. Under B, specify which cloud features are blocked while local sale stays available.
2. Confirm the license certificate signing/key rotation and revoked-device recovery policy, or authorize engineering to propose a design for approval.

Until answered, `CASHIER-OFFLINE-001` remains OPEN; do not close it based on passing cache validator tests. No production or hosted change is authorized by this document.
