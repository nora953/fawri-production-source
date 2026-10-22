# P0 staff mutation boundary and scoped approver lock — 2026-10-22

**Accepted executable: `44f46431c63e7ca723d4e1e283259a9872ab8abf`.46/46 workflows SUCCESS.** Isolated39749682352/job119727410924:79/79 invocations exit0/failed0/skipped0/cancelled0/summaryComplete,77 unique files. [Exact acceptance](evidence/P0-CASHIER-STAFF-LOCK-ACCEPTANCE-20261022.json). Start checkpoint4c8b781c; prior executable2b4d154f46/46+78/78 preserved.

## Design and change

Commerce needed staff UPDATE privilege solely to SELECT FOR UPDATE its manager approver. A writable-column exemption would still allow mutation. Migration0042 adds public.fawri_lock_cashier_approver(text,text), returning only id/display_name/role/status/revoked_at and retaining the underlying FOR UPDATE row lock inside the caller's transaction. fawri_security.allows_merchant authorizes the supplied merchant using actual LOGIN/backend/full transaction scope, not a supplied GUC. The static body is schema-qualified, STRICT/VOLATILE/SECURITY DEFINER with search_path=pg_catalog. PUBLIC receives EXECUTE on this scope-guarded routine; it receives no staff DML grants. No application roles or hosted ACLs were provisioned. Its trusted owner must have staff lock/private predicate privileges and remain unreachable to runtime LOGINs.

Approval consumption keeps its business transaction, role/revocation, sale binding/window, replay/concurrency and update rules, obtaining the locked non-secret approver through the function. PIN issuance remains on the auth LOGIN. merchant_cashier_staff joins AUTHENTICATION_INTEGRITY_TABLES, so admission rejects all reachable table/column mutation authority; the disposable runtime fixture automatically removes staff DML grants. No mutable column exemption exists. Readiness additionally requires the function, EXECUTE, definer/volatile/fixed-path metadata and unreachable owner. Canonical0042 SQL, matching manual-stage SQL/provenance, deterministic snapshot and journal passed reproduction. No discount/PIN threshold/subscription/offline policy or credential change.

## Actual validation

| Proof | Executed result |
| --- | --- |
| New native staff-lock suite |7PASS,0FAIL/skip/cancel, parent included |
| Direct staff authority |All14 columns UPDATE denied; INSERT/DELETE/TRUNCATE/PIN hash SELECT denied; ordinary public-field SELECT preserved |
| Mutation admission |45 table/column grant scenarios across direct/PUBLIC/inherit/SET/unreachable roles; reachable grants reject, unreachable remain accepted, revocation restores readiness |
| Lock function scope/projection |Only five public fields; forged tenant/admin GUCs, another backend, wrong merchant, expired and completed transaction scopes denied; same-merchant/foreign staff ID returns no row |
| Actual lock contention |Independent auth LOGIN UPDATE returns55P03 under150ms lock_timeout while commerce holds staff lock; row unchanged; after either COMMIT or ROLLBACK, auth UPDATE succeeds |
| Function admission |Invoker semantics, unsafe search_path, stable volatility, missing EXECUTE and missing routine reject; restoration accepts |
| Previous native regressions |Manager PIN10PASS, permission/session8PASS, authentication63PASS/50 sensitive-read ACL cases/10 columns; rollback/replay/concurrency/demotion/durable lockout preserved |
| Complete isolated gate |79/79 clean invocations/77 unique files; all43 migrations, full committed-schema dump/restore, owned cleanup and Node22 HTTP PASS |
| Schema reproducibility |39749682448/job119726808272 SUCCESS;0042 manual SQL/journal/deterministic snapshot reproduced |
| Foundation/quality |Foundation39749682531/job119726986131 final marker/types/build/readiness/native-RLS/integration PASS; final quality39749682344 all4 jobs PASS |
| Security |39749682487 attempt1 SUCCESS; audit119727140452/review119727140678:0 high/0 critical/2 moderate |
| Auth concurrency recovery |39749682683 attempt2/job119728151440 SUCCESS, seven auth-contract invocations clean; one bounded same-source failed-job retry |

Accepted source and actual checkout7f612db589e1f500af71a3dfb57525519e670368 share treea4938667bfa5c19e4ecdc8ebddef2e989faddb66. Subsequent report/evidence/ledger commits are docs-only[skip ci], not new executable proof. Counts include parents and repeated invocations, not a P0 denominator. Local syntax PASS; unattested native execution refuses before application DB import. All actual DB assertions ran in owned network-none PostgreSQL on GitHub Actions.

## Retained failures and corrections

Initial583492a5 final-quality job119725566020 failed3 unit cases because the inert SQL adapter only recognized direct table SQL. [Exact initial evidence](evidence/P0-STAFF-LOCK-INITIAL-UNIT-ADAPTER-20261022.json). Correction updates only the adapter to match the exact scoped function SQL, assert merchant/staff arguments and return no secret fields. Discount amount/percentage limits, window and denial assertions remain unchanged; no production relaxation. Final source passes full quality and actual consumption tests.

On corrected source, auth concurrency attempt1/job119726809062 failed before isolated auth-contract tests when Docker image download ended with connection reset. [Exact infrastructure evidence](evidence/P0-STAFF-LOCK-AUTH-INFRA-ATTEMPT1-20261022.json). One failed-job retry at the same source completed successfully; no source/dependency/guard/policy change. This is infrastructure recovery, not an application test failure. Initial evidence remains dated and preserved.

## Remaining / exact next

Bounded direct staff mutation isolation is accepted only in the disposable/admission proof; hosted privileges are untouched and uncertified. **Non-secret cashier row isolation remains OPEN.** Canonical source snapshot shows11 cashier tables without RLS; this is source inventory, not a new hosted inspection or proof of every access route. Begin the seven identity tables: merchant_cashier_staff, merchant_cashier_staff_permissions, merchant_cashier_stations, cashier_station_pairing_challenges, cashier_station_credentials, cashier_shifts, cashier_operator_sessions. Trace primary historical reads and trusted auth callers, then prove private-scope two-tenant denials and auth positives while retaining the new lock. Review discount settings/policies/override approvals and operation attribution separately. Alternative views/functions and full auth/privacy coverage remain OPEN.

Offline/grace/sync/retention/provider/storage/full-P0 inventory remain OPEN. **NO-GO; whole-P0 percentage UNMEASURED.** Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. GitHub/Actions only; no external service connector, hosted mutation, deployment, main push, merge, credential rotation or P1/P2. Preserve accepted evidence and resume at the bounded next task.
