# SEQ-312–317 — current device, permission and enabled HTTP boundaries

Six sequential stages in one audit batch. Application, original tests and schema unchanged. Dates use Baghdad 2026-10-14; CI timestamps remain UTC 2026-10-13. No merge, deployment, provider or hosted database mutation.

| Stage | Evidence | Result |
| --- | --- | --- |
| SEQ-312 | Current Authv2 device binding, admin permission/enabled routes and SQL authority review | Exact device record ownership, owner password, live current profile permissions and session versions identified. |
| SEQ-313 | Independent synthetic E164/trusted device/full aggregate HTTP fixture | Ten new named business cases; previous fifteen management cases not rerun. |
| SEQ-314 | Fixed allowlist and attested network-none runner | Syntax PASS; four local refusal cases PASS, separate from business cases. |
| SEQ-315 | Initial run38484571902/job115595011417 and remaining run38484821000/job115595809185 | Six initial PASS plus four corrected remaining PASS = ten distinct completed cases. Each run applied28 migrations; owned cleanup SUCCESS. |
| SEQ-316 | Initial audit endpoint expectation triage and backend/UI boundary reconciliation | Initial case7 expected admin identity200 on merchant /me; corrected audit to /admin/me. No app repair or new app finding. Existing stale UI finding remains OPEN. |
| SEQ-317 | Results, seven canonical ledgers and PR checkpoint | Exact counts, limitations and handoff preserved. Next SEQ-318. |

## Ten distinct business cases

| # | Case | Actual observation |
| --- | --- | --- |
| 1 | Missing/wrong bound device header | Both401; matching header200 and rightful session remains active. |
| 2 | Foreign owner device record under assistant target |404; owner cookie remains authorized200. |
| 3 | Wrong owner password for trust revocation |401; assistant cookie still200. |
| 4 | Two-device selective revocation | Owner POST200; targeted device session row revoked/cookie401; second device row active/cookie200. |
| 5 | Assistant changes another assistant permissions |403; target has zero permission rows unchanged. |
| 6 | Unknown permission value |400; session/security versions unchanged, three original grants preserved and existing session active. |
| 7 | Permission removal with live session | PATCH200 revokes old row/cookie401; fresh bound cookie has identity200 on /admin/me but merchant list403. |
| 8 | Invalid enabled input | String false rejected400; profile enabled and fresh session active. |
| 9 | Disable | PATCH200; enabled=false, session revoked and admin identity401. |
| 10 | Reenable | PATCH200; both prior cookies remain401, fresh bound identity200 and no-grant merchant list403. |

Initial source e412b4ed8e40e73048ae758a0b3c37cb3821eb1c: six business PASS, one audit expectation failure, three dependent NOT_RUN. Raw TAP6P/2F/0SKIP includes failed parent. Case7 passed revocation and merchant list denial before its last assertion incorrectly requested /me (merchant endpoint). Source auth-session-routes.ts explicitly separates merchant /me from admin /admin/me. Thus this is an audit fixture mistake, not a demonstrated application authorization defect. Original application guard and tests unchanged.

Remaining source65bd43a462b8f46271ee39b9bad3e08c770f4a26: only four remaining named cases4P/0F; rawTAP5P/0F/0SKIP includes one parent. Fresh cluster recreates required second-device and first-device revocation state through existing services, not counted as cases and not a repeat of six completed HTTP cases. Final unique total10PASS/0applicationFAIL/0NOT_RUN. Never sum raw parents or the failed initial duplicate case into independent completed coverage. Multiple assertions percase remain one case.

## Applicability and limits

Actual Express/cookie-parser/full auth-security router, middleware, current account profile/permission SQL, trusted devices and Authv2 sessions on fresh owned PostgreSQL16/Node24.21.0. All28 committed migrations and database/role/loopback/marker identity checks PASS eachrun. Network-none, no ports, readonly source, disposable data directory, early runtime/server/pool cleanup and owned container/volume cleanup SUCCESS. No legacy merchants.json/auth-security.json at end.

Trusted synthetic devices and sessions are seeded via current services. This does not certify interactive login/OTP/approval onboarding, token delivery, browser cookie/CSRF/CORS behavior, production RLS/least privilege, provider operations, concurrency/fault atomicity of these admin writes, every endpoint or permission. SQL assertions cover named rows and versions only. Reenable proves fresh session with retained zero permissions and revoked-cookie nonrevival; it does not prove old permissions are restored.

Backend rejection extends context for WORK-MONITOR-STALE-001 but does not close stale data or pending UI action lifetime failures. RESIDUAL-FIXTURE-CONTRACT-001 remains OPEN; original legacy test failures are not retroactively green. No new canonical product finding in this batch. Existing archive atomicity, expiry marker rollback, profit disclosure and other findings remain OPEN.

Current tracked-file secret scan and workflow policy PASS (exact final counts saved in seq317-security-current.json); reachable historical synthetic fixture gate remains OPEN. Twenty-one selector paths unmapped and222 minimum full App route visual cases NOT_RUN unchanged; this HTTP batch does not reduce that visual denominator. Whole audit percentage NOT_YET_MEASURABLE; release BLOCKED.

Evidence: seq315-device-http-{initial,remaining}.tap and results.json; seq314-runner-fences.test.mjs/.tap. [Initial CI](https://github.com/nora953/fawri-production-source/actions/runs/38484571902/job/115595011417); [remaining CI](https://github.com/nora953/fawri-production-source/actions/runs/38484821000/job/115595809185).

Next SEQ-318: remaining current admin security lifecycle/role boundaries, applicable full App route cases and unresolved provider/hosted operational gates. Continue audit-only; no comprehensive repair plan before audit completion.
