# Manager override PIN persistence — 2026-10-22

Recovered checkpoint4a97fbbc9e59950e689ec2f2ea9842f6ad698e65, accepted codebe497124f86ce12b6e2041f1246f0a5e33874cef (46/46 workflows,76/76 isolated invocations). New regression sourcef00230603ba51a50c01e39f3e8befb8b06e2677d changes tests/runner only; production source remains unchanged. No new source acceptance is claimed.

## Hypothesis and strict pre-fix regression

verifyApproverPin updates failed_pin_attempts/pin_locked_until then throws inside issueCashierDiscountOverrideApprovalAuthoritative's operational transaction. The transaction wrapper rolls back thrown failures. A new owned, network-none actual-LOGIN regression makes five wrong-PIN requests and then tries the correct PIN, records counters/codes/lock state without secrets, and requires counters1,2,3,4,0, a fifth-request lock and rejection of the correct PIN during the lock. This regression is expected to fail if the source hypothesis is real; baseline results PENDING. Do not bypass or weaken assertions to obtain green CI.

Next read exact native evidence, preserve the observed baseline; then commit PIN refusal decisions before throwing outside the transaction, use the authentication LOGIN for secret verification and split non-secret commerce approval-consumption projection while preserving FOR UPDATE, consume/replay/rollback and revocation semantics. Extend native positive, failure, concurrency and authority checks. No hosted changes, policy changes, issuer/RLS/migration changes, merge/main push or P1/P2.

Hosted runtime BLOCKED_BY_RAILWAY, hosted DB NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. Release NO-GO; whole-P0 percentage unmeasured. GitHub/GitHub Actions only.
