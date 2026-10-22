# Manager override PIN persistence — 2026-10-22

Recovered checkpoint4a97fbbc9e59950e689ec2f2ea9842f6ad698e65, accepted codebe497124f86ce12b6e2041f1246f0a5e33874cef (46/46 workflows,76/76 isolated invocations). New regression sourcef00230603ba51a50c01e39f3e8befb8b06e2677d changes tests/runner only; production source remains unchanged. No new source acceptance is claimed.

## Hypothesis and strict pre-fix regression

verifyApproverPin updates failed_pin_attempts/pin_locked_until then throws inside issueCashierDiscountOverrideApprovalAuthoritative's operational transaction. The transaction wrapper rolls back thrown failures. A new owned, network-none actual-LOGIN regression makes five wrong-PIN requests and then tries the correct PIN, records counters/codes/lock state without secrets, and requires counters1,2,3,4,0, a fifth-request lock and rejection of the correct PIN during the lock. This regression is expected to fail if the source hypothesis is real; baseline results PENDING. Do not bypass or weaken assertions to obtain green CI.

Next read exact native evidence, preserve the observed baseline; then commit PIN refusal decisions before throwing outside the transaction, use the authentication LOGIN for secret verification and split non-secret commerce approval-consumption projection while preserving FOR UPDATE, consume/replay/rollback and revocation semantics. Extend native positive, failure, concurrency and authority checks. No hosted changes, policy changes, issuer/RLS/migration changes, merge/main push or P1/P2.

Hosted runtime BLOCKED_BY_RAILWAY, hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. Release NO-GO; whole-P0 percentage unmeasured. GitHub/GitHub Actions only.


## Confirmed pre-fix evidence and remediation candidate

Baseline sourcef00230603ba51a50c01e39f3e8befb8b06e2677d, native39740085994/job119694925095:77 invocations,76 clean, only the new strict regression failed (one child+parent). All45 other workflows succeeded. Observed wrong-attempt counters[0,0,0,0,0], five CASHIER_OPERATOR_INVALID responses, no lock and validPinApproved=true. Production blobcba5281efbf60ce2c795e72ea69f7bc063f17011 was unchanged. [Preserved baseline](evidence/P0-MANAGER-PIN-BASELINE-20261022.json). This confirms the service-level owned actual-LOGIN bug; no hosted/HTTP exploitation claim.

Candidate **f0418c1350a4d51dc112fb805304978541ab1dfc** is PENDING CI. PIN refusals now return a decision from the authentication transaction; the API throws only after that transaction commits. SQL/conflict/business failures still throw inside and roll back. Secret PIN verification uses the separate auth LOGIN. Commerce consumption keeps its FOR UPDATE/business checks but reads a non-secret approver projection. Tenant admission now rejects merchant_cashier_staff.pin_hash SELECT (nine sensitive columns total); no staff mutation grant changes or lost locks.

Native tests retain the strict five-failure/correct-PIN lockout case and add concurrent failures, lock expiry recovery, permissions/role/policy/input denials, SQL/limit/duplicate-operation rollback, actual tenant PIN-read denial and ordinary locked consumption, rollback/replay/concurrent consume/demotion checks, and marker/missing/tenant auth URL no-fallback. Main pool methods throw if issuance borrows them; legitimate commerce uses an independently authenticated tenant transport. JS syntax PASS; new type/build/native/full acceptance PENDING. No policy threshold change (5 failures,15-minute lock), schema/RLS/issuer changes or hosted writes.
