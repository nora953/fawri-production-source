# Fawri final audit — evidence register

Evidence statuses: HISTORICAL_PASS | CURRENT_VERIFIED | OPEN_PROOF | NOT_CHECKED. No status means universal correctness.

| ID | Scope | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| BASE-001 | Core 16-phase freeze (2026-10-07) | HISTORICAL_PASS | [freeze report](../fawri-core-freeze-audit-2026-10-07.md) | Includes architecture, PostgreSQL/RLS, cashier golden journeys, auth, localization, UX, resilience, observability, privacy, backup drill and regression. No fresh rerun. |
| OPS-001 | Railway service deployed from main SHA 56d7ac2 | CURRENT_VERIFIED | Railway `fawri-staging/fawri-web` metadata, inspected 2026-10-10 | SUCCESS 2026-10-09; 1/1 online. |
| OPS-002 | Railway HTTP last 24h | CURRENT_VERIFIED | Railway HTTP metrics inspected 2026-10-10 | 1487 requests; 0 server 5xx; does not prove functional journeys. |
| OPS-003 | PostgreSQL connectivity, RLS role and migrations | OPEN_PROOF | Railway has DATABASE_URL variable name; Neon connector failed | Variable presence is not connection proof. |
| GIT-001 | All GitHub branches reconciled | NOT_CHECKED | GitHub branches first page 100 entries | Full pagination and compare pending. |
| GIT-002 | Open PR inventory | CURRENT_VERIFIED | [PR #476](https://github.com/nora953/fawri-production-source/pull/476) | Draft at inspection; do not auto-merge. |
| CORE-001 | Offline cashier external discrepancy | OPEN_PROOF | Prior freeze report; no exact Claude finding supplied | Require reproducible claim and targeted test; do not repeat all cashier QA. |
| REL-001 | External provider production activation | OPEN_PROOF | [release blockers](../FAWRI_RELEASE_BLOCKERS.md) | Out of core freeze scope; production credentials, provider cutover and hosted backups remain distinct. |

## Recording template
`ID | commit | files/config touched | expected behavior | test/evidence | finding | severity | disposition | reopen trigger`

## 2026-10-10 live staging evidence (read-only)

| ID | Scope | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| OPS-004 | Railway staging readiness and expected DB role | CURRENT_VERIFIED | Operator-provided `/ops/readiness` screenshot, timestamp `2026-10-10T18:17:58.935Z`; source `artifacts/api-server/src/observability/runtime.ts` | `ready`, `postgresql_authority: up`, `production_release_configuration: up`. Expected role `fawri_staging_rls_runtime` matches `current_user` at probe time. Does not prove every transaction or release-gated RLS assertion. |
| DB-001 | Neon `staging-runtime` schema and migration ledger | CURRENT_VERIFIED | Read-only Neon connector SQL, branch `br-falling-dust-b1km4gix`, 2026-10-10 | 94 public tables, 28 Drizzle migrations, 1 merchant, 0 channels; branch-specific evidence only. |
| DB-002 | Runtime RLS and grants | CURRENT_VERIFIED | Read-only Neon `pg_class`, `pg_roles`, `has_table_privilege` queries, 2026-10-10 | 45 tables RLS-enabled, 49 not. Restricted role `fawri_staging_rls_runtime` has no BYPASSRLS, but has broad grants on non-RLS account/cashier tables; authorization and negative access proof remain OPEN. |
| DB-003 | End-to-end tenant isolation and Meta routing | OPEN_PROOF | `artifacts/api-server/tests/global-merchant-postgres-http-journey.integration.test.ts`; `postgresMetaChannelAuthority.ts` | Existing golden journey requires local `fawri_ci`; cannot safely run against live Neon. Meta page routing cross-tenant query lacks tenant context; no connected staging pages to reproduce. |

OPS-003 remains historical OPEN_PROOF for its original 2026-10-10 snapshot; newer evidence above supersedes its connection-only portion. Production release and backup readiness remain unverified.
