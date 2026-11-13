# FT-01 — canonical 0000–0052 clean-schema PostgreSQL 18 disposable rehearsal PASS

**Date:** 2026-11-09 Baghdad (workflow UTC 2026-11-08 22:06).  
**Exact GitHub source SHA:** `70390a74372cf89c36e43d6792fb02264c72faca`.  
**Workflow:** [FT-01 isolated clean PostgreSQL 18 canonical schema rehearsal #42528386404](https://github.com/nora953/fawri-production-source/actions/runs/42528386404) → **COMPLETED SUCCESS**.  
**Job:** [fresh-canonical-schema #128876943837](https://github.com/nora953/fawri-production-source/actions/runs/42528386404/job/128876943837) → **COMPLETED SUCCESS**.  
**Scope:** CI-owned disposable loopback PostgreSQL **18**, DB `fawri_ci`, synthetic `fawri_ci` credentials only. **No Neon/database provider connection, no old data import, no deployment, no merge.**

## One bounded and directly launch-relevant proof

- Verified service is PostgreSQL **18**, target URL is **127.0.0.1/fawri_ci**, zero public tables and no Drizzle ledger before migration: `FT01_LOCAL_PG18_EMPTY_SOURCE_PASS`.
- Verified canonical source inventory with 53 reviewed migration files and separate 0052 stage hash/snapshot; source-only policy rejects old Neon branches and still marks 0052 **HELD_NOT_AUTHORIZED_FOR_HOSTED**: `FT01_SOURCE_ONLY_0052_HOLD_PASS`. Five source-inventory positive/negative tests passed.
- Reused the existing `lib/db/scripts/smoke-migration.mjs`, which expressly refuses remote host or DB other than `fawri_ci`. On this fresh PG18 it applied **all 53 canonical Drizzle migrations twice without drift**, stabilized dependency order, and verified canonical schema and relationships. JSON result:
  - `database: fawri_ci`
  - `snapshot: 0052_snapshot.json`
  - `tables: 97`
  - `enums: 69`
  - `composite_foreign_keys: 82`
  - `migrations: 53`
  - `applied_twice_without_changes: true`
  - `dependency_order_stabilized: true`
- Independent post-bootstrap SQL on the **same disposable PG18** proved exactly 53 migration history entries, 0 notifications, native RLS enabled across the **eight residual privacy tables** plus **two 0052 cashier stream/receipt tables**, no-login/non-elevated `fawri_cashier_retirement_owner`, and both expected cashier scoped read policies: `FT01_LOCAL_PG18_53_MIGRATIONS_10_RLS_STORAGE_PASS`.
- Terminal runner fence `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS` confirmed the workflow used the local CI URL, not any hosted connection. All job steps green.

## Interpretation and precise remaining gate

**BOUNDED ACCEPTED:** Fresh **canonical** 53-step migration source is structurally and relationally runnable on PostgreSQL **18** from an empty database; 0052 DDL/storage objects can be constructed and RLS/owner flags meet these specific local predicates. This is not just a generated complete-schema approximation, but the actual committed migration sequence (reused canonical local smoke runner).

**Still open:**
1. The owner's *actual new* Neon `crimson-cherry-65705041` / `br-holy-waterfall-b993zglb`, DB `fawri`, PG18 was separately owner-verified **empty** via read-only SQL; **no migration has run there**. Its endpoint identity, owner role semantics and Neon-specific DDL permissions/backup/rollback remain unproven. The current Neon connector is pinned to the old project and must not be used as fallback.
2. `0052` hosted storage schema rollout is distinct from its **incomplete trusted financial receipt/device protocol**. The API production prelistener **requires** 0052 cashier storage readiness. Do not omit 0052 and pretend the API can launch, and do not treat local DDL success as protocol/operator acceptance. Preserve source protocol fail-closed.
3. Three permanent independent least-privilege **tenant/auth/operator LOGIN** principals and their actual host function grants/effective privileges, 8/8+ broad runtime RLS/policies, hosted SQL+HTTP actor matrix, and deployed source/inbound restore boundary are **not** proven by disposable superuser PG18.
4. Before even test-only schema writes on new hosted project: separately approved explicit target, reviewed migration runner/source SHA, snapshot/restore strategy, lock/timeout/cutover and secrets handling. The source-only current `scripts/run-postgresql-migration-cutover.mjs --write` remains intentionally disabled; do **not** bypass it. Later live merchant traffic needs robust backup/PITR, payment/Meta and release signoff.

**Status:** FT-01 PG18 empty canonical migration/0052 storage **LOCAL REHEARSAL PASS** only; original staging kept untouched, no P0 hosted gate closed, `FIELD002 OPEN`, `0052 HOSTED BLOCKED`, Draft PR #550, commercial **NO-GO**. Existing previous isolated SQL+HTTP 7/7 and original staging read-only restore retained, not rerun.
