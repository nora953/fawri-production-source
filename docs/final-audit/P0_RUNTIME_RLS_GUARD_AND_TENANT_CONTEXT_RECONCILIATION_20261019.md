# P0 runtime RLS guard and tenant context reconciliation — 2026-10-19

**Decision: NO-GO. Source review and isolated read-only SQL only; no hosted rollout or fixture writes.**

## Verified application implementation
- `artifacts/api-server/src/services/productionReleaseReadiness.ts`: `productionReleaseGateRequired` returns true for explicit `FAWRI_DEPLOYMENT_MODE=production`, false for explicit staging/development; otherwise follows `NODE_ENV=production`. Thus staging-mode deployments do **not** execute the production RLS assertion; the Railway environment *name* `production` is not sufficient to infer the process deployment mode.
- `artifacts/api-server/src/services/postgresRuntimeRlsSecurity.ts`: `assertProductionDatabaseRlsReady` rejects effective and authenticated roles with SUPERUSER/BYPASSRLS, ownership or reachable privileged roles, and missing/RLS-disabled protected tables. Its authenticated `session_user` checks prevent a privileged login being misclassified as safe merely by `SET ROLE`.
- `artifacts/api-server/src/services/operationalPostgresAuthority.ts`: `withMerchantOperationalTransaction(merchantIdValue, work)` validates a nonempty merchant ID up to 200 characters, opens a transaction, and executes `SELECT set_config('fawri.tenant_id', $1, true)` before invoking the work callback. `true` makes the setting transaction-local; the wrapper does **not** itself authenticate/authorize the supplied merchant ID. Its callers must derive the ID from a trusted authenticated authority and must not reuse the wrapper for untrusted tenant claims.
- `lib/db/src/index.ts` creates a PostgreSQL pool from `DATABASE_URL`; it does not itself set tenant context.
- `artifacts/api-server/tests/production-postgres-rls-security.test.ts` includes unit assertions for rejecting privileged session identity and for production gate being inert under explicit staging mode.

## Isolated Neon transaction proof (branch br-snowy-voice-b1bovtwi)
Connected as `fawri_staging_runtime`, transaction-local `SET ROLE fawri_staging_rls_runtime` gave effective `current_user=fawri_staging_rls_runtime`, authenticated `session_user=fawri_staging_runtime`, and `rolbypassrls=false` for the effective role. The authenticated role is independently documented as BYPASSRLS; therefore this setup is **not** an acceptable production runtime connection, and production readiness must reject it. In that same limited-role transaction, `fawri_tenant_or_audited_admin('synthetic-tenant-a')` returned NULL without tenant context, TRUE after transaction-local setting of tenant A, and FALSE for synthetic tenant B. The three checked protected tables contained zero rows even for the privileged role, so zero visible rows did **not** prove cross-tenant isolation. No tenant fixtures were created.

## Security boundary requiring tests
`fawri.tenant_id` is a custom PostgreSQL setting writable by the database session. RLS is effective against foreign merchant rows only when trusted application code supplies the authenticated merchant's identity and an unprivileged database login is used. A direct SQL client already holding runtime credentials is outside a trusted HTTP tenant-context boundary; broad grants on non-RLS tables remain separately important.

## Follow-up acceptance
1. Trace each HTTP/worker caller of `withMerchantOperationalTransaction` and classify merchant ID origin as authenticated/verified or user-controlled; add negative tests for any unverified path.
2. Confirm Railway process `FAWRI_DEPLOYMENT_MODE`, `NODE_ENV`, and *actual* authenticated database role through approved secret-safe evidence. Variable names alone do not prove values.
3. On disposable PostgreSQL with two synthetic merchants and a dedicated `LOGIN NOBYPASSRLS` role, test cross-tenant SELECT/UPDATE/INSERT and pooled connection context reset; avoid testing on hosted merchant data.
4. Preserve existing CI proof, including 41/41 green at commit `c2d13827184d2917a767b1584c44ef47e38f0eb8`, as **disposable CI evidence only**. Revalidate exact release SHA before deployment.
5. Hosted migration, privilege, deployment, merge and launch gates remain pending explicit review and approval.

**Do not infer GO from passing source checks or synthetic role-switching.**
