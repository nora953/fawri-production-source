# P0 cashier permission and operator-session authority — 2026-10-22

**Accepted executable: `2b4d154f01521318abb02f7080cdf6c02e834e05`. All46/46 workflows SUCCESS.** Isolated run39746441245/job119715940401 completed78/78 invocations with exit0,failed0,skipped0,cancelled0 and complete TAP summary;76 unique test files. Counts include parent tests and repeated invocations, not a whole-P0 denominator. [Exact evidence](evidence/P0-CASHIER-PERMISSION-SESSION-ACCEPTANCE-20261022.json).

Continuation starts at e9a65f59d24920ada436e0503ea265c13faceaab. Previous manager-PIN sourcef0418c13 acceptance and all earlier evidence remain historical.

## Change

Cashier non-manager discount-role cleanup and merchant HTTP staff discount-policy mutation now use identity-checked withMerchantAuthenticationTransaction. Existing merchant predicates, FOR UPDATE, optimistic staff version check, permission filtering, policy writes, active-session snapshot synchronization and transaction rollback remain together. Ordinary policy reads and merchant-wide discount-kind writes keep their business transactions.

Production readiness rejects tenant mutation authority on merchant_cashier_staff_permissions and cashier_operator_sessions, including reachable roles and column grants. cashier_operator_sessions.token_hash joins protected credential SELECTs (10 columns). Disposable fixture grants follow these arrays. No migration, issuer, business policy, hosted ACL, secret or dependency changes.

## Executed proof

| Proof | Actual result |
| --- | --- |
| New actual-LOGIN permission/session suite |8PASS,0FAIL/skip/cancel, parent included |
| Restricted tenant SQL | INSERT/UPDATE/DELETE/TRUNCATE denied on both tables; token_hash SELECT denied; ordinary session projection usable |
| Production mutation admission |12 grant/revoke cases: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER across both tables; grants reject readiness, revocation restores it |
| Trusted cleanup | Non-manager override removed from permissions, active snapshots and policy; manager/other merchant unchanged; missing/cross-merchant/idempotent cases pass; zero primary pool calls |
| Cleanup rollback | Revoked auth session UPDATE causes SQL42501; prior permission deletion rolls back, policy/snapshot/staff unchanged |
| Real secure merchant HTTP | Cookie/device session plus real active entitlement; versioned policy save updates permissions/policy/staff/snapshot; cashier cannot acquire manager override; unrelated permission preserved; cross-merchant404 and stale-version409 |
| Late HTTP failure | Revoked auth session UPDATE causes500 and rolls back permission/policy/staff version updates together |
| Missing authority | Marker revoked, missing auth URL and tenant URL fail closed; no primary fallback |
| Authentication regression |63PASS;10 sensitive columns/50 actual-LOGIN direct/PUBLIC/inherit/SET/unreachable read ACL cases;0 primary calls |
| Existing manager PIN/commerce |10PASS; durable lockout, non-secret FOR UPDATE consumption, rollback/replay/concurrency and demotion checks preserved |
| Complete isolated run |78/78 clean invocations,76 unique files, all42 migrations, full committed-schema dump/restore, owned cleanup and Node22 HTTP phase pass |
| Foundation |39746441434/job119715941742 SUCCESS; final marker, API/frontend types/build, readiness/native RLS/integration and commerce closeout pass |
| Security |39746441357 attempt1 SUCCESS; audit119715949059/review119715949269:0 high/0 critical/2 moderate; no retry or relaxation |

Actual checkout6484818c27cba31f1f02c4c171e1fb97bc7277f3 and accepted source share treeeae74e44da5047f37246539e1960e37d728b5323. Source change is exactly three production files plus canonical runner/new native test. Subsequent report/evidence/ledger checkpoints are docs-only[skip ci], not new executable proofs. Local Node syntax checks PASS; unattested execution refuses before application DB import. Initial local partial snapshot lacked guard/helper files; restoring exact source allowed the expected guard refusal, not a product failure. Actual DB assertions ran only in owned network-none PostgreSQL on GitHub Actions. No CI failure in this increment.

## Remaining gates and exact next step

**Direct merchant_cashier_staff mutation remains OPEN.** Commerce consumes manager approvals while locking the public staff row and needs an UPDATE privilege. Next: design a narrow privilege/locking arrangement, prove actual-LOGIN denial of credential/role/status/counter/version writes and insertion/deletion/truncation, and retain trusted auth writers plus commerce locks/concurrency/rollback. Do not blindly revoke every UPDATE or remove the commerce lock.

Non-secret cashier row isolation, alternative view/function exposure, offline/grace/sync/retention/provider/storage and complete P0 inventory remain OPEN. NO-GO; whole-P0 percentage unmeasured. Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. GitHub/GitHub Actions only; no external-service connector, hosted mutation, deployment, main push, merge, credential rotation or P1/P2. Preserve completed evidence and resume at the bounded next task.
