# Fawri audit — durable resume point

Updated2026-10-11. DraftPR520; audit/conversation-notes-reconciliation-20261011. Test infrastructure/fixtures/docs only; no app repair, hosted mutation, merge or deploy authorized.

## Last completed task and commit

SEQ-20 [source05456ea9](https://github.com/nora953/fawri-production-source/commit/05456ea9c5bfdf9c007159aae0226f8c949db1e6), [run38176210529](https://github.com/nora953/fawri-production-source/actions/runs/38176210529), job114579031278:33 unique files/34invocations,126PASS/14FAIL/0SKIP. Six offline28-migration chains/owned teardownSUCCESS. auth business-route11PASS including previousDBskip; password recovery tamper/replay/concurrent reset/revocationPASS. Fullschema recovery/addon controlsPASS. Latest documentation checkpoint preserves this evidence and UI review; its GitHub commit is current branchHEAD (no self-referential SHA embedded).

Meta pipeline38176210628/job114579031565SUCCESS:knowledge1/Meta54PASS, migration28. Foundation38176210612/job114579031408SUCCESS: deletion1 plusknowledge1/Meta54PASS, two fresh28migrationchains/finalmarker. Historical guard-refusal failures repaired; do not call them appdefects. Expected failedResources2 marker is guard unit fault fixture, not teardown failure.

## Open issues and evidence limits

Executed six findings006/012/018/027/028/032 remain: ten functional failures+four parents.027/028/032 also cashier-confirmed; cashier checkout sixsamekey controlsPASS. Source UI findings:016keeper selection omits release_scheduled despite serverPASS; newFAWRI-UI-006rawbillingenums/Englisherror display.030two moderate dependencies/artifactpresence, active exploitability unproved.020candidate inventory64 integrationfiles,17directmarkers/32selected,32outsideboth; additional non-integration authcutover file selected via preloader, notdirectguard.

Recovery is full committed schema + twofixturechannels in one owned cluster with pre-existing roles, not cluster-role/PITR/external-media proof. Meta/AI/payment providers are synthetic/injected only. AR/Sorani/EN review critical billing/security surfaces source-only; no browser/linguistic clearance.

## Exact next task

R09: create guarded disposable two-merchant HTTP session ownership/revocation/token-redaction negatives under a synthetic restricted nonowner/NOBYPASSRLS role with modeled broad sensitive-table grants. Confirm actualrole before HTTP. This is a partialFA-I-007 API-defense proof, not live-role grant certification. Register teardown before mutation. Then R13deployment/rollback/media recovery source review; reconcile final report/remaining scope and PRbody. Reuse unchanged proof; no unsafe direct tests/hosted mutations.

Docs-only checkpoint may rerun existingActions due wholePR path matching; no test result may be assumed from it. Durable source/results are committed. Check remoteHEAD and read latestlogs only if new assertions/configuration or failure justify it.

## Blockers, authority and estimate

Business/UI fixes require explicitapproval. Hosted runtime role/provider settlement/storagePITR/browser QA need identified approved environments. No localDocker/psql; isolatedActions available. Workbalance unknown. Nexttask15–30minutes; roughly1.5–3.5hours focused audit excluding queues/newfailures/repairs/externalproof. Release date/readiness not established.

## Latest SEQ-21 saved preparation (supersedes next task)

Previous source/documentation checkpoint[755cc007](https://github.com/nora953/fawri-production-source/commit/755cc00708cdbe52711c007ad2a7e476f92072e0). Newrestricted-session HTTP fixture prepared and saved in this commit; exact remoteHEAD is durable. Actual no-attestation direct refusalPASS (exit1beforeDBimports); syntax/diffPASS. DB/HTTP results NOT_RUN.

Next read CI for this commit:34unique files/35invocations. Newfixture must prove applicationpool role is restricted/nonowner/NOBYPASSRLS, broadfourDMLgrants and account_sessions nonRLS, then missing/tampered/wrongdevice401, own-only/token-redacted list, crossrevoke404/ownrevoke200, forbiddenorigin403/no mutation and own logout-all preserving othermerchant. Separate fixture/permission failures from confirmed app defects; verify teardown role/account cleanup. No live staging-role conclusion. Latest executed source05456ea9 still126PASS/14FAIL/0SKIP with sixexisting findings. After proof, R13deployment/media/PITR source review andR14report reconciliation. Business/UI repairs remain outside authorization.

## Latest SEQ-22 checkpoint (supersedes earlier next task)

[Sourcefccd677a](https://github.com/nora953/fawri-production-source/commit/fccd677a1798470b3dba70e20ccbc37662177ceb), [run38176766705](https://github.com/nora953/fawri-production-source/actions/runs/38176766705), job114580690925:131PASS/14FAIL/0SKIP;34unique/35invocations,six28migrationchains/cleanupSUCCESS. Restrictedbroadgrant actualapplicationrole5HTTPtestsPASS; allfive sensitive tablesnonRLS, noowner/super/bypass. FA-I-007partialsessiondefenseproof only; staff/credential/livegrantgapsremain.

NextreadCI for this checkpoint: fixedNode22HTTP compatibility adds seventhfreshcluster and one repeat;34unique/36phase-runtimeinvocations. Runtime/auditBatch fields distinguish fromNode24HTTP; reasonforrerunDockerfileNode22vsoriginalNode24. Node22resultNOT_RUN sofar. Verifyallmigrations/cleanup; do not call it actualimage/stagingstartup. R13source review and approved-environment role/media/redeploy/rollback/PITRdrill proposal saved. Externalauthorization needsunchanged.

Then BILLING-EXTERNAL-TX-013 mocked externalcheckoutsuccess plus attachment/commitSQLfailure/retry, preservingprovider-sideeffectevidence; currentlyunprovedgap. Complete finalreport reconciliation/currentPRsummary after safe scopecheckpoint. Next15–30minutes; remaining roughly1–3hours excluding queues/newfailures/fixes/externalproof.

## Latest SEQ-23 checkpoint (supersedes next task above)

[Source83999ff1](https://github.com/nora953/fawri-production-source/commit/83999ff1ff1986ce5284142f089b1c459abab2e9), [run38177206914](https://github.com/nora953/fawri-production-source/actions/runs/38177206914), job114581998702:132PASS/14FAIL/0SKIP,34unique/36phase-runtimeinvocations; seven28migrationchains/cleanupSUCCESS. HTTPNode22.23.3 and24.21.0PASS; no actualpackagedstagingimage startupproof. Restrictedsession5/fullschema recoveryPASS.

Preparedand savedguardedexternalcheckoutrollbackfile for013/015 (noDBexecutionyet). NextCI35unique/37invocations: mockpaymentcreation/openSQLtransaction; SQLP0001referenceattachmentrollback; signedgatewaystatus-confirmed orphan handling; samekeyretry mustretain/reuse externalrequestidentity. BothproviderPOSTandstatusGETinjected; statusmockcountasserted; generatedRSA/privatekeys neverpersisted. Actualcode syntax/noattestationrefusalPASS. Classifyfixtureerrors separately; recordprecise Nodeparentsvsfunctionalcounts. Thenfinalreport/PRsummary reconciliation with originalopenissueIDs; no business/UIfixorhostedmutation. ActualCOMMITfailure/providerlatency/productionretrybehavior remainunproved.

Nexttask15–30minutes; estimatedremaining focusedreconciliation/follow-up roughly1–2.5hours excludingqueues,newfailures,repairs,externalproof. Workbalanceunknown.

## Follow-up checkpoint — 2026-10-12 (audit continuation)

Comprehensive non-code release scope saved as `COMPREHENSIVE_RELEASE_AUDIT_SCOPE_2026-10-12.md` at commit `4d758cb428bb1236c85ac025f2f3f0318785e732`. The first CI wave for that docs-only commit is **in progress**, notably isolated PostgreSQL run `38180288392` (job `114591204939`), quality `38180288501`, security `38180288462`, cashier `38180288649`; **do not claim success yet**. Next checkpoint: read isolated-run logs for `billing-external-checkout-rollback-postgres.integration.test.mjs`, count actual test assertions and cleanup, distinguish fixture failure vs confirmed 013/015 product behavior; reconcile all CI outcomes and update ISSUES/EXECUTION_RESULTS/FINAL_REPORT. Do not run against hosted databases, change application behavior, or merge. Non-code scope includes UX/RTL/accessibility, operations, media persistence, provider settlement and commercial/legal readiness; untested gates remain OPEN.

## SEQ-26 continuation checkpoint — 2026-10-12

Previous in-progress CI note is superseded. Completed isolated PostgreSQL run [38180374172](https://github.com/nora953/fawri-production-source/actions/runs/38180374172), job 114591512528: 132 PASS, 21 FAIL, 0 SKIP across 37 phase/runtime invocations. New synthetic checkout rollback suite 0 PASS/7 FAIL; SaaS and cashier both confirmed existing BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015. Exact observations in ISSUES.md; exact suite breakdown in EXECUTION_RESULTS_2026-10-11.md (commit fd85f357); final launch-gate synthesis in FINAL_REPORT_DRAFT.md (commit 7e64bec4); remaining-work checkpoint in REMAINING_WORK_MATRIX.md (commit 6e2fc890). The CI run has completed: quality/security SUCCESS; isolated PostgreSQL FAILURE; cashier isolated FAILURE, normal cashier suite SUCCESS. Meta synthetic, full schema restore, Node22 HTTP, cleanup PASS. New CI from docs-only commits should not be interpreted as new code proof unless source/fixtures change. No new app business changes.

**Next work:** prioritize existing issue IDs 013/015/012/018/027/028/032/FA-I-006 and UI006/016 with severity, acceptance tests and remediation dependencies; check coverage by user role and screen without treating source review as browser proof; record separate operator/owner approval requirements for real payment sandbox, hosted role grants, media/PITR, staging container startup and commercial/legal signoff. Avoid duplicate issue IDs or rerunning completed synthetic proofs without changed source. Release remains BLOCKED. Commit documentation checkpoints to GitHub; do not merge PR520 or deploy.


## CURRENT RESUME — SEQ-113, 2026-10-12 (supersedes earlier next-task sections)

Branch: `audit/conversation-notes-reconciliation-20261011`; draft PR #520. Last completed: SEQ-109–113. Reviewed source: `23563ffba019a666e3d2f61f29769723d56b7e03`; main: `d38d29229bed0f9575a98e7026e7819fe363bfd4`. Discover this documentation/test checkpoint from the branch HEAD; no self-referential SHA is embedded. Read current refs and PR discussion first. The old SEQ-26 handoff was stale: later SEQ-27–108 evidence is in PR comments and the existing cashier review files. Do not restart the audit.

### Completed evidence

- `scripts/fawri-sync-audit.test.mjs`: actual committed function bodies with explicit inert dependency adapters. 27 PASS / 0 FAIL / 0 SKIP on Node 24.19.0. This executes uploader orchestration, sale parsing/replay, timeline and offline-cache helpers, without application imports, DB, IndexedDB or provider calls. Tests asserting problematic current behavior being green mean reproducible evidence, not repaired product.
- Existing four source-contract files: 18 PASS / 0 FAIL / 0 SKIP. Exact commands in EXECUTION_RESULTS_2026-10-11.md. Syntax and git diff checks PASS. Node stripTypeScriptTypes warning is nonfatal.
- New canonical proof gaps: CASHIER-SYNC-SEQUENCE-001 (accept 1→3, reject later 2) and CASHIER-SYNC-SHIFT-001 (pending binding from prior shift rejects before upload). Normal logout already refuses pending envelopes, mitigating the ordinary shift-close path. Feasible expiry/admin-close recovery still needs integration proof.
- Existing CASHIER-OFFLINE-001: structural validation accepts edited far-future grace; clock helpers reject >2-minute rollback and preserve the durable prior server-time estimate. No full POS licensing bypass claimed.
- Server normalized hash rejects changed note and coherent changed quantity/totals; identical sale replays with no inventory access; cross-tenant mismatch rejects before transaction. Client invalid/partial ACK and network ambiguity retain operations; partial upload deletes accepted first operation only. These are mocked runtime results, not real SQL/HTTP/storage proof.

### Current baseline CI

Run 38187646375 / job 114613349687, source 23563ffb: 132 PASS / 21 FAIL / 0 SKIP, 35 unique files and 37 invocations. Fourteen functional failures and seven parents correspond to eight existing canonical findings: FA-I-006, 012, 013, 015, 018, 027, 028, 032. Current historical-operation test 1 PASS; compensation-history 2 PASS; restricted-session 5 PASS; injected Meta 54 PASS; full-schema restore, Node22 HTTP and owned cleanup PASS. Cashier run 38187646619: normal job 114613350272 PASS, isolated job 114613350678 FAIL. Of 23 current-head workflows, 21 SUCCESS and 2 FAIL. No rerun requested. New checkpoint Actions are UNKNOWN until inspected; baseline results must not be attributed to a later SHA as fresh execution.

### Exact next task: SEQ-114

Prepare guarded disposable PostgreSQL gap/backfill and simultaneous two-device final-stock tests. Read existing guards/runner/fixtures, add only new assertions: 1→3→2, intentionally local-only sequence gap, initial sequence >1, exact/altered replay, last-stock competition, sale-versus-return, transaction rollback and complete receipts. Existing CI does not cover this exact matrix. Test-only changes and documentation are authorized; application repairs are not.

Then SEQ-115: reproduce pending operations after expired/admin-closed session, preserving historical staff/shift attribution. Test same/new operator, return/void, session restoration and core-sale commit followed by attribution failure/retry. Do not claim the ordinary logout path is broken or remove its pending safeguard.

SEQ-116/117: actual browser IndexedDB multi-tab concurrency, versionchange recovery, local changed-payload sale/return/void replay, restart/outbox durability, exact 7-day expiry and cache/clock tampering. Browser launch is currently ENVIRONMENT_BLOCKED: Playwright is installed but Chromium headless-shell executable is absent. Docker/psql also unavailable locally. Never substitute live Neon or a real gateway for isolated tests.

### Decisions and remaining gates

Gap/tombstone/backfill policy, secure historical upload recovery and signed offline license threat model need concrete design approval before functional changes. Existing payment repair design remains unapproved. User forbids application fixes, main merge, deploy, live DB/secret changes and real payments without separate authorization. Continue independent authorized audit work when possible.

Engineering audit planning estimate: approximately 50%, uncertain 40–60%, using explicit milestone/domain weights in PROGRESS.md; not a measured scenario pass rate, release-readiness percentage or release-date forecast. Release remains BLOCKED. Whole-product scope still includes dashboards, reporting/export, languages/RTL/mobile/accessibility, hosted grants/image/readiness/media/PITR, monitoring/rollback, authorized providers and commercial acceptance.
