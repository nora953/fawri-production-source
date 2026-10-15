# SEQ-286–289 — actual PostgreSQL consent expiry and lifecycle recovery

Continue baseline31241a304ee5e5017b4af960ec3e683ed55a3f8b. Audit only; new isolated audit workflow/fixtures/evidence. Application, original tests and committed schema unchanged. Completed report supersedes preparation checkpoint; blocked first attempt retained.

| Stage | Actual evidence | Outcome / limits |
| --- | --- | --- |
| SEQ-286 | Seven audit-only SQL cases and fixed-file owned provisioner | Current canonical consent, actual preview validator, canonical lifecycle sweep. No hosted mutation/provider call. |
| SEQ-287 | Four local runner refusal controls, Node24.19.0 | 4PASS/0FAIL/0SKIP; unknown file/missing runner/missing attestation refused before DB actions. Syntax PASS. Separate from SQL business coverage. |
| SEQ-288 | Actions run38433417141/job115421169603, source23efe18cb9089507909b3d390fea790272e22cd7 | ActualPG16/Node24.21.0,28migrationsPASS,7business cases5PASS/2FAIL/0SKIP; temporary-data and owned-container cleanup SUCCESS. |
| SEQ-289 | Source wiring, failure classification and canonical reconciliation | Existing LOW SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 upgraded from adapter-only to actual SQL confirmation; no duplicate finding. Lifecycle recovery proved in bounded invocation; hosted scheduler/HTTP/auth/role scope remains open. |

## Exact business cases

| Case | Outcome | Observation |
| --- | --- | --- |
| Unexpired canonical approve | PASS | status/consent_decision approved committed through current canonical function. |
| Unexpired canonical reject | PASS | status/consent_decision rejected committed. |
| Foreign merchant decision | PASS | SUPPORT_INSPECTION_NOT_FOUND; actual target remains pending. SQL predicate proof in owned superuser DB, not restricted-role RLS certification. |
| Opposite concurrent decisions | PASS | One concurrent invocation succeeds (approved in this run); one receives SUPPORT_INSPECTION_NOT_PENDING. Matching stored status/decision. One bounded race, not exhaustive scheduling proof. |
| Expired consent persistence | FAIL | SUPPORT_INSPECTION_EXPIRED rejects; raw row remains pending, expired_at/ended_at absent. |
| Expired preview persistence | FAIL | SUPPORT_PREVIEW_EXPIRED rejects; raw row remains active, ended_at absent, viewed_sections empty. |
| Canonical lifecycle recovery/idempotence | PASS | Sweep commits expired pending and approved/session markers; fresh live other-tenant request/session unchanged. Expired access stays denied; second sweep reports0new expiry updates; live validator returns read_only=true and records inventory section. |

## Existing SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 — LOW / OPEN / CONFIRMED_SQL

The two failing acceptance cases strengthen the existing finding, not two new defects. Both actual authority functions UPDATE an expired marker and then throw inside withOperationalTransaction. The actual helper issues ROLLBACK, undoing the marker. Access is denied based on timestamp; no expired data access or authorization bypass demonstrated. The stale persisted status can affect lifecycle/audit observation until a successful sweep.

Direct invocation of refreshSupportLifecyclePostgresCanonical fixes the persisted markers: observed first sweep expired_inspection_requests=4 (pending plus approved windows), expired_preview_sessions=2; reminders/escalations/autocloses0. A second sweep all counters0. Those totals include earlier isolated fixture rows intentionally retained in the same owned cluster; not four independently executed expiry tests. The selected lifecycle fields (status, consent decision, expiry/end markers and viewed sections) of live other-tenant rows remain equal across both sweeps. Subsequent expired request/session checks return NOT_PENDING/ENDED respectively. No finding closure: service denial path still rolls marker back, and production scheduler reliability is not certified by direct invocation.

Source wiring: auth-support-inspection-decision-postgres-routes uses current canonical decision under secure merchant session; auth-support-postgres-routes snapshot validates preview before building snapshot and passes authenticated admin/session IDs. postgresSupportRuntimeCutover calls canonical sweep at startup and intervals (production60s/test5s) and catches/logs failure; admin lifecycle/realtime routes also call it. This is source evidence only. The test does not mount those routes, use real cookies, start timers or certify assistant-role/browser journeys. Preview fixtures use null admin_session_id because this batch targets expiry; existing session-binding finding remains open.

## Provenance and correction

Corrected source23efe18cb9089507909b3d390fea790272e22cd7, https://github.com/nora953/fawri-production-source/actions/runs/38433417141/job/115421169603 . Fixed explicitESM.mts audit fixture, existing DB entrypoint, fresh network-nonePG16, zero published ports, readonly repository and owned attestation/database/role/run marker checked before28committedmigrations/import. No hosted credentials/provider actions. Owned superuser allows synthetic seeding; not least-privilege runtime proof. Pool ended after test, executor temp cleanup=true, teardown trap and final always cleanup SUCCESS.

Initial sourcea4751a9bcb7959192e0db52a1bdd4ee3582c8124 run38433129065/job115420176153: migrations28/identityPASS, initial audit adminseed lacked mandatory phone; all7cases stop at23514 accounts_active_phone_required_check before targetbusiness assertions. Initial TAP0P/7F are AUDIT_FIXTURE_SEED_BLOCKED, not seven product defects. Audit seed corrected with E164adminphone and verification timestamp; no schema constraint weakened or original test changed. Sanitized selected markers/jobsteps and corrected TAP saved in seq288evidence; no raw private logs/session tokens persisted.

## Remaining scope

New SQL7cases5P/2F and separate local4refusalcontrolsPASS. Prior results preserved without recounting. ExistingLOWseverity unchanged; actualSQL_PENDING evidence gap now resolved for these consent/preview marker scenarios. Lifecycle invocation proof does not clear mountedHTTP/secure-session/currentrole/RLS/worker failure or fullUI/provider gates. Current tracked repository scan1754files/0findings PASS; policy70workflows/0violationsPASS. Historicalsynthetic reachable-historygate stillOPEN, no overallsecurityclearance.

21/277 selector uncertainty and222fullroutevisual casesNOT_RUN unchanged. Overall percentage NOT_YET_MEASURABLE. ReleaseBLOCKED. NextSEQ-290: licensedcashier sale/history scenarios not blocked by retired fixture assumptions, actualHTTP/role lifecycle boundaries and remaining route inventory. No application repair/final remediation plan/merge/deployment.
