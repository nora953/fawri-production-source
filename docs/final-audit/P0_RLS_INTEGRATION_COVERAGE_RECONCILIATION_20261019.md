# P0 restricted role integration coverage — 2026-10-19

Audit branch: fix/p0-provider-receipt-order-discovery-20261015.

Source inspection confirms production-postgres-rls-security.integration.test.ts exercises disposable PostgreSQL effective and authenticated role checks, non-BYPASSRLS runtime identity, RLS-disabled schema drift, table ownership drift, and privileged role reachability. postgres-runtime-role-readiness.test.ts rejects privileged authenticated session behind a restricted effective role. These are existing tests, not newly executed tests.

Source inspection of operationalPostgresAuthority.ts confirms withMerchantOperationalTransaction sets transaction-local fawri.tenant_id, but does not itself verify merchant authorization. Caller authorization tracing remains necessary.

CI snapshot for commit 62f92c8c352c359bc8ca231ea915681c3115b6db: 41 workflow runs; 9 success, 18 in progress, 13 queued, 1 pending. Do not claim complete success. Previously observed c2d13827184d2917a767b1584c44ef47e38f0eb8 had 41/41 successful workflows.

Remaining: actual Railway login role and deployment mode, migration reconciliation, cross-merchant data isolation for unprotected tables and cashier sessions, release approval. P0 NO-GO. No hosted changes performed.
