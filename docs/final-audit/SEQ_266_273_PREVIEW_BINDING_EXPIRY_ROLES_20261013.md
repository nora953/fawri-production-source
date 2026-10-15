# SEQ-266–273 — support preview binding, expiry and role applicability

Baseline `583774144dc24a840e7462227865db35bd19a0dc`; audit branch;2026-10-13. Local equivalenttreecommit9863fb2a has exact baseline treeb19c6f26bdc57a59767cd7fa8ec44cbfe4c6a00d (remote metadata commit differs). Application/originaltests/workflows/schema unchanged. Audit harness/doc/casefixture only; no DB/provider/browser/historychange or applicationrepair.

| Stage | Actual evidence | Result and boundaries |
| --- | --- | --- |
| SEQ-266 | Latestreport/ledgers/equivalenttree; operationalPostgresAuthority transactionhelper; postgresSupportAuthority validator and sourcecaller | Continuity/sourcePASS. Actual transactionhelper and validator composed, not independently copied behavioralmodel. Pool/SQLstate/commitrollback actions injected; no @workspace/db import. Initial worktree setup remotecommit not fetched, recovered with verified equivalentlocaltree; no auditrestart or lostfiles. |
| SEQ-267 | Actual validateSupportPreviewSessionPostgres834–903 + withOperationalTransaction68–84, injectedSQL |6PASS: correct binding commitsviewedsection/releaseonce; intentionally unboundrow allows sameadmin; missing/foreignadmin/foreignsession/ended rejectbeforemutation/rollback/release. SQLSELECT FORUPDATE string observed, locks not actually tested. |
| SEQ-268 | Persistednonnulladmin_session_id but calleradminSessionIdempty |1observationPASS/1acceptanceFAIL. NEW SUPPORT-PREVIEW-SESSION-BINDING-001 LOW/OPEN/SERVICE_CONTRACT_PROOF_GAP: matchingadmin canomit caller session and serviceaccepts because mismatchcheck requiresbothvalues. Current soleHTTPcaller passes validated context.session.id; no demonstrated HTTPbypass/crossadminleak or endpointreachability withblankID. |
| SEQ-269 | Expiredrow, actualvalidator UPDATEended then throw, actualtransactionhelper catches→ROLLBACK |1observationPASS/1acceptanceFAIL. NEW SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 LOW/OPEN/FUNCTION_COMPOSITION_CONFIRMED_SQL_PENDING: expired request rejected but attemptedterminationmarkerrolledback in SQLadaptermodel. Sourceordering exact; no realSQLstate proof or expiredaccesssuccess. Separate lifecycleworkercanpersist expiry, narrowing severity. |
| SEQ-270 | Actual transaction helper commitfailure with viewupdate |1PASS: simulatedCOMMITfailure triggersROLLBACK and release; adapterviewedsectionupdate undone. Not real ambiguous networkcommit/pgpoolhealth/recovery certification. |
| SEQ-271 | Actual requireAssistantSupport/requireAssistantInspection routeguards + actual hasAdminPermission; secure-sessionmiddleware inert; rolefixture inventoryrefinement |4PASS: owner rejected;assistantbothgrants allowed;supportonly deniedinspection;inspectiononly deniedsupport. Corrected UIroutefixture1JSONrow/6CSVcases toauthorizedassistantbothgrants/matchingboundpreview. Historicalownerfixture was preparationassumption, not previousPASS.222fullroutecases unchangedNOT_RUN. |
| SEQ-272 | Solevalidatorcaller auth-support-postgres-routes401–406; authSession AuthContext/session assignment; postgresSupportAuthority refreshSupportLifecycle1041–1064 and startPreview expirybranch |SOURCE_REVIEW_ONLY: real routealwayspasses contextsessionid aftersecureassistantpermissions; serviceblankcaller finding is not currentlyproven routeexploit. Expiry validator rejects read, scheduledrefresh normallyreturns after endedUPDATE and canCOMMIT; startPreview approvalexpiry also writes then throws (same ordering concern, no new runtimeassertioncount). Permissionrevocationduringinflight/fullbackendSQL/browser remains pending. |
| SEQ-273 | Baseline33workflowstatuses fromActions, currentledger/proofmapping |25SUCCESS/8FAILURE snapshot. No per-suiteSQL/browsercounterinference, no newCIdefect declared fromstatusalone. ExistinghistorygateAUDIT-SYNTHETIC-HISTORY-GATE-001 retained; no scannerrule/historyrewrite. NextSEQ-274. |

## Actual commands / counts

Node24.19.0, cleanNODE_ENVtest/noDATABASE_URL. VM TS-stripped exactapplicationfunctions; SQL/pool/state/rollback/secure-session adapters inert. No Expresssocket, actualPostgres/rowlocks/RLSgrant/backendrevocation or Reactmount. Testreturns binding/mutationorder; modelstate follows transactions explicitly, cannotcertify deployedrow.

