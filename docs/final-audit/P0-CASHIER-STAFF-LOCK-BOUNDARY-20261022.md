# P0 staff mutation boundary and scoped approver lock — 2026-10-22

Start checkpoint4c8b781c2bf9ef29fd6486e4541945c3501a13e0. Previous executable2b4d154f acceptance46/46 workflows and78/78 invocations remains preserved. Candidate `44f46431c63e7ca723d4e1e283259a9872ab8abf` is CI_PENDING, not accepted yet.

## Design and change

Primary commerce previously needed staff UPDATE privilege solely to SELECT FOR UPDATE its manager approver. Allowing an UPDATE column would still permit mutation, so this change adds migration0042's narrow public.fawri_lock_cashier_approver(text,text) instead. It returns only id/display_name/role/status/revoked_at, locks the same underlying staff row in the caller's transaction, and requires fawri_security.allows_merchant for the supplied merchant. That predicate is bound to actual LOGIN/backend/full transaction ID, not a caller GUC. The body is static, schema-qualified, STRICT/VOLATILE/SECURITY DEFINER with search_path=pg_catalog; PUBLIC receives EXECUTE on this scope-guarded function, not table mutation authority. No app roles or hosted ACLs are provisioned. Its trusted owner must have underlying staff lock privileges and private predicate EXECUTE, and remain unreachable to application roles.

Approval consumption keeps its original business transaction, binding, role/revocation, time-window, replay and update rules; it now obtains the non-secret locked approver through that function. PIN issuance remains on auth LOGIN. Staff joins AUTHENTICATION_INTEGRITY_TABLES so production admission rejects any reachable table/column mutation privilege. The disposable fixture automatically removes its staff DML grants. No UPDATE column exemption exists. Readiness additionally requires the function's presence, EXECUTE, definer/volatile/fixed-path metadata and unreachable owner. Migration0042 SQL, manual-stage provenance, deterministic snapshot and journal are committed together.

Initial candidate583492a5 failed three unit cases because the inert SQL adapter did not recognize the new function; exact failure is retained in [initial evidence](evidence/P0-STAFF-LOCK-INITIAL-UNIT-ADAPTER-20261022.json). Corrected candidate updates only that adapter, binds merchant/staff arguments and removes secret fields; business assertions and production code unchanged by correction. Initial in-progress runs may be cancelled by the existing workflow concurrency policy; do not count them as passing or as product findings.

## Prepared validation

Guarded actual-LOGIN staff test denies all column updates and INSERT/DELETE/TRUNCATE/PIN read; exercises45 table/column mutation admission scenarios across direct/PUBLIC/inherit/SET/unreachable grants; ordinary reads, exact public projection, forged GUC, other backend, cross-merchant, expired and completed scope negatives; real conflicting auth UPDATE must time out while commerce holds the row, and succeed after COMMIT or ROLLBACK. Five malformed/missing/unexecutable function cases fail admission. Existing PIN/approval consumption tests now assert the actual function and retain original rollback/replay/concurrency/demotion cases. A readiness unit verifies missing lock capability fail-closed. Full migration reproducibility/schema restore and all existing affected integration suites must pass.

Local Node syntax checks PASS; unattested invocation refuses before DB import. Actual SQL runs only on owned network-none PostgreSQL in GitHub Actions. Expected79 invocations; use exact completed logs, not expectation, for acceptance.

## Remaining / next

CI_PENDING until exact-source logs and tree match are saved. Direct staff mutation will be closed only within the passing bounded actual-LOGIN proof; non-secret cashier row isolation and alternate view/function exposure remain OPEN. Offline/grace/sync/retention/provider/storage and complete P0 inventory remain OPEN. Next after this gate: bounded cashier non-secret row-isolation inventory and minimum auth-owned tables, preserving business locks and merchant predicates. NO-GO; whole-P0 percentage UNMEASURED. GitHub/Actions only; no Railway/Neon/other service connector, hosted mutation, deployment, main push, merge, credential rotation or P1/P2.
