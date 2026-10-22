# Authentication sensitive SELECT readiness — 2026-10-22

Recovered branch HEAD: bc001202c95934f0cdbf3446eb1004ac7588f382. Previous accepted executable: 43065bda4b032244016d0fc78823f5579b01deca (46/46 workflows; 75/75 isolated invocations). New code acceptance is PENDING, and must not borrow those counts.

## Source trace and bounded remediation

Compared all 346 API source/schema files with GitHub blob hashes at the recovered HEAD before searching account/session/OTP/device SQL. Merchant/admin account lookup and password changes, sessions, OTP/rate-limit, trusted admin devices, owner provisioning/recovery and mixed cashier identity paths use authenticationDatabasePool/withAuthenticationTransaction/withMerchantAuthenticationTransaction. Account password_hash and metadata are read by authentication paths; accounts.metadata contains owner recovery key hashes. Session token/device fingerprint, OTP code hash and trusted-device fingerprint remain authentication material.

Ordinary account fields are still needed by operational paths: postgresSupportSnapshot/postgresEmergencySnapshot read account phone, postgresMetaChannelAuthority reads account id/phone_verified, and support inspection reads admin display_name. Therefore this batch does not ban every SELECT on accounts or all authentication tables.

The production tenant readiness check now inventories SELECT on six credential-bearing columns: accounts.password_hash, accounts.metadata, account_sessions.token_hash, account_sessions.device_fingerprint_hash, auth_otp_challenges.code_hash and trusted_devices.device_fingerprint_hash. It rejects direct/table/PUBLIC, inherited and SET-reachable grants, including an unsafe session_user hidden behind a restricted current_user. Missing columns or malformed inventories fail closed. This is an admission check, not automatic ACL repair, a new SQL authorization boundary or proof of no alternate view/function credential exposure.

Actual-LOGIN regression extends the existing owned, network-none PostgreSQL authentication suite: 30 column/ACL cases (six columns × five modes), denial before and after grant/revoke, unreachable membership control, ordinary account identity-read positive control, table SELECT, missing-column failure/recovery and the original signup/OTP/session/admin/mixed-rollback/fallback positives. Real authentication still uses a separate non-owner LOGIN; the primary pool remains instrumented to throw on any borrowed query/lease. Unit regression covers malformed/missing evidence and new refusal codes. Existing migration/RLS/issuer grants are unchanged. No hosted ACL changes or credential rotation.

## Validation and next action

Native fixture JavaScript syntax PASS locally. New GitHub Actions runtime/type/unit results PENDING. Preserve failed attempts and exact source/checkout SHAs; only accept after inspecting actual job counters. Next verify new authentication suite, Foundation readiness/type/build gate and relevant CI; fix failures without weakening privileges, removing positive assertions or skipping cases. Remaining cashier credential integrity, offline/grace, sync gaps, complete P0 inventory and hosted gates stay open.

Release NO-GO. Hosted deployment/runtime: BLOCKED_BY_RAILWAY. Hosted DB checks: NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No Railway/Neon tools, hosted writes, deployment, main push, merge or P1/P2 work. Whole-P0 percent remains unmeasured.


## First native attempt and fixture correction

Candidate 44668bde6fd0da69511d6cf57770cb396ebe2315, isolated run39720855404/job119633701906: authentication suite **42 passed/0 failed/0 skipped/0 cancelled**, including all30 ACL cases and all original positive auth journeys; primaryPoolCalls=0. The full run was rejected: old fixture tenant roles still held broad sensitive SELECT and the new admission gate rejected them. Exact75 invocation summaries and first failure trace are preserved in evidence/P0-AUTH-SENSITIVE-SELECT-INITIAL-20261022.json. Foundation119633702454 also passed DB/API types, readiness unit contract and native RLS contract before the same fixture refusal in knowledge integration. These are partial results, not full-source acceptance.

Correction source candidate **2cf55e258762402f001a6960f4521d389a96822f** narrows only disposable tenant-role SELECT grants. Before revocation it records already-readable ordinary columns, removes direct table/sensitive-column SELECT, and restores only those previously-readable non-sensitive columns. It does not grant new ordinary capabilities or change the separate auth LOGIN. The authentication fixture adds a real-LOGIN helper/idempotence/no-grant-expansion positive proof. JavaScript syntax PASS; new native/type/full CI acceptance PENDING.

Next cashier trace remains separate: cashierRuntimeExpiryReconciliation still uses the primary operational pool to refresh station credentials and expire pairing/operator-session rows. Do not blindly add those tables to the no-mutation list before tracing scheduled housekeeping and session validation; cashier credential integrity is not closed by this six-column authentication batch.
