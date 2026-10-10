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

| META-001 | Meta webhook page mapping with restricted RLS role | OPEN_PROOF | Reviewed webhook middleware, page directory, PostgreSQL channel authority, migrations 0024/0025 and local Meta ingress test (2026-10-10) | Potential RLS-filtered lookup; no restricted-role reproduction or application change. |

| AUTH-001 | PostgreSQL merchant management route authorization (source review) | SOURCE_REVIEW_PASS_RUNTIME_OPEN | `artifacts/api-server/src/routes/auth-merchant-management-postgres-routes.ts`, `postgresMerchantManagementAuthority.ts`, reviewed 2026-10-10 | Admin notes require secure admin session and `manage_merchant_status`; channel overrides require secure admin session and `manage_channels`. Status changes require `manage_merchant_status`; deletion request creation requires assistant admin and that permission; rejection/deletion and legacy import require owner role. Deletion additionally checks owner password. No bypass demonstrated on these routes. Runtime negative-permission and session-revocation tests still required. Service methods alone are not an authorization boundary. |

| RLS-TEST-001 | Existing restricted-role tenant regression coverage (source inspection) | TEST_PRESENT_EXECUTION_UNVERIFIED | `artifacts/api-server/tests/merchant-management-tenant-rls.integration.test.mjs`, `merchant-deletion-tenant-rls.integration.test.mjs`, inspected 2026-10-10 | Both enforce local `localhost`/`127.0.0.1` DB (`fawri_ci` or `fawri_final_audit`), create temporary NOLOGIN/NOBYPASSRLS/NOINHERIT role, and verify `current_user`. Management suite checks audited cross-tenant directory access, invalid/suspended admin denial and pooled context reset; deletion suite verifies merchant A purge preserves merchant B and pooled context reset. Tests mutate their disposable local DB; existence is not evidence of execution on current main or staging. Meta webhook restricted-role mapping and non-RLS account/cashier authorization are not covered by these two suites. |

| CASHIER-AUTH-001 | Cashier station/operator token-device-merchant authorization source review | SOURCE_REVIEW_PASS_RUNTIME_OPEN | `artifacts/api-server/src/middleware/cashierStaffSession.ts`, `src/services/postgresCashierStaffAuthority.ts`, cashier isolation/durable-binding/concurrency test files, inspected 2026-10-10 | Station authentication hashes token and joins credential to station on station+merchant, enforces device binding, active status, credential version/expiry and merchant operational access. Operator authentication additionally joins staff, shift and station on merchant IDs, requires active/unexpired session, current staff version, open shift, and permission snapshot; missing permission yields 403. Middleware applies entitlement with grace, except explicitly flagged historical sync. Existing `cashier-station-durable-binding.test.mjs`, `cashier-merchant-catalog-isolation.test.mjs`, and `cashier-operator-login-concurrency-hardening.test.mjs` inspect source patterns rather than execute real cross-device/cross-merchant HTTP attacks. Runtime negative-case tests with isolated local PostgreSQL remain OPEN. |
