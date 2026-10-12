# Remaining audit work — 2026-10-11

Each row is a short task with a separate saved checkpoint. Estimates are engineering estimates, not credit estimates or measured completion percentages. Reuse prior evidence unless the row adds an assertion or changes the tested configuration.

| Next task | Scope and success criteria | Current evidence / dependency | Estimate |
| --- | --- | --- | --- |
| R01 | Read latest isolated run; classify all 26 files, migrations and cleanup; save exact counters and issue updates | SEQ-18 read/saved:114PASS/14FAIL/0SKIP,31 unique/32invocations; next password suite expands32/33 | 15–30 min |
| R02 | Extend direct-entrypoint guards based on inventory; prove unsafe targets rejected before DB imports | 64 textual candidates;17 direct markers/32 selected after password recovery;32 outside both. Local password pre-import denialPASS; HTTP CI pending | 15–30 min |
| R03 | Failed setup and first SQL cleanup failure; later deletion/error visibility | COMPLETE common strategy onfe892e69/run38174186237: childexit1, zeroaccounts/merchants, rawerrorredacted; journey-specific fault points remain optional follow-up | Completed |
| R04 | Cashier retention selection and month-end/leap-year/proration boundaries | Retention/stale-version DBPASS;8 calendar/nearzero policy testsPASS. Pricing policy decision/UI proof still open | 15–30 min |
| R05 | Cashier same-key checkout, payment-ref competition and SQL-failure recovery | COMPLETE audit: cashier6same-key trials/payment-refPASS;027/028/032 confirmed. Application repairs need approval | 15–30 min |
| R06 | Refund after cycle change: base, expired/missing add-on batch, duplicate credit and concurrent refund | COMPLETE audit: base018FAIL; addonFK/concurrency/expired-renewal3PASS; official suspended sender017denialPASS | 15–30 min |
| R07 | Knowledge learning lifecycle and injected-provider Meta lifecycle | COMPLETE on2964aba2/run38173603888: standalone learning1PASS, Meta54PASS; real-provider proof remains external | Completed |
| R08 | Full migrated Fawri schema plus synthetic account/merchant/RLS fixture dump/restore; compare data/policies and rerun tenant assertion | COMPLETE synthetic schema/channel proof: seed+verifyPASS,94tables/45policies/638constraints/matching fingerprint/restricted reads. Role/media/PITR external | 15–30 min |
| R09 | Sensitive non-RLS table grants and authenticated HTTP denial matrix | FA-I-007 remains a coverage gap; avoid owner-role-only conclusions | 15–30 min |
| R10 | Determine moderate advisory reachability in shipped API/frontend artifacts; propose minimum compatible patch |030 has exact dev dependency paths; exploitation unproven | 15–30 min |
| R11 | Normalize bot/AI/security CI counts, provider mocks, skips and failure coverage | Reuse already green adversarial/quality/security runs; live provider proof excluded | 15–30 min |
| R12 | Review critical Arabic/Sorani/English text and accessibility/error states from source; record semantic candidates | Structure already PASS; semantic/browser proof not supplied by structure | 15–30 min |
| R13 | Review staging deploy triggers, rollback and persistent-media recovery requirements; prepare reviewable recovery drill | Hosted changes forbidden; no-volume staging observation is historical | 15–30 min |
| R14 | Reconcile final report, canonical statuses, evidence links, remediation order and handoff | Draft only until required operational and visual gates resolved | 15–30 min |

Original14-task plan was3.5–7hours. WithR03/R07 completed, the remaining12listed tasks represent roughly **3–6 hours** of focused audit work, excluding queue time, additional investigations caused by failures, approved application fixes and external proof. This is a planning range; update it after each resolved row. A complete release decision has no reliable end date until the dependencies below are resolved.

## Decisions and external proof

