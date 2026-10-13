# Current evidence inventory — baseline 7e0da5eb, SEQ-224

## Authoritative continuation — SEQ-312–317 (2026-10-14 Baghdad)

Latest [SEQ-312–317](SEQ_312_317_DEVICE_PERMISSION_HTTP_20261014.md). **Next SEQ-318**. Six sequential stages, audit only; application/original tests/schema unchanged.

Actual Authv2/device/permission/enabled HTTP + ownedSQL: **10 distinct business cases PASS** across initial6 and corrected remaining4. Initial e412b4ed8e40e73048ae758a0b3c37cb3821eb1c run38484571902/job115595011417:6PASS, case7 audit endpoint expectation failure,3NOT_RUN; raw6P/2F includes failed parent. Remaining65bd43a462b8f46271ee39b9bad3e08c770f4a26 run38484821000/job115595809185:4businessPASS/raw5P includes one parent,0FAIL/0SKIP.28migrations and owned cleanup SUCCESS eachrun. Corrected admin identity /admin/me, application unchanged; six completed cases not rerun.

Wrong/missing device, foreign device record, wrong password, selective device revocation, assistant role, invalid permission/enabled values, permission removal, disable and reenable/nonrevival boundaries PASS. Four local runner refusal controls separate. No new app finding; existing stale UI and legacy fixture issues remain OPEN. Seeded trust is not OTP onboarding/browser/RLS/provider proof.21selector paths/222full route visual cases unchanged. Whole percentage **NOT_YET_MEASURABLE**, release BLOCKED.


This is a real scope/evidence inventory, not a universal test denominator. Each domain has partial proof. PASS and FAIL both constitute executed audit evidence; product release still requires acceptable outcomes. A domain cannot receive full credit merely because one constituent test passed.

| Required domain | Existing evidence reused | Current classification | Specific remaining acceptance proof |
| --- | --- | --- | --- |
| Repository/build/lineage | Four ledgers, remote main/head, current33Actions, quality build; prior225branch inventory | PARTIAL | Complete branch/PR disposition and exact launch artifact lineage; selection/coverage closure |
| Cloud cashier sync | Stock race, historical compensation/closed-shift HTTP, timeline, ACK models; SEQ-109–127 | PARTIAL / known findings | Legacy bridge historical role/device negatives, client shift transition/outbox recovery, gap/backfill contract, real network interruption |
| Offline cashier/licensing | Native IDB3P/1F, mocked authority/clock; SEQ-113/117 | PARTIAL / known findings | POS shell real offline cold start, 7-day grace/device/restart/clock tamper, signed authority policy and IDB altered payload |
| Payments/subscriptions/accounting | Current billing SQL suite, provider rollback faults, new actual-body webhook adapters | PARTIAL / known findings | Durable identity/orphans, concurrency/late/refund/mismatch/SQL faults, provider contract/settlement and independent cashier/SaaS semantics |
| Auth/session/tenant/RLS | Current admin1P, support5P, sensitive restricted5P, knowledge1P, management6P, production role6P | PARTIAL | Deployed runtime grants/non-RLS endpoints, remaining permission matrix, non-owner/concurrent recovery and true provider OTP |
| Admin/merchant/staff interfaces | Parent15P, Support12P/1F, Preview7P/4F, Emergency9P/3F, new monitor callbacks | PARTIAL / known findings | Full authenticated route and nested-pane role/refresh/write journeys, preview lifecycle and device/action state |
| Catalog/inventory/orders/data lifecycle | Golden HTTP, deletion/RLS, cashier deletion current1P; catalog-history unselected test source | PARTIAL | Four catalog/history SQL tests, retention boundaries and restore/redeletion/provider/media lifecycle under real role; concurrency faults |
| Reports/PDF/XLSX | Package ZIP independent consumer, report3P, central5P, receipt8P, date6P/completeness4P | PARTIAL / known findings | Foreign-currency units, full backend accounting, large dataset/load deadline, visual consumer/physical printer acceptance |
| AR/EN/KU/RTL/mobile/accessibility | Scoped component direction/overflow/PDF text and translation structure | PARTIAL | Route×role×language×viewport applicable cases, keyboard/focus/screen reader and semantic terminology review; no full Cartesian completion claimed |
| Meta/bot/AI | Injected54P, learning1P, signature/replay/queue proofs; restricted-page FAIL | PARTIAL / known findings | Restricted global page resolution, live authorized sandbox permissions/delivery, provider failure/quotas/costs and response quality |
| Hosting/recovery/security/operations | Disposable schema restore, backup/source gates, readiness snapshot; new shutdown adapter4P | PARTIAL | Hosted least privilege/media/PITR/RPO/RTO/TLS/alerts/redeploy rollback; actual worker drain/recovery; external/commercial/operator sign-off |

## Bounded numeric inventory

