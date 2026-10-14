# SEQ-306–311 — current Authv2 merchant management HTTP and owner session boundaries

Continue baseline00f5ea6a47dfc7f95090926ad11f3746a8b97eab. Six sequential stages in one batch, as requested. Audit only: independent workflow/synthetic fixtures/evidence; application/original tests/schema unchanged. No nativeUI/previousretention cases rerun.

| Stage | Scope / evidence | Result / bounds |
| --- | --- | --- |
| SEQ-306 | Current aggregateauth-security router, management/session contracts and oldblocked fixture | Continuity/source review. Originalmanagement test failed oldphone seed; new currentfixture targets intended HTTPbusinessproof. |
| SEQ-307 | New E164/currentAuthv2/trusteddevice fixture, realExpress/cookieParser/router,15named dependentHTTPcases | Actualapplicationhandlers/middleware/services/SQL; knownowned accounts only, loopbackinownednamespace. |
| SEQ-308 | Fixedone-file runner,4local refusalcontrols andsyntax | 4PASS/0FAIL/0SKIP separately; ownednetwork-nonePG16/readonlysource/attestation/28migrations/cleanup retained. |
| SEQ-309 | Correctedrun38444767251/job115460157268, sourcecc27ff5aef9d2e8e9347c0604e53efa23d2c19a7 | 15businesssubcases15PASS/0FAIL; rawNodeTAP16PASS/0FAIL/0SKIP includes1parent.28migrationsPASS, job/ownedcleanupSUCCESS. |
| SEQ-310 | Blockedfirstattempt triage, role/session binding and purge limits | Initialownerissuance requiresdevice beforecases, auditfixture corrected with trusteddevice registration/boundheader; productionguard unchanged. No newproductdefect. Existingfixture-maintenance issue extended; nativeUIfinding remainsOPEN. |
| SEQ-311 | Exactresults/canonicalledgers/handoff/currentPR checkpoint | Saved proof and stage applicability; nextSEQ-312. No wholepercentage or fullroute/provider/leastprivilege clearance claimed. |

## Fifteen distinct completed HTTP business subcases

| # | Case | Actual HTTP / SQL observation |
| --- | --- | --- |
| 1 | No session directory read | 401. |
| 2 | Assistant permission contrast | No grants403; view_merchants assistant200/list containsfixturemerchant. |
| 3 | Approved status | GrantedassistantPATCH200/currentmerchantapproved; subsequentmerchantAuthv2sessionissued. |
| 4 | Note/channel override | ActualPUT/PATCH200;1merchant_admin_note/1channeloverride row. |
| 5 | Suspension and merchantcookie | PATCH200/account suspended; sessionrowrevoked/subscriptionsuspended/repliesoff; oldmerchantcookieGET/me401. |
| 6 | Deletionrequest duplicate | FirstPOST201; duplicate409. |
| 7 | Assistant cannot review ownerrequest | POSTreject403; requeststillpending. |
| 8 | Owner rejection and newrequest | OwnerPOST200/rejected; newassistantrequest201. |
| 9 | Assistantspoofed ownerbody | Assistantcookie+ownerID/passwordbody completion403; merchantsuspended. |
| 10 | Ownerincorrectpassword completion | 401; currentrequestpending. |
| 11 | Actualfixture deletion | Ownercorrectcompletion200/requestcompleted; accountclosed/phoneNULL/phone_verifiedfalse, merchantPIIanonymized/retentiondeleted, fixtureproducts/notes/overridesremoved, subscriptionretainedsuspended/repliesoff/metadataempty, twohistoricalreviewsanonymized, merchantabsentdirectory,1merchant_deleted auditrow. |
| 12 | Assistant invokes ownerrevocation | 403. |
| 13 | Wrongaccount/session binding | Ownertargetassistant+ownersessionID404; ownerrowstillactive. |
| 14 | Wrongownerpassword forrevocation | 401; assistantrowstillactive. |
| 15 | Validownerrevocation and livecookie | POST200/assistantrowrevoked; assistantcookieGET/merchants401 throughactualmiddleware. |

These are15named businesscases, not16; the extra rawTAPpass is the outerfixtureparent. Multiple HTTP/SQL assertions percase are not recounted as independent tests. The case sequence is dependent bydesign (approve→suspend→request→review→purge); a failed prerequisite blockslatercases rather than fabricatingPASS. Correctedrun reachedall15, zeroempty/skippedgreen.

