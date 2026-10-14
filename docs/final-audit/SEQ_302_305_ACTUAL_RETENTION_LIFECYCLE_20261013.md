# SEQ-302–305 — actual current-fixture retention lifecycle

Continue baseline772429c0d0aa706409227bb4238abbbe992653bd. Audit only: independent workflow/synthetic fixtures/evidence; application/original tests/schema unchanged. Current E164/current Authv2 session fixture closes bounded business proofs previously blocked by old local-phone seed, without changing original assertions.

| Stage | Actual evidence | Result |
| --- | --- | --- |
| SEQ-302 | Current retention/management policy source, eight modern service/SQL cases | Readonly/suspension/renewal/closed/deletion-request concurrency/fault atomicity. No purge/provider/HTTP mutation. |
| SEQ-303 | New fixed-file owned runner; four local refusal controls | Node24.19.0 4PASS/0FAIL/0SKIP, syntaxPASS. Controls not SQL acceptance. |
| SEQ-304 | Run38442860689/job115453629407, source29be3ed302f1d307129a3999b1e978f8fb20ee19 | ActualPG16/Node24.21.0,28committed migrationsPASS,8business cases8PASS/0FAIL/0SKIP. OwnedcleanupSUCCESS. |
| SEQ-305 | Result classification/canonical ledgers/handoff | No new canonical finding. Originalstale-E164fixture finding staysOPEN; scoped actualSQL evidence added, broader lifecycle gates retained. |

## Eight exact completed cases

Policy evaluation time2026-10-13T00:00:00Z; new synthetic account phonesE164 and current mandatory fields. Data belongs exclusively to disposable cluster.

| Case | Actual result / raw query evidence |
| --- | --- |
| Warning2readonly | Expiry2026-07-01→warning_2; products_read_only=true/warningstage2/accountactive, no suspension. |
| Overdue suspension/repeat/isolation | Expiry2026-01-01→eligible_for_deletion/account/subscription suspended/repliesoff. One currentAuthv2session row revoked; account session/security versions increment once. Repeatedrefresh keeps versions/subversion/sessionrows; another tenant's selected account/merchant/subscription/session lifecycle fields unchanged. |
| Renewal with0replies | Future2026-11-15expiry restores retention-suspended account/merchant, clears marker/readonly; subscriptionreplies_exhausted/auto_reply=false, version+1. Oldrevokedsession never revived. |
| Renewal with10replies | Same restoration; subscriptionactive/auto_reply=true, version+1. Oldrevokedsession unchanged. |
| Administrative suspension/current renewal | Suspensionwithoutretentionmarker remains suspended; currentfuturepaidexpiry yields MERCHANT_NOT_ELIGIBLE_FOR_DELETION for retentiondelete reason, no request inserted. |
| Closedaccount protection | Futureexpiry cannot revive closedaccount: functionnull; selected lifecycle snapshot including updated timestamps unchanged. |
| Sessionrevocation SQLfault atomicity | Owned BEFOREUPDATEtrigger raises AUDIT_SEQ302_REVOKE_FAILURE atsessionstatus revoked. Service rejects; all selected account/merchant/subscription/session lifecycle values and timestamps remain equal to pre-call snapshot. Earlier suspension changes rolled back; trigger/function removed in finally. |
| Concurrentdeletionrequest | Two simultaneous currentservice calls for eligible suspended merchant produce1fulfilled/1DELETION_REQUEST_ALREADY_PENDING. RawDB1pendingrequest/1deletion_requested auditrow. One bounded race, not exhaustive load proof. |

## Interpretation and original fixture boundary

The original merchant-retention-postgres.integration.test.ts stopped at23514 rawlocalphone seed inSEQ278. It remains unchanged and is not retroactively declaredPASS. RESIDUAL-FIXTURE-CONTRACT-001 still covers that obsolete fixture and other prior blocked originals. These eight modern cases directly execute current retention/management functions and currentAuthv2sessionissuance on realSQL. Prior7SEQ252–254adaptercases are historical/reused, not repeated or added again.

No new productdefect found in this scope. Confirmation of positive behavior doesnot clear originalmerchantmanagementHTTPjourney, actualdeletionpurge/recovery/media/provider or license/financial/UI findings. Accountsession statuses were queried; no real browsercookie/login/logout/middleware roundtrip exercised. Administrative-suspension case verifies persisted state and deletion eligibility; doesnot certify every exportedaccessflag/currentrole route.

Source aligns with observations: retentionaccount/merchant/subscription updates and session revocation share withMerchantOperationalTransaction. Renewal restoration requires retention_suspended_at, preventing automatic administrativeunsuspend. Closedaccount returns beforeupdate. Effectiveexpiry takes max(historicalend,current subscriptionexpiry). Deletionrequest locks merchant, checks availability/eligibility, relies on pendingmerchant partialuniqueindex, and writesaudit in sametransaction. Assistant syntheticprofile is available actor; permission/owner HTTPguards are not tested by service calls.

## Isolation, provenance and cleanup

Actualjob https://github.com/nora953/fawri-production-source/actions/runs/38442860689/job/115453629407 ; head29be3ed302f1d307129a3999b1e978f8fb20ee19. FreshownedPG16network-none/no publishedports; Node24 sharesonlyownedloopbacknamespace. Attestation/database/role/run marker verified before migrations and imports. Readonlysource, no hostedDB/providercredentials/calls. CurrentE164syntheticaccounts seedpreparedonce; no initialblockedattempt for thisbatch. Ownedrootrole is not leastprivilege productionRLSproof.

Pool.end, temporarydata cleanup=true, provisionertrap and finalalwaysownedcontainer/volume cleanupSUCCESS. Exactmarkers/jobsteps and fullTAP inseq304evidence. Rawprivate logs/sessiontokens/hashvalues not saved; projections explicitly exclude authenticationsecrets. Temporaryfault trigger/function onlycreated/dropped in ownedcluster. No application repair/schema change or originaltestweakening.

Final trackedrepositoryscan1790files/0findingsPASS; policy74workflows/0violationsPASS. Historicalsynthetic reachable-historygate staysOPEN; no fullsecuritygreen.21automatedselectorpaths remainunmapped and222minimumfull-routecases allNOT_RUN unchanged. WholeauditpercentageNOT_YET_MEASURABLE;releaseBLOCKED.

NextSEQ-306: modern currentAuthv2 merchantmanagementHTTP/deletionrequestreview and realowner/assistant session-action boundaries, then remainingfullroutes/provider/hosted operationalgates. No finalrepairplan before comprehensiveauditcompletion; no merge/deployment.
