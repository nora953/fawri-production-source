# P0 payment SQL recovery — verified checkpoint (2026-10-14)

Source: `da4d0c05e43a953623d42ec74729f16a4bd05cef`, [draft PR534](https://github.com/nora953/fawri-production-source/pull/534), parent issue523. Main was not merged or deployed.

Evidence: [isolated PostgreSQL run38517736663](https://github.com/nora953/fawri-production-source/actions/runs/38517736663), job115700230288; Node24.21.0, guarded disposable network-none PostgreSQL, injected fake providers only. Parsed actual AUDIT_SUITE_RESULT records:43 invocations/41 unique files,168PASS/3FAIL/0SKIP.

| Test | Scope | Commit | Environment / database | Result | Evidence / finding | Next action |
|---|---|---|---|---|---|---|
| cashier-billing-negative-failure-cases.integration.test.mjs | SQL-fault receipt / terminal / concurrency | da4d0c05 | Offline disposable PostgreSQL | PASS6/0 | Same run/job; P0001 leaves reconciliation order,1event,0applications,0subscriptions; exact concurrent next-day replay applies once with original paid_at; payload/distinct overwrite denied | Reuse for unchanged source |
| saas-billing-sql-failure-recovery.integration.test.mjs | SQL-fault receipt / replay | da4d0c05 | Offline disposable PostgreSQL | PASS3/0 | Same state: reconciliation+1event, no partial subscription; exact concurrent next-day replay and original paid_at PASS | Reuse for unchanged source |
| billing-external-checkout-rollback-postgres.integration.test.mjs | Committed reservation / no repeated provider POST | da4d0c05 | Offline PostgreSQL / injected provider | PASS9/0 | Durable checkout identity and unresolved expiry protection remain | No duplicate rerun |
| meta-page-directory-restricted-rls.integration.test.mjs | Restricted ingress resolver | da4d0c05 | Offline PostgreSQL / NOSUPERUSER NOBYPASSRLS | FAIL2functional+1parent;2PASS | Connected mapping0 vs2; approved page503. Existing FA-I-006 / issue535 | Implement least-privilege resolver |

Batch counts:priority8PASS/3FAIL;cashier25/0;billing36/0;tenant41/0;meta-bot55/0;full-restore2/0;Node22 HTTP1/0. Cleanup succeeded. The isolated workflow is overall FAILURE because of Meta. SQL-fault recovery is bounded PASS; P0 and issue523 are not globally closed.

Other same-head gates: billing readiness38517736748, quality38517736701, cashier lifecycle38517736696, PostgreSQL outage38517736434, foundation38517736489, staging container38517736684, merchant PostgreSQL HTTP38517736790, merchant golden38517736524, clean deployment golden38517736789, performance38517736495 SUCCESS. These are checks, not a live deployment.

Security38517736598 FAILURE: dependency audit/review/lockfile and working-tree scan PASS; full history has1credential-url finding in immutable blob202a9fc041cb2cde0e8169683a6eb9eb7478e130 at docs/final-audit/evidence/seq241-entrypoint-fences.test.mjs. Read-only inspection confirms synthetic username/password and reserved.invalid hostname, deliberately refused by pre-import attestation, not used for a DB connection. Prepare an exact blob/path/rule/index641/length64 exception with negative mutation tests; never generalize by hostname or file. No secret value recorded here.

Limitations: SAVEPOINT recovery handles recoverable SQL application failure, not process death before commit, connection loss/failed commit or truly unmatched orphan payments. A separately committed receipt inbox/provider reconciliation remains acceptance work under523. No hosted-role changes, real provider calls, main merge or deployment authorized.

Next: security historical-fixture gate in separate draft PR, then Meta FA-I-006 issue535. Never weaken RLS or assign broad BYPASSRLS. Use scoped resolver grants and actual restricted-role positive/negative proofs.
