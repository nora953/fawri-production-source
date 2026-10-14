# SEQ-232–239 — real SIGTERM, durable recovery and monitor races

Baseline `6ef87566bb55f6d6c9d7fc17698e4af210980482`, audit branch `audit/conversation-notes-reconciliation-20261011`, 2026-10-13. Continuation, no restart. Application/existing tests/workflows/schema unchanged. No repairs, deploy, real payments or DB connections. Only synthetic owned temporary disk fixtures and loopback HTTP child server.

## Evidence and classification

| Stage | Files/functions and execution | Outcome / limit |
| --- | --- | --- |
| SEQ-232 | SEQ-225–231 report, current ledgers, exact remote branch, prior OPS-WORKER-DRAIN-001 / WORK-MONITOR-STALE-001, actual index shutdown and authoritative worker selection | Continuity PASS. API Meta worker calls startDurableJobWorkerAuthoritative; required production authority chooses PostgreSQL branch. Default local JSON queue cannot certify that SQL branch. |
| SEQ-233 | Actual entire durableJobQueue.ts with only data-path resolver adapter; actual index.ts shutdown body with real process.exit, real SIGTERM, real loopback HTTP server.close, native fs/timers and owned directory. Runtime.dispose/logger are inert adapters. | Three cases: two observational/control PASS, one acceptance FAIL. stop+resume naturally completes durable job once. SIGTERM exits0 with actual persisted processing claim and pre-gate synthetic side effect, runtime.dispose marker present. Acceptance drain FAIL. No mock process.exit, timer or HTTP close callback. Whole compiled API startup/auth/SQL/runtime disposal not executed. |
| SEQ-234 | Restart queue instance loads actual persisted fixture after child dies. Date adapter advances to lease expiry+1s; real disk/lock/queue transitions. Default uncertain outcome, explicit successful reconciliation, throwing reconciliation | Three PASS: uncertain/error become blocked dead letter; explicit successful reconciliation becomes completed; none reruns handler and no job disappears. Dead-letter requeue rejected. Explicit injected reconciliation outcome is not Meta provider proof. Accelerated clock is not a real five-minute wall-clock test. |
| SEQ-235 | Actual startDurableJobWorkerAuthoritative required-authority branch body with inert tenant/claim/heartbeat/complete SQL adapters; real timers, held async handler | One PASS: concurrent runOnce refused; stop returns undefined, disables future runOnce but current handler continues/completes after release. Supports production-shaped scheduling gap; no real Postgres claim/recovery transaction tested. |
| SEQ-236 | Actual AdminWorkMonitorPage load callback, deferred inert fetch/shared state. Distinct admin IDs and competing success/403 requests | Four cases:2observational PASS/2acceptance FAIL. Old admin-A response replaces successful admin-B state. Old success can clear newer visible403 loadError. Existing WORK-MONITOR-STALE-001 strengthened. Does not mount React/router; same-component prop-change applicability confirmed in App.tsx154–155 without explicit key, but actual navigation/render pending. |
| SEQ-237 | Actual executeAction callback, pending revoke-session + synthetic owner password, after visible/silent403 refresh, inert POST denial | Four cases:2observational PASS/2acceptance FAIL. Both cases still send POST; returned403 produces actionError and clears processing. No real credentials/network/actual mutation. Existing UI freshness finding, no backend bypass. |
| SEQ-238 | AdminWorkMonitorPage.tsx184–194,275–285,457–519; App.tsx154–155; auth-admin-postgres-routes.ts356–365,483–500; Meta worker421–463/reconcile267–315 | SOURCE_REVIEW_ONLY. Cleanup clears interval but does not abort old fetch. Confirmation dialog remains outside main data/error conditional; confirm disabled only by processing or empty password, action callback lacks loadError/generation guard. PostgreSQL mutation route still has secure session/owner/assistant/password gates; no client-only authorization claim. Actual Meta-specific recovery delegates to refund/disconnect/live reply contracts; generic local queue controls do not certify them. Mounted browser BLOCKED: no Chromium, frontend dependencies or compiled CSS here. |
| SEQ-239 | 33 Actions for baseline, receipt run38348021288/job115133820484 raw result marker and job steps | Snapshot25SUCCESS/8FAILURE. New receipt failure is ENVIRONMENT_BLOCKED: browser:null/results:[], Browser prerequisite timed out. Zero receipt assertions ran; not8new product FAIL. Logged source is PR merge656e0f702c97b5cbd6074291cce58c496be70582, distinct from audit head. Prior valid native receipt proof remains historical. Other seven known workflow failures not re-counted as new defects. |

