# SEQ-240–247 — residual integration fences and Meta recovery matrix

Baseline `17e521408b9fdc5621c18839f88d5f22a2c5992b`; branch `audit/conversation-notes-reconciliation-20261011`; 2026-10-13. Audit only. Application, original tests, CI runner/workflows and schema unchanged; no hosted DB, provider requests or repairs.

## Stage evidence

| Stage | Inspected files/functions / proof | Classification / limits |
| --- | --- | --- |
| SEQ-240 | Current ledgers, SEQ-232–239, residual13-file CSV, isolated provisioner/preload/guard/migrator, original fixture entrypoints | Continuity/source review PASS. Fresh exact worktree retained previous worktrees. No restart of comprehensive audit. Current official isolated executor does not select these13; no runner edits. |
| SEQ-241 | Every13 integration entrypoint through actual `--import scripts/lib/disposable-postgres-preload.mjs`, missing URL and unattested hosted-shaped `.invalid` URL | **26PASS/0FAIL/0SKIP** safety controls, exit0. Child exits nonzero with exact guard denial before application DB import, no original application assertion executed. No network or SQL connection attempted by this preflight. This proves explicit preloader invocation only, not native direct entrypoint safety or current CI wiring. |
| SEQ-242 | All13 integration sources / fixture dependencies, SHA256, actual test names, after hooks, owner singleton requirement, shared runtime authority suite, local URL checks, built-server legacy fixtures | PREPARED_DOCUMENT_ONLY: machine-readable execution manifest. Each must use a fresh owned guarded cluster, committed migrations, scoped env and external teardown on every failure. Owner suite requires zero existingowner;10runtime authority tests share state. Four catalog final hooks only pool.end; knowledge fixed IDs/DELETE before seed + cleanup after seed require container destruction. Three legacy.mjs need compiledAPI and compatibility validation. Original13 runtime NOT_RUN; guards not weakened, orchestration not repaired. |
| SEQ-243 | Actual private `processMetaReplyRefundJob` and `reconcileExpiredMetaJob` bodies in metaWebhookWorker.ts, inert authoritative refund adapter | **8PASS**: success/already-refunded complete; balance conflict/unrecognized rejection deadletter; reservation/subscriptionmissing/SQL exception retry; missing identity deadletters before financial call. Stable event passed to refund adapter; private SQL message sanitized. No actual debit/refund/SQL, prior REPLY-RESTORE-CYCLE-018 remains open. |
| SEQ-244 | Actual expired Meta job dispatcher, fake/live reconcilers injected, absent transport and channeldisconnect | **4PASS**: exactly matching live/fake dispatch; fake no transport deadletter; disconnect retry. No live send, provider state or actual disconnect idempotency proof. Other terminal fallback not added as new acceptance claim. |
| SEQ-245 | Actual `reconcilePostgresMetaReplyJob` in postgresMetaWebhookReplyTransport.ts568–630; inert tenant/event state lookup | **8PASS**: missing/reserved→retry; sent→complete with messageID; failed→retry; sending/unknown→deadletter; SQL fault→sanitizeddeadletter; invalid identity rejected before lookup. These are decision-table tests on trusted injected state, not actual SQL/transitions/race/send certification. |
| SEQ-246 | `beginDelivery`230–305, transportsend463–517, operationalPostgresAuthority.ts69–111, refund and Meta runtime selectors | SOURCE_REVIEW_ONLY: pending delivery insert/update in tenant transaction completes before sendText call; existing pending/uncertain path avoids duplicate send. Operational transaction awaits COMMIT before return, rollback on errors. Thus missing/reserved state retry has a documented ordering basis in current source; no crash/torn-storage/provider atomicity guarantee. Existing reply cycle/refund defects and shutdown findings not closed. |
| SEQ-247 | Exact baseline33Actions snapshot and receipt run38350269903/job115140836967 actual result JSON | **26workflowSUCCESS/7FAILURE**. Receipt native **8PASS/0FAIL** Chrome154: AR/EN/KU×58/80mm and two controlled iframe lifecycle cases. Previous browser launch failure remains ENVIRONMENT_BLOCKED with0tests for its run; current success is a later proof, not a code fix. Logged source PRmerge8f7b4ce414cef44bf79b9dcfa9329d522718a74b differs from audit head. Other workflow statuses not recounted as localtests or per-suite SQL totals. |

