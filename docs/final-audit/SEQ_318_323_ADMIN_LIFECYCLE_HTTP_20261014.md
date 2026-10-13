# SEQ-318–323 — current administrator creation, monitoring and password lifecycle HTTP

Six sequential audit stages. Application, original tests and schema unchanged. No earlier management/device/permission cases rerun. Date is Baghdad2026-10-14; CI UTC2026-10-13. No merge/deployment/hosted DB/provider mutation.

| Stage | Evidence | Result / applicability |
| --- | --- | --- |
| SEQ-318 | Exact current admin creation/monitor/trust cap/logout/password contracts | Source review including owner-only target resolution and forced password-change allowed routes. |
| SEQ-319 | New aggregate Authv2 Express/cookie-parser/SQL synthetic fixture |14 named dependent business cases; trusted devices/session issuance seeded through current services. |
| SEQ-320 | Fixed allowlist, attestation and isolated runner | Syntax PASS,4local refusal cases PASS separately; owned network-none PG16/readonly source/early cleanup. |
| SEQ-321 | Source9824331fdded014a7bf98808a0dde035847dff47, run38486456958/job115601177970 |14businessPASS/0FAIL/0NOT_RUN; rawTAP15PASS/0FAIL/0SKIP includes1parent.28migrations/owned cleanup SUCCESS. |
| SEQ-322 | Response fields/SQL versions/must-change/session isolation reconciliation | Named successful and negative boundaries proven; no new canonical product defect. Prior findings remain OPEN. |
| SEQ-323 | Evidence,7canonical ledgers, current security checkpoint and PR #520 | Verified persisted checkpoint; nextSEQ-324. Whole percentage NOT_YET_MEASURABLE/release BLOCKED. |

## Fourteen distinct completed business cases

| # | Case | Actual HTTP / SQL result |
| --- | --- | --- |
| 1 | Assistant lists or creates admins | Both403; synthetic new phone has zero account rows. |
| 2 | Owner input confirmation mismatch |400; no new account. |
| 3 | Owner assistant creation |201; SQL assistant_admin, mandatory password change=true, zero grants; selected private field keys absent. |
| 4 | Duplicate phone |409; exactly1account retained. |
| 5 | Work monitor authorization/isolation/projection | Anonymous401/assistant403/owner200; one target session, no owner/unrelated assistant session; selected private field keys absent. |
| 6 | Third trusted device |409 ADMIN_TRUSTED_DEVICE_LIMIT_REACHED; two existing trusted devices preserved, third remains pending. |
| 7 | Logout-all actor/target bounds | Assistant403; owner account as assistant target404; owner session active. |
| 8 | Owner logout-all across two devices |200/revoked_count2; both assistant session rows revoked and both cookies401; owner and unrelated assistant identities200. |
| 9 | Reset wrong owner password |401; hash/password/security/session versions and mandatory-change flag unchanged, target session active. |
| 10 | Reset temporary password mismatch |400; account snapshot unchanged and session active. |
| 11 | Valid owner reset |200/reauthentication_required; temporary password verifies and prior password no longer verifies; must_change=true, three versions each+1; old session revoked/cookie401. |
| 12 | Fresh bound temporary-password session | /admin/me200/must_change=true; granted merchant list403 ADMIN_PASSWORD_CHANGE_REQUIRED. |
| 13 | Forced self-change reuses temporary password |409 PASSWORD_UNCHANGED; account snapshot unchanged, session active. |
| 14 | Forced different password |200/reauthentication_required; new password verifies, must_change=false; session revoked/old cookie401; fresh bound granted merchant list200; owner still200. |

Fourteen cases, not15: the extra rawTAPpass is outer fixture parent. Multiple assertions percase not counted separately. No failures, skipped or empty green. Full case sequence completed once; no rerun required. Local runner4PASS is infrastructure refusal coverage, not four extra app cases. Actual hash comparisons stay in memory; persisted observations contain statuses/booleans only, no password hash/token/body credentials.

## Scope and boundaries

Real aggregate auth-security router and Express/cookie-parser middleware with current SQL account, admin profile/permissions, trusted-device and session authority. Fresh owned PostgreSQL16 with28 committed migrations and attested database/role/loopback/runmarker checks; Node24.21.0. Network-none/no publishedports, readonly repo, no provider/hosted credentials. Early hook stops support runtime, closes connections/server/pool; executor temporary data cleanup=true and workflow owned container/volume cleanup SUCCESS. End of test has no legacy merchants.json/auth-security.json.

Creation and reset exercise actual handlers; subsequent authenticated sessions are issued through existing service fixtures, not interactive login with temporary/new passwords. Password verification proves selected SQL hash change, not delivery/OTP/login UX. Forced admin change deliberately permits no current_password when current SQL flag requires it; this case validates that route contract using an authenticated bound synthetic session, not an anonymous change.

Monitor projection checks exact prohibited field keys password_hash, token, token_hash, refresh_token, device_hash, device_fingerprint_hash recursively and checks session ownership in fixture. It does not certify every private field/value or the accuracy of failed-login telemetry (current response placeholders not exercised). Owner-only monitor backend success does not close WORK-MONITOR-STALE-001 native stale/pending action findings.

Device cap checks third trust rejection and current two-device preservation; no cap concurrency/fault injection or onboarding approval flow. Logout-all validates two target device cookies and two unrelated admin cookies, not every account/session distribution. No production RLS/leastprivilege, browser cookie/CSRF/CORS, hosted/provider operations, request-load/concurrent account creation, audit-write failure or transactional rollback of reset/profile flag writes tested. These remain separate gaps. Original tests untouched; RESIDUAL-FIXTURE-CONTRACT-001 remains OPEN.

Current tracked secret scan and workflow policy PASS; exact final counts saved in seq323-security-current.json. Reachable historical synthetic credential-shaped fixture gate remains OPEN. Previous archive atomicity, expiry-marker rollback, profit disclosure and all canonical findings retained. No new canonical app finding in this batch.

Twenty-one repository selection paths remain unmapped;222 minimum full App visual cases remain NOT_RUN. Component/backend proofs do not reduce that route denominator. Whole audit percentage NOT_YET_MEASURABLE; release BLOCKED. Seven ledgers updated without erasing historical failures.

[Actual CI](https://github.com/nora953/fawri-production-source/actions/runs/38486456958/job/115601177970). Evidence seq321-admin-lifecycle.tap/results.json and seq320-runner-fences.test.mjs/.tap.

Next SEQ-324: remaining admin security/session lifecycle and full App/role/operational inventory; continue audit only without final repair plan until comprehensive audit completion.
