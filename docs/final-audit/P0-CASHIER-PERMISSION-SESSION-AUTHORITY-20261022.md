# P0 cashier permission and operator-session authority — 2026-10-22

Continuation starts at e9a65f59d24920ada436e0503ea265c13faceaab; previous manager-PIN acceptance remains preserved. Candidate 2b4d154f01521318abb02f7080cdf6c02e834e05 is PREPARED / CI_PENDING, not yet accepted.

## Change

Cashier non-manager discount-role cleanup and merchant HTTP staff discount-policy mutation now use identity-checked withMerchantAuthenticationTransaction. Their existing merchant predicates, FOR UPDATE, optimistic staff version check, permission filtering, policy changes, active-session snapshot synchronization and transaction rollback remain together. Ordinary policy reads and merchant-wide discount-kind writes remain on their existing business transactions.

Production readiness now rejects tenant mutation authority on merchant_cashier_staff_permissions and cashier_operator_sessions, including reachable roles; cashier_operator_sessions.token_hash joins the protected credential SELECT list (10 columns). Disposable fixture grants follow these arrays. No migration, issuer, business policy, hosted ACL or credential changes.

## Prepared proof

A guarded actual-LOGIN native test exercises tenant CRUD/TRUNCATE/token SELECT denial, positive ordinary session reads, 12 mutation grant/revoke readiness cases, auth-only non-manager cleanup, manager/cross-merchant/idempotent behavior, SQL rollback, real secure merchant HTTP policy update and snapshot refresh, late-statement HTTP rollback, stale version/cross-merchant denial, and marker/missing/tenant-auth-URL no-fallback. Existing manager-PIN commerce consumption regression remains in the runner to preserve non-secret FOR UPDATE.

Local Node syntax checks PASS. Actual DB assertions run only in owned network-none PostgreSQL GitHub Actions. Expected runner inventory becomes78 invocations; actual count must be reconciled from complete logs.

## Remaining gates

merchant_cashier_staff direct mutation remains OPEN: commerce consumes approvals while locking its public staff row and therefore needs an UPDATE privilege. Do not apply full-table mutation revocation until a narrow privilege/locking design is proven. Non-secret cashier row isolation, offline/grace/sync/retention/provider/storage/full-P0 inventory remain OPEN. NO-GO. Whole-P0 percentage is unmeasured. GitHub/GitHub Actions only; no external-service connector, hosted mutation, deployment, main push, merge or P1/P2.