- **277** current top-level API test files, including **91 integration** files. API quality selector covers127;109 other files have literal references; **41/277 =14.80% selection paths unresolved** in the bounded scan.13 of41 are integration files. This is selection uncertainty, not percent of untested code.
- Current isolated run:41 unique files,43 invocations, all complete summaries. They mix unit/static/SQL assertions and cannot be divided by277 as universal execution coverage. Some other Actions execute separate tests; no such division made.
- **37 named app routes +fallback**, **5 cashier modes** plus demo, nested admin panes. Historical table remains source inventory. Component and authority harnesses provide partial evidence; no new full app route journey run in SEQ-215–224. An applicable route-role-device test-case denominator is still pending.
- **11 required domains** listed above. All have incomplete exit proof. Domain labels and SEQ IDs have no equal-weight basis for a completion percentage.

Overall completed/remaining audit percentage is **NOT_YET_MEASURABLE**. Historical54%/46% estimate is retired as a current measurement; preserved in previous records. This document supplies the missing scope baseline and measurable sub-inventories, but does not fabricate completeness of their applicability or evidence mapping. Next build explicit case IDs, applicability/NA rationale, expected behavior and exact current evidence; calculate completed-evidence cases/total applicable cases only within declared scope. Keep blocked external tests in denominator and report them separately.

Release BLOCKED. No application repairs or consolidated repair plan before comprehensive audit completion. Full evidence and next SEQ-225 are in [SEQ-215–224 report](SEQ_215_224_COVERAGE_WEBHOOK_MONITOR_20261013.md).

## SEQ-225–231 bounded update

Expanded243tracked script/workflow/package sources resolves7of41selectors through commerce validator and two workflow callers;34remain unresolved,all13integration unchanged.41/277 prior figure remains historical bounded result; current34/277=12.27% selection uncertainty.28of original41files executed locally (68.29%),13NOT_RUN (31.71%); this is execution of declared file queue, including failures, not product completion.92contract assertions87P/5F,9actual discount runtimeP,4precision2P/2F. Five stale test expectations and one extreme numeric defect documented. Current33Actions26SUCCESS/7FAIL; provider deletion source1P/SQL1P distinct. Whole audit percentage still NOT_YET_MEASURABLE. NextSEQ-232.

## SEQ-232–239 evidence update

Real childSIGTERM plus local durableFS/restart proof added; no productionSQL/provider clearance. Actual requiredPG worker stop callback proof uses inertSQL. Monitor request race and pending-action after403 added with inertfetch/state, mountedReact pending.15tests10P/5F strengthen two existing findings,zero new canonical product findings. Current33Actions25SUCCESS/8FAILURE: extra receipt failure is environment startup withzeroassertions.34unresolvedselectors/13integration queue unchanged; entire UI case denominator unresolved. Wholepercent NOT_YET_MEASURABLE; nextSEQ-240.

## SEQ-240–247 bounded evidence

13/13 residualentrypoints have2negativepreload controls each26PASS;0/13 originalruntimeexecuted.20actualMeta recovery adaptercasesPASS, noSQL/providerstate proof. Prepared13perfileexecutionmanifest;34selectoruncertainty/13integrationruntime/fullUI/actualPGproofs unchanged. Current33Actions26SUCCESS/7FAILURE; laterreceipt8nativePASS, originaltimeout preserved. No overallpercent measurable; nextSEQ-248.

## SEQ-248–257 bounded update

14newcases12P/2F:media5P/2F(realownedFS/inertSQLstorage),retention7P(inertSQL/actualcalendar).2newmediarecoveryfindings;separate26fencechecksreverified afterauditfixtureliteralchange, notnewcoverage. Localrepositoryscanner1706/0findingsPASS;hostedCIpending. Baseline33Actions24SUCCESS/9FAILURE;extraadminbrowserblocked0cases andsyntheticfixture scannerfinding. Original13integration/34selectors/fullUIcase denominator unchanged. OverallpercentageNOT_YET_MEASURABLE,nextSEQ-258.

## SEQ-258–265 scoped case inventory

37namedApp routes incl1conditionaldev;36productionroutes×AR/EN/KU×390/1280 plus6fallback=222minimumfullroutevisualcases allNOT_RUN. SourceIDs/components/fixtures/flags inseq262JSON/CSV; partialcomponentproofs notpromoted. Role/write/error/lifecycle/nestedpanes/cashier/accessibilityexcludedandpending.5newmediafunctioncases4P/1F,oneproductfinding;onehistoricalsyntheticsecurityCIblocker. Current33Actions25SUCCESS/8FAILURE/currentrepositorypass/historyfail. Original13integration/34selectors unchanged. Not universaldenominator;wholepercentNOT_YET_MEASURABLE,nextSEQ-266.

## SEQ-266–273 applicability/evidence refinement

15newpreview/transaction/roleadaptercases13P/2F. TwoLOW scopedfindings(servicebindingcontractgap/expiryrollbackmarker), noHTTP/SQL/backendbypassclearance. Supportpreviewroute1JSONrow/6visualcasesfixturechangedfromowner toassistantbothgrants;222fullroutecases allNOT_RUN unchanged.33Actions25SUCCESS/8FAILURE;historysyntheticgate retained.13originalintegration/34selectors unchanged;wholepercentNOT_YET_MEASURABLE,nextSEQ-274.