## Trusted device preparation and initial attempt

Initialsource3a9e23b26887276def1fe815c4d2c643f88939c9 run38444329802/job115458651247 applied28migrations/verifiedownedidentity, then stoppedatowner session issuance with AUTH_POSTGRES_OWNER_DEVICE_REQUIRED. Zero15businesscasesexecuted; rawfileparent0P/1F is AUDIT_FIXTURE_AUTH_BLOCKED. Earlycleanuphook/temp/containercleanupSUCCESS; no latehookhang.

Currentowner session contract requiresdeviceID, and boundadmin sessions validate trusteddevice plusmatchingx-fawri-device-id. Auditfixture now uses actualregisterAdminDeviceAuthoritative/setAdminDeviceTrustAuthoritative to seed threeowned synthetictrusteddevices, issuesboundowner/grantedassistant/ungrantedassistant sessions, and suppliesmatchingheader. No guard bypass/suppression, no originaltestpatch. Interactiveadminlogin/OTP/deviceapproval onboarding was not exercised by seededtrust. This extends RESIDUAL-FIXTURE-CONTRACT-001 with a currentdevicecontract incompatibility that oldmanagementtest could not reach afterphonefailure; not a newapplicationdefect.

The finalsession cases bridge existing WORK-MONITOR-STALE-001 nativeUI attemptedwrongtarget/staleaction evidence to actualbackenddenials and qualifiedsessionbinding. ServerprotectionPASS doesnot close the UIlifetime/action defect or certify everyadminendpoint/permissionmatrix. Cookies are realAuthv2tokens createdbycurrentservice forownedsyntheticaccounts, notmockedresponseidentity; valuesneverlogged/persisted in evidence.

## Isolation, purge applicability and cleanup

Correctedjob https://github.com/nora953/fawri-production-source/actions/runs/38444767251/job/115460157268 ; sourcecc27ff5aef9d2e8e9347c0604e53efa23d2c19a7, Node24.21.0/PG16. Freshnetwork-nonecluster/no publishedports, Node sharesonlyownedloopback. Attestation/database/role/runmarker beforecommitted28migrations andimports; readonlyrepo/no hostedDB/providercredentials. ActualExpressserver bound127.0.0.1inside thatnamespace. No externaldelivery/provider/network access.

Deletion ran actualphysical-media-cleanup wrapper on an ownedtemporarydatadir and fixture with no provider/mediaobjects. Verified listedSQLanonymization/removal fields only; not allpossible relations, crossmerchantdeletion, realstorage removal/media race/starvation/corruption recovery/provider cleanup. Priorrelated findings remainOPEN. RootownedDBrole is not deployedleastprivilege/RLSproof. HTTPorigin/CSRFbrowsercookies/interactiveOTP/fullApp/nativeUI/performance/load remain outside.

Cleanuphookregistered beforedynamicimports/seed, stopsactualPostgresSupportRuntimeCutover, closesownedconnections/server/pool. Executor temporarydir cleanup=true; provisionertrap and alwayscontainer/anonymousvolume cleanupSUCCESS bothattempts. Originallatecleanup issue remainsunchanged; newauditfixture demonstrates earlycleanup for its owninitialfailedseed. Atfinalcheckpoint legacymerchants.json/auth-security.json filesabsent; not a universal proof of neverattempted transientJSONread/write. Selectedmarkers/observations/TAP/jobsteps savedinseq309evidence, no rawprivate logs or token/bodypassword values.

Local4runnerrefusals separate. Finalcurrenttrackedscan1802files/0findingsPASS; policy75workflows/0violationsPASS; historicalsyntheticreachable-historygateOPEN. PreviousSQL/native/fixturefailure records preserved.21automatedrepositoryselectorpaths remainunmapped,222minimumfull-routevisualcases allNOT_RUN unchanged. OverallauditpercentageNOT_YET_MEASURABLE;releaseBLOCKED.

NextSEQ-312: remainingcurrentHTTPtenant/device/negative lifecycle boundaries and applicablefullroute/role/offline/nativecase inventory, provider/hosted operationalgates. No applicationrepair/finalremediationplan/merge/deployment before comprehensiveauditcompletion.
