# SEQ-274–281 — actual original integration execution on owned PostgreSQL

Baseline a2632bd345b1bb22ee430ba99ff75b794723530a; audit execution commit3d4a4f529e7463448a4587b9d729e60f534734ac. Audit-only NEW workflow and independent executors; application/originaltests/schema/existingworkflows/scanner unchanged. No hosted data/provider request/productionrepair. Initial preparationreport retained as history, this report is the authoritative completed checkpoint.

## Stage outcomes

| Stage | Scope / actual evidence | Outcome / limits |
| --- | --- | --- |
| SEQ-274 | Currentledgers/residual13manifest; localDocker/PG absent; ownedexistingrunner source |Continuity/sourcePASS; choose independentnewaudit execution path on Actions instead of assuming localSQL or changing originaltestguards. |
| SEQ-275 | New .github/workflows/audit-residual-original-integration.yml and docs/evidence/seq275 executors |New auditcapability:13allowlistedfiles, each freshPG16 networknone/random runtimepassword/no publishedports, Node24 sharesonlythatnamespace/readonlyroot+attestation. Existingguard before28committedmigrations and beforeoriginaltestimports; originalassertions unchanged. |
| SEQ-276 | Syntax and4localnewrunner refusal controls |4PASS/0FAIL/0SKIP/noDB. Unknownfile/missingrunnerenv/missingattestation refusedbeforetargetactions. Initialcurrentrepo1727trackedscan/0findings andCIpolicy68workflow/0violationsPASS; fullhistorygate stillopen. |
| SEQ-277 | Preparation saved and workflowtrigger verified |Preparationcommit3d4a4f5; newrun38428443462/job115403939524. Install/APIbuild/guard syntaxSUCCESS. NoSQLPASS claimed at queued/running checkpoints. |
| SEQ-278 | Completed job logs,13 RESIDUAL_ORIGINAL_SUITE_RESULT markers/13outerfileendmarkers/isolation proofs |13originalfilesinvoked,13distinctownedclusters,28committedmigrationsPASS for each.12complete summaries16PASS/8FAIL/0SKIP;1incomplete summary.4fullygreenfiles/8completefailedfiles/1incompletefile. Allperfiletempcleanuptrue; outercontainer cleanup andalwaysownedcleanupSUCCESS. Not deployedrestricted-role or liveprovider clearance. |
| SEQ-279 | Actual canonicalconsentdecider+tenanttransaction helper with inertSQL/rollback adapter |7localcases6PASS/1FAIL:approve/reject/invaliddecision/foreignmerchant/alreadydecided controlsPASS;expiredconsentdenied butexpiry markerrolledback. Strengthens existing SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001, no duplicate. SQLactualconsent race nottested. Initialmissing VMprocess fixture corrected, no originalapplicationrepair. |
| SEQ-280 | Exact8completefailurecases+incompletefixture, source contracts/history,selection/case applicability |Failtriage below. NEW MEDIUM testmaintenance RESIDUAL-FIXTURE-CONTRACT-001 covers originalfixture incompatibilities;no newlyconfirmed productdefect declared. Variantremoval expected409 now conflicts with archiveintent; archive/historyacceptance stillpending, cannot claim data lost or preserved afterremoval.21/277selector paths remain unresolved after13newworkflowselectionproofs; notuntestedcodepercent. |
| SEQ-281 | Currentmanifest/run/ledgers/handoff append-onlycheckpoint |Actualresults recorded;previous13NOT_RUN retired onlyforattemptedinvocations, not allintendedassertions. Originaldirectentrypointguards/cleanupremainopen. WholepercentNOT_YET_MEASURABLE;nextSEQ-282. |

## Actual SQL/HTTP suite results and triage

| Original file (tests folder) | Actual count / exit | Interpretation |
| --- | --- | --- |
| catalog-variant-inventory-history-postgres.integration.test.ts |1P/1F,exit1 |Inventory mutation survives ordinarygraphrebuildPASS. Salehistory fixture lacks activecashier entitlement; fails CASHIER_OPERATION_CURRENT_ENTITLEMENT_REQUIRED before target sale/history. Current licenseenforcement not a productbug. |
| catalog-variant-promotion-survival-postgres.integration.test.ts |1P/0F,exit0 |ActualPG promotion identity survives ordinarycatalog rebuild. Not deletion/expiredpromo/fullHTTPUI proof. |
| catalog-variant-removal-history-conflict-postgres.integration.test.ts |0P/1F,exit1 |Missing expected rejection at removal. Currentauthority archivesremovedvariants and blocks activepromotion references; oldtest requires blanket inventoryhistory409. Semanticcontract divergence, postremovalarchival/history assertions not reached. Needs newguardedacceptance, no data-loss claim. |
| catalog-variant-row-preservation-postgres.integration.test.ts |1P/1F,exit1 |Inventorymutation rowpreservationPASS;cashier sale evidence fixtureblocked bysame missing activeentitlement. |
| emergency-read-access-postgres.integration.test.ts |1P/0F,exit0 |OriginalactualSQL/Authv2 emergencyworkflow assertions executePASS on freshownedcluster. Not deployedrole/nativeUI snapshot lifetimeclearance. |
| emergency-read-access.integration.test.mjs |0P/1F,exit1 |LegacyJSON fixture/authHTTP expects200, receives401 before emergency targetjourney. Not confirmed emergency applicationdefect. |
| knowledge-postgres-lifecycle.integration.test.ts |1P/0F,exit0 |Actualknowledge tenantdeletion and unaffectedsecondtenant fixturePASS. FixedsyntheticIDs containedbyfreshcluster, not arbitraryrealretentioncoverage. |
| merchant-management-postgres.integration.test.ts |summaryINCOMPLETE,exit7 |Fixtureseed line104 violatesaccounts_phone_shape_check23514; originalrawlocalphones conflict with committed0026 E.164 constraint. No completeTAP totals;outer~240sbound reached. Cleanuphookregistered afterseed; exact lingeringhandlecauseNOT_PROVEN. ActualbusinessdeletionjourneyBLOCKED. No fabricated0/1 summary. |
| merchant-retention-postgres.integration.test.ts |0P/1F,exit1 |Same23514 rawlocalphone fixture atseed. Retentionbusiness assertionsBLOCKED; currentphoneconstraintcorrectlyrejects invalidfixture. |
| order-payment-hardening.integration.test.mjs |0P/1F,exit1 |LegacyJSON/authfixture expectslogin200,401 received before targetpaymentassertions. No customerpaymentdefectcertification. |
| owner-admin-postgres.integration.test.ts |1P/1F,exit1 |Actualownerprovisioning/singleton/readinessSQLcasePASS; oldfirsttest expects productiongate inert without explicitflag, current productiondefault requiresPG andfailsPRODUCTION_OWNER_ADMIN_POSTGRES_AUTHORITY_REQUIRED. Firstexpectationstale, not weakenedproductiongate. |
| runtime-authorities-postgres.integration.test.ts |10P/0F,exit0 |ActualSQL merchant/settings/catalog/channelcredentials/conversations/order/jobs/authnotifications/noLegacyJSON controlsPASS. Samefileorderedfixtures concurrency1, no realprovider/GitHublaunch/securityroleclearance. |
| support-images.integration.test.mjs |0P/1F,exit1 |SuccessfulcurrentAuthv2 cookie returned, testparserexpects retiredlegacy cookieprefix. Privacy/tenant/image validationjourney stops at parser; not productprivacyfailure. Generatedsynthetic cookie value redacted in saveddiagnostics. |

