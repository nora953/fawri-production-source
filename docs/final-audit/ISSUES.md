# Fawri final audit — issue and decision ledger

Issues are not automatically defects. Classify as DEFECT, PROOF_GAP, EXTERNAL_DEPENDENCY, or PROCESS.

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-001 | PROOF_GAP | OPEN | Direct Neon connector returned tool-not-found errors. Need non-secret read-only DB role/readiness evidence before FA-004 PASS. Do not infer database is absent. |
| FA-I-002 | PROCESS | OPEN | GitHub branches page 1 has 100 results; full branch pagination and comparison required in FA-001. |
| FA-I-003 | PROCESS | OPEN | [Draft PR #476](https://github.com/nora953/fawri-production-source/pull/476) awaits review and evidence; not part of core freeze automatically. |
| FA-I-004 | PROOF_GAP | OPEN | Reported Claude offline cashier integration concern not supplied verbatim. Request precise reproduction/code path before reopening existing cashier tests. |
| FA-I-005 | EXTERNAL_DEPENDENCY | OPEN | Production provider activation, backups/PITR, durable media storage and release gates tracked in [release blockers](../FAWRI_RELEASE_BLOCKERS.md). |


| FA-I-006 | PROOF_GAP | OPEN / HIGH PRIORITY | Meta page-to-merchant routing under RLS: `listActiveMetaPageMappingsAuthoritative()` executes a cross-merchant `SELECT page_id, merchant_id FROM merchant_channels` through `withOperationalTransaction()`, which does not set `fawri.tenant_id`. Migration `0025_tenant_rls_policy_predicate_cutover.sql` sets the `merchant_channels_tenant_boundary` predicate to `fawri_tenant_or_audited_admin(merchant_id)`. If the deployed runtime role is subject to RLS and lacks a specifically authorized cross-tenant resolver, this SELECT may return zero rows. Validate actual role, table RLS flags, policy grants and a synthetic connected-page lookup in staging. Do not disable RLS or add BYPASSRLS to runtime; design a narrowly scoped, audited, least-privilege resolver if reproduction confirms. |

## Reopening a closed audit
Record exact commit/config delta or reproducible failure, affected components, minimal necessary tests, and closure evidence. No broad restart.

## Decisions
- 2026-10-10: freeze new features; stage-by-stage final audit; visual QA last.
- 2026-10-10: GitHub documents are continuity source; conversation memory is supplementary.
- 2026-10-10: Railway staging already exists; no duplicate environment creation.

## 2026-10-10 staging security follow-up (read-only)

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-007 | PROOF_GAP | OPEN / SECURITY REVIEW | On Neon `staging-runtime`, 94 public tables exist, 45 with RLS enabled and 49 without. The restricted runtime role has SELECT/INSERT/UPDATE/DELETE on non-RLS tables including `accounts`, `account_sessions`, `merchants`, `merchant_cashier_staff`, and `cashier_station_credentials`. This does not establish an API exploit: inspect authorization and least-privilege access, then run two-merchant negative access tests on disposable infrastructure before release. Do not blindly enable RLS on global/auth tables. |
| FA-I-008 | PROOF_GAP | OPEN | `staging-runtime` has 28 applied Drizzle migration records and 94 public tables; Neon's separate default `production` branch lacks the migration ledger. Verify deployed DATABASE_URL branch safely without publishing its value; never migrate the default branch accidentally. |
| FA-I-009 | PROOF_GAP | OPEN | `/ops/readiness` screenshot at 2026-10-10T18:17:58.935Z reports `ready`, `postgresql_authority: up`, `production_release_configuration: up`. Railway `FAWRI_DEPLOYMENT_MODE=staging` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE=fawri_staging_rls_runtime` were supplied by operator. This proves expected-role match for the readiness query, not complete tenant isolation or production release gate. Verify operational flows and safe branch target. |

FA-I-006 follow-up: GitHub `postgresMetaChannelAuthority.ts` still calls `listActiveMetaPageMappingsAuthoritative()` via `withOperationalTransaction()` without `fawri.tenant_id`; Neon staging has zero connected Meta channels, so real routing cannot yet be reproduced. Preserve RLS; test a synthetic mapping on disposable infrastructure and design a narrowly scoped resolver if needed.

FA-I-006 update (2026-10-10): The webhook middleware calls the authoritative page map before merchant authorization; missing page mapping returns HTTP 503. PostgreSQL-only map lookup is an all-pages query without tenant context. Migrations 0024/0025 use tenant-or-audited-admin RLS. Local Meta ingress integration tests do not prove behavior with the restricted staging role. Reproduce on disposable PostgreSQL before any least-privilege fix.
