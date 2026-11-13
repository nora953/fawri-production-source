# FIELD002 — clean isolated staging clone migrations 0043–0051 completed (2026-11-06)

## Exact target, authority and source

- **Target ONLY:** Neon project `round-fire-18493605`, **non-default, non-primary** branch `br-polished-mouse-b1proel7` (`fawri-field002-clean-staging-rehearsal-20261106`), explicitly database `neondb`, existing `neondb_owner` role. Neon branch metadata was checked independently: parent `br-falling-dust-b1km4gix`, `default=false`, `primary=false`, `protected=false`.
- Owner had authorized applying the existing committed **0028–0051** migrations to this isolated rehearsal branch. Earlier evidence covers 0028–0042; this checkpoint completes **0043–0051**. Source pinned to GitHub commit [`772feca2ce86496bbd732b84adcd39170106eebd`](https://github.com/nora953/fawri-production-source/commit/772feca2ce86496bbd732b84adcd39170106eebd) and `lib/db/drizzle/meta/_journal.json`.
- No original staging, default production, Railway, deployed runtime, customer account or external backup was targeted for SQL changes; migration **0052 deliberately excluded**.

## Real hosted execution, not a simulation

Executed the nine exact committed SQL files in index order on the isolated clone, each in its **own atomic SQL transaction**, plus the original source text's SHA-256 Drizzle ledger entry:

| Migration | PostgreSQL source work |
| --- | --- |
| 0043 | Seven cashier identity/credential/station RLS policies |
| 0044 | Four cashier discount/attribution RLS policies |
| 0045 | Scoped cashier approval mutation functions and original access controls |
| 0046 | Scoped cashier setting/invalidation functions and original access controls |
| 0047 | Support privacy lineage checks and five support RLS policies |
| 0048 | Emergency privacy lineage checks and four emergency RLS policies |
| 0049 | Order-item declarative RLS policy alignment |
| 0050 | Three merchant management authentication policies |
| 0051 | Five residual merchant privacy policies |

Each transaction included bounded `lock_timeout`/`statement_timeout`, a precondition for database `neondb` and owner role, a strictly contiguous Drizzle `created_at`/count precondition, zero historical notifications, zero other client backends at admission, and a postcondition for the next ledger record and notification count. For 0043/0044/0051 additional RLS-count postconditions were executed. On error, the intended atomic unit would fail rather than leave that migration partially committed. At 0049, an initial *local parsing precondition* detected a semicolon in a SQL comment and stopped **before invoking the database transaction**; the execution was then parsed by statement line, preserving the three exact SQL statements and hashing the **complete unaltered committed source file** for the ledger.

**All nine migration transactions returned successful responses**, without changing source SQL semantics or disabling migration guards.

## Independent post-commit SQL acceptance

Separately queried the same explicitly pinned Neon branch after the transactions:

- Drizzle records: **52 of 53**, maximum journal timestamp `1791936000023` = migration **0051**. **0052 was not run**.
- `public.notifications`: **0**.
- All **8/8** critical privacy tables have enabled RLS, **one reviewed policy each**, and an independent live PG18 policy SHA-256 expression matched the eight **exact expected fingerprints** committed in `artifacts/api-server/src/observability/runtime.ts`: **8/8 match, zero mismatches**.
- Independent recomputation of SHA-256 for every committed source file **0043–0051** from the pinned GitHub source against live `drizzle.__drizzle_migrations.hash`: **9/9 match, zero mismatches**.
- Unsafe creator-default function EXECUTE grants to the two historical runtime roles: **0**.
- Other application client backends at postflight inspection: **0**.

The eight privacy table row counts on **new clean clone** and on original staging were identical:

| Privacy table | Clean clone | Original staging |
| --- | ---: | ---: |
| `audit_events` | 283 | 283 |
| `notifications` | 0 | 0 |
| `merchant_channel_overrides` | 2 | 2 |
| `merchant_deletion_requests` | 1 | 1 |
| `manual_reply_requests` | 0 | 0 |
| `merchant_admin_notes` | 0 | 0 |
| `order_drafts` | 0 | 0 |
| `processed_channel_events` | 0 | 0 |

Independent read-only query of the original `staging-runtime` branch `br-falling-dust-b1km4gix` **after this rehearsal** still reported **28 migrations**, **0 notifications**, **0/8 critical RLS/policies**, and **2 unsafe historical creator-default function grants**, with identical aggregate privacy records. Therefore this result does **not** authorize using the original runtime for live tenant traffic.

## What is accepted, and what is not

**Newly accepted:** the previously blocked fresh-source **0043–0051 hosted migration rehearsal on the clean clone is COMPLETE**, with exact Drizzle source hashes, reviewed eight-policy fingerprints, zero experimental notices, unchanged original-staging aggregates, and atomic execution evidence. This is a genuine closure of the isolated clean-clone migration subcondition; no replay of 0028–0042.

**Still OPEN:** FIELD002 as a whole, R2 commercial backup/seed/import/archived-source promotion isolation, approved least-privilege hosted runtime + authenticated own/foreign/revoked SQL+mounted HTTP parity on the **fresh** clone and eventual original staging, independent original-staging ACL correction and 0028–0051 rollout, real deployment/source promotion controls, and the parent eight-table privacy/HTTP release gate. The previous older clone's hosted tests and GitHub CI are not a substitute for fresh-clone or original deployment acceptance.

**Separately BLOCKED:** `0052` role/owner bootstrap. No 0052 execution attempted. No merge, Railway variable change, commercial deployment or production/default Neon SQL operation.

**Canonical P0 accounting remains historically recorded as 29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**; full denominator and certified overall percentage are unknown. FIELD002 **OPEN**, parent privacy **OPEN**, launch **NO-GO**. PR #550 remains draft and unmerged. This checkpoint does not claim global CI green or certify merchant data isolation merely from an 8/8 policy fingerprint check.

No raw merchant IDs, customer records, notification content, credentials or connection strings were copied into this evidence.