Counts are NodeTAP markers from12complete suites:16P/8F/0SKIP, includingSQL/static/HTTPchecks; no independent-parent inflation. Merchantmanagement incomplete result keptseparate even though onefailuremarker observed. Exit7/wallbound is not interpreted as a newapplicationdefect. Original13testfiles untouched; no businessassertionsweakened or fixturepatched forgreen.

## Isolation and cleanup proof

[Run38428443462/job115403939524](https://github.com/nora953/fawri-production-source/actions/runs/38428443462/job/115403939524), Nodev24.21.0,13distinctcontainers; eachnetworknone/publishedPortsfalse/databasefawri_ci/rolefawri_ci/marker verified beforemigrations/imports. One deliberate markerfalse linebelongs toguardnegativeunitcontrolbefore suites, not failedrealclusterproof. All13migrationmarkers count28. Rootrole inownedfreshcluster is notleastprivilegeproductionruntime. Outertrap removesownednode/PGcontainers/anonymousvolumes;finalalwayscleanupSUCCESS. Freshclusters preventfixedIDcrosssuite pollution andowneralreadyexists skips. Summary0SKIP onlywherecomplete, no incomplete-skips inference.

Exactresults/isolationproofs/sanitizeddiagnostics/jobsteps in evidence/seq278-original-results.json, manifestobservedruntime fields updated whilepreviousNOT_RUN saved. No fullgeneratedsessioncookies/passwords/rawprivatelogs copied. Preparedreport/scriptcommand references retained; local4safetycontrol command inseq276summary. Realworkflow executes originalcommands viaexistingtsx/preload aftermigrations;unknownfile/attestationdenials arefailclosed.

## Local consent proof / lifecycle source

Canonicalconsent inputtenant/request/ticket qualifiedSQL and actualwithMerchantOperationalTransaction setting tested with inertSQL.7cases6P/1F,exit1;TAP/summary saved. Expiredconsent UPDATEexpired thenthrow →actualhelperROLLBACK, similar to existingpreviewexpiryfinding;accessdenied. Ticketresolved/closed sourceendsapprovedrequests+activepreviews in sametransaction;claim cannotreassign ticket alreadyownedbyanotheradmin. Sourceonlyforclosure/concurrentrevocation, not newSQLruntimeacceptance. No duplicate newexpiryissue.

## Current scope and next

New originalexecution closes invocation gap13/13, but only4filesfullygreen and mixedsubcasecoverage; failed/blocked targetacceptance remainsopen. Newdynamicworkflow/source selects13previouslyunresolvedfiles, reducingselectoruncertainty34→21 of277 (7.58%), NOTuntestedcodepercent. Originalnativeentrypoint/preimportguardissues stillopenwhenrunoutside safeauditworkflow.222fullroutevisualcases notexecuted;role/error/lifecycle/hosted/provider scope remainsincomplete. No defensible overallpercentage.

RESIDUAL-FIXTURE-CONTRACT-001 MEDIUM/OPEN/TEST_MAINTENANCE groups oldcashierentitlement/rawlocalphones/legacyJSONauth/legacycookie/productiongate expectations. Variantarchivecontract divergence remains TRIAGE in samefixturequeue;no confirmedapplicationdata-lossclaim. Merchantmanagement latecleanup source maps toexistingDB-TEST-CLEANUP-021, notduplicate. Priorfinancial,media,expiry,UI andhistoricalsyntheticsecuritygate findings retained; newauditworkflow doesnotclearotherCI.

NextSEQ-282: modern synthetic businessfixtures/additional guardedauditassertions forcashierhistory/variantarchival/post-removal retainedaccounting/retentionmanagement, without altering originaltests or repairingapplication;actualSQLconsent/previewexpiry and rolejourneys;remaining21selectors/222fullUIcases andexternaloperationalproofs. No finalrepairplan beforeauditclosure. ReleaseBLOCKED.
