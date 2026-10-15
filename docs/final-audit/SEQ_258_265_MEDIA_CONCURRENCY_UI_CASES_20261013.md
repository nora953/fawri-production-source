# SEQ-258–265 — media deletion concurrency and explicit UI case inventory

Baseline `b97df88c43e99940a9d50638a9334422da00982d`, audit branch, 2026-10-13. Application, existing tests/workflows/schema/security rules unchanged; audit documentation/harness only. No SQL/provider/realstorage/delete request, no remediation/historyrewrite/merge/deploy.

| Stage | Actual evidence | Outcome / limits |
| --- | --- | --- |
| SEQ-258 | Previous ledgers/report/currenthead; capture/write/delete/reconcile media source and previoustwo media findings | ContinuityPASS; no auditrestart. No priorprovedsuite rerun just forstagecount. |
| SEQ-259 | Actual entire merchantPhysicalMediaCleanup.ts with realownedFS and inerttransaction/storage; single precommit failure |1PASS: preparedmanifest removed and no storage removal. Control validates ordinary rollback case, not realSQLrollback. |
| SEQ-260 | Two simultaneous actual completeMerchantDeletionWithPhysicalMediaCleanup invocations; held completionadapters allow bothcapture before winnercommit; winner succeeds but storagefails/pending; loserthenfails |1observationalPASS/1acceptanceFAIL. NEW MEDIA-CLEANUP-CONCURRENT-UNLINK-001 MEDIUM/OPEN: loser catch unconditionally rmSync sharedmerchantpath, removing winnerpendingmanifest; subsequentreconcilemissing. RealFS intentloss demonstrated; SQLcommit/error injected, no real deletion/providerloss. |
| SEQ-261 | Two actual reconciliation calls; olderstorageattempt held/fails after newer call completes; realmanifestwrite |2PASS observations/controls: late oldfailure reopens completedmanifestpending; next idempotent retry completes. Supports concurrent manifest ownership/ordering gap, not additional lostintent defect or realduplicatecloud deletion. |
| SEQ-262 | App.tsx37namedroutes+fallback, one devsmoke flag; component/source-lines/fixture and routevisualcaseCSV | SOURCE_INVENTORIED:36productionnamedroutes×3languages×2viewports=216 plus6fallback=222explicit minimumfullroutecases, allNOT_RUN. Conditionaldevscope excluded with NAreasonflagoff. Authfixture and valid dynamicIDs listed. Not full role/error/write/lifecycle/nestedpane/cashier/accessibility denominator. Existing component proofs partial, not promoted to authenticatedfullroutePASS. |
| SEQ-263 | auth-merchant-management-postgres-routes.ts324–371; completeMerchantDeletionPostgres1187–1242; captureCleanupManifest170–220; read/write/reconcile source | SOURCE_REVIEW_ONLY: owner/session/password checks remain; capturetransaction reads suspendedstate before later deletiontransaction; deletionlocksmerchant/account and request, closesmerchant so concurrentloser can reject. Both preparedcalls can precede serializeddelete; catch removes sharedfile without request/generationownership. No directunauthorized actor or actualSQLrace proof. |
| SEQ-264 | Manifest counters/case applicability/proof limits and scanner currenttree | Source/scope checkpoint.5newtests4P/1F, one newproductfinding.222minimumroutecases not executed, not wholepercentage. Current repositoryscannerPASS locally; no historyscan exemption or userrealcredential needed. |
| SEQ-265 | Baseline33Actions and security run38353681095/job115151569363 |25SUCCESS/8FAILURE. Currentrepositoryscan stepSUCCESS; fullreachablehistoryscanFAIL credential-url1 blob202a9fc041cb2cde0e8169683a6eb9eb7478e130, historical docs/evidence/seq241fixture. NEW AUDIT-SYNTHETIC-HISTORY-GATE-001 LOW/OPEN test/processblocker: historicalsyntheticURL persists despite currentliteral correction. No realsecret exposure; nohistoryrewrite/scannerexception made. Other7knownfailures not recounted as newdefects. |

## Actual tests / filesystem scope

Node24.19.0;cleanNODE_ENVtest/noDATABASE_URL; VM executes TS-stripped actualmodule with builtinfs/path/crypto/Date and ownedmkdtemp. ImportedSQL/transaction/deletion/storage routines injected. No realcredentials or externalrequest. Each test removes owneddirectory. Actual commands/exits in evidence/seq258-runtime-summary.json; TAP beside harness.