- Application changes for restricted Meta routing and billing012/027/028/032 require explicit approval. Do not disable RLS or grant runtime BYPASSRLS.
- Reply-cycle credit policy needs a decision if observed behavior conflicts with accounting invariants; document behavior before proposing a change.
- Persistent catalog/support media storage, production-like recovery/PITR/RPO/RTO, real provider settlement and real Meta/AI operation require separately approved environments, credentials and procedures.
- Final visual QA requires an identified deployed version and approved site access; structure/typecheck/build success cannot substitute for browser evidence.
- Main merge and production deployment remain forbidden without explicit approval.

SEQ-18 planning update: R03/R05/R06/R07/R08 synthetic tasks complete; R01 checkpoint recurring. R02 broader guards, R04 policy/UI limits, R09/R11/R12/R13/R14 remain; R10 artifact presence established but compatible fix/exploitability external. Remaining focused audit roughly2–4hours excluding queues, new failures, fixes and external gates. Earlier3–6hour estimate is historical.

SEQ-19: password recovery HTTPPASS; R11 CI normalization complete with one explicit skipped business-route DB assertion queued in isolatedrunner. Two legacy Meta guard refusals repaired, actualCIpending. R02 remains32 uncovered integrationcandidates plus out-of-glob DB tests; no broad safety closure.

SEQ-20: R11 safe legacy caller repairs actualPASS and priorauthDBskip nowPASS. R12 bounded critical source review complete; existing016UI selection and newUI006localization findings documented, browser/linguistic/fullsite gates open. NextR09 restricted-role HTTP ownership, thenR13 recovery/deploy review andR14 reconciliation. Remaining focused range1.5–3.5hours excludes external proof and fixes; directguard breadth remains open.

SEQ-21 R09guarded two-merchant HTTPsession proof prepared under actual synthetic restricted applicationrole/broadgrants; localpreimportdenialPASS, DBpending.34unique/35invocations next. Doesnot certify actualhostedgrants/staff/credentials.

SEQ-22 R09boundedrestrictedHTTPsessiondefense5PASS; actualrole/grants/nonRLSproven, hosted/staff/credential scopeopen. R13source/drillplancomplete; Node22runtimecompatibilitypending, actualimage/redeploy/media/PITRexternal. Next013externalcheckoutSQLrollbackmockproof thenR14report reconciliation. Roughly1–3hours focused work plus external/fix/queue dependencies.

SEQ-23 Node22/24HTTPcompatibilityactualPASS; R13boundedsource/drilltaskcomplete, hostedproofopen. Existing013/015mockrollback/orphanmatrixprepared, actualCIpending. ThenR14comprehensivecheckpointreport with precise residualproofgaps; remainingfocusedrange1–2.5hours excluding operationalproof/fixes/queues.

SEQ-24 (2026-10-12): Isolated PostgreSQL run 38180374172 completed FAILURE; new guarded checkout rollback test reproduced canonical BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015 in both SaaS and cashier. First order rolled back after synthetic external creation; same-key retry caused second fake provider creation and orphan webhook ignored order_not_found. Exact evidence recorded in ISSUES.md commit 8efdf168. Final quality/security workflows SUCCESS; isolated cashier workflow FAILURE. Meta fake-provider, full-schema restore, Node22 HTTP, cleanup steps PASS. Next: reconcile detailed new run counts, classify all remaining failures, update final report and whole-product gate inventory. Release remains BLOCKED; browser/RTL/accessibility, actual offline device, hosted RLS grants, media/PITR, real provider sandbox, staging startup and commercial/legal acceptance remain NOT VERIFIED. Do not treat synthetic test as real double charge; do not merge/deploy or alter business code without approval.


## SEQ-113 current remaining queue (supersedes old exact-next rows)