## Actual local commands / accounting

Node24.19.0, NODE_ENVtest, no real DATABASE_URL/dependencies/Docker/browser. VM strips actual TS function bodies; financial/state dependencies inert. Fence child only gets PATH/NODE_ENV and, for one scenario, synthetic `.invalid` URL without attestation. Exact test command args, exits and counts in [runtime summary](evidence/seq240-runtime-summary.json).

```sh
node --test --test-reporter=tap docs/final-audit/evidence/seq241-entrypoint-fences.test.mjs
node --test --test-reporter=tap docs/final-audit/evidence/seq243-245-meta-recovery.test.mjs
```

Two exits0. **46local controls /46PASS /0FAIL /0SKIP**, divided into26 pre-import safety refusals and20 Meta adapter runtime cases. They are not46 SQL tests. All13 original integration suites remain NOT_RUN. Actual original paths are attempted behind pre-import guard; rejection deliberately prevents their assertions. Node can emit a failed file-container marker for the guarded child, which is not an original application test execution or a product FAIL.

Initial fence harness inspected stderr only; Node's child test reporter forwards guard diagnostic to stdout.26 initial fixture failures corrected by explicit TAP reporter and aggregate stdout+stderr, preserving exact denial match; initial fixture failures excluded from final26PASS result. No application guard, test assertions or expectations changed. Meta20PASS result not rerun or duplicated in counts.

## Guarded execution readiness and residual limits

[Manifest](evidence/seq242-isolated-execution-manifest.json) includes13 exact filenames/content hashes/test names/requirements. It does not enable current CI selection and is not a promise that legacy fixtures are compatible with Auth v2. Existing localhostname/database-name checks are not ownership attestations. Native direct tests remain unsafe to point at a tunnel or hosted DB; PG-TEST-GUARD-002/003 and DB-TEST-CLEANUP-021 retained. No new duplicate issue.

No original SQL proof claimed for catalog history, knowledge deletion, retention, owner provisioning, emergency access, runtime tenant isolation, legacy customer payment or images. Mounted WorkMonitor/route-role-language-device evidence, real PostgreSQL SIGTERM/provider reconciliation,34 unresolved selector paths and13 integration execution queue remain pending. No domain closure inferred from these controls.

## Current CI / receipt

[Receipt run38350269903/job115140836967](https://github.com/nora953/fawri-production-source/actions/runs/38350269903/job/115140836967):8result entriesPASS, Chrome154.0.8037.97, six thermalwidth PDF cases each1page/exact2400total/costsentinelabsent/no active markup/reprint retained, iframe afterprint/error cleanup with inert print and explicit event. Not physicalprinter/POS/offline/nativeprintdialog certification. [Snapshot](evidence/seq247-ci-snapshot.json) retains33runIDs and actual receipt marker; failed7 workflow identities retained. Unchanged repeats earn no new total coverage. Former receipt run38348021288 remains timeoutbeforeassertions; no need to alter historical evidence.

## Deduplication and next checkpoint

**Zero new canonical product defects.** New source/adapted-runtime recovery evidence strengthens the remaining proof inventory for OPS-WORKER-DRAIN-001; does not clear actual deployed SQL/Meta recovery. Refund decision mapping does not fix historical-cycle accounting defect REPLY-RESTORE-CYCLE-018. Test safety/cleanup gaps map to existing entries. No repair/final remediation plan.

Overall completed/remaining audit percent remains **NOT_YET_MEASURABLE**.13/13 entrypoints have explicit26/26 negative pre-import controls;0/13 original integration runtime execution in this batch. This declared denominator is not whole audit coverage.11domain/fullUI applicability and external operational evidence remain open.

Next **SEQ-248**: original residual13 integration runtime under fresh attested committed-schema clusters when available; mounted WorkMonitor and route-role-language-device cases; actual PostgreSQL SIGTERM/reconciliation faults and Meta delivery recovery. Continue other uncovered lifecycle/security boundaries without repeating known-failing suites for stage count. ReleaseBLOCKED.