```sh
node --test --test-reporter=tap docs/final-audit/evidence/seq259-261-media-races.test.mjs
```

**5tests/4PASS/1FAIL/0SKIP**, exit1. Finalverification replaces preliminaryrun, not addedtocount. Failedacceptance proves sharedfilesystem recoveryintent can be erased by concurrentloser; observationalPASS reproduces hazard, not product approval. CompletePostgres transaction and providerstorage not actually executed. No productionmedia leak/data deletion/providerduplicates claimed.

Race order: bothcalls capture suspendedfixture and write samehashedmerchantmanifest; winnerSQLadapterreturns success; winnerstorageadapterfails leavingdurablepending; loser's injectedconflict hits genericcatch and rmSync(sharedpath); actualmanifestdisappears. RealSQL source supports possible serializedloser but does not establish productionexecution/frequency. Singlefailurecontrol and oldretryrecovery narrow conclusion.

## Scoped UI denominator

[Route inventory](evidence/seq262-route-inventory.json) retains exactAppsourceSHA256,37routepaths/components/sourcelines, fixture andconditionalflagNAreason. [CaseCSV](evidence/seq262-route-visual-cases.csv):AR/EN/KU at390×844 and1280×844 for36productionroutes andNotFoundfallback. Aliases keptseparate because pathmode/bootstrap may differ. Dynamicownerrecovery/supportpreview/emergencysnapshot/workmonitor fixtures require syntheticserverstate/IDs before mount.

Declared scope is minimumhappy-state locale/viewportfullroutevisualjourney only.0/222 fullroutecases from currentlymapped evidence; partialcomponent/nativePDF/providerinjected proofs remain valid and recorded elsewhere. Do not describe this as0% entire project or absence of UI tests. Rolepermissiondenials/writes/errorrecovery/retention/routeparameterchanges, nestedadminpanes, cashierseparateshell, keyboard/screenreader/semanticreview are explicitly excluded and stillrequired. Wholeauditpercentage remainsNOT_YET_MEASURABLE.

## Findings / deduplication

- MEDIA-CLEANUP-CONCURRENT-UNLINK-001 MEDIUM/OPEN/FUNCTION_RUNTIME_CONFIRMED. Distinct from MEDIA-CLEANUP-CORRUPT-001 and MEDIA-CLEANUP-STARVATION-001; sharedpath loses validwinnerintent throughloserrollback, without injectedcorruptfile or100batch failures. Oldretryreopening is supportingordering evidence, not seconddefect. No apprepair.
- AUDIT-SYNTHETIC-HISTORY-GATE-001 LOW/OPEN/CI_PROCESS_BLOCKER. Earlier auditfixture literal is synthetic/non-real; currentrepositoryscannerpassed after representationchange. Fullreachablehistory still sees oldblob; repositorypass must not be reported as entiresecurityPASS. This is a workflowblocker/classifier finding, not realcredentialincident. Historicalfinding leftintact, no broadallowlist/historyrewrite/rotationclaim.

Previous media2findings,OPS-WORKER-DRAIN-001,WORK-MONITOR-STALE-001 and financialcyclefindings remainopen.13originalintegrationNOT_RUN/34unresolvedselectors unchanged. No repaired/closed issue.

## CI and next checkpoint

[Security run38353681095/job115151569363](https://github.com/nora953/fawri-production-source/actions/runs/38353681095/job/115151569363):dependency/lockfile/reviewjobsSUCCESS; currentrepositorySUCCESS; reachablehistoryFAIL syntheticfixtureblob1. [Snapshot](evidence/seq265-ci-snapshot.json)33workflowIDs/statuses; no inferredper-suiteSQLcounts. Previous browserstartupoccurrences and laterreceiptPASS preserved. No newfullbrowser/SQL/provider/hostedproof.

Next **SEQ-266**: explicitrole/error/write/lifecyclecase applicability and existingevidencemapping; media sharedmanifestconcurrency under ownedrestrictedSQL when available; residual13integration/WorkMonitor mountedjourneys/actualPGrecovery. Keep historicalsyntheticsecuritygate blocker visible for laterauthorized repair; do not weaken scanner or rewrite history duringaudit. OverallremainingpercentageNOT_YET_MEASURABLE; releaseBLOCKED.