## Actual commands and counts

Local Node24.19.0, no DATABASE_URL in child env, no Docker/Chromium or installed project dependencies. No direct application DB imports. TS-stripped code executes in vm; all application bodies read from exact unchanged baseline. Child fixture persists real synthetic background-jobs.json and synthetic effect/dispose files in mkdtemp; each test kills/awaits owned child and removes directory.

```sh
node --test --test-reporter=tap docs/final-audit/evidence/seq233-235-worker.test.mjs
node --test --test-reporter=tap docs/final-audit/evidence/seq236-237-monitor.test.mjs
```

Actual first command exit1: **7tests/6PASS/1FAIL/0SKIP**. Second exit1: **8tests/4PASS/4FAIL/0SKIP**. Disjoint local total **15tests/10PASS/5FAIL/0SKIP**; no parent markers. Observational PASS means current problematic behavior reproduced, not product repaired. TAP and source harnesses preserved alongside report. Exact exit codes recorded in evidence/seq232-runtime-summary.json from a final verification rerun with clean parent env; this rerun replaces preliminary evidence, is not added to totals.

The durable child writes a synthetic effect before awaiting the held handler. SIGTERM removes the process before completeDurableJob; durable processing row survives. Restart tests show retention/fail-closed recovery in the local JSON authority. There is no actual provider send/payment, no production cluster restart, no lost database row or duplicate provider effect demonstrated. Successful reconciliation is an injected known outcome and has no live provider guarantee.

## Deduplication / risk interpretation

**Zero new canonical product findings.** Five acceptance failures strengthen TWO existing findings:

- OPS-WORKER-DRAIN-001: upgraded from adapter-only shutdown proof gap to real child SIGTERM reproduction for local queue + actual shutdown body; required PostgreSQL worker stop semantics observed with inert SQL adapters. MEDIUM/OPEN, deployed SQL/provider drain/recovery still pending. Release remains blocked independently of whether generic dead-letter protection avoids duplicate execution.
- WORK-MONITOR-STALE-001: race and pending-action freshness evidence added; no new duplicate created. UI stale state/attempted action is not a backend authorization bypass. Backend denial was a controlled adapter in tests; route source provides authorization gates but runtime backend revocation matrix not newly exercised.

Receipt startup timeout is an environment occurrence; do not create a receipt defect or overwrite earlier valid PASS evidence. Current workflow FAIL and test NOT_RUN are separate classifications.

## Links, scope and next checkpoint

[Receipt run38348021288/job115133820484](https://github.com/nora953/fawri-production-source/actions/runs/38348021288/job/115133820484); JSON result: browser null, no cases, prerequisite timeout. [Snapshot](evidence/seq239-ci-snapshot.json) records33runIDs/statuses. [Current isolated run38348021258](https://github.com/nora953/fawri-production-source/actions/runs/38348021258) is workflowFAIL; no new per-suite144/24 total inferred. [Quality run38348021321](https://github.com/nora953/fawri-production-source/actions/runs/38348021321) SUCCESS does not certify full coverage.

No overall percentage recomputed.11-domain inventory,34unresolved test selectors/13integration runtime queue and applicable route-role-language-device denominator remain open. Do not add15tests to a universal denominator or credit unchanged CI repeats. Remaining audit percentage NOT_YET_MEASURABLE.

Next **SEQ-240**: safely prepare13integration evidence; actual mounted WorkMonitor/routing/action revocation; production-shaped PostgreSQL SIGTERM/lease/Meta recovery under owned guarded instance; route-role-language-device case inventory. Receipt launch environment can be rechecked with documented transient reason, without repairing production code or weakening assertions. No final repair plan before audit completion. Release BLOCKED.
