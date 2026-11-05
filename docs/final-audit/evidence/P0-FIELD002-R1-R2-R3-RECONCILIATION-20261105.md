# FIELD002 — 2026-11-05 R1/R2/R3 source and isolated historical checkpoint

## Acceptance scope

This checkpoint adds a **fail-closed executable source-contract test**, not a customer-facing product-policy change. Previous isolated [hosted SQL/HTTP proof](P0-FIELD002-HOSTED-CLONE-SQL-HTTP-ACCEPTANCE-20261105.md) remains accepted for notification tenant boundaries, with 7/7 actual hosted tests and exact owned cleanup. Source branch: `fix/p0-provider-receipt-order-discovery-20261015`, PR #550. Original staging/production Neon and Railway were **not** changed, no deployment or PR merge.

## R1 — current 12-type field allowlist: now guarded for drift

Read current server `artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts` and the reviewed `responseFieldContract.types` in `P0-NOTIFICATION-PRODUCER-FIELD-MAP-20261025.json`. The current `NOTIFICATION_RESPONSE_VARIABLE_FIELDS` list matches all **12/12** declared per-type required+optional+permitted-extra fields exactly, in order; unknown/inherited type names require an own mapping property, and the server projects canonical `id/type/created_at/read_at` separately.

The existing actual SQL/HTTP suite `artifacts/api-server/tests/merchant-notification-privacy-http-postgres.integration.test.mjs` now adds **`FIELD002 twelve-type source projection allowlist matches reviewed response contract`**, which fails if any type/key drifts, if reviewed type count changes without review, if a reserved internal/identity field is added, or if the own-property guard is removed. This is a **new regression assertion**, not an assertion that code automatically provides commercial authorization of arbitrary new field policies.

Already accepted: the HTTP mapper minimizes to the declared per-type field list, hides stored-only extensions and unknown type variables, and leaves stored `variables` untouched. Still open: product approval for the deliberate compatibility change to unknown/custom clients; malformed-record list rejection is current behavior, not a migration or consumer discovery. The historical evidence JSON contains dated pre-implementation candidate notes (`serverPerTypeAllowlist=false`); those are **historical snapshots**, not today's source classification. Do not overwrite dated provenance.

## R2 — read-only isolated-clone history and writer limits

Fresh read-only SQL on **isolated** Neon `br-young-hill-b1x9vhlz` / `neondb` (2026-11-05) checked only aggregate type counts, nullable reference pairs and JSON shape; it copied **no IDs, credentials, variable values or customer payloads**:

| Persisted notification type | Rows | Complete source ref | Missing/incomplete source ref |
|---|---:|---:|---:|
| `inspection_session_request` | 11 | 11 | 0 |
| `subscription_balance_purchase` | 9 | 0 | 9 |
| `subscription_emergency_activated` | 2 | 0 | 2 |
| `subscription_expired` | 1 | 1 | 0 |
| `subscription_expiry_reminder` | 1 | 0 | 1 |
| `subscription_plan_event` | 3 | 0 | 3 |
| `support_reply_reminder` | 1 | 1 | 0 |
| **TOTAL** | **28** | **13** | **15** |

All 28 have JSON-object `variables`, all 28 are merchant-audience records. The **three legacy source/client-only types have 14 persisted rows**, disproving any claim of zero legacy SQL records. `pg_stat_statements` and `pgaudit` were **not installed on this clone**, so this aggregate cannot identify historical statement writers. Absence of source reference is **not** proof of corruption or an authorization to invent links, delete, backfill or rewrite records.

Read-only historical validation previously established 28/28 hosted record frontend-shape compatibility under the agreed SQL approximation; this checkpoint **reconfirms counts and missing linkage**, but does **not** claim new raw historical HTTP client acceptance, all alternate writers identified, or that archived deployments share the same writer set. The hosted 7/7 SQL/HTTP proof used synthetic notices and a local mounted router, not a replay of the 28 real historical payloads.

## R3 — source vs product intent, do not silently activate

- Eight notification types have bounded canonical callers and regression evidence, per the existing producer map.
- `operational_new_order` is an implemented **direct SQL helper** `notifyMerchantNewOrderPostgres` in `postgresOperationalNotificationAuthority.ts`; in the inspected `order-operations.ts` and `metaInboundMessage.ts` there was no call to it. A complete transitive call graph across all deployments was **not** established; do not assert global impossibility.
- Legacy `subscription_balance_purchase`, `subscription_plan_event` and `subscription_emergency_activated` are recognized frontend/read contracts but lack an accepted canonical PostgreSQL notification writer/caller path. In `postgresSubscriptionEntitlement.ts`, `subscription_emergency_activated` also appears as an **audit action_type**, which is not itself a notification insert.
- **Explicit product decision remains required:** whether new-order notification becomes an active canonical event, and whether all three historic subscription types stay **read-compatible only**, or get a separately reviewed new source/caller and migration. Default safe interim implementation is **no activation/no deletion**, preserving existing read contracts and historic records until policy sign-off.

## Next gate and proof rules

R1 implementation/source-drift regression now bounded; R1 product compatibility sign-off OPEN. R2 28-row snapshot and scope accounting bounded; true alternate-writer/client provenance + disposition OPEN. R3 producer intent OPEN pending product decision. No full eight-table hosted actor matrix, live deployment readiness, old-staging migration 0052 completion or P0 release approval follows. **FIELD002 OPEN; 0052 BLOCKED; release NO-GO**, PR #550 Draft/unmerged. Known register **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, complete inventory and certified full P0 percent unavailable.
