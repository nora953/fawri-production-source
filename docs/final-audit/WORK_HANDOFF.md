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
