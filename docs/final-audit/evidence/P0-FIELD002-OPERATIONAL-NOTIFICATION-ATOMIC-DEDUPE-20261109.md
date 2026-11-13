# P0 FIELD002 residual tenant notification — atomic PostgreSQL producer idempotence race

**Date:** 2026-11-09. **Source-only correction accepted**; parent `P0-RESIDUAL-MERCHANT-PRIVACY-001/http` and `P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX` remain OPEN until complete independent hosted/actor SQL+HTTP acceptance. No original Neon or Railway changes.

## Defect and bounded source fix

The accepted PostgreSQL notification producer `insertOperationalNotification` in [`postgresOperationalNotificationAuthority.ts`](../../../artifacts/api-server/src/services/postgresOperationalNotificationAuthority.ts) used **separate `SELECT` then `INSERT ... ON CONFLICT (id) DO NOTHING`**. If two *concurrent merchant-scoped transactions* queried before either committed, both could report `deduplicated:false` even though the unique constraint persisted only one notification. The code therefore incorrectly represented who performed the write, undermining replay observability and idempotence result semantics.

[Fix commit `8b10106e`](https://github.com/nora953/fawri-production-source/commit/8b10106e3be2e8a5d3615f62cf3680988092697f): one atomic `INSERT INTO notifications ... ON CONFLICT (id) DO NOTHING RETURNING id` inside the **original** trusted tenant-scoped `withMerchantOperationalTransaction`, returning `deduplicated: inserted.rows.length === 0`. This removes the stale preliminary `SELECT`. It does **not** relax RLS, read privileges, source-reference validation or notification type policies and never overwrites an existing notification's fields/read timestamp.

## Exact isolated SQL and real HTTP proof

- [GitHub Actions notification privacy HTTP matrix **#42708081051**](https://github.com/nora953/fawri-production-source/actions/runs/42708081051), **COMPLETED SUCCESS** on source [test commit `6193a0b6`](https://github.com/nora953/fawri-production-source/commit/6193a0b6e7952b55d995b38f39956ce96c2fc8cf). The existing full application notification suite gained an actual simultaneous PostgreSQL producer test, not only a static function-source assertion. The runner emitted:

  `P0_NOTIFICATION_ATOMIC_INSERT_RACE {"actualPostgres":true,"restrictedTransaction":true,"merchantCount":2,"calls":8,"distinctNotices":2,"newWinners":2,"deduplicatedLosers":6,"peerDenied":true,"firstFieldsUnchanged":true,"hostedAccepted":false}`

- Four real concurrent calls to the **same** source event for merchant A, and four for merchant B, resulted in **one real insert and three database-confirmed deduplications per merchant**, with two distinct tenant-keyed IDs and **exactly two SQL rows**. Cross-merchant authenticated HTTP mark-read returned 404, own authenticated HTTP list exposed only the correct own notification projected through the existing frontend validator, and repeated subsequent sends did not alter the stored canonical fields or timestamp.
- [Full quality run **#42708082257**](https://github.com/nora953/fawri-production-source/actions/runs/42708082257) **all 4 jobs COMPLETED SUCCESS**: full-build, full-typecheck (API and UI tests), translation-structure-audit, quality-tool-tests.
- No provider payment flow was activated. The direct `operational_new_order` helper remains unactivated by default per approved FIELD002 R3 policy, three historical subscription legacy notification types remain PostgreSQL read-compatible only, and historical notice records are not deleted or rewritten.

## Bounded remaining acceptance

This corrects a real race in the **producer result**, without claiming whole notification, FIELD002 or privacy gate closure. Still pending: real commercial/staging restricted LOGIN and independent scope/tenant-role privacy SQL+HTTP parity, associated 0052 source adoption, historical R2 writer provenance/retention and relevant deployed client compatibility.

**Gate:** FIELD002 parent / residual merchant privacy OPEN; PR #550 DRAFT; **NO-GO**. Historical 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED = 64.4% of 45 known source-gate rows, not global P0 completion. No hosted database writes, merchant activation, merge or deploy.
