# SEQ-134–136: administration, Support and local media audit

## Definitive current handoff — SEQ-134–137 completed; next SEQ-138

Continue from saved evidence; do not restart. Audit/test/documentation only. All application repairs and consolidated repair planning remain deferred until the comprehensive audit is complete.

Executed source `a2a9a780740d8719be5564344ad9afa984e2bbbd`, [isolated run38288686551](https://github.com/nora953/fawri-production-source/actions/runs/38288686551), job114943166682, Node24.21.0: **144 PASS /24 FAIL /0 SKIP**,41unique files/43invocations. Every AUDIT_SUITE_RESULT has summaryComplete:true.24markers remain16functional+8parents for9existing canonical application findings, including HIGH/OPEN CASHIER-REPORT-PROFIT-001. No application defect repaired or new Support defect demonstrated. Owned teardown, full-schema restore, injected Meta54 and Node22 HTTP PASS.

New actualSQL/HTTP: admin auth/router1PASS; Support5PASS (4negative children+parent). Actual tickets/images/replies/inspection approval/secret-redacted preview/reminders persist inSQL without legacy JSON. Missing session401; real foreign merchant404 for other ticket/image/reply, absent in own list/no message mutation; owner image200. Removing current manage_support grant rejects list/image/reply403 with same previously permitted cookie; restoring grant returns200. Preview PATCH403/read-only and same-admin other-session403; original session200/store unchanged; ended snapshot409. Default disposable role and mounted router fixtures; not deployed grants/full-app fallthrough/browser/live OTP/media durability proof. Owner Support device trust uses real services with synthetic setup; actual owner OTP/device login separately passed in admin suite.

Prior Support fixture failures remain documented: invalid legacy phone shape (23514), then device-less owner session (AUTH_POSTGRES_OWNER_DEVICE_REQUIRED), both before HTTP. Corrected only test fixtures, pre-mutation cleanup and audit counters; no app/schema change. Failed incomplete output was not counted as success. Final complete runtime above supersedes those prepared/setup-only statuses.

Local separate: media filesystem5PASS (real scratch fs, actual producer bodies), runner counter4PASS (actual summary/classification body, synthetic TAP). Prior admin UI14PASS, receipt native8PASS and central component5PASS remain bounded evidence, not added to SQL aggregate. [Detailed evidence](SEQ_134_136_ADMIN_SUPPORT_20261012.md).

Planning estimate remains approximately **54%audited /46%remaining**, uncertainty40–60%, same milestone/domain model. No increment for fixture corrections, unchanged CI repeats or limited extra controls alone; this is not a measured passrate/readiness. Release BLOCKED. Full screen/role/modal/mobile/offline, hosted grants/media/PITR/rollback/monitoring, provider and commercial acceptance remain open.

**Exact next SEQ-138:** mounted merchant/admin Support page state and role/browser coverage from the37route inventory (loading/empty/error/retry, allowed/denied role surfaces and keyboard/RTL), separating synthetic API UI proof from already verified real Support HTTP. Then remaining owner/admin/merchant screen groups. Reuse all completed service/media/report proofs; rerun only for changed code/config or a justified new assertion. No main merge, deployment, live DB/secrets or real payment.


Audit only. Application code is unchanged. Repairs and consolidated repair planning remain deferred until comprehensive audit completion.

## SEQ-134 — previously unexecuted PostgreSQL HTTP journeys

Source head `3019e9a47733076366bec86475cd0f69a3dd5a09`, [isolated run38287120221](https://github.com/nora953/fawri-production-source/actions/runs/38287120221), job114938040636. Two existing suites newly selected first in the guarded tenant batch:

- `admin-auth-router-postgres.integration.test.ts`: owner device OTP (synthetic dev code), assistant creation/trust/permissions, mandatory password change, old-session and password rejection, disable/re-enable and device revocation.
- `support-postgres-cutover.integration.test.ts`: actual merchant/admin Auth v2 ticket/image/reply/approval/preview/redaction/reminder HTTP and SQL persistence.

Completed: admin auth journey **1 PASS /0 FAIL**. Support failed before any HTTP at accounts_phone_shape_check (23514): its old079... phone fixtures are incompatible with current normalized phone constraint. Child exit7 and missing terminal TAP summary; no Support functional PASS and no new application defect. Completed-suite records sum139PASS/24FAIL/0SKIP; additionally1observed fixture-setup failure has no terminal counters. Do not present139/24 as an exhaustive completed aggregate.43invocations/41unique. All owned cleanup/restore/Meta54/Node22 steps SUCCESS.

Fixture correction: all4 synthetic Support phones now use valid+964... shape. Register cleanup before first fixture mutation; use shared aggregate cleanup without swallowed SQL errors, deleting only fixture admin-access audit rows before accounts. Runner now labels summaryComplete and counts observed not-ok markers if terminal fail summary is absent; incomplete summaries force failure. This addresses audit infrastructure only; no app/migration changes. Prior setup failure remains recorded. Runner preload verifies disposable DB attestation before DB/application imports; network-none owned containers, migrated synthetic schema. Mounted auth router/default disposable role does not certify deployed grants, full application routing, live OTP, browser or persistent media. The signature-only9byte PNG fixture does not certify image decoding. The corrected Support teardown is registered before mutation and preserves errors while attempting later cleanup. Fault injection for this specific journey is not certified; owned container/volume teardown remains required.

## SEQ-135 — new Support HTTP negative assertions / PREPARED

Extend the same actual Support journey with4 child tests, preserving positive controls:

1. Missing session401; a real second merchant gets404 for known other-tenant ticket/attachment/reply, cannot see ticket in own list; denied reply does not change stored message count, original owner image still200.
2. Delete only the current profile manage_support grant while retaining the already issued permission-bearing session. Admin list/image/reply deny403, messages unchanged; restore grant in finally and list200. This tests current server authority, not UI hiding or a new cookie with reduced claims.
3. Approved preview rejects PATCH403/READ_ONLY; another session of the same assistant gets403/SESSION_MISMATCH; original session still200 and original store_name unchanged.
4. After ending preview, snapshot409/PREVIEW_ENDED.

Both selected test entrypoints now additionally call shared disposable attestation before application/DB imports. Local syntax checks PASS. Direct unattested Node24.19.0 invocation of each exits1 at the guard before DB imports: PASS fail-closed behavior. New SQL/HTTP assertions NOT_RUN until next complete CI logs. No app authorization or live permissions changed.

## SEQ-136 — local actual media filesystem boundary

`node --test scripts/fawri-support-media-filesystem-audit.test.mjs`, Node24.19.0: **5 PASS /0 FAIL /0 SKIP**. Extracted actual safeStoragePath, ensureSupportImageDirectory, persistAuthorizedSupportImage and actual error class; type syntax stripped, real fs/path/crypto/scratch files, no DB imports. Scratch fixture cleanup registered before file mutation.

- Traversal and extra segments rejected; ordinary key remains under configured root.
- Ticket path/dot aliases rejected before directory creation.
- Root and ticket directory mode0700 and actual containment.
- Existing ticket symlink rejected, external directory untouched.
- Actual atomic publication preserves exact bytes, file mode0600, leaves no temporary file on success; second publication rejected and original bytes unchanged.

This does not certify hostile concurrent filesystem processes, disk crash durability, hosted storage, DB-to-file rollback, image decoding or HTTP authorization. No application defect closed from these local passes. No additional whole-audit percentage credit beyond current54% estimate pending remaining broader gates.

## SEQ-137 — incomplete execution counter regression

`node --test scripts/fawri-audit-suite-summary.test.mjs`, Node24.19.0: **4PASS/0FAIL/0SKIP**. Execute the actual runner summary/classification body: complete passing TAP accepted; complete failed TAP retains child/parent counters; observed unfinished fixture failure counted with summaryComplete:false; partial output cannot be green even with exit0. Synthetic TAP inputs, no DB proof. This specifically prevents the previously observed Support exit7/missing terminal summary from disappearing from failure reporting.

## Next

SEQ-134 logs read and classified. Execute corrected Support journey and SEQ-135 without weakening negative assertions; preserve passing admin proof and open application findings. Persist exact source/run/job and complete aggregate; never add local5 to SQL counts or reuse138/24 as a new aggregate. Remaining mounted-browser owner/admin/merchant/support/mobile/role surfaces still open.

## SEQ-135 first corrected runtime — fixture device contract

Source8ad38293, [run38288147993](https://github.com/nora953/fawri-production-source/actions/runs/38288147993), job114941363779:43invocations/41unique, **139PASS/25FAIL/0SKIP**, all summaries complete.24markers remain existing9application findings; one additional Support fixture setup failure before HTTP: AUTH_POSTGRES_OWNER_DEVICE_REQUIRED. Corrected phone fixtures and pre-mutation teardown now complete quickly and expose full counters; owned cleanup SUCCESS. No new app permission defect inferred. Current owner requires deviceId; old Support test directly issued a device-less owner session. Fixture now registers/trusts a synthetic owner device through actual device services, binds owner session and owner request device header. Owner OTP HTTP remains separately proved; this synthetic trust service is not additional login proof. Four new Support negative child tests still NOT_RUN pending next source. Local syntax PASS; SEQ-137 counter regressions4PASS separate.