## SEQ-274–281 actual original execution update

13/13 originalresidualfiles invoked inownseparateattestedcluster/28migrations;12completeNodeTAP summaries16P/8F/0SKIP,1incompletefixture.4fullygreenfiles,8completefails,1incomplete; intendedfailed/blockedbusinessassertions notcoveredmerelybyinvocation. Newauditworkflow13selectionproof reduces34unresolvedto21/277 (7.58%),notuntestedcodecoverage. Manifest retainsoldNOT_RUN andnewobservedruntime.222fullroutecasesstillNOT_RUN;wholepercentageNOT_YET_MEASURABLE,nextSEQ-282.

## SEQ-282–285 bounded SQL archival update

Two new actualSQL business cases1P/1F; four separate runner refusal controlsPASS. Archive preserves complete immutable inventory mutation/retains hidden variant through rebuild. Marker-failure atomicity confirmedMEDIUM: requestrejected whilecoreeditcommitted. Initialfixtureimportblocked0businessassertions separate. No originaltests rerun;21selectors/222fullroutevisualcases unchanged. WholepercentNOT_YET_MEASURABLE;nextSEQ-286,ReleaseBLOCKED.

## SEQ-286–289 actual expiry SQL update

New7SQLcases5P/2F,4separate runnerrefusalsPASS. ExistingLOWexpiryrollback finding strengthened toactualSQL; liveconsent/foreigntenant/oppositerace/lifecycle recovery/idempotence controlsPASS, deniedexpiry markersFAIL. Production timers/HTTP/auth/role/RLSNOT_RUN inthisbatch. Initial7auditseedfailures excludedfrombusinesscounts.21selectors/222routevisualcases unchanged,wholepercentNOT_YET_MEASURABLE,nextSEQ-290,releaseBLOCKED.

## SEQ-290–293 licensed zero-stock history update

Fournewdistinct SQLcases4PASS(final):3initialcompleted/oneinitialseedblocked,remainingonly1PASS. Historicalfullsale/item/mutationrows preservedacrossrebuild/guardeddenial andownedmissing-level archive; replaynoadditionalstock, unsafe returndenied.4localrunnerrefusalsseparate. Originalfixturefailuresnotrewritten,noproductfindingadded.21selectors/222routevisualcases unchanged,wholepercentNOT_YET_MEASURABLE,nextSEQ-294/releaseBLOCKED.

## SEQ-294–297 mounted monitor and selection update

ActualnativeChrome7cases4P/3F strengthens existingmonitorfinding beyondadapters. Three390pxlanguagecomponentcases are notfullrouteclearance:222allNOT_RUN unchanged.959sourcecensus confirms21unchangedMJScontracts/nofilename refs withinboundedsource/glob review;prior28filelocalruntime reused,norepeatedexecution.21automatedselectorpaths remainunmapped,notuntestedcodepercent. Realrole/App/HTTP/nativependingactions remainopen,wholepercentageNOT_YET_MEASURABLE,nextSEQ-298/releaseBLOCKED.

## SEQ-298–301 native monitor action scope

Sixnewnativecomponentcases4P/2F extendexistingmonitorfinding toactualpendingaction lifecycle. SyntheticGET/revokePOST403/404/200/incorrectpasswordboundaries only, no realHTTPauth/backendSQLmutation. Previous7casesnotrerun;21selectorpaths/222fullroutecasesNOT_RUN unchanged. Currentrole/App/othernativeactions/provider/hosted scopeopen,wholepercentageNOT_YET_MEASURABLE,nextSEQ-302/releaseBLOCKED.

## SEQ-302–305 retention SQL boundary coverage

EightnewactualSQLcases8PASS,4localrunnerrefusalsseparate. ModernE164retention/suspension/renewal/sessionrevocation/faultatomicity/deletionrequestsinglewinner proof; originalblockedfixtures unchanged. NoHTTP/realrole/purge/provider/productionRLSclearance, no newdefect.21selectorpaths/222fullroutecasesNOT_RUN unchanged,wholepercentageNOT_YET_MEASURABLE,nextSEQ-306/releaseBLOCKED.

## SEQ-306–311 current actual management HTTP update

15distinctbusinesssubcases15PASS;raw16TAPincl1parent,4localrunnerrefusalsseparate. ActualAuthv2aggregateHTTProles/password/management/review/purgefields/sessionbinding/livecookie401,ownedSQLonly. Initialownerdeviceseedblocked0targetcases retained,modernfixturecorrected/noguardrelaxed. Originalfixtures/UIdefectsunchanged,provider/storage/allrelations/RLS/fullApp/OTP scopeopen.21selectorpaths/222fullroutecasesNOT_RUN unchanged,wholepercentageNOT_YET_MEASURABLE,nextSEQ-312/releaseBLOCKED.