| Next | Task / exit evidence | Dependency / allowed scope |
| --- | --- | --- |
| SEQ114 | Guarded disposable PostgreSQL1→3→2/gap contract, exact/altered replay and paired two-device final-stock contention | New test-only assertions/fixtures permitted; no live DB. Define distinction between commerce gap and intentionally local-only adjustment. Preserve tenant/device/operation uniqueness and fault rollback |
| SEQ115 | Expired/admin-closed prior-shift pending-operation recovery; sameoperator/newoperator/return/void/attribution-fault retry | Test-only actual HTTP on disposableDB; browser dependencies. Normal logout already blockspending and must not be removed |
| SEQ116 | Real IndexedDB two-tab stock/compensation concurrency, versionchange automatic recovery and durablepending after restart | Chromium absent locally; identified safe browser needed. No fake browserPASS |
| SEQ117 | Local sale/return/void altered-payload retry,7dayexpiry/cache tamper/clock restart and pending-upload partialacceptance | Source findings already known; add actualbrowser proof rather thanrepeat source assertions |
| Repair gate | Prioritize013/015/012/018/027/028/032/FA-I-006 and UI findings; signed license/gap/recovery designs | Application changes require user approval after concrete design. No production changes |
| Whole-product gates | Admin/merchant/staff flows; reportPDF/Excel/data parity; AR/EN/KU RTL/mobile/accessibility; hosted roles/readiness/image/rollback/media/PITR; authorizedproviders/settlement/commercialacceptance | Keep SOURCE_REVIEW/MOCKED_RUNTIME/DISPOSABLE_INTEGRATION/STAGING/BROWSER distinct; use current scope ledger, no duplicate findings |

Planning estimate approximately50%(40–60% uncertainty) for engineering evidence coverage, not release eligibility. No reliabletime-to-release while repairs and target-environment/provider proof remain blocked. This audit batch did not execute new remoteCI; current existing runs are exact baseline evidence. Any new commit'sActions must be read before claiming current pass.


## SEQ-114 — guarded real PostgreSQL proof prepared (2026-10-12)

Continuation from saved commit `3d88d9c78350db1b82036eee6e2a0a6c73c75ba6`. Added test-only `artifacts/api-server/tests/cashier-sync-multidevice-postgres.integration.test.mjs` and registered it first in the existing `cashier` isolated runner batch. No application changes or workflow permissions altered.

Two subtests plus parent: four independent merchant trials, two licensed/credentialed devices competing simultaneously for one physical stock unit at one location; require exactly one sale, one mutation, one timeline record, stock0/version2 and loser CASHIER_SYNC_NEGATIVE_STOCK. Concurrent exact winner replays must cause no second mutation; changed-note replay must reject idempotency conflict; loser retry must remain negative-stock. Separate actual-SQL timeline observation accepts1→3 and rejects later2, preserving the sequence-gap PROOF_GAP instead of approving that behavior. No provider HTTP: subscription activation uses existing test_fake APIs and all fixtures are synthetic.

Shared attestation executes before DB/application imports; teardown registered before first fixture mutation, tracks owned account IDs before INSERT and aggregates cleanup failures. Existing network-none runner and migrated schema retained. Local syntax checks PASS; direct unattested invocation exits1 with expected guard refusal before DB import. Actual PostgreSQL assertions **NOT_RUN locally / CI_PENDING**, no assertion success claimed. Expected inventory becomes36 unique files/38 invocations for the full isolated run if all existing phases execute; counts/results must come from logs, not expectation.

Exact next action: inspect the new commit's isolated CI cashier phase and this test's AUDIT_SUITE_RESULT, distinguish fixture/schema errors from product failures, verify cleanup, and update these ledgers. Do not rerun previous unchanged assertions merely to increase counts; this run is justified by new multi-device/altered-replay/gap assertions. After proof, continue SEQ-115 feasible expired/admin-closed historical shift recovery. Browser/IndexedDB remain blocked locally by missing Chromium. Functional fixes, hosted DB, deploy and merge remain unapproved. SEQ-114 is PREPARED until actual results are reconciled.


## SEQ-114a update

Firstnewrunclassified inEXECUTION_RESULTS: gapSQLobservationPASS; stockracefixture/recoverytamperfixture correctionspendingactualCI. Nextmandatorytask isreadcorrectedheadCI suitecounts/cleanup, notdeclareSEQ114fullPASS. Afterproof: feasibleclosedshiftrecoveryHTTP, realIndexedDB/browser, signedlicense and remainingwholeproductgates. Existingproductfailuresstillopen; nofunctionalfixauthorized.