```sh
node --test --test-reporter=tap docs/final-audit/evidence/seq267-270-preview-transactions.test.mjs
node --test --test-reporter=tap docs/final-audit/evidence/seq271-route-permissions.test.mjs
```

Actualexits1/0. **15newcases13PASS/2FAIL/0SKIP**: validator/helper11cases9P/2F;guard4P. Exactexits/counts/source/equivalentbaseline in evidence/seq266-runtime-summary.json. TAP/harnesssaved. ObservationalPASS proves problematiccurrentbehavior, not repair. Twoacceptancefailures representtwoLOW findings, onecontractproofgap and oneexpirymarkerorderingdefect withSQLpending.

Preparationerrors excluded: initialworkspace referenced unavailablelocalremotecommit; equivalenttreeworktree used before tests. Initialclassifier matchedSELECTFORUPDATE aswrite; corrected anchoredUPDATE. InitialguardVM retained unusedcryptoimport; removed importbeforeexecution. These were harness errors, not application FAIL; allfourrolecontrolsPASS after correction. No originalapplicationassertionweakening or productionfix.

## Authorization bounds / fixture refinement

The sole current HTTPsnapshot caller sends adminId/contextsessionid, then loads ticket/buildsnapshot. AuthContext includes validatedsession; current source does not offer blankID input directly from user. Missing serviceparameter can violate persistedbinding only at service boundary in this evidence. Do not label as confirmed productionauthbypass.

Roleguards explicitly requireassistant_admin plusmanage_support plusinspect_merchant_sessions; ownerrole's general hasAdminPermission true does not overrideassistant-onlyguard. Existingrouteinventoryownerfixture forsupportpreview was wrongpreparation assumption and nowrefined. JSONrow and6AR/EN/KU×390/1280casefixtures changed; allremainNOT_RUN. Roleguardadapter4PASS is scoped APIfunctionproof, not4or6mountedroutecases. Otherroutefixtures/fullrole/error/write/lifecycle applicability stillpending;222minimalvisualcases not fulluniversaldenominator.

Expiryupdate occursinsidewithOperationalTransaction; throwingSUPPORT_PREVIEW_EXPIRED executesROLLBACK. Reads remainrejected. refreshSupportLifecyclePostgres independently updatesexpiredpreviewstatus andreturns normally; startup/intervalrunningandactualSQLnot verifiedhere. No evidence ofexpired snapshot leakage. ExistingUIexpiry/cachefindings andbackendlifecycleguardfindings not closed.

## New findings / deduplication

| ID | Severity/state | Exact mechanism / remainingproof |
| --- | --- | --- |
| SUPPORT-PREVIEW-SESSION-BINDING-001 | LOW/OPEN/SERVICE_CONTRACT_PROOF_GAP | Validator requires boundID ANDcallerID beforecomparing; callerblankacceptedwithmatchingadmin. ValidnonnullmismatchdeniedcontrolPASS; intentionallyunboundrowcontrolPASS. SolecurrentHTTPcaller suppliesvalidatedID; actualSQL/HTTProutebypassnot demonstrated. |
| SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 | LOW/OPEN/FUNCTION_COMPOSITION_CONFIRMED_SQL_PENDING | ValidatorexpiryUPDATE thenexception entersactualhelperROLLBACK; adapterpersistedmarkerremainsactive. AccessrejectionPASS. Scheduledlifecycleworker cancommit expiry; sourceapprovalstartbranch similar butnotadditionalexecutedfinding. Need guardedactualSQL lifetime/auditproof. |

These are distinct from WORK-MONITOR-STALE-001/privateUIcache and mediarecoveryissues. No duplicatecreated; no oldfindingfixed/closed. No finalrepairplan beforeauditclosure.

## CI / next

[Workflow snapshot](evidence/seq273-ci-snapshot.json):33runIDs/statuses25SUCCESS/8FAILURE, for exactremoteaudithead baseline. UnchangedCI repeats earn no newcoverage; no realSQLsuite144/24orbrowserassertionsreused as currentrun counters. Currentrepositoryscanner andhistoricalclassifiergate stay separate.

Next **SEQ-274**: guardedSQLpreview/sessionexpiry/consentandassignmentlifecycle proofs; mountedfullsupportpreviewrolejourneys and remainingroute-role-errorcases; concurrentrevocationactualHTTP/SQL asavailable. Original13integrationNOT_RUN/34unresolvedselectors/222fullroutevisualcasesNOT_RUN unchanged. All11domain/fulloperationalexternalgates incomplete. Overallremainingauditpercentage **NOT_YET_MEASURABLE**; releaseBLOCKED.
