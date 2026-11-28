# Manager override PIN persistence — confirmed and remediated in isolation, 2026-10-22

**Accepted executable f0418c1350a4d51dc112fb805304978541ab1dfc:46/46 workflows SUCCESS;77/77 isolated invocations clean.** [Exact acceptance](evidence/P0-MANAGER-PIN-PERSISTENCE-ACCEPTANCE-20261022.json). **Release NO-GO.** Recovered checkpoint4a97fbbc9e59950e689ec2f2ea9842f6ad698e65; prior sourcebe497124 accepted46/46+76/76 remains historical.

## Confirmed original defect

verifyApproverPin wrote failed_pin_attempts/pin_locked_until then threw inside the issuance transaction. Its rollback discarded the failure state. New strict actual-LOGIN test sourcef00230603ba51a50c01e39f3e8befb8b06e2677d changed only test/runner, retaining production blobcba5281efbf60ce2c795e72ea69f7bc063f17011. Native39740085994/job119694925095 observed counters[0,0,0,0,0], five CASHIER_OPERATOR_INVALID codes, no lock, then correct PIN accepted. Strict regression failed; all previous76 invocations passed and45/46 workflows succeeded. Its two failed TAP counts include child+parent, not two vulnerabilities. [Exact pre-fix evidence](evidence/P0-MANAGER-PIN-BASELINE-20261022.json). This is a service-level owned network-none LOGIN proof, not a claim of hosted/HTTP exploitation.

## Focused remediation

Only two production files change. Manager approval issuance uses withMerchantAuthenticationTransaction. PIN refusal returns a typed decision so its update commits; the API throws the refusal after commit. SQL, conflict and business errors still throw inside the transaction and roll back. Threshold5/lock15 minutes remain unchanged; malformed/unauthorized requests do not reset failure state.

Secret issuance loads a locked PIN projection on the auth LOGIN. Commerce consume keeps the caller's original transaction/FOR UPDATE and permission, role, policy, sale-binding/window and replay checks but loads non-secret approver fields. No commerce secret read is needed. Tenant readiness extends to merchant_cashier_staff.pin_hash SELECT: nine protected columns/45 ACL cases. Disposable helper preserves prior non-secret grants. No staff mutation restriction, migration, RLS predicate/issuer grant, subscription/offline policy, hosted ACL or credential change.

## Native acceptance

[Run39740821742](https://github.com/nora953/fawri-production-source/actions/runs/39740821742),job119697340772:77/77 invocations exit0/fail0/skip0/cancel0/summaryComplete. Manager PIN suite10PASS, auth58PASS (parents included), primaryPoolCalls0. Fixed counters[1,2,3,4,0], fifth error CASHIER_PIN_LOCKED, correct PIN rejected during lock. Concurrent eight failures serialize at the same threshold; expired-lock recovery succeeds. Permission/role/policy/malformed/self/missing refusals, SQL insert/limit/duplicate rollback, actual tenant PIN-read denial, non-secret locked consume rollback/replay/concurrent once-only consumption, demotion-before-consume and marker/missing/tenant auth URL no-fallback pass. Existing assertions remain.

All42 migrations/full dump-restore and Foundation39740821822/job119697340867 final marker/types/build/readiness-unit/native-RLS/integration pass. Source and actual checkout6f2c8791a84f80006d93d0d60cf58bc4ca1570a6 share tree18946b39ab1fe8974f52dd86ab43eb30b908dd52. All46 exact-source workflows SUCCESS. Counters include TAP parents/repeated runtimes; they are not unique P0 coverage or a completion percentage.

Security39740821775 attempt1 audit119697341448 failed closed because output had no vulnerability counts; no counts inferred from that job. [Attempt evidence](evidence/P0-MANAGER-PIN-DEPENDENCY-AUDIT-ATTEMPT1-20261022.json). One bounded failed-job rerun request at the same source led to successful attempt2 audit119699938164/review119699988452 (all four security jobs successful): actual0 high/0 critical/2 moderate. No source/dependency/policy relaxation or application-suite rerun for the retry.

## Next task and remaining gates

Trace cashier-discount-policy-operations and cashierStaffDiscountRoleHardening's primary staff/permission/operator-session snapshot mutations and lock dependencies; design actual-LOGIN mutation isolation before expanding restrictions. Preserve commerce FOR UPDATE semantics. Primary staff/session mutation and non-secret cashier row isolation remain OPEN; do not describe complete cashier integrity as closed. Offline/grace/sync/retention/provider/storage/full-P0 inventory remain open. Do not rerun77 suites for docs-only changes.

Hosted runtime BLOCKED_BY_RAILWAY; hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No Railway/Neon/other external service connectors, hosted write/deploy, main push/merge, live credential rotation or P1/P2. Whole-P0 percentage unmeasured; source acceptance is not hosted certification. NO-GO.
