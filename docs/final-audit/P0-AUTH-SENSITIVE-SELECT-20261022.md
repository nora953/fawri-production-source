# Authentication sensitive SELECT admission — accepted in isolation, 2026-10-22

**Source: 2cf55e258762402f001a6960f4521d389a96822f. 46/46 workflows SUCCESS, 75/75 isolated invocations clean; authentication suite43PASS/0FAIL/0SKIP/0CANCEL (includes parent), all30 ACL cases. Release NO-GO.** [Exact machine evidence](evidence/P0-AUTH-SENSITIVE-SELECT-ACCEPTANCE-20261022.json).

## Source trace

Recovered HEAD bc001202c95934f0cdbf3446eb1004ac7588f382. Compared all346 API source/schema files with GitHub blob hashes before searching account/session/OTP/device SQL. Merchant/admin account lookup/password changes, sessions, OTP/rate-limit, trusted admin devices, owner provisioning/recovery and mixed cashier identity paths use authenticationDatabasePool/withAuthenticationTransaction/withMerchantAuthenticationTransaction. accounts.metadata contains owner recovery key hashes. Ordinary fields still serve operational paths: support/emergency snapshots read account phone, Meta channel writes read id/phone_verified, support inspection reads admin display_name. Banning all account SELECT would break these journeys.

## Production change

Only postgresRuntimeRlsSecurity.ts changes production behavior. Tenant readiness inventories six sensitive columns: accounts.password_hash, accounts.metadata, account_sessions.token_hash, account_sessions.device_fingerprint_hash, auth_otp_challenges.code_hash and trusted_devices.device_fingerprint_hash. Direct/table/PUBLIC, inherited and SET-reachable reads are rejected, including an unsafe session_user hidden by restricted current_user. Required columns and well-formed inventories are mandatory. Ordinary account identity/status reads are preserved. No migration, RLS predicate, issuer grant, hosted ACL or credential changes.

This is an admission check, not automatic ACL repair, a new SQL authorization boundary, complete authentication privacy certification or proof against alternate views/functions. Hosted roles/deployment remain unverified.

## Native regressions and initial failure

Existing owned network-none PostgreSQL auth fixture retains separate actual tenant/auth LOGINs and all signup/lookup/OTP-single-use/session-issue-validate-rotate-revoke/admin-permission-password-state/mixed-rollback/production-fallback positives. Primary pool methods throw if borrowed. Added30 ACL cases (six columns × direct/PUBLIC/inherit/SET/unreachable), reads denied before/after revoke, reachable reads demonstrated, restricted-current-role/session-user control, ordinary account read, table SELECT, missing-column rejection/recovery and fixture helper idempotence/no-grant-expansion.

Initial source44668bde: auth42PASS, but full-source acceptance rejected because legacy tenant fixtures held broad credential SELECT. Foundation types/build/readiness-unit/native-RLS passed before the same knowledge-fixture refusal. [Initial exact75 summaries](evidence/P0-AUTH-SENSITIVE-SELECT-INITIAL-20261022.json) retained. Correction narrows disposable direct tenant grants: records previously-readable ordinary columns, revokes direct table/sensitive SELECT, restores only previously-readable non-sensitive columns. Auth LOGIN and original business assertions remain; no new ordinary capabilities or bypass.

## Exact-source acceptance

Native [run39721170510](https://github.com/nora953/fawri-production-source/actions/runs/39721170510), job119634687396:75 invocations, all exit0/fail0/skip0/cancel0/summaryComplete. Auth43PASS with primaryPoolCalls0 and all proof flags true. All42 migrations/full dump-restore PASS. Foundation run39721170393/job119634687328 completed its final marker, types/build/readiness unit/RLS/integration PASS. All46 exact-source workflows SUCCESS. Actual checkout e1e206fc6b15d6cd703f09d9119813d3986808f6 and source share tree2ea8af20b2fb92b1e62500f48f748361f2123a75. Dependency audit/review run39721170505:0 high,0 critical,2 moderate. Counts include parents/repeated invocations and do not measure whole-P0 completion.

## Next task and limits

Trace cashierRuntimeExpiryReconciliation's primary operational pool station refresh and pairing/operator-session expiry mutations alongside authentication-based cashier validation and legitimate housekeeping before restricting cashier credential tables. Do not blindly add those tables to a no-mutation list. Cashier/offline/grace/sync/retention/provider/storage/full P0 inventory remain open. No need to repeat accepted75 suites for docs-only changes.

Hosted runtime: BLOCKED_BY_RAILWAY. Hosted DB: NOT_RUN_SESSION_RESTRICTION_GITHUB_ONLY. No Railway/Neon or other external service connectors, hosted writes/deployment, main push/merge, credential rotation or P1/P2. Whole-P0 percentage remains unmeasured. NO-GO.
