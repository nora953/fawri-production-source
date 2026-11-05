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

## 2026-11-05 security history scan, verified immutable fixture spans

The newest FIELD002 R1 regression passed in actual notification SQL/HTTP CI. A separate full-history security check reported three `credential-url` findings in old revisions of the synthetic FIELD002 connection-plan **test** file; current working tree and dependency candidate security check were clean. The three historical blobs are `d739b637f04a36187727eed4714ea29958b27919`, `03acd56b7185a1be6b7ab0e3e4b0b997997009cc`, and `65f004befa5e5d6c8e4c8cbf8f3d6777d5aeaef8`. Direct blob reads established that every detected substring had username `neondb_owner` and the deliberately encoded `encoded%40fixture` test password; **the regex match ended at a source-code quote, not a literal database host**. This is not a usable connection URL. The current test builds the synthetic URI at runtime instead.

`scripts/security-final-audit.mjs` now classifies **only** those three immutable blob/path/rule/index/length/exact-content combinations as previously reviewed fixture literals, with a regression proving altered blob, path, rule, span, password or hostname still fails. No blanket scanner suppression, real credential exception, force-push or Git history rewrite. The requirement remains a **passing current branch history scan**, not merely a source-level workaround. If the full-history CI scan does not pass, this checkpoint is **not** accepted as a security closure.

## 2026-11-05 R3 source correction — three JSON writers have real legacy route callsites

A refreshed **precise source review** found three concrete *AuthDb/JSON* writer functions in `artifacts/api-server/src/routes/authRuntimePart3.ts`: `appendMerchantBalanceNotification` for `subscription_balance_purchase`, `appendMerchantSubscriptionPlanNotification` for `subscription_plan_event`, and `appendMerchantEmergencyActivationNotification` for `subscription_emergency_activated`. They are actually called from legacy subscription routes: `authRoutesPart3.ts` for admin `PUT/PATCH /merchants/:id/subscription` and `authRoutesPart1.ts` for merchant `POST /subscription/emergency`. Thus “legacy source/client-only” refers to the **lack of accepted *canonical PostgreSQL notification* writers**, **not** a lack of any old JSON business caller.

In the current application, the PostgreSQL entitlement router is mounted in `auth-security.ts` before legacy routing and owns those three corresponding HTTP paths in required mode; `app.ts` mounts secure auth before the `enforceLegacyAuthProductionCutoverGate`, which returns **410** on unresolved `/api/auth/*` requests before the legacy JSON router. Source-contract test `FIELD002 three legacy subscription notification writers remain behind PostgreSQL cutover` now fails if any exact legacy writer, callsite, PostgreSQL path, authority switch, router precedence or required-mode fallback fence drifts. This is **additional source CI**, not a new hosted runtime test or an approval to re-enable old JSON subscription mutations. PostgreSQL subscription functions must not silently begin emitting historic notice types without a new product contract; historic records remain readable via the reviewed twelve-type response projection.

**R3 policy still OPEN:** user/product-owner must choose whether direct new-order notification becomes a supported caller and whether these three old events remain history-only under PostgreSQL or receive a new fully validated canonical writer. No new code path was activated, no historic source refs or data changed, FIELD002 still OPEN/NO-GO.

## 2026-11-05 — product-owner policy approval and bounded R1 client compatibility repair

The product owner explicitly approved the adjusted four-part policy in the conversation: (R1) only reviewed notification response fields, no unsafe extras and compatibility validation; (R2) preserve 28 historical rows and investigate 15 incompletely sourced records without relinking/deleting, with legal/business retention to be decided separately; (R3) preserve the three legacy subscription types **for PostgreSQL read compatibility only** (mark-as-read of an authorized legacy notice remains permitted, while no new PostgreSQL producer is authorized); and defer activation of the direct new-order notification until the order-commit, replay, tenant-isolation, rollback and product activation tests are completed. Formal machine-readable record: [P0-FIELD002-APPROVED-NOTIFICATION-POLICY-20261105.json](P0-FIELD002-APPROVED-NOTIFICATION-POLICY-20261105.json). This is a release policy scoped to required PostgreSQL authority, not an instruction to erase old AuthDb JSON behavior during non-required compatibility mode.

**R1 implementation change:** `artifacts/fawri/src/lib/merchantNotificationsAuthority.ts` previously rejected the **entire valid list** if any server-projected historical unknown type was present. The server already emits canonical metadata only for unknown types. The client now safely **skips unsupported metadata-only types** while rendering verified known notifications, and still fails closed on malformed supported types, invalid metadata, or any unsupported row carrying extra keys. Existing individual mark-read stays strict; persisted SQL records and even received JSON objects remain unchanged. Frontend unit tests cover mixed known/unknown and malicious/invalid records; existing SQL/HTTP suite now tests the approved policy JSON against the 12-type manifest, the client type list, the non-activation of new order at two reviewed callsites, and the absence of a notification INSERT in the current PostgreSQL subscription authority. These are explicitly **bounded callsite checks**, not a formal global call graph. No original Neon, Railway, deploy or merge.

**Gate interpretation:** R1 product decision now APPROVED, subject to CI and a necessary backward-compatible rollout to older clients; R3 product intent now APPROVED with no activation, subject to continued source/CI verification. R2 preservation APPROVED but writer provenance and an eventual compliant retention decision remain OPEN. FIELD002 as a whole OPEN, 0052 BLOCKED and P0 NO-GO until complete gate requirements are proven. These product approvals must not be counted as full gate closures.

## 2026-11-05 — FIELD002-R2 isolated clone source linkage and SQL writer audit

[Detailed bounded writer inventory, 15 null-source reference proof and exact read-only SQL](P0-FIELD002-R2-SQL-WRITER-REACHABILITY-20261105.md). This adds a source-only regression check guarding five known SQL INSERT sites and obsolete support helper reachability. No historical writer was attributed without provenance; R2 remains OPEN for external/deployed writer evidence and separate retention decision.
