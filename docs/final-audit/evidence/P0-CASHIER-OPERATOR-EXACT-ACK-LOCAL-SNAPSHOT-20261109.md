# P0 — operator cashier exact local ACK snapshot, native IndexedDB

**Date:** 2026-11-09. **Parent:** `CASHIER-SYNC-SEQUENCE-001` (OPEN). **Scope:** active operator cashier outbox, post-server-ACK local deletion integrity. No change to provider payments, external hosted database, legacy cashout upload, or v2 movement-only protocol.

## Launch-critical bug

After a server returned a positive operation ID/device sequence/accepted entity list, the active operator client called `IndexedDbCashierAuthority.acknowledgeSynced([operationId])`, which deleted **all** current IndexedDB outbox rows matching that operation ID. An original outbox snapshot could change while a network request was pending, through local recovery, a competing writer or corruption. A newly added or replaced row was **not** in the original provider/server ACK, but the old deletion deleted it by shared operation ID anyway. That violates durable local replay evidence and can leave a device sequence unrecoverable.

## Change and fail-closed semantics

- [IDB source `5cc9f81f`](https://github.com/nora953/fawri-production-source/commit/5cc9f81f28e2dc9534aac899cea417996875d5df) adds `IndexedDbCashierAuthority.acknowledgeSyncedExact(operationId, expectedEnvelopes)`. Rejects missing, noncanonical or duplicate expected operation-entity identity, preserving existing local rows. Within **one IndexedDB readwrite transaction**, reads the *complete* operation-index collection, compares **both count and exact serialized local envelopes** (including original payload) against original uploaded snapshots and refuses mismatch as `CASHIER_LOCAL_ACK_EVIDENCE_MISMATCH`. Only after an exact match does it delete that exact collection; the same IndexedDB transaction rolls back on error.
- [Operator source `9a56ffeb`](https://github.com/nora953/fawri-production-source/commit/9a56ffeb833d37c6e8de0300bfcbddcd9da3ad6a) now calls `acknowledgeSyncedExact(operationId,envelopes)` only **after** the existing full server ACK verifier and operator binding, under the active app/Web Lock controls.
- [Existing operator contract tests updated `eedc77d4`](https://github.com/nora953/fawri-production-source/commit/eedc77d42b1cb5c9fcf1f967455a23d6a19d69f4) to require *exact snapshot* ACK, preserving original server response ID/sequence/entities/compensation checks.
- [Real native IndexedDB browser regression `0df99899`](https://github.com/nora953/fawri-production-source/commit/0df99899a09c8d54d7a23a5c40335a29203d67fa) now creates genuine local sales and inventory movements, tests that omitting an envelope from original expected ACK is denied, inserts **another durable row sharing the original operation ID into the native IndexedDB outbox**, verifies the exact ACK is denied and all database stores remain byte-for-byte unchanged, then tests a fresh exact ACK removes only the intended operation while the next operation's outbox, sale and inventory records remain persisted.

## Exact evidence and limits

- [Native Chromium IndexedDB #42702615503](https://github.com/nora953/fawri-production-source/actions/runs/42702615503): **COMPLETED SUCCESS**, job **129451002515**, output `P0_NATIVE_OUTBOX_REGRESSION` explicitly contains `"exactSnapshotAckProtection":true`; station binding/restore native browser checks also PASS. This is a real native browser database with synthetic transport, **not** a live production payment or physical device acceptance.
- [Operator targeted source contracts #42702615436](https://github.com/nora953/fawri-production-source/actions/runs/42702615436): **COMPLETED SUCCESS 37/37**, includes original ACK-before-delete, no double drain, boundary and historical binding guards.
- [Final quality #42702615806](https://github.com/nora953/fawri-production-source/actions/runs/42702615806) **PENDING** when this record was prepared; check exact full-typecheck and build conclusion before asserting overall quality acceptance. No new overall P0 percentage is inferred from these tests.

## Gate remains OPEN

This fixes one source-only data-loss boundary: local outbox must match exactly the successfully ACKed snapshot. It does not independently attest authenticated hosted SQL/HTTP authorization, original multi-device sequence, physical power loss/restore, unsupported v2 movement-only adjustments, retention or provider financial settlement. The separate legacy client may still use operation-ID bulk ACK, and is **not** claimed fixed or used for newly accepted operator behavior. Additional cross-tab/cross-device safety must be evaluated separately.

**Status:** `CASHIER-SYNC-SEQUENCE-001` OPEN, PR #550 draft, release NO-GO; no hosted DB writes, Merge, deploy, financial event or data deletion on actual users. Original known source register 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED, historic 29/45=64.4% is **not** overall project readiness.
