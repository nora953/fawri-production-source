## Active session identity readiness hardening — CI pending, 2026-10-15

Active Draft#550 / fix/p0-provider-receipt-order-discovery-20261015. Separate root cause: readiness checked current_user only; a privileged session_user can remain behind SET ROLE. New local unit reproduced7PASS/1FAIL (missing rejection), repaired8/0; TypeScript/diffPASS. New code separately checks session role superuser/BYPASSRLS/protected-table ownership. New disposable cases reject bootstrap-superuser session behind restricted current role, and independently test non-superuser session roles with BYPASSRLS or receipt-table ownership; RESET ROLE is observed to restore unsafe RLS state, all fixture DDL rolls back. Existing normal acceptance fixtures now set both current/session identities to the restricted role with SET SESSION AUTHORIZATION, preserving original ownership membership cases. Actual new SQL/CI NOT RUN until publication; do not count previous326PASS as this source's acceptance.

Next: inspect new CI/source, exact session-role SQL outcomes, fullrestore/cleanup and all workflows; record results. Resume git fetch origin fix/p0-provider-receipt-order-discovery-20261015; git switch --detach FETCH_HEAD. Owned runner only: bash scripts/run-isolated-postgres-audit.sh tenant. Prior provider mapping-change concurrency remainsNOTRUN after delegated content flag; no bypass of that block is attempted here. Hosted owner/grants/provider/storage/deployment and ownership/retention policy remainOPEN; historical85%/15% unmeasured, releaseNO-GO. No main merge/deploy/hosted writes. PostgreSQL rationale: https://www.postgresql.org/docs/17/sql-set-role.html and https://www.postgresql.org/docs/17/role-attributes.html . This is bounded startup/session-readiness hardening, not certification of actual hosted credentials or every reachable privileged-role configuration.

## Receipt inbox RLS readiness accepted — 2026-10-15

Draft#550 source `e1b31378ff7acc3ead9850db2eb418dee90b31c7`: **25/25 workflows SUCCESS**. Isolated run `38684893840`, job `116257386044`, checkout `2f4abef901f29cb9295800f80ae0e5b25472abfa`: **326 PASS / 0 FAIL / 0 SKIP**,55unique/57invocations (parents/repeated runtimes included). RLS suite22/0/0 includes two new global inbox drift cases. Independent migration-inventory unit baseline6/1 identified only verified_provider_payment_receipts missing; repaired7/0. Runtime protected-table inventory now covers the capability-only inbox alongside tenant tables, while keeping legacy field/error IDs compatible. No policy/migration/grant changes. Fullrestore/ownedcleanupPASS:34migrations/95tables/45policies/9functions, unchanged fingerprint388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035. Evidence: evidence/P0_RECEIPT_INBOX_RLS_READINESS_RESULTS_20261015.json.

## Current acceptance and handoff — 2026-10-15

Active Draft #550, branch `fix/p0-provider-receipt-order-discovery-20261015`, base Draft #549. Tested code commit: `cd7408ee178393a5a63a02e6bbdc9a163cd54c00`. All **25/25 observed workflows SUCCESS**. Isolated run `38681867802`, job `116247985222`, merge checkout `181b04e212b5c98e8848652e56d4f517b19464e5`: **324 PASS / 0 FAIL / 0 SKIP**, 55 unique files / 57 invocations. Counts include parent tests and repeated runtimes; never add overlapping workflow totals.

The original signed SaaS/cashier callback now finds an existing mapped order under a nonowner, non-superuser, NOBYPASSRLS runtime with empty tenant/admin context. Independent SQL proves one immutable receipt, one application and one subscription for each authority; fresh duplicate replay retains original receipt/paid time. Naked global reads remain zero and pooled context resets. Permission denial, request/amount mismatch, same-authority and cross-authority ambiguity fail closed without grants. The capability only resolves existing authoritative orders; arbitrary ownership repair is not implemented. Operator authorization remains separate.

Baseline failure is preserved: source `1f3d743a78d7716b21b6e875e62e4fe477e324a4`, run `38681215276` / job `116245975903`, 321 PASS / 3 FAIL / 0 SKIP (parent plus two new cases). Both returned ORDER_NOT_FOUND despite mapped orders, with receipt1/apps0/grants0. Exact report: `P0_RESTRICTED_PROVIDER_ORDER_DISCOVERY_20261015.md`; baseline and repair JSON evidence under `evidence/P0_RESTRICTED_PROVIDER_DISCOVERY_*_20261015.json`.

Canonical regeneration/reproducibility and actual SQL PASS in schema run `38681868158`, job `116247986045`; this provides CI evidence despite the local symlinked-pnpm generator block. Full restore PASS: 34 migrations / 95 tables / 45 policies / 9 functions, matching seed/verify fingerprint `388515b2f9bd94c03cded652f5f39a5414fb1f6950f80f2521d033c237392035`. New resolver remains non-PUBLIC after restore. Owned container/volume cleanup PASS. Parent #549 cashier RLS readiness repair `36f955e` remains accepted (321/0/0, 14 workflows), now included in this source.

Remaining: provider-specific mapping changes after initial discovery and between receipt-admission commit/application are **NOT RUN**. Additional delegated instrumentation was interrupted by an automated content flag; incomplete unpublished changes were removed, so they are not part of this accepted source. Next exact unit is a controlled fixture concurrency proof at those actual database boundaries, with immutable receipt/no premature grant/context-reset assertions. Merchant mutation after admission is constrained by existing composite FKs; do not weaken them. Also independently review receipt/function-owner readiness coverage. Hosted owner/RLS/EXECUTE/provider acceptance, deployment gating/storage, arbitrary ownership repair and retention-duration/privileged-deletion policy remain OPEN. No new percentage is measured: historical85% complete/15% remaining only; release **NO-GO**.

No main merge, Railway deployment, hosted migration/grant/secret changes or real payment was performed or authorized. Documentation-only final checkpoint uses [skip ci]; tested code is the SHA above. No tests are running at this checkpoint.

Exact resume commands and remaining unit are in WORK_HANDOFF.

## Restricted signed-provider discovery repair — 2026-10-15 (CI pending)

Active dependent Draft#550/fix/p0-provider-receipt-order-discovery-20261015, base#549. Baseline1f3d743a78d7716b21b6e875e62e4fe477e324a4, isolated38681215276/job116245975903 FAIL:321PASS/3FAIL/0SKIP,55unique/57invocations (failing new suite0PASS/3FAIL includes parent+2cases). Five other workflowsSUCCESS. Both actual signed original callbacks (SaaS/cashier) returnSUPERQI_SANDBOX_VERIFIED_PAYMENT_ORDER_NOT_FOUND under nonowner/NOBYPASSRLS with empty tenant/admin context despite mapped orders. Independent SQL proves durable inbox1/originaltime, orders unchanged/apps0/grants0; nakedreads0 and pooledcontextempty. This is availability failure, not demonstrated tenant leakage.

New bounded repair adds non-PUBLIC0033 confirmed-receipt/order resolver, separate private-symbol provider scope, tenant-scoped reference attachment and revalidation inside both original billing transactions; operator replay authorization unchanged. Existing authoritative order only, no inferred ownership repair. Negative cases cover absentEXECUTE/request/amount mismatch/same-authority/cross-authorityambiguity/decoyisolation, followed by success/duplicate/originaltime checks. Restore asserts newcapabilitynonPUBLIC. Localtypecheck/syntax/diff/staticmigrationlineagePASS. Full local canonical generation BLOCKED by symlinkedpnpm module directory restriction atlegacy stage2; actual newSQL/CI NOT RUN until published.

Current resume commands in WORK_HANDOFF.

## Cashier production RLS readiness acceptance — 2026-10-15

Draft#549 source36f955e32d0f6f7284b5fcfb850ea117e0c00ee0, isolated38681113382/job116245665218:321PASS/0FAIL/0SKIP,54unique/56invocations;14/14workflowsSUCCESS. Runtime gate now includes all7 cashier licensing/billing RLS tables omitted after0027. Local baseline5PASS/1FAIL→repair6/0; actual RLS suite20/0/0 includes14new disabled-RLS/runtime-ownership drift cases and rollback-restored readiness. Fullrestore33migrations/95tables/45policies/8functions and cleanupPASS, identical fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498. Exact report: SEQ_377_P0_RLS_RESTORE_ADMIN_SYNC_READINESS_20261014.md; evidence/P0_CASHIER_RLS_READINESS_RESULTS_20261015.json.

Next executable unit is separate dependent Draft#550/fix/p0-provider-receipt-order-discovery-20261015, baseline1f3d743a78d7716b21b6e875e62e4fe477e324a4. It reproduces actual signed-provider callbacks under nonowner/NOBYPASSRLS/no tenant context, preserving durable receipt before desired success assertion. Baseline CI38681215276/job116245975903 still running at checkpoint; NOT RUN/PENDING until logs are inspected. Bounded receipt-backed existing-order resolution repair in progress locally, not accepted. No automatic ownership repair/deletion policy. Hosted owner/grants/provider/storage/deployment gates OPEN; historical85%/15% not newly measured, releaseNO-GO. No main merge/deploy/hosted migration/grants permitted without separate explicit approval.

## Integrated #523/#535 evidence — 2026-10-15

Combined Draft#549/8a694b43 passes307/0/0 and14workflows. This supersedes the need for a combined synthetic regression, not hosted rollout or ownership/retention policy. #523 keeps remaining policy/discovery/hosted acceptance OPEN; #535 keeps reviewed function owner/RLS/EXECUTE and hosted full path OPEN. No new product defect found by three directory boundaries or integration. Current next actions in WORK_HANDOFF.

## #523 bounded acceptance update — 2026-10-15

Three additional directory/evidence/durable-audit boundaries PASS on df31f752 (run38679137264); no new production defect found. Restricted DML protection does not define a financial retention duration or authorize privileged deletion. Order discoverability/ownership repair, approved retention and hosted capabilities remain OPEN; combining accepted billing/Meta stacks into one tested Draft is next.

## #523 / #535 scope reconciliation — 2026-10-15

#523 stays OPEN. Actual autocommit verified-inbox response-loss now PASS for SaaS/cashier (bb0ac4e0, run38677861248, new5 counted tests); existing explicit-COMMIT transport, durable inbox and operator17 proofs must not be rebuilt. No production defect reproduced by this new extension. Remaining: operator ownership/discoverability/retention and reviewed hosted capabilities.

#535 full original restricted-role Meta pipeline already PASS on separate #547/217a40c8 (287/0/0,14 workflows); issue comment6183869401 reconciles stale scope. Hosted owner/RLS/EXECUTE rollout stays OPEN. Railway readiness endpoint200/ready is now observed, but old main/d38d2922 code, checkSuites=false, storage architecture and Neon tool unavailability retain release NO-GO. See WORK_HANDOFF and hosted gate; no percentages freshly measured.
## Verified supplied Meta recipient admission and pure module extraction — 2026-10-15 Baghdad

Accepted source `198f9145e6021c15352ca9edae7939e9c2151f1b`, Draft PR #547. Isolated run `38655918835`, job `116165872633`, merge checkout `8450ce4f18fa84a4d4769dd8c9d3c4fbf90b461c`: **283 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Parent tests and repeated runtime invocations are included; overlapping workflow counts are not added. Meta run `38655918971`, job `116165526685` succeeds with 20 identity tests including parent.

Original signed app/encrypted queue/restricted live worker accepts both valid controls: signed second-tenant channel and an original encrypted job with omitted optional recipient. Sixteen malformed cases dead-letter before changing nine exact domain snapshots or increasing provider calls beyond those two valid sends. Supplied recipient must match canonical page, including rejection of conflicting, empty and null values; completely omitted recipient remains compatible. Pooled isolation/context reset passes.

Baseline `8bdb14cfb305b373dee98ca6933d020c08988e77`, Meta run `38655454807`, job `116164017803`: 16 PASS / 4 FAIL including parent. Each malformed supplied recipient completed with an extra provider call and seven changed domain snapshots including subscription/reply ledger. Canonical page/sender still routed the outbound reply; no wrong outbound destination, foreign-tenant writes or external exploit demonstrated.

First repair `c4334399` passed full Meta/20 identity tests but hit the unchanged structure gate at 1802 intent-service lines (critical threshold 1800), quality run `38655684372`/job `116164762558`. Pure admission parser/type and deterministic digest/JSON helpers now live in `metaReplyJobAdmission.ts` (176 lines), imported before SQL orchestration (1634 lines). Exact extracted-text comparison after export/name normalization, TypeScript, syntax, diff and unchanged structure audit pass. Current all-CI proof includes that refactor.

Full schema restore and owned container/volume cleanup pass: 33 migrations, 95 tables, 45 policies, 8 functions; fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. Report `P0_META_RECIPIENT_ADMISSION_20261015.md`; immutable evidence `evidence/P0_META_RECIPIENT_ADMISSION_RESULTS_20261015.json` retains baseline, gate failure and corrected acceptance.

Prior docs `2fd90087` ended 12 successes/2 cancellations, not full acceptance. Providers are synthetic; no schema/RLS/grants or hosted rollout changes. #535 remains open for hosted capability review. Derived-event format and broader precommit process termination remain separate audit candidates. PR stays draft; no merge/deploy.

## Verified normalized Meta reply envelope admission — 2026-10-15 Baghdad

Accepted source `cfc9e279bb7022716b79f9fa55484b52fbbdc841`, Draft PR #547. Isolated run `38654600094`, job `116161483164`, merge checkout `57d157e7c7846229d92d25dc581a5e95bac8ddeb`: **279 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parents and repeated runtime invocations; overlapping workflows are not added. Meta run `38654600099`, job `116161259617` also succeeds; identity suite has 16 passing tests including parent.

Original signed app/encrypted queue/live worker under a restricted nonowner role rejects thirteen malformed identity/envelope cases before changes to nine exact domain snapshots or provider calls beyond the valid signed second-tenant control's one call. New guards require object `page`, one entry, one messaging event and no boolean `is_echo=true`, matching normalized original reply ingress. Existing media/collision/restart/restore tests pass. Pooled isolation/context reset passes.

Baseline `7e10c21252df4c284401ea9f2c13187d7f4ffe83`, Meta run `38654095685`, job `116159663016`: 11 PASS / 5 FAIL including parent. Wrong object, echo, extra entry and extra message all completed, each called the provider and changed seven domain snapshots including subscription/reply ledger. No tenant bypass or external exploit is established; later events were ignored, not demonstrated executed. First repair `47f57938` passed all sixteen identity tests but failed the old captioned-image direct fixture missing object `page`; accepted source adds that field only and preserves media suppression/storage assertions.

Full schema restore and owned container/volume cleanup succeeded: 33 migrations, 95 tables, 45 policies, 8 functions; fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. TypeScript/syntax/diff checks pass. Report `P0_META_ENVELOPE_ADMISSION_20261015.md`; immutable evidence `evidence/P0_META_ENVELOPE_ADMISSION_RESULTS_20261015.json` preserves baseline and corrected proof.

Prior documentation checkpoint `6cff5bb5` has 10 successful and 4 cancelled workflows, not full acceptance. These cancellations do not invalidate the separately completed 275-test source proof. Providers are synthetic local services. No schema/RLS/grants or hosted rollout change; #535 remains open. Recipient/derived-event identity and broader precommit process termination remain separate audit candidates. PR stays draft; no merge or deployment.

## Verified Meta webhook-body identity admission — 2026-10-15 Baghdad

Accepted source `15a2b0d6e83eb6aec8fc4f284cc8a6ab24c630d3`, Draft PR #547. Isolated run `38653303268`, job `116157339326`, merge checkout `60d64af543b42ddc31c216a74f48665b5b804972`: **275 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parent tests and repeated runtime invocations; overlapping workflow counts are not added. Meta run `38653303727`, job `116157046053` also succeeded; the identity suite has 12 passing tests including its parent.

The original signed app, encrypted queue and restricted live worker reject nine malformed jobs: row/payload merchant and event conflicts, missing explicit event, and conflicting or missing body page/sender/message identifiers. Every denial returns `META_JOB_PAYLOAD_INVALID`, preserves exact snapshots of nine domain tables and keeps provider calls at 1 for the valid signed second-tenant positive control. Pooled isolation/context reset passes. Repair requires body identifiers to equal the already-required explicit payload fields before SQL preparation.

Baseline `22f62bbe06af99546c0870de25560671749e98da`, Meta run `38653087929`, job `116156323167`: 8 PASS / 4 FAIL including parent. Each of three missing body identifiers wrongly completed with one provider call and changes to conversations, messages, inbound events, outbound deliveries, notifications, subscriptions and reply ledger. Tenant/event row and payload were consistent, so no tenant bypass or external exploit is demonstrated. Body conflicts already rejected correctly.

Full restore and owned container/volume cleanup succeeded; 33 migrations, 95 tables, 45 policies, 8 functions, fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`. Local TypeScript/syntax/diff checks passed. Report: `P0_META_WEBHOOK_BODY_IDENTITY_20261015.md`; immutable machine evidence: `evidence/P0_META_WEBHOOK_BODY_IDENTITY_RESULTS_20261015.json`.

Documentation checkpoint `9dd839d` had 13 successes and a cancelled isolated run; it is not counted as 14/14 acceptance. Graph/embedding are synthetic. No schema/RLS/grants or hosted rollout changes. #535 remains open for hosted capability review. Next audit candidates: object/recipient/echo/cardinality/envelope semantics and broader precommit termination; these identifier tests do not close those scopes. PR remains draft, without merge/deployment.

## Verified Meta durable job identity admission — 2026-10-15 Baghdad

Draft PR #547 accepted source `f76f4db29811864cd885aa4fb0eafd5577e490e2`; isolated run `38652116750`, job `116153247325`, merge checkout `71db6931587456b44938ec43135c3b6f84a55b05`: **269 PASS / 0 FAIL / 0 SKIP**, 51 unique files / 53 invocations. All 14 observed workflows succeeded. Counts include parent tests and repeated runtime invocations; overlapping workflow counts are not added. The new identity suite contributes 6 passing tests including its parent.

The original signed app, encrypted queue and live worker under a restricted nonowner role accept the valid second-tenant channel control. Conflicting payload merchant, conflicting event, and missing explicit event all dead-letter with `META_JOB_PAYLOAD_INVALID` before changing any of nine exact domain snapshots or increasing provider calls beyond the positive control's one call. Naked tenant reads and pooled context reset pass. The service admission check precedes `ensureInboundState`; the existing inbound-event collision fixture now uses a consistent canonical queue identity and retains its collision assertion.

The baseline event mismatch completed, and missing event wrote inbound/conversation/message/notification state before late rejection. Merchant mismatch was already protected by a composite foreign key (`23503`); no foreign-domain writes or RLS/FK bypass were demonstrated. Earlier failures, including the corrected fixture-reference mistake, remain documented in `P0_META_JOB_IDENTITY_20261015.md` and machine evidence `evidence/P0_META_JOB_IDENTITY_RESULTS_20261015.json`.

Full restore passed with 33 migrations, 95 tables, 45 policies, 8 functions and fingerprint `793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498`; owned container/volume cleanup succeeded. TypeScript, syntax and diff checks passed. Graph and embedding are synthetic local providers. No schema/RLS/grant change, hosted rollout, merge or deployment is included. #535 remains open for hosted owner/RLS/runtime capability review. Further audit candidates include canonical webhook-body identity and broader precommit process termination; those are not closed by this checkpoint.

## Verified original Meta DLQ/refund-enqueue restart gap — 2026-10-15 Baghdad

Draft PR547 acceptedsource2af43ccec88b4588584018c0cb2c2b1691fe3758; isolated38648764448/job116142085204 mergecheckoutb0d294eb95c5c5e84679b88d9cdb10a874b281a1 SUCCESS:263PASS/0FAIL/0SKIP,50unique files/52invocations. Newactualworkerrestart4PASS(parent+3stages); all14observed workflowsSUCCESS. Prior documentationheadf759a31 all14CI SUCCESS. Fullrestore33migrations/95tables/45policies/8functions same793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498 and ownedcleanupPASS. Test-only source changes; no production app/schema/RLS/grants change.

Signed originalapp/queue/liveworker under nonowner/NOSUPERUSER/NOBYPASSRLS, ownedGraph400 confirmsfailure. Passive nativeSQL/result observation forwards promise/callback forms unchanged, recognizes actual target job UPDATEdead_letter/META_REPLY_FAILED then arms existing exactCOMMIT wireproxy. BackendCOMMIT withheld/selfSIGKILL beforefailJob return/onDeadLetter. Independent SQLproves1failedreplyjob/saferequeuepolicy/debit1/no credit/no refundjob and providerCalls1. Fresh originalstartup scan discovers debt; testobserves originalqueuedrefund/no credit within10s before manualrun. Original enqueue/decrypt/claim/refund processes1job/1credit, originalreplyrequeue blocked, balance20. Two concurrent newworkers restart: no extrajob/credit/providercall, exactcreditledger unchanged, owned+decoybalances20, nakedreads0/contextreset. No fixturecreatesrefundjob or replacesworker/route/auth handlers.

Preserved88cbe8b2: isolated38647618878/job116138286317newrestart4PASS, Metapipeline38647618893/job1161382863321PASS/3FAIL(parentincluded), FoundationFAIL. Preservedc570b143: isolated38648214182/job1161402617474PASS, Metapipeline38648214205/job1161402612891PASS/3FAIL, FoundationSUCCESS. Explicitworkerconstructor starts500ms polling despitebootstrapdisable; ownedpoll60000ms separatesmanualclaim. IPCready onlymeansconstructed; original recoverMissingRefundJobs asynchronous, runOnce caninitiallyfindnojob beforestartup enqueue. Boundedsuccessful observation of originalqueuedjob is correct fixtureprecondition, preservingmanualrun=true and exactstate checks; no runtime/readiness/pollbehavior repair. Faileddependent ledger assertions fromundefined expectation retained, notnew productdefects oracceptedsource. Local syntax/diff/proxy5PASS separate/overlapping.

Next concreteunit: hostileencryptedjob payload vsdurable row merchant/event identity beforepreparation. Source postgresMetaAutoReplyIntent.parseJob prefers payload.merchant_id and preparePostgresMetaAutoReply enters ensureInboundState before latercorevalidateJob; sourceconcern, dedicatedruntimeNOT_RUN. Construct validforeignchannel/body as positivecontrol, canonicalrowA/payloadB viaoriginalencrypt/enqueue; require rejectionbeforeconversation/message/notification/ledger/providerwrites, then truthful codefix ifruntimeconfirms. Do not use missingforeignchannel as falsegreen. Broaderprecommit/processkill and reviewed schemaowner/RLS/runtimeEXECUTE rollout535 separateOPEN. This proves boundedactualworker startuprecovery, not fullproductionbootstrap/scheduler/realMeta/AI/hostedDB/fullUI/release-ready; no merge/deploy/payment action orwholeauditpercentage. Report:P0_META_WORKER_RESTART_20261015.md; machineevidence:evidence/P0_META_WORKER_RESTART_RESULTS_20261015.json.

## Verified restricted Meta restore COMMIT-ack/process recovery — 2026-10-15 Baghdad

Draft PR547 accepted sourceb62ab0e663da9064596856d2dd21a8e8a9f73fe0. Isolated38646289223/job116133845970, mergecheckout10f23f7e37c250f8ea02fbaa17efee1c26640488 SUCCESS:259PASS/0FAIL/0SKIP,49unique files/51invocations; new scopedrestorewire6PASS(parent+4faultcases+1chronology). All14observed workflowsSUCCESS. Prior documentationhead686730c2 also14/14CI SUCCESS. Fullrestore33migrations/95tables/45policies/8functions matching793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498 and ownedcleanupPASS. No production source/schema/RLS/grants changed for this unit.

Original authoritative refund/release wrappers and scopedSQL in fresh nonowner/NOSUPERUSER/NOBYPASSRLS children. Existing ownedTCP proxy forwards role/read-denial assertions then arms immediately before restore; exact actual backend COMMIT CommandComplete withheld. Fourcases(refund/release × handleduncertainty/selfSIGKILL) independently prove committed1credit/balance20, originaldebitunchanged, wrongtenantdenied without eitherbalancechange. Two concurrent freshprocess retries each returnalready_refunded/already_released, exact originalcredit/id/time/metadata unchanged, tenantcontextreset. SIGKILL occursafteractualcommit beforecaller acknowledgment, not arbitraryprecommitkill. Prior originalsignedworker13PASS remains separate; this unit is restoreprimitive transport/process acceptance, not full-worker scheduling/restartgap.

Preserved firstsource45428643: isolated38645703979/job116131890089256PASS/2FAIL (newwire3PASS/2FAIL,parentincluded); Meta pipeline38645703996/job116131890635newwire2PASS/3FAIL. Failedfunctional cases stopped atinitialrawfixture reservation beforewirefault. Deterministic originalSQL observer-only fixture reproduces23514 with microsecondcreated_at vs JavaScriptmilliseconds; originaldenial/unchangedrollbackPASS. Positiveownedfixtures nowcreated1minuteearlier, no applicationguard/constraint/faultassertion weakening. Localproxy5PASS; initialwronglocaltestpath corrected withoutclaimingpass. Counts overlap priorproofs, no additiveauditpercentage.

Next concrete unit: full originalworker crash after confirmedfailure/deadlettercommit before refundenqueue, freshworker discovers owedrefund, once-onlycredit; then hostile encrypted payload/rowtenant mismatch runtimecase and broaderprecommit/processinterruptions. Existing boundedwire proof mustnot substitute for thatworker lifecycle.535 reviewed schemaowner/RLS/runtimeEXECUTE rollout remainsOPEN; globaldiscovery behavior needs its ownruntimeevidence. No hostedDB/grants/realprovider/payment/merge/deploy/fullUI/bootstrap/scheduler/release-ready claim. Report:P0_META_RESTORE_WIRE_RECOVERY_20261015.md; machine evidence:evidence/P0_META_RESTORE_WIRE_RECOVERY_RESULTS_20261015.json.

## Verified restricted Meta refund and postreservation release — 2026-10-15 Baghdad

Draft PR547 accepted source0efc5c547b201ec80031901f540d4d91cf38d494. Isolated run38644555624/job116128093363, mergecheckout08dd6779604d091d352b5d417055f73d5c16cd5e SUCCESS:253PASS/0FAIL/0SKIP,48unique files/50invocations. Original actual-app suite13PASS(parent+12cases), superseding prior10 withoutaddingruns. All14 observed workflowsSUCCESS; previous documentationhead35a4a3 all12CI SUCCESS. Fullrestore33migrations/95tables/45policies/8functions identical793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498, ownedcleanupPASS.

Signed original app/manualfilter/tenantqueue/liveworker under nonowner/NOBYPASSRLS. New owned Graph400 confirmedfailure with attemptlimit1 follows original deadletter/refundjob:1debit then1credit/balance19. Original afterReservation hook changes actual merchantsettings; beforesend check suppresses withoutGraphsend and releases1credit/balance19. Fourdebits/twocredits total includes prior2successfulresponses; successfulGraphsendcount2 staysunchanged. Two concurrent replay calls AFTER each original restoration returnalready_refunded/already_released and noextra credit; not racingtwoinitialcredits. Wrongtenant blocked before refund under restricted RLS (reservation_not_found) and under owner role (reservation_identity_invalid), and after bothrestorations; balances/contextreset/directtenantreads0PASS.

Restore supports explicit verifiedmerchant and sets transaction-local tenant context beforeledgerlookup, verifies debitmerchant beforealready-restored path. Refundworker uses durablejobmerchant; postreservationrelease uses validatedjobmerchant. No RLS/grant/capability/migration change. Payload/jobmerchant mismatch guards source-reviewed but dedicated hostile-job runtimecase NOT_RUN. Legacy event-only administrative compatibility remains; global subscriptions/missingrefund discovery/restart recovery are unverified separate scopes, not demonstratedfailures. No realGraph/AI, hostedDB, auto-scheduler/bootstrap/fullUI orwholeauditpercent/release-ready credit.

Next concrete unit: restart between confirmedfailed replydeadletter commit and refundjobenqueue, plus lostCOMMITack during refund/release and freshprocess duplicate recovery under restrictedrole. Reuse existing ownedTCPproxy, do not broaden grants or infer tenant from hidden ledger. Add hostile encrypted jobpayload/rowmerchant mismatch runtimeacceptance separately. Reviewed schemaowner/RLS/runtimeEXECUTE rollout stillOPEN in535; no merge/deploy/liveDB/payment authorized. Report:P0_META_RESTRICTED_RESTORE_20261015.md; machineevidence:evidence/P0_META_RESTRICTED_RESTORE_RESULTS_20261015.json. Existing failureattempt and250pass predecessor remain in history.

## Verified signed actual Meta app / restricted subscription RLS — 2026-10-15 Baghdad

Draft PR547 accepted source f7c88b16633b1a2435a0c9470fac1f90d736fca4. Isolated run38642887506/job116122514964 SUCCESS:250PASS/0FAIL/0SKIP,48unique files/50invocations; actual-app Meta suite10PASS (parent+9cases). All12 observed workflowsSUCCESS. Local original-function transaction adapter5PASS and existing static contracts6PASS remain separate/overlapping, not additive SQL proof. Full restore33migrations/95tables/45policies/8functions fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498 identical seed/verify; owned cleanupPASS.

Original app.ts signedHTTP/manualfilter/encryptedqueue/original liveworker runOnce, nonowner/NOSUPERUSER/NOBYPASSRLS. Two owned tenants: each sends1/debits1/balance19, duplicate ingress no extra job or grant, manual inbound persists once/noautomaticreply, expiredsubscription suppressed, invalidsignature401 and unknown/disconnected/revokedcapability503 without tenant leakage. Original subscription reads now scope known merchant inside BEGIN with transaction-local set_config; naked tenant tables including subscriptions/replybatches remain0 and pooled tenant resets. Synthetic loopback Graph and configured embedding only; no real Meta/AI/hosted proof.

First attempt039fe108/run38633527935/job116090836480 failed worker admission because merchant-identified subscription transactions omitted tenant context and RLS hid valid subscriptions. Failed-dependent debit/expired assertions preserved. Repair scopes read/reserve/emergency/action transactions only, preserving policies/grants/locks; no blanket RLS bypass. Approved publication used connected GitHub after shell push lacked credentials. Prior automatic approval rejections and later explicit destination consent retained.

#535 remainsOPEN for reviewed schema-owner/RLS/runtime capability rollout; bounded fullapp happy/manual/expired acceptance now verified. Event-only restore/refund/release and global list discovery remain separate unscoped source concerns, not runtime-verified defects or covered by this acceptance. Next concrete unit: actual liveworker confirmed-failure refund and postreservation release under restricted RLS, pass verified merchant from owned durable job, reject identity mismatch, prove concurrent replay once-only credit/contextreset. Do not weaken RLS/infer tenant from hidden event or repeat accepted happy path without new fault. No merge/deploy/hosted DB/grants/provider/payment/fullbrowser/mainbootstrap/scheduler/wholeauditpercent/release-ready action. Report:P0_META_FULL_APP_RESTRICTED_20261014.md; machine evidence:evidence/P0_META_FULL_APP_RESTRICTED_RESULTS_20261014.json.

## Verified actual operator HTTP PostgreSQL wire recovery — 2026-10-14

Draft PR546, branch test/p0-operator-replay-wire-recovery-20261014 stacked on545/d15aa5fd. Accepted2e3acfea62c6c7e1ad14e2f088e33fb0998ba3d8; isolated38631830513/job116085119744, merge71db03cc64f5916b81806d96c14a8de2810ab5c8:240PASS/0FAIL/0SKIP,47unique files/49invocations. New operator suite5PASS (parent+4cases);7/7 observed workflowsSUCCESS. Prior545 documentation head7CI SUCCESS verified. Totals overlap earlier proofs; no additive/whole-audit percentage.

Original operator HTTP/router/admin session/device/currentpermission and original SaaS/cashier SQL authorities run in fresh children under nonowner/NOBYPASSRLS. Owned TCP proxy forwards authentication then arms after fresh synthetic provider confirmation; exact actual backend COMMIT CommandComplete withheld at receipt/grant boundaries. All4cases return503 without success and independently observed committed state. Fresh genuine session after current finance permission removal returns403 before provider/audit/state changes even after completedgrant. Two concurrent new-process/session retries each recheck provider: receipt boundary applied+duplicate, grant boundary duplicate+duplicate. Exactly1application/subscription per owned order, original six-digit receipt/event/paid UTC time, immutable evidence and durable execution auditPASS. Four owned grants total; prior generic service/browser proofs remain separate.

Fullrestore33migrations/95tables/45policies/8functions/restrictedtenantreads seed/verify identical793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498. LocalAPI typecheck/syntax/5proxytests/diffPASS. First source accepted without correction; documentation checkpoint preserves testedsource. [Report](P0_OPERATOR_REPLAY_WIRE_RECOVERY_20261014.md), [machine evidence](evidence/P0_OPERATOR_REPLAY_WIRE_RECOVERY_RESULTS_20261014.json). Unrelated pre-existing capture PNG remains untouched/unstaged/excluded.

523 remainsOPEN: bounded actual operator TCP-ack uncertainty accepted; expiry/device-race extensions, broader arbitrary process termination, independently known order discoverability/ownership-retention and reviewed hosted capability rollout separate.535 full downstream signed restrictedMeta HTTP acceptance is next concrete unit; do not substitute bounded directory/middleware-only proof or repeat accepted source without a new fault. Route-levelHTTP plus synthetic provider in owned offline DB only, not full mainapp/browser/mobile/fullvisual/accessibility/222baseline/release-ready. No production application/schema change, hosted DB/grants/provider/payment/merge/deploy. Publication of code/tests/docs/DraftPR/CI already authorized.

## Verified operator review/confirm/replay UI — 2026-10-14

Draft PR545, branch fix/p0-operator-receipt-replay-ui-20261014 stacked on544/dec8497f. Tested4e95b72e27fa60ba2a59da2c8569854c196eccee; browser38629698500/job116077862920 mergecheckoutc62a528ea2a000e671693d6f67b9290d3d2b3e97:36PASS/0FAIL (11new+25existing). Localfrontend typecheck/build and9client testsPASS (5new+4existing); policyPASS. 7/7 observed workflows SUCCESS for tested source. Prior544 docshead26/26CI SUCCESS. No new backend or SQL proof credit.

Successful SuperQi receipt controls require explicit existing authority/order, separate fresh review and confirmed execution, cancel0writes, editinvalidates review. Identity-matched server applied/duplicate only; no optimistic success. Denied/conflict clears review; network/malformed/5xx execution staysuncertain/noautoretry, explicitfreshreview required. Pending locks controls/listnavigation; abort/late response ignored on permission unmount. Confirmationfocus/cancelrestore and exacttechnicalorderdigits PASS in all3languages. No merchant/amount/ownership override, inferred mapping, browser persistence or rawrefs/hash. UI requires independently reviewedexistingorder ID; discovery remainsOPEN.

Original-parent mountedBrowser with real controller/role permission logic/productionCSS and synthetic GET/POST HTTP; no hookreplacement. Full bot flow3languages; explicit financecashier confirmation/intent, conflict/403/409, simulatedlostack(after1syntheticapplication)/explicitduplicateretry, inputinvalidation, pendingnavigation/permissionremoval, failedreceipt nocontrolsPASS. This is frontend simulated acknowledgement/application acceptance, not real backend grant/transportuncertainty;544 bounded real SQL evidence separate. No full main-App/router/mobile/fullvisual/accessibility/222baseline orwholeauditpercent/releaseclaim.

Initial5773bfce browser38629211770/job11607618220535PASS/0FAIL retained, overlapping; extended with cashierexecution and focusassertions, not additive. [Report](P0_OPERATOR_REPLAY_UI_20261014.md), [machine evidence](evidence/P0_OPERATOR_REPLAY_UI_RESULTS_20261014.json). Documentation-only checkpoint preserves testedsource. Unrelated pre-existing modified docs/final-audit/evidence/seq345-captures/UIR-005-ku-1280.png remains untouched/unstaged/excluded; do not overwrite or publish it inadvertently.

523 remainsOPEN for operator-specific process/TCPcommit uncertainty/expiry-device-race extensions, orderdiscoverability/ownership-retention and reviewedcapabilityrollout;535 full downstreamsignedrestrictedMeta separate. No newbackend/migration/RLS/grant/hosted/provider/payment/merge/deploy action.

Next concrete unit: operator-specific replay real TCP/COMMIT-ack loss and fresh-session retry under restricted role using existing disposable guard/frameproxy, assert one grant/originalreceipt time/currentpermission and durable audit. Existing generic billingwire proof must not substitute for actual operatorHTTP lifecycle. Then full downstream signed restrictedMeta535, with expiry/device-race and orderdiscoverability separate acceptance. Do not repeat verified frontend/backend/review/identity proofs absent changedsource/newfault. Code/tests/docs/DraftPR/CI publication already authorized.

## Verified tenant-scoped authorized receipt replay execution — 2026-10-14

DraftPR544, branch fix/p0-authorized-receipt-replay-execution-20261014 stacked on543/f343649b. Tested1df0e82185e130d86f4b42c831a189c28fd663bb: isolated38610296207/job116011585090235PASS/0FAIL/0SKIP,46unique files/48invocations; actual executionHTTP12PASS. 26/26 observed workflows SUCCESS for tested source. Fullrestore33migrations/95tables/45policies/8functions, matching seed/verify fingerprint793d8e3837c86ee820bb3189ce5003c2368b80326284dc6f1e831762c1e71498/restrictedtenantreads/non-PUBLICexecutioncapPASS. LocalAPI typecheck/build/syntax/canonical33 and5transporttestsPASS; historicalmetadata unchanged. Prior543 docsheadf343649b24/24CI SUCCESS.

POST replay requires existing authority/order intent, nonempty allowed origin, real device-bound admin manage_subscriptions. Trusted-backend-only bounded non-PUBLIC capability validates exact assigned receipt/order, current session/versions/expiry/device/permission, returns one authoritative tenant privately. Initial execution-attempt audit commits before fresh provider check; each original receipt/grant transaction reauthorizes under tenant RLS, holds SHARE locks through commit and checks locked order identity. No merchant/amount override, mapping/order repair, or review-response authority. Original durable receipt admission/once-only SaaS+cashier grant remains; exact paidtimestamp from raw firstreceipt retained.

Proof: real new router+session/device/origin+SQL under nonowner/NOBYPASSRLS with injected provider. Revokedpermission/session and changedmapping duringprovider deny beforebillingevent; auditfailure0providercalls/0writes; concurrent applied+duplicate in eachauthority; partialSQLfault received-event/0grant then once-only retry. Owned grantbarrier proves permission DELETE waits behind commit. Exactly5owned reviewed orders receive applications; rawreceipts unchanged/directtenantlessreads0. Not full mainapp/UI/mobile/accessibility or new operator-specific process/TCP commit-uncertainty proof; no baseline/wholeauditpercent/release-ready credit.

Preserved attempts3d6919bf (38608549904/job116005648212) and3c7b89ae (38609344794/job116008366366), each228PASS/7FAIL; newexecution5PASS/7FAIL. SafeSQLSTATE23514 confirmed original updated_at>=created_at constraints: fixturefixed12:00 receipt preceded realcheckout creation after17:00. Correct owned original chronology provider+50ms/receipt+100ms withsixfractionaldigits fromcheckoutcreated_at; assert chronology beforeseed. No constraint/runtimeguard/cleanup or acceptance weakening. [Report](P0_RECEIPT_REPLAY_EXECUTION_20261014.md), [machine evidence](evidence/P0_RECEIPT_REPLAY_EXECUTION_RESULTS_20261014.json).

Documentation-only checkpoint preserves tested application/SQL/test/workflow source. No hosted database/grant/realprovider/payment/merge/deploy.523 remainsOPEN for frontendexecution workflow, operator-specific transport uncertainty/expiry-device-race extensions, ownership/retention and reviewedcapability rollout.535 full downstream signed restricted-role Meta separate.

Next concrete unit: operator replay frontend using review+execute as separate freshly authorized calls, explicit existing expectedauthority/order, confirmation, clear safe errors and pending/retry behavior; never invent tenant/order mapping or amount, never treat review as grant token. Add original-parent mountedbrowser acceptance with synthetic HTTP; actual backend execution is already boundedverified. Then operator-specific commit-uncertainty transport and full downstream restrictedMeta535. Do not repeat acceptedexecution/review/identity/UI/receipt proofs absent changedsource/newfault. Code/tests/docs/DraftPR/CI publication already authorized.

## Verified audited fresh-provider receipt replay review — 2026-10-14

Draft PR543, branch fix/p0-audited-receipt-replay-review-20261014 stacked on542/59c01d7d. Tested36e34b0250c9e5551cfe36eada09bbc0c91fca49: owned offlinePostgreSQL run38605943109/job115996722476223PASS/0FAIL/0SKIP,45unique files/47invocations; new realHTTP replayreview12PASS.24/24 observed workflowsSUCCESS. Full restore32migrations/95tables/45policies/7functions, identical seed/verify fingerprint56a8482170dc08ded441a06a2c174e954b273be4cf4bf0bd61a41b6c0fe02773, restrictedreads/non-PUBLIC reviewcapPASS. LocalAPI typecheck/build/syntax/canonical32 and5transporttestsPASS; historicalmetadata unchanged. Prior542 docshead59c01d7d also11/11CI SUCCESS.

POST replay-review validates device-bound current admin manage_subscriptions and strict existing authority/order intent. Trusted backend-only non-PUBLIC capability checks current SQL permission, exact unambiguous identity and commits audit before raw receipt lookup. Fresh synthetic-provider status/event/hash/amount/currency verified; SQL permission/mapping audited/rechecked after I/O. Returns verified/applied:false and bounded intent; raw references/hash staybackend. It is review-only, not execution or futuregrant authority. No merchant/amount override/order creation/mapping repair/entitlement action.

Proof: actual route+origin/session/device middleware/SQL in controlled Express host under nonowner/NOBYPASSRLS role; no authstubs. Denials/no providercall, malformed override/wrongorder, both authorities, providerfail/nonterminal/changed identities, crossauthorityambiguity, SQLdisabled actor, permission/mapping change during I/O, auditfault beforeprovider, concurrentreview and exact unchanged receipt/order/entitlementPASS. Source typecheck first found Express scalar/array param union and was corrected before publication; no failed CI attempt for this unit. Not full main-app router/UI/mobile/accessibility, no baseline/wholeaudit percentage/release-ready claim.

[Report](P0_RECEIPT_REPLAY_REVIEW_20261014.md), [machine evidence](evidence/P0_RECEIPT_REPLAY_REVIEW_RESULTS_20261014.json). Documentation-only checkpoint preserves tested app/SQL/test/workflow source. No hosted DB/capability grant/realprovider/payment/merge/deploy.523 remainsOPEN for execution, frontend action, ownership/retention and reviewedcapability rollout;535 full downstream signed restricted-role Meta separate.

Next concrete unit: trusted execution/replay after fresh provider confirmation, retaining audited current operator permission through grant decision and once-only existing receipt/application authority. Review response must never authorize later execution. Existing global order-owner discovery requires a separately reviewed bounded tenant resolution/tenant-scoped entrypoint; never weaken RLS or expose raw capability to merchants. Test true execution with real admin/session/SQL, audit fault, provider/mapping/permission changes, concurrent duplicate retry, partial entitlement fault and uncertaincommit while preserving original receipt time. Do not repeat acceptedreview/identity/UI/receipt proofs unless changedsource/newfault. Publication code/tests/docs/DraftPR/CI already authorized.

## Verified provider/order exact identity binding — 2026-10-14

DraftPR542, branch fix/p0-provider-order-identity-binding-20261014 stacked on541/f5827c1f. Tested2f39b22c8461b65bee233ec731319fbe103ede7f; isolated38603808035/job115989443270211PASS/0FAIL/0SKIP,44unique files/46invocations; extended inbox16PASS (10new+6existing).11/11 observed workflowsSUCCESS.31migration/95table/45policy/6function restore seed/verify fingerprint297fb7562f1ad1425ca955c1b9ad2b5537cc32517b308f20d362aa1d2b8e01ef exact, restrictedtenantreadsPASS. Local API typecheck/build/syntax and5transporttestsPASS. Previous541 documentation headf5827c1f also7/7workflowSUCCESS.

BILLING_PROVIDER_ORDER_IDENTITY_BINDING_20261014: source-confirmed OR candidate discovery lacked exact stored request validation when payment matched. Correct both SaaS/cashier: matching confirmed request mandatory; non-null payment must match, null recoverable only with request match. Confirmed amount must match before attachment; UPDATE rechecks request/amount/provider/payment. Eight negativecases: full order snapshots unchanged, no subscription/application grant, one durable receipt on replay. Six identity-fixture repairs concurrent applied+duplicate with firstreceipt time; two nullpayment positivesPASS. No hosted incident claim, manual API or identity/tenant repair mechanism. FindingFIX_VERIFIED_BOUNDED; broader reconciliation523 remainsOPEN.

[Report](P0_PROVIDER_ORDER_IDENTITY_BINDING_20261014.md), [machine evidence](evidence/P0_PROVIDER_ORDER_IDENTITY_BINDING_RESULTS_20261014.json). No new migration/RLS/grant, mainmerge/deploy/hostedprovider/payment. Actual signed service+SQL injectedgateway in owned offlinePostgreSQL, not full main-app HTTP/operator write acceptance or hostile metadata race proof. No baseline/wholeauditpercent/release-ready credit. Documentation-only checkpoint preserves tested application/test/workflow source.

Next concrete unit: implement trusted admin manual replay capability/action with durable current-permission audit and fresh provider confirmation; receipt event ID+expected existing order authority/id only, no merchant/amount override. Exact immutable receipt/order/provider identities/currency/amount must agree; unresolved/ambiguous mapping failsclosed without creating orders or guessing ownership. Preserve firstreceipt time and existing once-only authorities under retries/commit uncertainty. Test real admin session/SQL permission, audit failure, provider outage/nonterminal/changed identity, ambiguity, concurrent replays and entitlement partial failure. Ownership/retention and reviewed hosted capability rollout under523; full downstream signed restricted-role Meta535 separate. Do not repeat completedidentity/UI/receipt proofs without changedsource/newfault; publication alreadyauthorized.

## Verified operator receipt review UI — 2026-10-14

Draft PR541, branch fix/p0-operator-receipt-review-ui-20261014 stacked on540. Tested source9fd5155eee05e74fb88d0d3f3bec2d777034a406; browser merge checkout6f8f78fa94897fbc91951f0180582c1b5d502245. Actual mounted AdminPage/controller/shell/view/i18n and production CSS, synthetic loopback HTTP. Browser38602501013/job115984989856:25PASS/0FAIL (10 new receipt cases +15 existing parent cases). Arabic/English/Sorani pagination, exact UTC/reference digits, masked/allowlisted fields, empty/permission-denied/no-request, finance403/503 clear/retry and refresh permission removal PASS. Local frontend typecheck/build and4client tests PASS; combined9client/session tests overlap4, not additive. 7/7 observed workflows SUCCESS for tested source9fd5155e; full repository typecheck/build/unit/source contracts/translations, security/supply chain, parent browser, storage, clean deployment contract, staging and foundation integration PASS. Documentation-only checkpoint preserves tested application/test/workflow source.

Preserved failed source3d55c1ae browser38602225533/job11598405686923PASS/2FAIL: i18n digit MutationObserver changed Arabic/Sorani technical timestamps/reference suffixes. Product uses original data-fawri-preserve-digits exclusion only on technical values; money stays localized. All25 assertions retained. [Report](P0_OPERATOR_RECEIPT_UI_20261014.md), [machine evidence](evidence/P0_OPERATOR_RECEIPT_UI_RESULTS_20261014.json).

No receipt persistence/export or entitlement write. Client uses cookie/device-bound existing audited read API; old data clears and stale aborted responses are ignored. Permission-gated tab unmounts on actor/capability change. This is browser frontend synthetic HTTP acceptance, not full App router/real backend combined proof, mobile/complete visual/accessibility certification,222baseline credit, wholeaudit percent or release approval. Existing backend SQL proofs are separate; no new migration or hosted/provider/payment/merge/deploy action.

Next concrete unit: safe manual reconciliation under523: fresh provider confirmation, exact immutable payment/request/order/amount/currency agreement, unambiguous authoritative mapping, current permission and durable audit, once-only existing entitlement authority. Inbox presence/short suffix must never grant or guess tenant. Ownership/retention and reviewed capability rollout remainOPEN. Full downstream signed restricted-role Meta535 separate. Do not repeat verified receipt read/UI proofs without changed source/new fault. Code/tests/docs/draftPR/CI publication remains authorized.

## Verified audited operator receipt read — 2026-10-14

DraftPR540, branch fix/p0-audited-operator-receipt-read-20261014 stacked on539/caafd5f2. **Tested source a79b600713af94633761a1e59333324284d5e671**: isolated38598864396/job115972566934 **201PASS/0FAIL/0SKIP**,44unique files/46invocations; operator HTTP6PASS. **27/27 observed workflows SUCCESS**. Real new route+secure session middleware+PostgreSQL under controlled Express host, restricted NOLOGIN/NOBYPASSRLS/non-owner application role; no auth stubs or entire-frontend acceptance claim.

GET /api/auth/admin/billing/verified-receipts requires PostgreSQL admin authority, secure device-bound session and manage_subscriptions permission. Actor from validated context only; DB rechecks active/enabled/password-ready profile and owner/current permission under shared locks. Bounded/redacted pages preserve microsecond cursor precision; no full references/hash/signature/guessed merchant. Durable scoped audit commits before response; injected audit failure503/no receipt data. Direct table access remains denied; receipt snapshots/global entitlement count unchanged. Trusted-backend read capability non-PUBLIC, no RLS relaxation/merchant grant. Migration0030/canonical31PASS. Full restore31migrations/95tables/45policies/6functions and identical fingerprint/restricted tenant readsPASS; both receipt capabilities remain non-PUBLIC.

Preserved failures:44837e83 isolated38597073031/job115966439784195PASS/1FAIL (device fixture omitted approver, no HTTP credit);0fb0156d isolated38598060193/job115969804431200PASS/1FAIL (operator5PASS then fatal cleanup hook). Correct complete trust via original authority and delete only owned device dependencies before owned accounts; constraints/all acceptance/cleanup assertions retained. [Report](P0_OPERATOR_RECEIPT_READ_20261014.md), [machine evidence](evidence/P0_OPERATOR_RECEIPT_READ_RESULTS_20261014.json).

Issue523 remainsOPEN for frontend/operator manual actions, provider reconfirmation/ownership-retention and reviewed hosted owner/runtime grant rollout;535 remainsOPEN for full downstream signed restricted-role Meta. No merge/deploy/hosted writes/real provider/payment, UI baseline credit, whole-audit percentage or release-ready claim. Documentation-only checkpoint leaves tested app/SQL/test/workflow source unchanged.

---

## Verified unmatched provider receipt admission — 2026-10-14

DraftPR539, branch fix/p0-verified-provider-receipt-inbox-20261014, stacked on538/441d1016. **Tested source e1681e4f462e013d7b0837c5482de17ff879b2e5**: isolated38554285754/job115819667019 **195PASS/0FAIL/0SKIP**,43unique files/45invocations; new inbox6PASS. **29/29 observed workflow runs SUCCESS**. Signed synthetic/gateway-confirmed SaaS/cashier orphan persists1receipt/0entitlement, concurrent duplicate preserves first time and identity, exact restored mapping replay applies1entitlement. Invalid signatures/confirmed-state mismatch create0; SQL failure rejects; restricted role cannot enumerate/directly mutate or use non-PUBLIC admission without explicit owned capability grant.

Migration0029, canonical30 history/snapshot/reviewed SQL hash/preimage included. Global unassigned identity evidence, no tenant guess/raw payload/signature/credential, immutable provider/event/payment/request/type/amount/hash and first time. Admission before lookup; unknown order remains retryable503, never grants from inbox alone. Trusted bounded SECURITY DEFINER function fixed search_path, qualified table, deny-by-default RLS, PUBLIC EXECUTE revoked; no hosted grants/migration performed.

Full restore30migrations/95tables/45policies/5functions and restricted tenant readsPASS; seed/verify fingerprints identical. Effective ACL entries expand defaults and sort without dropping grants; temporary added-grant probe detects real changes; receipt function stays non-PUBLIC after restore. Preserved first70375a57 and second6461059a attempts194PASS/1FAIL each, inbox6PASS: table default-vs-explicit ACL and legacy function grant-order representation only. Stronger final checks replace storage-form comparison while retaining overall fingerprint assertion. Native ordering correction805a68bd was superseded before runtime acceptance; never credit it as tested.

[Receipt report](P0_VERIFIED_RECEIPT_INBOX_20261014.md), [machine evidence](evidence/P0_VERIFIED_RECEIPT_INBOX_RESULTS_20261014.json). Issue523 staysOPEN for operator API/UI authorization, manual reconciliation/ownership/retention and reviewed hosted function owner/runtime grant rollout;535 staysOPEN for full downstream signed restricted-role Meta. SuperQi remains sandbox-only/production-forbidden. No merge/deploy/hosted writes/real payment, UI baseline credit, whole-audit percentage or release-ready claim. This documentation checkpoint leaves tested app/SQL/test/workflow source unchanged.

---

## Verified actual PostgreSQL wire response loss — 2026-10-14

DraftPR538 tested source **abe851db0bf40ecf2dcf294dc73f5a32c6c78a44**: isolated38550530635/job115807106721 **189PASS/0FAIL/0SKIP**,42unique files/44invocations; receipt recovery15PASS including four actual TCP dropped-COMMIT-response cases. All **26/26 observed workflow runs SUCCESS**. Admin corrected lane38550531165/job11580754187941PASS includes original admin proof1PASS; overlaps tenant batch, adds no unique credit. Framing4PASS separate from SQL total.

Product correction: lib/db/src/index.ts drains active-client and idle-pool connection error events, preserves failed query/transaction rejection, and reports only bounded SQLSTATE. Wire proxy observes actual server COMMIT CommandComplete, withholds it/ReadyForQuery and closes TCP; authority returns controlled failure, independent parent sees committed state and fresh concurrent next-day processes apply exactly once or both duplicate, preserving original paid_at. All original billing/process/backend/known-COMMIT-rejection and cashier-history assertions retained. Legacy global-admin service/push-force lane replaced with reusable attested network-none runner, guard preserved.

Preserved failures: c4acd6cb isolated38549209533/job115802750100184PASS/5FAIL (four wire cases plus parent);38c41f26 broad25/26PASS, global-admin38549878445/job115804963066 rejected missing attestation before DB import. Corrected source above proves the fixes; prior attempts are not relabeled green. [Report](P0_WIRE_COMMIT_ACCEPTANCE_20261014.md), [machine evidence](evidence/P0_WIRE_COMMIT_RESULTS_20261014.json).

Wire acknowledgment boundary now covered under523; issue staysOPEN for unmatched verified-payment durable inbox/operator reconciliation.535 staysOPEN for full downstream signed restricted-role Meta and hosted grant review. No UI baseline credit, whole-audit percentage or release-ready claim. No merge/deploy/hosted mutation/real provider/payment. This documentation checkpoint leaves tested application/test/workflow source unchanged.

---

## Verified COMMIT caller-outcome checkpoint — 2026-10-14

Draft PR538 tested source **d418feaf63288411b0b135a6d0c50ad3bdb9caf7**. Owned offline PostgreSQL run38525448026/job115724620052: **185PASS/0FAIL/0SKIP**,42unique files/44invocations. Receipt suite11PASS includes four new driver08006 outcomes after successful actual receipt/entitlement COMMIT, fresh concurrent next-day processes, one entitlement and original paid_at. **13/13 observed workflows SUCCESS**. Cashier history fixture2PASS with database-clock rounding, original location/stock/catalog/idempotency checks intact. Prior documentation-head30020abf lifecycle failure38524878617/job115722776644 is preserved; never claim that head was wholly green.

Proof is injected driver outcome after actual server COMMIT, not a proxy dropping wire acknowledgment frames. Issue523 remainsOPEN for true transport proof and unmatched verified payment inbox;535 remainsOPEN for full downstream restricted-role Meta/grant acceptance. No production source change in this acceptance revision, no merge/deploy/hosted writes/real provider actions; no UI baseline credit or release-ready claim. [Report](P0_COMMIT_ACK_ACCEPTANCE_20261014.md), [machine evidence](evidence/P0_COMMIT_ACK_RESULTS_20261014.json).

---

## Verified durable payment receipt checkpoint — 2026-10-14

Draft PR538, tested source **7302359705a509cc25cefbc3f6e14849b0f68508**: isolated run38524397545/job115721219577 **181PASS/0FAIL/0SKIP**,42unique files/44invocations; **12/12 observed workflows SUCCESS**. New receipt recovery suite7PASS covers four process/backend interruptions, two known admission-COMMIT failures, fresh concurrent next-day retries, original payment time, unresolved-receipt checkout barriers and one entitlement. Admission commits before application; merchant-first locks align checkout. Prior8ad83ea typecheck/barrier failures remain recorded, corrected without weakening lifecycle assertions.

Evidence: [receipt report](P0_DURABLE_RECEIPT_ADMISSION_20261014.md), [machine results](evidence/P0_DURABLE_RECEIPT_RESULTS_20261014.json). Owned offline PostgreSQL/fake providers only; this does not change the UI audit baseline or imply release readiness. No merge/deploy/hosted database/grants/real payment actions. Issues523/535 stay OPEN for unmatched orphan inbox, ambiguous successful COMMIT acknowledgment loss and full downstream restricted-role Meta/grant acceptance.

---


## Authoritative continuation — SEQ-366–371 (2026-10-14 Baghdad)

Latest [SEQ-366–371](SEQ_366_371_EMERGENCY_WORKSPACE_INTEGRITY_20261014.md). **Next SEQ-372**. Audit only; application/original tests/schema unchanged.

Full Vite main/App/emergency management owner ×AR/EN/KU ×390/1280:6 new baseline PASS.18 extra assistant/denied UI-branch/503→retry PASS, zero baseline credit. Initial run38500731533/job115646801848:24PASS/6 diagnostic locator FAIL; original failure preserved. Only6 diagnostics re-executed after audit-locator correction in run38501087503/job115647945992:6 reproduction PASS, not product acceptance. Both builds/uploads/cleanup succeeded;234+44 GET with device headers,0 unexpected/mutation.48 PNGs reviewed/persisted.

New **EMERGENCY-AUDIT-STATUS-MISREPORT-001 MEDIUM/OPEN/NATIVE_DOM_CONFIRMED**: owner UI calls chain healthy despite synthetic overview valid:false, six DOM probes/three mobile visual captures. PostgreSQL overview source allows false payload; actual SQL corruption/HTTP tamper not executed. Legacy invalid-chain503 path distinguished. Desktop owner-card visibility/clipping TRIAGE; actual directory403 not executed (denied200 pair tests frontend branch only). No app repair.

Current seq371CSV222 baseline:84PASS_BOUNDED_FULL_APP/138NOT_RUN;36 cumulative extra state cases and8 diagnostic cases outside baseline.37.84% baseline execution only; whole-audit percentage **NOT_YET_MEASURABLE**, releaseBLOCKED.21 selectors unmapped/11 domains partial; no real authorization/SQL/RLS/provider or complete responsive/accessibility clearance.

# Fawri final audit — issue and decision ledger

## Authoritative continuation — SEQ-360–365 (2026-10-14 Baghdad)

Latest [SEQ-360–365](SEQ_360_365_FULL_SNAPSHOT_CSS_20261014.md). **Next SEQ-366**. Audit only; application/original tests/schema unchanged.

ActualVite main/App/support/emergency snapshots ×AR/EN/KU ×390/1280: headc311d48e16baf1c361775a9fb0ab1e1e5683fb49/merge33ddb076cd9657fa9a8db45b8f8b9c7def27eae1, run38498401910/job115639330331: **12newbaselinePASS/0FAIL**,42allowedGET/deviceheaders/0POST/runtimeerrors,12captures reviewed/persisted. Additional2diagnosticPASS run38498978000/job115641143612: test-onlycatalogCSSdisable returnsbadges702.69/547.92px→40px andexpands titles;4before/aftercaptures. No apprepair.

New **UI-KU-CATALOG-CSS-SPILLOVER-001 LOW/OPEN/NATIVE_CAUSE_CONFIRMED**: broadcatalogSorani640–1399rule matchessecuritybadge onbothsnapshots at1280. Mobilecrampedheader notattributed tothatmedia rule. ExistingSoraniOct/AM datefinding extendedtoemergencysnapshot, noduplicate. Currentseq365CSV222baseline:78PASS_BOUNDED_FULL_APP/144NOT_RUN.18negative+2diagnosticcases outsidebaseline. No realcookie/grant/backend/RLS/read-onlysecurity/timer/deeptab certification; fallbackfonts.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-354–359 (2026-10-14 Baghdad)

Latest [SEQ-354–359](SEQ_354_359_FULL_ADMIN_ROUTES_20261014.md). **Next SEQ-360**. Audit only; application/original tests/schema unchanged.

Full actualVite main/App/globalauthvalidator/previewlauncher/owner-setup/workmonitor ×AR/EN/KU ×390/1280: head9f9fe04a278a366b7235bd5731a3cb0efd9645f2/merge03fd41d1a3b23cb25ed56816342811de6e79e620, run38494339483/job115626569603. **12newbaselinePASS/0FAIL**,12captures reviewed/persisted.48allowlistedGET/deviceheaders present; title/direction/overflow/disabledemptygeneration/syntheticassistanttarget PASS;0unexpectedPOST/runtimeerrors. No realcookie/backend-role/SQLproof.

New **I18N-MONITOR-SORANI-DATE-001 LOW/OPEN/NATIVE_VISUAL_CONFIRMED**: Sorani activity date showsEnglish Oct/AM inbothviewportcaptures; sourceusesckb-IQ/Intl fallbackcauseinferred, notresolvedOptionsconfirmed. PriorfindingsOPEN. Currentseq359CSV222cases:66PASS_BOUNDED_FULL_APP/156NOT_RUN; extra18negativestatesoutsidebaseline.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-348–353 (2026-10-14 Baghdad)

Latest [SEQ-348–353](SEQ_348_353_FULL_NEGATIVE_ROUTES_20261014.md). **Next SEQ-354**. Audit only; application/original tests/schema unchanged.

Full Vite main/App negative OTP/pending/recovery ×AR/EN/KU ×390/1280, headb47b937c5927f7a62787fdceb82a3be80d9adef4/merge9e0f0933d0ca1bd68060c5fa921ebfb791d94aa1, run38493530475/job115624007088: **18 extra UI cases PASS/0FAIL**,30captures inspected/persisted. Missing challenge disables input/verify and redirects via signup link; synthetic503→manualrefresh200 recovers pending title; denied synthetic recovery key shows generic error/hides server sentinel/retains key1.12GET+6POST allowlisted,0unexpected requests/runtime errors. Existing heading issue remains OPEN; no new canonical defect.

These18 negative states are outside222defaultbaseline, baseline_credit0. Baseline unchanged54PASS/168NOT_RUN; prior54notrerun. No actual backend key/OTP/SQL/provider/auth/RLS proof; fallback fonts.21selectors unchanged; whole percentage **NOT_YET_MEASURABLE**, release BLOCKED. Next full App admin/owner baseline fixtures.


## Authoritative continuation — SEQ-342–347 (2026-10-14 Baghdad)

Latest [SEQ-342–347](SEQ_342_347_FULL_LIFECYCLE_ROUTES_20261014.md). **Next SEQ-348**. Auditonly/application/tests/schemaunchanged.

ActualVite main/App OTP/pending/recovery ×AR/EN/KU ×390/1280: headb8502d58406f66279ed9bccebb02f110173c39ee/merge0768cd0c40f8ad9aa06a18ae67a5826e2ae17afb, run38493001942/job115622347297. **18newbaselinePASS/0FAIL**;18captures inspected/persisted. SyntheticOTPinput/emptydisabledverify, pendinginitial+refresh12GET, key1emptydisabled/title/direction/overflowPASS. New **A11Y-OWNER-RECOVERY-HEADING-001 LOW/OPEN/DOM_CONFIRMED**: allsixrecoverycases have0semanticheadings; visibleCardTitle isdiv. Notauthfailure/WCAGcertification.

Currentseq347CSV222cases:54PASS_BOUNDED_FULL_APP/168NOT_RUN. Prior36notrerun. No realOTP/recovery/backend/RLS/provider orlaternegative-state proof; fallbackfonts only.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. NextnegativeUIstatesoutsidebaseline.


## Authoritative continuation — SEQ-336–341 (2026-10-14 Baghdad)

Latest [SEQ-336–341](SEQ_336_341_FULL_ENTRY_ROUTES_20261014.md). **Next SEQ-342**. Sixsequentialstages/auditonly; application/originaltests/schemaunchanged.

FullactualVite main/App/router/providers/landing/login/signup onChrome154: head925abe7ca26d2d1b536a3b579d27f7fadc99036d/merge1cb7742870daab9d788697f3b0c2cd8b10bddf7d, run38491939756/job115618926761. **18newdistinctPASS/0FAIL** xAR/EN/KU x390/1280. Exacttitle/direction/overflow/CTA/formstructure/passwordinputtypes/empty-signupdisabled/scrollsubmit/destinationpath+exacttitle;0API/0runtimeexceptions.30captures reviewed+persisted (18initial+12submitviews, not30cases). No newcanonicalfinding; metadata/priorissuesremainOPEN.

Currentseq341CSV:222baselinecases,36PASS_BOUNDED_FULL_APP/186NOT_RUN. Prior18notrerun. Fallbackfonts/guestonly; submittedcredentials/OTP/provider/backend/allbelowfold/fulltranslation/accessibility notcertified.21selectors unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. NextOTP/pending/recoveryfixture applicability/authenticatedroles.


## Authoritative continuation — SEQ-330–335 (2026-10-14 Baghdad)

Latest [SEQ-330–335](SEQ_330_335_FULL_PUBLIC_ROUTES_20261014.md). **Next SEQ-336**. Six sequentialstages/auditonly; application/originaltests/schema unchanged.

Full actualVite main/App/router/providers/publicpages on nativeChrome154: head56138e8a6d10d9aff5094222d3139aa799852d97/merge76306173e6f045c8d28cb93a0730852c39991158, run38489837137/job115612162119. **18distinctPASS/0FAIL**: privacy/terms/fallback xAR/EN/KU x390/1280. Exacttitle/all9policyitems/direction/overflow/controls/home URL navigation;0unexpectedAPI/0uncaughtsnapshoterrors.18first-view captures inspected andpersisted withhashmanifest. Belowfold/pixel/productionfonts/legal/accessibility/backend notcertified.

New **PUBLIC-METADATA-TEMPLATE-001 LOW/OPEN/SOURCE_CONFIRMED**: index.html description/OG/Twitter retain Replit/template updateinstruction; notdeployedSEO incident proof. Otheropenfindingsretained. Currentseq335caseCSV:222baselinecases,18PASS_BOUNDED_FULL_APP/204NOT_RUN; historical222NOT_RUN superseded.21selectors unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. NextremainingfullApppublic/rolecases; no repeatcredit.


## Authoritative continuation — SEQ-324–329 (2026-10-14 Baghdad)

Latest [SEQ-324–329](SEQ_324_329_SESSION_HTTP_20261014.md). **Next SEQ-330**. Six sequential stages/audit only; application/original tests/schema unchanged.

Source204b23402a07c4ad209b4be1156344fee64d07f6, run38487200244/job115603591089: **14distinct businessPASS/0FAIL**, raw15P/0F/0SKIP includes1parent.28migrations/ownedcleanupSUCCESS. Owner2perdevice/assistant2peraccount caps, selfsession list/delete ownership, expired SQL marker, touch absoluteclamp, HTTProtation/replacement/oldcookie401, originalcookie logout over2links, one concurrent200/401winner, selflogout-all and tamperedsecret/kindconfusion boundariesPASS. Fourlocal runner refusals separate; prior cases notrerun.

DisposableSQLtimestamps adjusted under unchanged constraints; absoluteexpired case alsoidleexpired. Concurrent loser emitted no cookieclear in singletrial, not browser response-order/load guarantee. Trust/sessions seeded, not login/OTP/RLS/provider/fullApp proof. No newcanonicalappfinding; allpriorissuesOPEN.21selectors/222fullApproute visualcases unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED. Prioritize fullApp route harness/role inventory next.


## Authoritative continuation — SEQ-318–323 (2026-10-14 Baghdad)

Latest [SEQ-318–323](SEQ_318_323_ADMIN_LIFECYCLE_HTTP_20261014.md). **Next SEQ-324**. Six sequential stages/audit only; application/original tests/schema unchanged.

Source9824331fdded014a7bf98808a0dde035847dff47, run38486456958/job115601177970: **14distinct businessPASS/0FAIL**, rawTAP15P/0F/0SKIP includes1parent.28migrations/owned cleanup SUCCESS. Assistant creation/input/duplicate, owner monitor session isolation and selected private fields, third device trust cap, logout-all role/target/two-device/unrelated-account protection, password reset invalid/valid/versions/revocation, forced-change restriction/reused-temporary denial/different-password recovery PASS. Fourlocal runner refusals separate; no earlier cases rerun.

No new canonical app finding; legacy fixture and native stale UI issues remain OPEN. Trust/sessions seeded, not interactive login/OTP/browser/RLS/provider proof; concurrency/fault rollback and failed-login telemetry not exercised.21selectors/222full-route visual cases unchanged. Whole percentage **NOT_YET_MEASURABLE**, release BLOCKED.


## Authoritative continuation — SEQ-312–317 (2026-10-14 Baghdad)

Latest [SEQ-312–317](SEQ_312_317_DEVICE_PERMISSION_HTTP_20261014.md). **Next SEQ-318**. Six sequential stages, audit only; application/original tests/schema unchanged.

Actual Authv2/device/permission/enabled HTTP + ownedSQL: **10 distinct business cases PASS** across initial6 and corrected remaining4. Initial e412b4ed8e40e73048ae758a0b3c37cb3821eb1c run38484571902/job115595011417:6PASS, case7 audit endpoint expectation failure,3NOT_RUN; raw6P/2F includes failed parent. Remaining65bd43a462b8f46271ee39b9bad3e08c770f4a26 run38484821000/job115595809185:4businessPASS/raw5P includes one parent,0FAIL/0SKIP.28migrations and owned cleanup SUCCESS eachrun. Corrected admin identity /admin/me, application unchanged; six completed cases not rerun.

Wrong/missing device, foreign device record, wrong password, selective device revocation, assistant role, invalid permission/enabled values, permission removal, disable and reenable/nonrevival boundaries PASS. Four local runner refusal controls separate. No new app finding; existing stale UI and legacy fixture issues remain OPEN. Seeded trust is not OTP onboarding/browser/RLS/provider proof.21selector paths/222full route visual cases unchanged. Whole percentage **NOT_YET_MEASURABLE**, release BLOCKED.


## Authoritative continuation — SEQ-306–311 (2026-10-13)

Latest [SEQ-306–311](SEQ_306_311_CURRENT_MANAGEMENT_HTTP_20261013.md), executed source `cc27ff5aef9d2e8e9347c0604e53efa23d2c19a7`, run38444767251/job115460157268. **Next SEQ-312**. Sixsequentialstages/auditonly; application/original tests/schema unchanged.

ActualaggregateAuthv2HTTP/SQL **15businesscases15PASS/0FAIL**, rawTAP16P/0F/0SKIP includes1parent.28migrations/ownedcleanupSUCCESS. Managementpermissions/approval/note/channel/suspension+cookie401/requestduplicate/ownerreview/spoofpassword/purgeanonymization and realowner-sessionrole/account/password/cookie401 boundariesPASS. No newcanonicaldefect. Originalphone/devicefixturemaintenance andnativeUIstaleaction findings remainOPEN.

Firstattemptzero targetcases blocked ownerDEVICE_REQUIRED; audittrusteddevicefixture correctedusingcurrentservices/boundheader, noguardrelaxed. FourlocalrunnerrefusalsPASSseparate; actualOTP/provider/media/RLS/fullAppscopepending.21selectorpaths/222fullroutecases unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-302–305 (2026-10-13)

Latest [SEQ-302–305](SEQ_302_305_ACTUAL_RETENTION_LIFECYCLE_20261013.md), executed source `29be3ed302f1d307129a3999b1e978f8fb20ee19`, run38442860689/job115453629407. **Next SEQ-306**. Audit-only, application/original tests/schema unchanged.

Actual ownedPG28migrations **8businesscases8PASS/0FAIL/0SKIP**, cleanupSUCCESS. Readonly/suspension+sessionrevocation/repeat/isolation, renewal0/10replies(no oldsessionrevival), manual/closedprotection, sessionrevocationfaultatomicrollback andconcurrentdeletionrequest1pending/1auditPASS. No newfinding; originaloldphonefixture remainsfailed/stale, notretroactivelygreen. Service/SQLscope, not fullHTTP/currentrole/purge/provider/RLSproof.

Local4runnerrefusalsPASS separate; previousretentionadapters notrerun.21selectorpaths/222fullroutecases unchanged; wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-298–301 (2026-10-13)

Latest [SEQ-298–301](SEQ_298_301_NATIVE_MONITOR_ACTIONS_20261013.md), head `8382a73faeb95ba284db70f05468a93c3430f26c`, merge071f16b2, run38439068416/job115440607861. **Next SEQ-302**. Audit-only, application/original tests unchanged.

ActualnativeChrome154WorkMonitor/Dialog/PasswordInput **6cases4PASS/2FAIL**, noinfraerror. Cancel/success/incorrectpassword/doubleconfirmcontrolsPASS. Pendingaction sendsPOSTaftersilent403; afterReacttargetswitchB sendsoldsessionAunderB. Syntheticfixture rejects403/404, no realbackendmutation. Existing **WORK-MONITOR-STALE-001 / OPEN / NATIVE_ACTION_CONFIRMED**, no duplicate/backendbypass. Realowner/assistantHTTP/SQL/App/nativeotheraction scope pending.

Previous7monitor cases notrerun;21selectorpaths/222fullroutecases unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-294–297 (2026-10-13)

Latest [SEQ-294–297](SEQ_294_297_SELECTOR_MOUNTED_MONITOR_20261013.md), head `5da92ffd4423cea44f2681d8eaa87128c93c26bf`, mergecheckout21b72bd0, run38437736590/job115436032580. **Next SEQ-298**. Audit-only, application/original tests unchanged.

Actual mountedChrome154WorkMonitor/I18n/CSS **7cases4PASS/3FAIL**, noinfraerror. AR/EN/KU390px direction/title/nooverflow andinitial403errorPASS. Real15second silent403/503 retain olddata/noerror, oldadminresponse replaces newtarget afterReactpropswitch. Existing **WORK-MONITOR-STALE-001 / OPEN / MOUNTED_BROWSER_CONFIRMED**, no duplicate/backendbypass. Pendingactions/realroles/fullAppHTTP stillopen.

959source selectorcensus:21unchangedMJScontracts/nofilename references; priorSEQ226execution reused, no repeatedtestcredit.21unmapped repositoryselectionpaths stayOPEN;222fullroutecasesNOT_RUN unchanged. Wholepercentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-290–293 (2026-10-13)

Latest [SEQ-290–293](SEQ_290_293_LICENSED_CASHIER_HISTORY_20261013.md). **Next SEQ-294**. Audit-only; application/original tests/schema unchanged.

Actual ownedSQL **4 distinct business cases PASS**: initial source3c03392c/run38434410022/job115424558317 gives3targetPASS/1seedBLOCKED; remaining-only corrected source9f9806b3/run38435030672/job115426684838 gives1PASS/0FAIL/0SKIP. Previously verified3notrerun.28migrations/ownedcleanupSUCCESS both. New licensed zero-stock sale history persists; zero-location-row blocks archive/inventorydisable; deliberate ownedmissing-level archive retains sale and exactreplay, unsafe returndenied without history/stock mutation. No new canonical defect; no productioncleanup/HTTP/UI/RLS proof.

Local4runnerrefusalsPASS separate. Originalretiredlicense fixture finding remainsOPEN; prioratomicity/expiry findings unchanged.21selectors/222fullroutevisualcases unchanged; whole percentage **NOT_YET_MEASURABLE**, releaseBLOCKED.


## Authoritative continuation — SEQ-286–289 (2026-10-13)

Latest [SEQ-286–289](SEQ_286_289_SUPPORT_EXPIRY_POSTGRES_20261013.md), executed source `23efe18cb9089507909b3d390fea790272e22cd7`, run38433417141/job115421169603. **Next SEQ-290**. Audit-only; application/original tests/schema unchanged.

Actual owned PostgreSQL28migrations: **7 business cases / 5 PASS / 2 FAIL / 0 SKIP**, cleanup SUCCESS. Existing LOW **SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001** now CONFIRMED_SQL: expired consent/preview access denied but marker UPDATE rolls back; rows remain pending/active. No access bypass. Canonical lifecycle sweep commits expiry, preserves live other tenant and repeats with0expiryupdates. No duplicate issue; scheduler/HTTP/role/RLS proof still pending.

Local4runner refusal controlsPASS separate. First newauditseed lacked required adminphone:7fixtureseedfailures/zero targetbusiness assertions, corrected auditfixture only.21selectors/222fullroutevisual cases unchanged; whole percentage **NOT_YET_MEASURABLE**. ReleaseBLOCKED.


## Authoritative continuation — SEQ-282–285 (2026-10-13)

Latest [SEQ-282–285](SEQ_282_285_CATALOG_ARCHIVE_POSTGRES_20261013.md), executed source `ce48910f71cfd910c0b86fe24aa9fdb805083cec`, run38431991119/job115416248457. **Next SEQ-286**. Audit-only new runner/fixtures; application/original tests/schema unchanged.

Real owned PostgreSQL28migrations: **2 business cases / 1 PASS / 1 FAIL / 0 SKIP**, cleanup SUCCESS. Successful archive preserves immutable mutation and hides retained variant through later rebuild. NEW MEDIUM **CATALOG-ARCHIVE-ATOMICITY-001 / OPEN / CONFIRMED**: injected archive-marker SQL failure rejects request after core commit; name/version changed, zero-stock unmarked variant visible, ledger preserved. No hosted outage/history loss claim. Initial CJS fixture import failure is separate HARNESS_IMPORT_BLOCKED/zero business cases; corrected audit ESM only.

Local four runner refusal controls PASS; not SQL acceptance. Existing fixture-maintenance finding remains, successful inventory-archive uncertainty now resolved within bounded case. Cashier/order/location/concurrent/recovery/HTTP/UI scope pending.21selectors/222full-route visuals remain open; whole percentage **NOT_YET_MEASURABLE**. Release BLOCKED.


## Authoritative continuation — SEQ-274–281 (2026-10-13)

Latest [SEQ-274–281](SEQ_274_281_REAL_RESIDUAL_POSTGRES_20261013.md), auditexecutioncommit `3d4a4f529e7463448a4587b9d729e60f534734ac`. **NextSEQ-282**. NEW audit-onlyworkflow/executors; application/originaltests/schema/existingworkflows/scanner unchanged.

Actualoriginal13files on13freshnetwork-nonePGclusters/28migrations each:12complete summaries16PASS/8FAIL/0SKIP;1incompletefixture.4fullygreenfiles/8completefailed/1incomplete. OwnedteardownSUCCESS. Failures largely obsoletefixtures; variantremovalarchivecontractTRIAGE, no newlyconfirmedproductdefect. NEWMEDIUM RESIDUAL-FIXTURE-CONTRACT-001 groupsfixturemaintenance. No originaltestpatched.

Local4newrunnercontrolsPASS;7canonicalconsentadaptercases6P/1F strengthens existingexpiryrollbackfinding. Safe13selection resolvesuncertainty34→21/277;notuntestedcodepercentage.222fullroutecasesNOT_RUN/actualblockedbusinessassertions/externalgates remainopen. Wholepercentage **NOT_YET_MEASURABLE**. Historicalcheckpointresults retained;ReleaseBLOCKED.


## Authoritative continuation — SEQ-266–273 (2026-10-13)

Latest [SEQ-266–273](SEQ_266_273_PREVIEW_BINDING_EXPIRY_ROLES_20261013.md), baseline `583774144dc24a840e7462227865db35bd19a0dc`. **NextSEQ-274**. Audit only; application/originaltests/workflows/schema unchanged.

15newcases13PASS/2FAIL/0SKIP:actualpreviewvalidator+transactionhelper11cases9P/2F and actualassistantinspectionguard4P, inertSQL/sessionadapters. TwoNEWLOW entries: SUPPORT-PREVIEW-SESSION-BINDING-001 serviceblankcallercontractgap(noHTTPbypass), SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 attemptedexpirymarkerrolledback(accessstilldenied;scheduledexpiryworkermaypersist).

Supportpreviewroutefixture refinedfromowner toassistantwithbothgrants;222fullroutevisualcases remainNOT_RUN. Baseline33Actions25SUCCESS/8FAILURE; existinghistoricalsyntheticgate retained. Wholepercentage **NOT_YET_MEASURABLE**.13integration/34selectors/fullUI/actualSQL/provider/hosted gatesopen. Priorhistorypreserved;releaseBLOCKED.


## Authoritative continuation — SEQ-258–265 (2026-10-13)

Latest [SEQ-258–265](SEQ_258_265_MEDIA_CONCURRENCY_UI_CASES_20261013.md), baseline `b97df88c43e99940a9d50638a9334422da00982d`. **NextSEQ-266**. Audit only, no application/CI/scanner/historyrepair.

5newtests4PASS/1FAIL/0SKIP realownedFS/inertSQL-storage. NEWMEDIUM MEDIA-CLEANUP-CONCURRENT-UNLINK-001: loserconcurrentdelete removes winnerpendingmanifest. Oldretry canreopencomplete;idempotentretryrecovers. NEWLOW AUDIT-SYNTHETIC-HISTORY-GATE-001: currentrepositoryscanSUCCESS but reachablehistoryFAIL1oldsyntheticfixtureblob; no realsecretclaim.

37namedroutes inventoried;1conditionaldevexcluded,36×3languages×2viewport+6fallback=222minimumfullroutevisualcases, allNOT_RUN. Scope excludes role/write/error/lifecycle/cashier/accessibility; not wholepercent. Baseline33Actions25SUCCESS/8FAILURE. Wholepercent **NOT_YET_MEASURABLE**;13integration/34selectors/fullUI/actualSQL/provider/hosted gatesopen. Historicalevidence retained;ReleaseBLOCKED.


## Authoritative continuation — SEQ-248–257 (2026-10-13)

Latest [SEQ-248–257](SEQ_248_257_MEDIA_RETENTION_SECURITY_20261013.md), baseline `0e0c457638f1016bda1c22b246688bc7898a94fd`. **NextSEQ-258**. Application/applicationtests/workflows/schema/scannerrules unchanged; auditfixture representation corrected only.

14newcases12PASS/2FAIL/0SKIP;twoNEWMEDIUM findings MEDIA-CLEANUP-CORRUPT-001 and MEDIA-CLEANUP-STARVATION-001 (realownedFS/inertSQL/storage). Retention7adaptercasesPASS. Separate26fencecontrolsPASS reverified; notrecounted asnewcoverage. Localrepositoryscanner1706files/0findingsPASS after syntheticfixtureliteral adjustment.

Baseline33Actions24SUCCESS/9FAILURE: extraadminparentfailure ENVIRONMENT_BLOCKED/0tests; securityscanflags1syntheticURL in oldauditfixture, correctionhostedCIpending. No realsecret or applicationrepair. Wholepercent **NOT_YET_MEASURABLE**;13integration/fullUI/actualSQL/provider/hosted gates remainopen. ReleaseBLOCKED; historical records preserved.


## Authoritative continuation — SEQ-240–247 (2026-10-13)

Latest [SEQ-240–247](SEQ_240_247_ENTRYPOINT_FENCES_META_RECOVERY_20261013.md), baseline `17e521408b9fdc5621c18839f88d5f22a2c5992b`. **NextSEQ-248**. Audit only; original application/tests/workflows/schema unchanged.

46localcontrols46PASS/0FAIL/0SKIP:26pre-import guardrefusals for13 residual entrypoints,20actualMeta recovery function cases with inertrefund/state adapters. **Original13 integration runtime NOT_RUN**, native direct-entrypoint safety/CI wiring not certified. Prepared per-file freshcluster executionmanifest; no guard weakened.

Current33Actions26SUCCESS/7FAILURE. Receipt run38350269903/job115140836967 native8PASS; previous launchtimeout0assertions preserved. Zero new canonical product defects; prior refund-cycle/shutdown/DBsafety findings remainopen. Wholepercent **NOT_YET_MEASURABLE**; remaining13integration/fullUI/actualPG/provider/hosted proofs unchanged. Historical evidence retained. ReleaseBLOCKED.


## Authoritative continuation — SEQ-232–239 (2026-10-13)

Latest [SEQ-232–239](SEQ_232_239_WORKER_SIGTERM_MONITOR_RACES_20261013.md), baseline `6ef87566bb55f6d6c9d7fc17698e4af210980482`. **NextSEQ-240**. Audit only; application/existing tests/workflows/schema unchanged.

15actual localtests10PASS/5FAIL/0SKIP. Real childSIGTERM leaves persisted unfinished local queue claim; restart protects uncertain outcomes from automatic retry and preserves row; explicit known reconciliation completes without rerun. RequiredPostgreSQL worker stop observed with SQL adapters, not actualSQL. Monitor callback races/pending action after403 strengthen previous UI stale finding; no mountedReact/backend bypass.

No new canonical product finding; strengthens OPS-WORKER-DRAIN-001 and WORK-MONITOR-STALE-001. Baseline33Actions25SUCCESS/8FAILURE; receipt extraFAIL is browser startup ENVIRONMENT_BLOCKED with0assertions, not receipt regression. No whole-project percent: **NOT_YET_MEASURABLE**.13integration and mountedbrowser/guardedSQL/recovery/fullUI inventory still pending. Historical checkpoints preserved. ReleaseBLOCKED.


## Authoritative continuation — SEQ-225–231 (2026-10-13)

Latest batch: [SEQ-225–231](SEQ_225_231_SELECTION_CONTRACT_PRECISION_20261013.md), baseline `1db2beb108aea0b507012428cce7ab5129f388be`. **Next SEQ-232**. Audit only; application, existing tests, workflows and schema unchanged.

Actual local105tests:98PASS/7FAIL/0SKIP.28 previously unresolved contract files:92tests87P/5F; five stale source-contract expectations. Actual discount runtime9P; independent precision oracle2P/2F. New LOW findings CASHIER-DISCOUNT-PRECISION-001 (extreme safe-integer percentage floor/one-unit acceptance; no real sale proved) and AUDIT-STALE-SOURCE-CONTRACT-001 (five stale expectations, no five product defects).

Expanded243-source selector review resolves7paths through commerce validator/CI;34/277 remain unresolved,13 integration NOT_RUN. Original41-file queue28executed/13not run; this is a bounded inventory, not whole audit coverage. Current baseline33Actions:26SUCCESS/7FAIL. Provider deletion currentrun38343460680/job115119606452 source1P and SQL1P; older pendingrun38342332323 cancelled before assertions.

Overall remaining percentage **NOT_YET_MEASURABLE**. Next mounted WorkMonitor, owned worker SIGTERM recovery, safe residual13 integrations and applicable UI case denominator. Historical records below preserved. Release BLOCKED.


## Authoritative continuation — SEQ-215–224 (2026-10-13)

Latest completed audit batch: [SEQ-215–224](SEQ_215_224_COVERAGE_WEBHOOK_MONITOR_20261013.md), baseline `7e0da5ebe93ee7cc444d0f2b9a1ed98c5476e1a3`. **Next SEQ-225**. Audit/test/documentation only; no application repair, final remediation plan, main merge, deployment or hosted DB/provider mutation. Historical checkpoints below are preserved and are not the current queue.

Actual local application-body adapter harness Node24.19.0: **18 tests /14 PASS /4 FAIL /0 SKIP**, exit1. Four failures strengthen two existing findings: BILLING-WEBHOOK-ORPHAN-015 and WORK-MONITOR-STALE-001. This is not Express/network, SQL, browser or real provider proof. New OPS-WORKER-DRAIN-001 is a MEDIUM operational proof gap/TRIAGE; no lost job demonstrated.

Current isolated Actions run38342332307/job115115887752:43 complete summaries,41unique files,144PASS/24FAIL/0SKIP, known failures reused without new coverage credit. Current cashier deletion SQL run38342332394/job115115888003:1PASS, no skips; separate static1PASS. Workflow snapshot33runs:25success/7failure/1in_progress at observation; provider identifier deletion still pending, not passed.

[Measured sub-inventories and remaining gates](COVERAGE_INVENTORY_20261013.md):277API test files,91integration,41selection paths unresolved in bounded search;37routes plus fallback,5cashier modes plus demo and nested panes. **Overall remaining percent NOT_YET_MEASURABLE**;54/46 remains historical planning judgment, not current measured coverage. Release BLOCKED.

Next: resolve catalog/history dynamic selection and safe isolated execution; mounted WorkMonitor denials/action state; owned child-process SIGTERM worker drain/restart; applicable route-role-language-device case denominator. Do not rerun unchanged failing suites just to raise SEQ count.


## SEQ-167 checkpoint — 2026-10-13

ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001 root cause refined: secure network-none Docker provisioning already exists in scripts/run-isolated-postgres-audit.sh and audit-isolated-postgres.yml, but separate global-admin-golden-journey.yml bypasses it. No confirmed defect in isolation runner from source alone.


## SEQ-166 checkpoint — 2026-10-13

ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001 remains OPEN: isolated audit runner consumes valid network-none DB proof but global-admin-golden-journey.yml directly invokes test against services.postgres without proof. Also CI concurrency cancels runs on audit-only commits; distinguish CANCELLED from test FAIL.


## SEQ-165 checkpoint — 2026-10-13

ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001 HIGH test-gate blocker: global admin golden journey CI run 38335320862 fails before application import; workflow services.postgres lacks mandatory network-none proof, attestation file/run ID and DB marker required by disposable-postgres-test-guard. Do not disable fail-closed guard.


## SEQ-161–163 checkpoint — 2026-10-13

WORK-MONITOR-STALE-001 source-confirmed: silent 15s GET failure retains old privileged monitor data without error; browser/backend tests pending. Owner recovery has explicit owner_admin 403 role gate and transactional credential/session/device revocation; no confirmed bypass.


## SEQ-159–160 checkpoint — 2026-10-13

PREVIEW-SILENT-REFRESH-001: Chrome154 silent409 and silent503 retain unmarked private snapshot; PREVIEW-EXPIRED-RETAINED-001: expiry countdown retains visible preview; PREVIEW-END-UNCONFIRMED-001: end503 navigates without confirmation. These are UI lifetime findings, not fresh server authorization bypass. SuperQi missing-order HTTP200 and generic SQL HTTP503 remain untested route-level TRIAGE.



## SEQ-143–158 checkpoint — 2026-10-13

SEQ-153–158 open/triage: CASHIER-IDB-IDEMPOTENCY-001 local same-ID changed-input silent replay (Chrome+source, backend has request_hash 409); CASHIER-BILLING-SQL-RECOVERY-001 synthetic P0001 rolls back event/order, webhook returns 503; SUPERQI-ORDER-NOT-FOUND-ACK-001 TRIAGE missing-order webhook ignored with HTTP 200. No real lost payment or cloud bypass proven. [Root causes](SEQ_153_154_CASHIER_ROOT_CAUSE_20261013.md) · [Cloud boundaries](SEQ_155_157_SYNC_WEBHOOK_BOUNDARIES_20261013.md) · [Webhook HTTP](SEQ_158_SUPERQI_WEBHOOK_HTTP_20261013.md).


## Current issue checkpoint — SEQ-141 (2026-10-13)

Confirmed in actual source and browser: EMERGENCY-SNAPSHOT-END503-001 (MEDIUM/OPEN, end 503 navigates without confirmation) and EMERGENCY-SNAPSHOT-END401-001 (MEDIUM/OPEN, finally overwrites /login). EMERGENCY-SNAPSHOT-KU-001 remains TRIAGE only (Sorani empty-tab timeout, root cause unconfirmed). Evidence [SEQ-140/141](SEQ_140_141_ADMIN_PARENT_EMERGENCY_20261013.md). Do not duplicate CASHIER-REPORT-PROFIT-001. No repair authorized.


## Definitive current handoff — SEQ-138–139 complete; next SEQ-140

Continue from saved evidence. Comprehensive audit and evidence recording only; no application repairs or consolidated repair plan until the audit is complete. No main merge, deployment, hosted DB/secrets or real payment.

Latest Support browser run [38318079531](https://github.com/nora953/fawri-production-source/actions/runs/38318079531), job115039529673, Chrome154: **12 PASS /1 FAIL /0 SKIP**,13 cases. The one confirmed failing assertion is `ADMIN-SUPPORT-STALE-001` MEDIUM/OPEN/UI reliability: after AdminSupportTab’s silent list refresh receives503, the old ticket is retained while reply and resolve controls remain enabled. Synthetic GET only; no message write or authorization bypass shown. The separate real SQL/HTTP Support proof still showed current `manage_support` revocation returns403 for list/image/reply on the same cookie.

The additional overlapping-refresh case returned `old:false,newer:true,requests:3`: this controlled fixture did **not reproduce** an older response replacing the newer display. Treat this as a bounded negative test only; the synthetic API did not exercise database snapshot ordering, hosted session state or the full admin route.

SEQ-138 mounted actual merchant `SupportPage` and admin `AdminSupportTab` with React/I18nProvider/Radix and Vite CSS against loopback synthetic GET API. Verified AR/EN/KU direction and390px overflow, hostile message text/no active image/script, loading/empty/503/retry, merchant stale-refresh mutation blocking/recovery, owner/assistant/inspection-prop child action surfaces and Escape dialog close. A native focusable new-ticket control was observed; click-to-form and actual keyboard activation remain unverified in this headless harness. Full parent admin tab/route/session, visual/accessibility, backend writes, hosted grants and device clearance remain open.

Earlier SQL/HTTP result remains separate and unchanged: run38288686551 **144 PASS /24 FAIL /0 SKIP**,41 unique files/43 invocations,9 canonical findings in that bounded suite including HIGH/OPEN CASHIER-REPORT-PROFIT-001. Browser assertions are not added to SQL counts. Overall planning estimate remains about54% audited/46% remaining (40–60% uncertainty), not readiness. Release BLOCKED.

**Next SEQ-140:** exercise the actual parent AdminPage `canManageSupport` tab and content gate through an authorized synthetic session/role, then continue remaining owner/admin/merchant route groups. Preserve all existing proofs; hosted grants/media/PITR/rollback/monitoring, offline/device, provider and commercial acceptance remain open.
## SEQ-134 reconciled; SEQ-135 prepared; SEQ-136 local media verified

See [SEQ_134_136_ADMIN_SUPPORT_20261012.md](SEQ_134_136_ADMIN_SUPPORT_20261012.md) for exact scope and limits. Source3019e9a4 / run38287120221 / job114938040636: real admin auth/router journey1PASS. Support fixture fails before HTTP on normalized phone constraint23514; child exit7 has no terminal TAP counters.43invocations/41unique; completed summary counters139PASS/24FAIL/0SKIP **plus one observed uncounted fixture-setup failure**. Not an exhaustive139/24 aggregate. No new product defect. Owned cleanup, restore, Meta54 and Node22 PASS.

Corrected test-only Support phones, pre-mutation aggregate cleanup with visible errors, fixture admin audit deletion and direct-entry attestation. Runner reports summaryComplete and observed failure fallback, rejecting incomplete summaries. SEQ-135 adds4 real negative HTTP child tests: missing/foreign-tenant ticket/image/reply access/no mutation, current revoked support permission despite stale session claims, read-only/exact-session preview, terminated preview rejection. Runtime pending next source; no new SQL pass claimed. SEQ-136 local actual filesystem functions5PASS: paths/private modes/symlink denial/atomic bytes/no collision overwrite. Separate from DB counts and hosted durability.

Planning approximately54%audited/46%remaining; no further increment for fixture correction or these limited local controls. No repairs/consolidated plan/merge/deploy/live changes. Next inspect corrected Support/negative tests and complete SQL counters; continue remaining owner/admin/merchant/support browser roles afterward.


## Current checkpoint — SEQ-128–133 verified; SEQ-134 prepared (2026-10-12)

This supersedes earlier next-step/prepared statuses below; keep them as history. Continue the comprehensive audit, tests/documentation only. No application repair or consolidated repair plan until the audit is complete.

Executed PR head `4b9bc639ff35addb6babb1d28f266a1c10d9bc90`, Actions checkout merge `2790ed78f2545c76c8cd317869502ed724c3d81b`:

- Isolated SQL/HTTP [run38204575983](https://github.com/nora953/fawri-production-source/actions/runs/38204575983), job114665101797: **138 PASS / 24 FAIL / 0 SKIP**,39 unique files/41 invocations. Counters computed from all41 AUDIT_SUITE_RESULT records.24 failed markers =16 functional+8parents for9 canonical application findings, not24 independent defects. Owned-container cleanup step SUCCESS; full-schema seed/restore, Node22 HTTP and injected Meta54 passed. This automatic CI repeat is corroboration, not new coverage.
- CASHIER-REPORT-PROFIT-001 **HIGH / OPEN**: actual authenticated operator HTTP without reports.profit returns can_view_profit:false and omits currency profit, but nested product/ranking disclose gross_profit_minor500. Authorized grant positive control passes. New suite1PASS/3FAIL (2functional+parent). No anonymous or cross-tenant leak established; no repair.
- Receipt [run38204576080](https://github.com/nora953/fawri-production-source/actions/runs/38204576080), job114665101839: **8 PASS / 0 FAIL** in Chrome154. AR/EN/Sorani×58/80mm each1PDFpage, exact2400total, no horizontal overflow, lastitem/saleID and reprint marker retained, escaped hostile labels/noactive markup/privatecost. Two additional actual iframe/srcdoc/load/helper checks remove frame after explicitly dispatched afterprint and after injected print failure. print method is inert at the physical boundary; no hardware/native dialog event or fallback-timer certification.
- Central reactive report [run38204576014](https://github.com/nora953/fawri-production-source/actions/runs/38204576014), job114665101732: **5 PASS / 0 FAIL**. Actual complete component/toolbar/I18nProvider/Recharts/Vite CSS, synthetic loopback API. AR/EN/Sorani each4nonempty PDFpages,6metrics,30operations, exact697910net, localized partial notice and lastproduct. Empty removes stale report;503disablesexport then actual7day range/apply controls recover. Not owner authentication/backend accounting/fullvisual/mobile clearance.
- Local admin UI authority **14 PASS / 0 FAIL / 0 SKIP**, Node24.19.0, actual capability/refresh/effect bodies with inert state/HTTP adapters; no mounted admin or real server auth proof. Reuse results; do not add the earlier10test run to14.

Planning estimate approximately **54% audited /46% remaining**, uncertainty40–60%. Same weighted milestone model (source20,functional30,adversarial20,target20,acceptance10), equal11domains. Modest bounded evidence increments: security68→69, dashboards44→47, reports49→53, language27→29. Other domain estimates unchanged; no credit for automatic CI repeats or fixture corrections. This is not measured universal coverage or launch readiness. Release BLOCKED.

**SEQ-134 PREPARED:** execute existing previously audit-unverified admin-auth-router and support-postgres-cutover journeys first in guarded tenant batch. The preload attestation runs before application/DB imports; runner is disposable loopback/network-none with owned teardown. Actual Auth v2 admin login/device OTP/trust/password-change/session-disable/device-revoke HTTP; Support merchant/admin tickets/images/approval/read-only preview/secret redaction/reminders. These are bounded mounted-router/default disposable-role fixtures, not full application route fallthrough, restricted deployed grants, OTP provider, browser or media durability proof. Support tiny signature-only PNG fixture cannot establish full image decode validation. Existing internal cleanup quality is not separately fault-certified; owned entire DB teardown is the containment boundary. Results NOT_RUN until CI read. Provisional inventory41unique/43invocations; preserve verified138/24 until complete new aggregate.

Next read SEQ-134 runtime and cleanup, classify fixture/product failures without weakening assertions; then remaining owner/admin/merchant/support browser and negative permission/tenant scope from37route inventory. No main merge, deploy, live DB/secrets or real payment.


Current continuation checkpoint: **SEQ-113, 2026-10-12**, source `23563ffba019a666e3d2f61f29769723d56b7e03`. The SEQ-109–113 section below supersedes historical source-only/pending statements only within its explicit scope. Release remains BLOCKED; no application fixes authorized or implemented.

Issues are not automatically defects. Classify as DEFECT, PROOF_GAP, EXTERNAL_DEPENDENCY, or PROCESS.

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-001 | PROOF_GAP | OPEN | Direct Neon connector returned tool-not-found errors. Need non-secret read-only DB role/readiness evidence before FA-004 PASS. Do not infer database is absent. |
| FA-I-002 | PROCESS | OPEN | GitHub branches page 1 has 100 results; full branch pagination and comparison required in FA-001. |
| FA-I-003 | PROCESS | OPEN | [Draft PR #476](https://github.com/nora953/fawri-production-source/pull/476) awaits review and evidence; not part of core freeze automatically. |
| FA-I-004 | PROOF_GAP | OPEN | Reported Claude offline cashier integration concern not supplied verbatim. Request precise reproduction/code path before reopening existing cashier tests. |
| FA-I-005 | EXTERNAL_DEPENDENCY | OPEN | Production provider activation, backups/PITR, durable media storage and release gates tracked in [release blockers](../FAWRI_RELEASE_BLOCKERS.md). |


| FA-I-006 | CONFIRMED_RESTRICTED_ROLE_RUNTIME_FAILURE | OPEN / HIGH PRIORITY | Meta page-to-merchant routing under RLS: `listActiveMetaPageMappingsAuthoritative()` executes a cross-merchant `SELECT page_id, merchant_id FROM merchant_channels` through `withOperationalTransaction()`, which does not set `fawri.tenant_id`. Migration `0025_tenant_rls_policy_predicate_cutover.sql` sets the `merchant_channels_tenant_boundary` predicate to `fawri_tenant_or_audited_admin(merchant_id)`. If the deployed runtime role is subject to RLS and lacks a specifically authorized cross-tenant resolver, this SELECT may return zero rows. Validate actual role, table RLS flags, policy grants and a synthetic connected-page lookup in staging. Do not disable RLS or add BYPASSRLS to runtime; design a narrowly scoped, audited, least-privilege resolver if reproduction confirms. |

## Reopening a closed audit
Record exact commit/config delta or reproducible failure, affected components, minimal necessary tests, and closure evidence. No broad restart.

## Decisions
- 2026-10-10: freeze new features; stage-by-stage final audit; visual QA last.
- 2026-10-10: GitHub documents are continuity source; conversation memory is supplementary.
- 2026-10-10: Railway staging already exists; no duplicate environment creation.

## 2026-10-10 staging security follow-up (read-only)

| ID | Class | State | Finding / next proof |
| --- | --- | --- | --- |
| FA-I-007 | PROOF_GAP | OPEN / SECURITY REVIEW | On Neon `staging-runtime`, 94 public tables exist, 45 with RLS enabled and 49 without. The restricted runtime role has SELECT/INSERT/UPDATE/DELETE on non-RLS tables including `accounts`, `account_sessions`, `merchants`, `merchant_cashier_staff`, and `cashier_station_credentials`. This does not establish an API exploit: inspect authorization and least-privilege access, then run two-merchant negative access tests on disposable infrastructure before release. Do not blindly enable RLS on global/auth tables. |
| FA-I-008 | PROOF_GAP | OPEN | `staging-runtime` has 28 applied Drizzle migration records and 94 public tables; Neon's separate default `production` branch lacks the migration ledger. Verify deployed DATABASE_URL branch safely without publishing its value; never migrate the default branch accidentally. |
| FA-I-009 | PROOF_GAP | OPEN | `/ops/readiness` screenshot at 2026-10-10T18:17:58.935Z reports `ready`, `postgresql_authority: up`, `production_release_configuration: up`. Railway `FAWRI_DEPLOYMENT_MODE=staging` and `FAWRI_EXPECTED_POSTGRES_RUNTIME_ROLE=fawri_staging_rls_runtime` were supplied by operator. This proves expected-role match for the readiness query, not complete tenant isolation or production release gate. Verify operational flows and safe branch target. |

FA-I-006 follow-up: GitHub `postgresMetaChannelAuthority.ts` still calls `listActiveMetaPageMappingsAuthoritative()` via `withOperationalTransaction()` without `fawri.tenant_id`; Neon staging has zero connected Meta channels, so real routing cannot yet be reproduced. Preserve RLS; test a synthetic mapping on disposable infrastructure and design a narrowly scoped resolver if needed.

FA-I-006 update (2026-10-10): The webhook middleware calls the authoritative page map before merchant authorization; missing page mapping returns HTTP 503. PostgreSQL-only map lookup is an all-pages query without tenant context. Migrations 0024/0025 use tenant-or-audited-admin RLS. Local Meta ingress integration tests do not prove behavior with the restricted staging role. Reproduce on disposable PostgreSQL before any least-privilege fix.

## 2026-10-11 reconciliation: actionable register findings not yet indexed in this issue ledger

This is an **index**, not a second evidence register. Detailed source observations remain in `AUDIT_REGISTER.md`; IDs below are stable existing IDs unless explicitly marked NEW. These findings are not all vulnerabilities.

| Register ID | Classification | State | Specific next proof / decision |
| --- | --- | --- | --- |
| CASHIER-SW-001 | DEFECT (source mismatch) | OPEN | Align SW cache generation and cold-start readiness check only after app-code approval; run targeted browser test. |
| CASHIER-DEMO-001 | PROOF_GAP | OPEN | Test `?demo=1` UI and normal POS runtime authorization; do not infer unauthorized sale from UI alone. |
| CASHIER-OFFLINE-001 | SECURITY_DESIGN_DECISION | OPEN | Decide whether offline license must be server-signed; test cache tampering under agreed threat model. |
| CASHIER-SYNC-SESSION-002 | PROOF_GAP | OPEN | Negative test legacy merchant-session bridge with historical operator permissions and device binding on disposable DB. |
| CASHIER-ATTRIBUTION-006 | PROOF_GAP (existing retry mitigation) | OPEN | Fault-inject after core sale commit and before attribution; retry must avoid duplicate sale and persist correct operator. |
| CASHIER-HIST-PERMISSION-009 | PROOF_GAP (PR #519, NOT MAIN) | OPEN | Historical `permission_snapshot` check absent in attribution lookup; decide historical vs current authorization policy and test unauthorized historical operator case. |
| CASHIER-HIST-IDENTITY-010 | PROOF_GAP (PR #520, NOT MAIN) | OPEN | Forge occurred_at and mismatched sequence/session; prove all binding checks across service boundaries. |
| TEST-DB-SAFETY-008 | PROCESS / TEST_SAFETY | OPEN | Add local disposable allowlist guard before running compensation-history integration suite; code approval required. |
| SAAS-BILL-TEST-001 / PG-TEST-GUARD-002 / PG-TEST-GUARD-003 | PROCESS / TEST_SAFETY | OPEN | Audit unsafe billing, subscription and RLS suites; complete CI workflow command inventory; do not run on Neon. |
| SUPPORT-IMAGE-TEST-002 | PROCESS / TEST_SAFETY | OPEN | Add disposable DB protection to support-image write-order integration suite before execution. |
| CATALOG-MEDIA-001 / SUPPORT-STORAGE-001 | EXTERNAL_DEPENDENCY | OPEN | Decide durable object storage or mounted volume; demonstrate survival across redeploy. |
| BACKUP-DRILL-001 | EXTERNAL_DEPENDENCY | OPEN | Document and safely prove hosted backup/PITR restoration separately from disposable drill. |
| RELEASE-GATE-STATIC-001 / FASTPAY-RELEASE-001 | EXTERNAL_DEPENDENCY | OPEN | Establish production Meta/AI/payment/billing evidence and release-gate clearance design. |
| FA-005 | PROCESS | PENDING | Perform owner/merchant/cashier and AR/KU/EN visual QA after functional and safety gates. |

**Status:** PR #518 verified merged; PRs #519 and #520 verified open drafts on 2026-10-11. This index is committed to PR #520 only, **not main** until reviewed and merged. CI inventory remains incomplete: attempting `.github/workflows/ci.yml` returned 404, but no inference is made about other workflow filenames. No integration test, database mutation, code change, or deploy performed.

**Resumption order:** (1) inventory CI/workflow paths and PostgreSQL integration test commands, (2) close safe-test guard coverage with approved code fixes, (3) historical operator negative test and Meta restricted-role reproduction on disposable PostgreSQL, (4) external media/backup/provider proof, (5) visual QA. Do not raise audit completion estimate for documentation-only activity.

## UI findings from historical staging notes — current main source review (2026-10-11)

| ID | Status | Evidence / next proof |
| --- | --- | --- |
| FAWRI-UI-001 | SOURCE_CONFIRMED_FIX_PENDING | Merchant DetailsModal bottom Close and shared DialogContent top X both present. Confirm unsaved note behavior before UI fix. |
| FAWRI-UI-002 | VISUAL_QA_PENDING | Permission footer has Cancel then Save and responsive flex layout; verify AR/KU/EN desktop/mobile. |
| FAWRI-UI-003 | SOURCE_CONFIRMED_FIX_PENDING | LogsTab unknown action codes fall back to raw codes; reason rendered verbatim. Localize display only, preserve stored audit data. |
| FAWRI-UI-004 | INVESTIGATE | Possible unsaved merchant note loss on dialog dismissal: local noteText and explicit save; parent close behavior and runtime reproduction still pending. |

These findings are documentation-only on draft PR #520, not merged into main and not repaired.

| FAWRI-UI-005 | SOURCE_CONFIRMED_FIX_PENDING | Merchant note save success toast fires before async PUT result: `AdminPageDialogs.tsx` lines 933-938 calls `onSaveNote(noteText)` then `toast.success`, while `AdminPageView.tsx` passes a voided async `doSaveNote` and `useAdminPageController.tsx` lines 1244-1268 awaits PUT and handles failure. Need awaitable save contract, success only on confirmed result, failure messaging, and pending-state protection; no runtime test or code fix yet. |

| CASHIER-STATION-ENTITLEMENT-011 | NEGATIVE_TEST_PENDING | Main `CashierManagementPage.tsx` lines 265-266 derives management eligibility from `cashierEntitlement.state === 'active'`; Add Station launcher line 727 is disabled unless active, but modal submit line 908 checks only `busy || !stationCreateBody` and `addStation` lines 433-440 posts the body without local entitlement recheck. UI restriction is not an API security guarantee. Identify server POST `/api/cashier/management/stations` handler and verify server-side entitlement/authorization rejects inactive, grace, restricted, suspended, and cross-merchant attempts using disposable test DB. No confirmed server bypass and no runtime test executed. |

**CASHIER-STATION-ENTITLEMENT-011 update (2026-10-11):** `SOURCE_GUARDED_NEGATIVE_TEST_PENDING`, not a confirmed server authorization defect. Server route `cashier-staff-operations.ts:280-301` requires merchant session; station creation `postgresCashierStaffAuthority.ts:901-978` inserts and assigns seat in a merchant transaction; `cashierEntitlementAuthority.ts:608-676` enforces active entitlement and seat limit. Pending disposable-DB negative/concurrency/rollback proof; see PROGRESS. The original issue row records the initial UI-only concern and is superseded by this evidence.

## Billing checkout reliability — source-reviewed, tests pending (2026-10-11)

| ID | Status | Evidence / remaining proof |
| --- | --- | --- |
| BILLING-IDEMPOTENCY-012 | CONFIRMED_SAAS_CHECKOUT_RACE / CASHIER_PENDING | `cashierBillingAuthority.ts:489-595` and `saasBillingAuthority.ts:509-595` check same-merchant idempotency keys under `FOR UPDATE` and reject mismatched retries, but absent-row SELECT alone cannot prove concurrent uniqueness. Verify actual DB unique constraints and simultaneous checkout attempts on disposable PostgreSQL. Catalog/price changes can also cause 409 on retry; agree replay contract. |
| BILLING-EXTERNAL-TX-013 | SOURCE_CONFIRMED_RELIABILITY_TEST_PENDING | Both cashier (`cashierBillingAuthority.ts:639-665`) and SaaS (`saasBillingAuthority.ts:628-657`) invoke SuperQi **sandbox** while DB checkout transaction remains open, then attach external payment reference. Test provider latency, external success + DB rollback/commit failure, retry and reconciliation on disposable DB with mocked provider. No observed production incident. |
| CASHIER-PRORATION-014 | POLICY_AND_BOUNDARY_TEST_PENDING | `cashierEntitlementAuthority.ts:132-241` uses UTC calendar-month clamp and BigInt whole-IQD half-up proration; near expiry a positive amount below 0.5 IQD rounds to zero and is rejected. Decide intended minimum/next-cycle policy; test leap year, month-end, expiry and grace boundaries. |

These are **audit work items, not three proven vulnerabilities**. No integration tests, external payment, DB mutation or deployment performed.

## 2026-10-11 source review continuation — test gaps (not executed)

| ID | Status | Source observation / exit proof |
| --- | --- | --- |
| BILLING-WEBHOOK-ORPHAN-015 | RECONCILIATION_TEST_PENDING | `superQiSandboxWebhook.ts` verifies signed payload and gateway status, but returns `ignored/order_not_found` when no order matches. Together with BILLING-EXTERNAL-TX-013, inject sandbox provider-success/DB-rollback and prove recovery, retries and reconciliation. No confirmed incident. |
| CASHIER-SEAT-RELEASE-016 | SERVICE_RUNTIME_PASS / SOURCE_CONFIRMED_UI_SELECTION_GAP / BROWSER_PENDING | `cashierEntitlementAuthority.ts` seat assignment returns existing snapshot for both `active` and `release_scheduled` rows; test whether merchant retention of a scheduled-release station cancels the release as intended. |
| REPLY-LEDGER-DUPLICATE-017 | OFFICIAL_TRANSPORT_RUNTIME_DENIAL_PASS / OTHER_CALLERS_OPEN | `postgresSubscriptionEntitlement.ts` duplicate reservation returns allowed/duplicate after matching prior debit and checking current subscription row, without reapplying the initial new-event status checks; verify caller does not send an unauthorized new reply on replay after suspension. |
| REPLY-RESTORE-CYCLE-018 | CONFIRMED_SYNTHETIC_CROSS_CYCLE_FAILURE | `restoreMerchantAutoReplyPostgres` credits the original subscription/batch and guards duplicate credits. Test late refund after renewal, old batch missing/expired and balance invariants. |
| CASHIER-STATION-ROLLBACK-019 | VERIFIED_SERVICE_DB_NEGATIVES | `postgresCashierStaffAuthority.ts` station insert and seat assignment share merchant transaction; test exhausted-seat rollback, no orphan station and concurrent create. |

All entries are source review or test design, not executed proof. No changes to application code, live DB, payment providers, or deployment.

## 2026-10-11 integration entrypoint safety

| ID | Status | Evidence / required fix |
| --- | --- | --- |
| DB-TEST-TARGET-GUARD-020 | VERIFIED_SOURCE_GAP / NOT_EXECUTED | `artifacts/api-server/tests/global-merchant-auth-bootstrap-postgres.integration.test.mjs:79` and `global-merchant-golden-journey.integration.test.mjs:223` skip only when `DATABASE_URL` is absent, with no disposable/local DB assertion in those entrypoints. Both use `@workspace/db` and write/delete synthetic accounts; `test:global-merchant-journey` invokes both. Require pre-import fail-closed target attestation and isolated ephemeral Postgres; prove rejection of remote/tunneled DB. No test execution or real-data impact observed. |

| DB-TEST-CLEANUP-021 | VERIFIED_SOURCE_GAP / NOT_EXECUTED | `global-merchant-golden-journey.integration.test.mjs:238-380` creates accounts, merchant, cashier subscription, billing order and entitlement application before registering `t.after` at line 377. Any error during fixture setup leaves synthetic rows behind. `global-merchant-auth-bootstrap-postgres.integration.test.mjs` also registers cleanup after initial pool query, temp directory and port reservation. Register cleanup before first mutation and use an isolated transaction/teardown strategy with failed-setup tests. |
| GOLDEN-LEGACY-FIXTURE-022 | CLOSED_BY_EXECUTED_CONTRACT | `global-merchant-golden-journey.integration.test.mjs:321-344` still writes a `merchants.json` compatibility fixture described as pre-PR #139. Confirm whether current runtime still needs this; if not, remove fixture and assert fully PostgreSQL-backed behavior. No runtime test performed. |

| GOLDEN-CONTRACT-DIVERGENCE-023 | CLOSED_BY_EXECUTED_CONTRACT | `global-merchant-golden-journey.integration.test.mjs:321-344` explicitly writes a pre-PR-#139 `merchants.json` fixture, while `global-merchant-postgres-http-journey.integration.test.ts:46-56,704` asserts no root-level `.json` files in its test data directory. The latter tests a stricter no-legacy-JSON contract but is not the same entrypoint as `test:global-merchant-journey`. Establish whether the legacy fixture is still necessary and make the npm command exercise the canonical contract. Source evidence only; neither test was executed. |

## Autonomous sequential audit — task SEQ-01 (2026-10-11)

User authorizes test guards, test additions and isolated CI on the audit branch; earlier approval-only wording for these scoped actions is superseded. No app/business changes, main merge or hosted DB mutation authorized.

| ID | Classification | State | Evidence / next action |
| --- | --- | --- | --- |
| DB-TEST-CLEANUP-024 | CONFIRMED_TEST_PROCESS_DEFECT | OPEN | Both MJS merchant journeys swallow account DELETE failures with `.catch(() => {})`; the direct TS HTTP journey and Meta ingress do the same with `.catch(() => undefined)`. This can report a green test after failed cleanup. Separate from late hook registration DB-TEST-CLEANUP-021. Use teardown that attempts every resource release, propagates redacted aggregate errors, and register before setup; test failed setup and failed cleanup. Source evidence only at baseline 09d5b8cd; no DB execution. |

DB-TEST-TARGET-GUARD-020 through GOLDEN-CONTRACT-DIVERGENCE-023 already exist; no duplicate entries created. Merchant deletion RLS suite has finally-based role cleanup but retains fixture rows until instance disposal; runner must destroy its owned instance.

## SEQ-02 — scoped guard and cleanup remediation (audit branch only)

- DB-TEST-TARGET-GUARD-020: IMPLEMENTED / 15 SAFETY REGRESSIONS PASS / ACTUAL CI INSTANCE PROOF PENDING. Five priority suites now call shared attestation before application DB imports. Guard requires a loopback-only network namespace matching runner-owned Docker identity, exact fawri_ci target/role, per-run marker verified by read-only probe, no URL query overrides and NODE_ENV=test. An environment flag or local tunnel URL alone cannot pass.
- DB-TEST-CLEANUP-021: both MJS cleanup hooks moved before mkdir/first mutation; removed unnecessary initial DELETE. Failed-setup helper regression PASS; actual failed-DB-fixture cleanup proof still pending.
- DB-TEST-CLEANUP-024: swallowed DELETE errors removed in both MJS journeys, TS HTTP and Meta ingress. Aggregate teardown attempts every cleanup and fails with redacted errors. Helper failure-injection PASS; actual PostgreSQL cleanup behavior pending.
- GOLDEN-LEGACY-FIXTURE-022 and GOLDEN-CONTRACT-DIVERGENCE-023 remain OPEN; compatibility fixture intentionally retained until measured canonical journey proof. No application implementation changed.
- Unselected unsafe suites under PG-TEST-GUARD-002/003 and TEST-DB-SAFETY-008 remain OPEN; the five-suite guard is not a repository-wide claim.

SEQ-03a follow-up to DB-TEST-TARGET-GUARD-020: first real CI refused at preflight because test guard used the per-database comment function instead of shared-object database comment function. Corrected to shobj_description; no application or hosted DB defect claimed. Closure remains pending fresh CI proof.

FA-I-006: dedicated restricted-role test added in SEQ-03b. Requires real tenant-reset passes and known-page routing passes; do not close from source or owner-role Meta suite. Runner startup race fixed by TCP readiness after actual CI init failure; no application defect inferred from that failure.

| AUDIT-FIXTURE-SCAN-025 | TEST_INFRASTRUCTURE / FALSE_POSITIVE_REVIEW | OPEN | Security run 38171061371 flags three fabricated remote connection strings in guard regression tests. Current inputs now use recognized placeholder passwords; historical blobs may still be flagged. These inputs were rejected before connections. Do not suppress real secret findings or rewrite history; verify narrowly scoped false-positive handling if needed. |

DB-TEST-TARGET-GUARD-020 SEQ-04: actual isolated instance matched database/role/run marker; address failed exact text comparison due PostgreSQL inet mask representation. host(inet_server_addr()) corrects the comparison, retains strict loopback-only rule. Wider legacy suites protected by runner preload only; direct-entrypoint PG-TEST-GUARD findings remain OPEN. No integration PASS yet.

| BILLING-TEST-E164-026 | CONFIRMED_TEST_FIXTURE_DEFECT | FIXED_AND_CI_VERIFIED | SaaS billing and signed SuperQi positive fixtures use local077... phones; actual migration0026 now requires E.164. Run38171428265 showed accounts_phone_shape_check SQLSTATE23514 before payment assertions. Changed test fixtures only to +964...; source constraint preserved. No billing runtime defect established by those failures. |

AUDIT-FIXTURE-SCAN-025: local current repository+history scans now PASS after recognized current placeholders and six exact immutable historical fixture exceptions (two blob SHAs/path/rule/offset/length). Regression rejects any widened match. CI security proof pending.

## SEQ-06 — isolated rerun, actual restricted-role failure (2026-10-11)

FA-I-006 is now reproduced under committed schema on disposable PostgreSQL16. [Commit284a5fa4](https://github.com/nora953/fawri-production-source/commit/284a5fa476ad975261099be74597e4cbeb23ba68), [run38171811645](https://github.com/nora953/fawri-production-source/actions/runs/38171811645), job114565798191: roleNOLOGIN/NOSUPERUSER/NOBYPASSRLS, merchant_channels RLS enabled; tenant-only lookup and pool context reset PASS; unknown-page generic503/noidentity leak PASS. Global approved mapping count actual0/expected2 FAIL; known approved page actual503/expected accepted FAIL. Three Node failures include the parent, representing two failed functional subtests, not three independent defects. No cross-tenant leak demonstrated. Live staging has no approved connected-page reproduction. Preserve RLS; application resolver change requires user approval.

Twenty of21 suite files PASS, totals48NodePASS/3FAIL/0SKIP. Deletion RLS, seven cashier suites, four billing suites and four tenant suites PASS. Four fresh DB instances each applied28 committed migrations; teardown PASS. BILLING-TEST-E164-026 is verified fixed by successful SaaS4/SuperQi2 cases. All other workflow runs on this commit, including final security/supply chain and final quality gates, completed SUCCESS. These facts do not establish release readiness or omitted failure paths.

Prepared next: remove golden journey legacy merchants.json fixture and assert no root JSON persistence; add synthetic late-paid-expired, mismatched-paid replay and shared-payment-reference concurrency tests. Not yet executed. Dependency audit reports two moderate advisory records (postcss-selector-parser GHSA-rj75-hqrm-r3gf; fast-copy GHSA-jggr-w7fw-pc2j); exploitability/dependency path pending, no new issue until reconciled with existing register.

## SEQ-07 — negative billing and fixture-free journey; SEQ-08 restore safety

[Source91d639ff](https://github.com/nora953/fawri-production-source/commit/91d639ff17dad866a89b06c1cea736e8f57bae6f), [run38172237280](https://github.com/nora953/fawri-production-source/actions/runs/38172237280), job114567076990:22suite files,49NodePASS/6FAIL/0SKIP;20filesPASS. Four committed-schema chains28migrations eachPASS; owned-container teardownPASS. Six failures are four failed subtests plus two parent failures (Meta two, SaaS two).

| ID | Classification/status | Actual evidence / next action |
| --- | --- | --- |
| BILLING-LATE-EXPIRED-027 | CONFIRMED_SYNTHETIC_RUNTIME_DEFECT / OPEN HIGH | Create checkout1hour in past, list orders proactively marks expired, then verified matching test_fake payment throws SAAS_BILLING_ORDER_NOT_PAYABLE instead of durable paid_reconciliation_required. Source saasBillingAuthority.ts checks nonpending status before late-payment reconciliation. No production charge; operational consequence is missing automatic reconciliation for a received payment. Approved business correction and replay recovery proof needed. |
| BILLING-PAID-REPLAY-028 | CONFIRMED_SYNTHETIC_RUNTIME_DEFECT / OPEN HIGH | Valid payment applied, distinct verified event with same payment ref and amount1 changes durable order paid -> paid_reconciliation_required. Amount mismatch branch precedes paid terminal guard. Existing entitlement stays applied; no double-credit demonstrated. Preserve terminal state and audit rejected event after approved fix; also test refunded state. |
| RESTORE-LIBPQ-OVERRIDE-029 | CONFIRMED_TOOL_GUARD_GAP / FIXED_LOCAL_TEST_PASS_CI_PENDING | Backup/restore accepted loopback URLs containing hostaddr/service parameters and inherited libpq routing variables. Six new rejection tests failed before patch;15passed after URL search/hash rejection, then17passed including mocked binary PGHOSTADDR/PGSERVICE/PGOPTIONS stripping. No database connection occurred (local pg tools absent; fake tools only). Existing direct tools still lack ownership/network attestation; arbitrary loopback tunnel and SELECT side effects remain unproven safety gaps. Do not run these direct against unproven DB. |
| SUPPLYCHAIN-MODERATE-030 | ADVISORY_DETECTED / EXPLOITABILITY_UNPROVEN | pnpm audit2moderate,0high,0critical; selector-parser6.0.10 via frontend dev @tailwindcss/typography (GHSA-rj75-hqrm-r3gf; fixed>=7.1.6); fast-copy4.0.3 via API dev pino-pretty/esbuild-plugin-pino (GHSA-jggr-w7fw-pc2j; fixed>=4.1.0). Recursive pnpm why confirmed paths. Dev declaration does not alone prove absence from deployed bundle. Patch/override compatibility and artifact reachability pending. No lockfile changes. |

GOLDEN-LEGACY-FIXTURE-022 and GOLDEN-CONTRACT-DIVERGENCE-023: CLOSED_BY_EXECUTED_CONTRACT on source91d639ff. MJS journey removed pre-PR139 merchants.json compatibility fixture; unchanged operational journey passes and asserts zero root JSON. HTTP journey alsoPASS. No claim all legacy app routes are removed.

SaaS concurrent distinct orders/shared provider payment ref PASS: exactly one entitlement, other rejected SAAS_BILLING_PROVIDER_PAYMENT_COLLISION in this execution. This single simultaneous attempt narrows earlier absent-row race concern; stress distribution and commit-failure recovery remain untested. Existing positive billing/refund suites stillPASS.

## SEQ-09 prepared — checkout concurrency and station rollback

Scope: test-only evidence additions for BILLING-IDEMPOTENCY-012 and CASHIER-STATION-ROLLBACK-019. Existing subscription test already proves final-seat serialization; added database station-count assertions after unlicensed, exhausted and losing concurrent creation, plus exact rejected code. Reason to rerun: orphan persistence was not asserted before. Added same-key simultaneous SaaS checkout test with up to6independent merchant trials, expects both callers receive one durable order; no result claimed until CI. Cashier entrypoint now has direct pre-import disposable guard and aggregated cleanup (extends020/024 coverage). Isolated workflow path trigger includes changed PostgreSQL integration tests and negative billing file. Golden fixture-free contract already established; do not re-open022/023 from unrelated failed suites.

## SEQ-09 verified; SEQ-10 prepared

[Sourcef956b689](https://github.com/nora953/fawri-production-source/commit/f956b689b0135ebe56503687a8557e8c8a579739), [run38172594527](https://github.com/nora953/fawri-production-source/actions/runs/38172594527), job114568154729:22files49NodePASS/7FAIL/0SKIP; four28migration chains andcleanupPASS. Seven failures include2parents: Meta2functional failures, SaaS3functional failures. Prior027/028persist.

BILLING-IDEMPOTENCY-012: CONFIRMED_SYNTHETIC_CHECKOUT_RACE. Trial0both callers succeeded; trial1one caller failed SQLSTATE23505, other succeeded. Test stopped on trial1; do NOT claim all6trials executed. Identical merchant/operation/plan/key concurrent requests should replay one checkout for both callers; unique constraint prevents duplication but service lacks successful conflict replay in this observed path. This is an idempotent response/reliability defect, not evidence of duplicate charge or entitlement. Source SELECT FOR UPDATE cannot lock absent key. Approved business fix and concurrent regression required.

CASHIER-STATION-ROLLBACK-019: VERIFIED_SERVICE_DB_NEGATIVES. Unlicensed insert rolls back to0stations; exhausted seat preserves1station; competing final-seat creation preserves2stations/2assignments and loser CASHIER_LICENSED_SEAT_LIMIT_REACHED. Existing cashier grace/suspension/tenant checksPASS. No HTTP/browser claim; retention016pending.

Restore evidence: [source861524b4](https://github.com/nora953/fawri-production-source/commit/861524b46143668079055a280db32e4c403d436e), [run38172470218](https://github.com/nora953/fawri-production-source/actions/runs/38172470218). Actual fresh PostgreSQL16 workflow service creation and synthetic fixed loopback URL verified in job114567775409 logs;1835byte dump checksum verified;3row restore count and source/target consistency hashPASS;2localobjectsrestore/hashPASS; secret scans/evidence uploadPASS; normal DROP database and service removalPASS. Observabilityjob11456777521312PASS/0FAIL/0SKIP; typecheckPASS. This proves tiny synthetic drill, not complete Fawri schema/full merchant recovery, external storage/PITR/RPO/RTO or production recovery.

| RESTORE-SELECT-EFFECTS-031 | CONFIRMED_TOOL_VALIDATION_GAP / FIXED_LOCAL_TEST_PASS_CI_PENDING | SELECT prefix guard accepted writable function/SELECT INTO/locking/predicate function. Four denial tests failed prepatch. Restricted verification to simple SELECT count(*) FROM unquoted optional-schema table; combined backup/restore/object tests21PASS/0FAIL/0SKIP. No SQL effects executed: missing manifest prevented tool use. Workflow now verifies owned running PostgreSQL service loopback-only published port and empty public schema before writes; cleanup no longer swallows psql failure. New workflow proof pending. |

Prepared SQL-fault/retry test: pre-importguard, synthetic verified payment, temporary trigger raisesP0001 during entitlement INSERT; captures persisted order/event/subscription state, removes trigger, tests exact eventretry/duplicate and expects durable reconciliation. New test23rdfile not executed yet; no defect claimed. Cleanup attempts trigger/function/accounts/pool independently. No hosted data/provider calls.

## SEQ-10 actual SQL fault and restore ownership; SEQ-11 prepared

[Sourcefbbb9d0c](https://github.com/nora953/fawri-production-source/commit/fbbb9d0cb8806d1e0fc7bd04d57aa7fdd34f1132), [run38172886288](https://github.com/nora953/fawri-production-source/actions/runs/38172886288), job114569035624:23files50NodePASS/9FAIL/0SKIP;20filesPASS; four28-migration chains andcleanupPASS. Nine failures include3parents;6functional failures. Prior Meta/012/027/028persist.

| BILLING-SQL-RECONCILIATION-032 | CONFIRMED_SYNTHETIC_FAILURE_RECOVERY_LIMIT / OPEN | Inject P0001 trigger on entitlementapplicationINSERT during verified syntheticpayment. Entiretransactionrollsback: orderpending,events0,applications0,subscriptions0; no durablepaid/reconciliationwork. Faultremoved/exacteventretryPASS(appliedonce,duplicateonreplay). Thus atomic rollback and repeat recovery work; a permanent error or exhausted providerretry leaves no received-payment evidence in these tables. No realpaymentorpermanentlossproven. Operator reconciliation/replay SLA and approved durable failure recording needed; cashier equivalent remains untested. |

[Restore run38172886344](https://github.com/nora953/fawri-production-source/actions/runs/38172886344) on same source, job114569035881:21unitPASS/0FAIL/0SKIP; RESTORE_SERVICE_OWNERSHIP_PASS, RESTORE_FRESH_DATABASE_PASS before writes;3rowdump/restore/hashPASS;2localobjectrestorePASS;cleanupPASS. Guards029/031now CIverified. Full Fawri schema/storage/PITR recovery remains open.

Cashier subscription legacy workflow run38172886355/job114569035424 failed disposable attestation before DB import; this was the newly protected test refusing the old push-force/service runner, not cashier business failure. Replaced only DB job with reusable isolatedcashier suite; preserve frontend/APItypecheck/policyunitjob and add previously presentfull-lifecycle suite to isolatedbatch, pendingCI.

SEQ-11 prepared: add existing Meta bot/AI full PostgreSQL testfile to new isolatedbatch with injected send/media/embedding providers and no externalnetwork/credentials; add directguard/early aggregatedpool/tempcleanup. New duplicate reservation/suspended subscription test expects sendguard rejection and zero fake sends (017). Add cross-cycle replyrefund test (018) preserving new-cycle debit after late old-cycle refund. Total26suitefiles planned, no results yet. Syntax transform and MJSchecksPASS; TypeScript type coverage for this test remains runtime/CI rather than full new compile proof.

## SEQ-11 verified: cross-cycle accounting; Meta harness corrected

[Source9331c489](https://github.com/nora953/fawri-production-source/commit/9331c489903c315a24d41726a3efa1b77954513b), [run38173288435](https://github.com/nora953/fawri-production-source/actions/runs/38173288435), job114570243330:26files,52NodePASS/62FAIL/0SKIP;21filesPASS. Five fresh isolated instances each28migrationsPASS; cleanupPASS. Of62failures,52are the Meta harness prematurely ending its pool after first awaited top-leveltest; other10include3parents and7functionalfailures. Do not label52Meta failures as product defects or completed functional coverage.

REPLY-RESTORE-CYCLE-018: CONFIRMED_SYNTHETIC_CROSS_CYCLE_ACCOUNTING_FAILURE. Old-cycle base reply reserved; subscription renewed after expiry; new-cycle reply reserved; refund oldevent returns refundedtrue and changes newcycleused1->0/remaining3999->4000. Renewal reuses subscription ID; refund has no original-cycle discriminator. The new event debit stays in ledger while base usage is erased. No real balances touched. Approved accounting policy/fix needed: reject or reconcile historical refund separately, preserve new-cycle debit, prove duplicate/concurrent cases and add-on batch behavior.

Meta harness correction (024 follow-up): early root afterhook incorrectly ran after first awaited top-level test and closed shared pool. Move all53cases under one parent with early parent t.after, retain aggregatedcleanup and disposableguard. This is an audit test-infrastructure correction; the original application Meta cases remain unproven until rerun.017suspended duplicate send negative did not reach its assertions in this run. Add independent knowledge-learning-cycle file with fakeembedding to isolatedbatch (27files planned). Syntax transformPASS; real CIpending.

[Cashier workflow38173288724](https://github.com/nora953/fawri-production-source/actions/runs/38173288724): both jobsSUCCESS. Job114570243664 API/frontendtypecheck and7policytestsPASS (calendar-month/leap-year/proration cases); job1145702440248suitefiles9NodePASS/0FAIL/0SKIP,28migrationsPASS. This verifies replacement for obsolete schema-push runner and full cashier lifecycle; near-zero proration policy and changed-retention selection stillpending014/016.

New FINAL_REPORT_DRAFT.md and REMAINING_WORK_MATRIX.md consolidate current evidence, priorities and14short-task planning estimate3.5–7hours excluding additional failures/queues/externalproof/fixes. Draft is not release approval.

## SEQ-13 — Meta/AI functional proof and cleanup fault preparation

[Source2964aba2](https://github.com/nora953/fawri-production-source/commit/2964aba2800274f704adbe5cf820e458958f0915), [run38173603888](https://github.com/nora953/fawri-production-source/actions/runs/38173603888), job114571197444:27files,106NodePASS/10FAIL/0SKIP;23filesPASS. Five isolated28migration chains andcleanupPASS. Four failedfiles correspond to existing006/012/027/028/032/018, sevenfailedfunctionalcases plus threeparents.

Meta parent harness corrected:54NodePASS/0FAIL/0SKIP (53functional subtests plus parent), owner-role committed-schema/injectedproviders only. Covers deduplicated send, confirmed failure retry, uncertain send prevention, tenant knowledge isolation, manual takeover, media provenance/forgery/redelivery, mixed attachments, SSRF-like unsafe URLs and event identity collision. No real Meta/OpenAI availability/token permission proof. Standalone knowledge learning-cycle1PASS. Restricted Meta page mapping failure006 is separate and persists.

017: reservation duplicate after subscription suspended returns allowedtrue/duplicatetrue; official PostgreSQL transport.send rejects MERCHANT_AUTO_REPLY_DISABLED and fake send counter remains0. This narrows concern to reservation API semantics/other callers; no unauthorized official send demonstrated.018crosscycle failure persists. Historical52Meta harness failures remain recorded, now corrected.

021/024 next real DB proof prepared: guarded child inserts synthetic account/merchant then setupthrows; first cleanup SELECT throws SQL error, subsequent DELETE and pool teardown must still run. Parent checks childexit1, bounded cleanup failure log, zero account/merchant rows and no raw PostgreSQL error. Node24 probe showed a setup error masks an after-hook error in reporter; helper now emits only TEST_CLEANUP_FAILURE count before aggregated throw.15guard/local cleanup testsPASS; real DB child proof pending28file rerun.

## SEQ-14 — failed-setup harness diagnosis; full schema restore prepared

[Source43e60b16](https://github.com/nora953/fawri-production-source/commit/43e60b164282beec5feba9546625b4c16faca21f), [run38173870161](https://github.com/nora953/fawri-production-source/actions/runs/38173870161), job114571997037:28files106NodePASS/11FAIL/0SKIP;23filesPASS. Five28migration chains andcleanupPASS. Existing10functional/parent failures persist; additional1is the new cleanup child harness, not app failure. Child unexpectedlyexit0, so DB cleanup proof not reached. Confirmed locally NODE_TEST_CONTEXT=child-v8 makes nested node --test skipfiles with a recursive-run warning; remove only this inherited context in childenvironment. No claim child fixture rows were inserted in failedrun.

Full-schema restore prepared: new separate sixth fresh offline cluster,28migrations; two synthetic merchants/channels; restricted NOLOGIN/NOSUPERUSER/NOBYPASSRLS readrole. Seed fingerprint includes publictables/RLSflags/ACLs,policies/functions,constraints/indexes,migrationjournal andfixturechanneldata. Dockerexec pg_dump/customdump, restore toemptyDB, replace only ownedsourceDB, reattest marker, compare fingerprint and rerun restrictedtenantreads without rerunning migrations. Roles remain in same disposablecluster (not cluster-role restore proof). Rawdump remains inside disposablecontainer, neveruploaded. Allcontainers/volumes/temp proof removed by existingtrap. MJS/shell/YAML/diffchecksPASS; actualrestorepending.29unique files planned,30invocations includingseed/verifyphases.

## SEQ-15 actual failed-setup cleanup and first full-schema restore

[Sourcefe892e69](https://github.com/nora953/fawri-production-source/commit/fe892e6973907e93c808f2c5af80b7273c224e9e), [run38174186237](https://github.com/nora953/fawri-production-source/actions/runs/38174186237), job114572937993:29unique files/30invocations,108NodePASS/11FAIL/0SKIP. Six fresh isolated instances each28migrationsPASS; cleanupPASS. Existing10functional/parent failures plus fullschema fingerprint comparison failure. Security/supplychain fourjobsSUCCESS onthissource; no productchange.

021/024 real failure proofPASS: child setup throws after synthetic account/merchant inserts, first SQLcleanup throws; expectedchildexit1, boundedcleanup error visible, rawerror redacted, remainingaccount0/merchant0. Later cleanup and pool end execute despite first failure. This proves common early-hook/aggregate strategy with actual DB writes/errors; it is not fault injection at every journey mutation.

Full-schema seedPASS:94publictables,45policies,3functions,28migrationrows,two syntheticconnectedchannels; restricted tenant readsPASS. Owned-container pg_dump/pg_restore commandPASS and source DB replacement/reattest completed. VerificationtestFAIL: fullfingerprint mismatch; no componentdetail yet, because assertion preceded restrictedrole reads. Do NOT call fullrestore verified or assume appdefect/data loss. Add bounded component/key/field diagnostics (no rawSQL/secrets) and run restricted tenant reads before finalfingerprint assertion. Roles remain in samecluster. Next actualrerun must identify semantic vs representation difference.

014: added nearzero half-up monthly boundary test;8localpolicytestsPASS/0FAIL/0SKIP using node --importtsx with DATABASE_URL absent. InitialtsxCLI failed sandboxIPCsocketEPERM beforetests; safe node-loader alternativePASS, no appfailure. Business choice for positive roundedzero remains policydecision. Existingcalendar/leapyear behavior alreadyCIverified, reused.016: explicitdowngradekeepselection switch cancels release + staleversion rejection prepared; directguard and aggregatecleanup added tothissuite. SyntaxPASS; DBassertionspending.

030artifact follow-up: local API build's pino-pretty.mjs.map lists fast-copy4.0.3 source; APIbuild always emits prettytransport, Dockerfile.staging copies fullnode_modules anddist withoutpruning. logger.ts skips prettytransport when NODE_ENVproduction; Dockerfile.staging sets production. Thus dev declaration does not imply artifactabsence, but defaultproductionruntime activation/exploit not demonstrated. Selector-parser frontendbuild dependency remains in copiednode_modules; not proven in browserasset. No dependency changes.

## SEQ-16 — restore difference localized; cashier retention proof

[Source3a9e83ab](https://github.com/nora953/fawri-production-source/commit/3a9e83ab580c7f0845c5b9309707901b9fe14523), [run38174557888](https://github.com/nora953/fawri-production-source/actions/runs/38174557888), job114574050281:29unique files/30invocations,108NodePASS/11FAIL/0SKIP; six28-migration chains andcleanupPASS. No newappdefect fromrerun.

Restoreverify restrictedtenantreadsPASS afteractualdump/restore. Tables/ACL/RLSflags,policies/functions,indexes,journal andfixturechannels compareidentically. Only constraint.definition differs; all638constraints and validation/deferral flags/counts preserved. SamplefullDDL notyetrecorded; semanticdifference remainsunknown. Add one original/restoredconstraint sample (publicschema metadata only) and retain finalfingerprintfailure until evidence permitsrepresentation normalization. No premature fullrestorePASS.

016explicit retention selectionPASS: keeperchange cancels its scheduledrelease, previouslykeptstation becomesrelease_scheduled; staleexpectedVersion rejected, validswitchback retainsoriginalkeeper through existinggrace/paidrenewalflow. assignseat helperis notexposedasretentionroute inreviewedsource; ordinaryassignmentnoop onrelease_scheduled isnot demonstrated UIretention failure. Officialscheduledselection servicebehaviorverified; UI/browser nottested.014nearzero proration8localpolicytestsPASS; pricingpolicydecision remainsopen.

Prepared newcashier billingnegativefile: latepaymentafterproactiveexpiry, mismatchafterappliedstate, samekey concurrentcheckout(up to6independent trials), globalpaymentrefcompetition and SQLfault/retry. Usesguard,syntheticfixtures/fakeprovider,earlyaggregatecleanup/faulttriggerremoval. SyntaxPASS; actualtestsnotrun. Next30unique files/31invocations. Updateexisting012/027/028/032 scope rather thanduplicatefindings if reproduced.

## SEQ-17 — cashier payment boundaries and restore representation evidence

Source [8dcc893e](https://github.com/nora953/fawri-production-source/commit/8dcc893ebf9c15a9162b93cb5276c392a7e4d4f9), [run 38174896098](https://github.com/nora953/fawri-production-source/actions/runs/38174896098), job 114575105770: 30 unique files/31 invocations, **110 PASS / 15 FAIL / 0 SKIP**. Six isolated PostgreSQL instances applied 28 migrations each; owned container/volume cleanup SUCCESS. Failures comprise ten existing functional/parent failures, four new cashier failures (three functional and their parent), and one restore comparison failure. These are not fifteen independent defects.

027 now confirmed for cashier as well as SaaS: matching verified payment after proactive order expiry throws CASHIER_BILLING_ORDER_NOT_PAYABLE. 028 now confirmed for cashier applied orders: a distinct mismatched-amount event rewrites applied to paid_reconciliation_required while entitlement remains applied. 032 cashier SQL trigger fault P0001 rolls back payment/application/subscription writes but leaves order pending and no durable provider-event evidence; removing fault permits exact-event retry and duplicate protection. These extend existing issue scope, not new issue IDs. No real provider charge or loss was tested.

012 remains confirmed for SaaS only. Cashier identical concurrent checkout succeeded for both callers with one stable order in all six independent trials, with no rejected SQLSTATE. Shared cashier payment-reference competition also passed. Do not generalize SaaS concurrency failure to cashier.

Full-schema dump/restore commands and restored restricted tenant reads passed. The sampled cashier_operation_attribution_identity_check differs only by flattening its leading associative AND group; 638 constraints retain counts/flags and other components match. One sample is insufficient to classify every constraint. Prepared native PostgreSQL parse/deparse normalization for CHECK constraints only, with equivalent-grouping positive canary and changed-predicate negative canary; all ACL/RLS/data/index/function/journal assertions retained. Syntax passed; actual normalization/restore proof pending.

Next guarded fixture covers addon-batch FK protection, concurrent duplicate refunds and expired-addon refund after renewal, separately from confirmed base-cycle defect018. Synthetic setup/early aggregate teardown; syntax passed, DB execution pending. Matrix expands to31 unique files/32 phase invocations. No application change.

## SEQ-18 — full committed schema restore and addon refunds verified

[Source fc1ee417](https://github.com/nora953/fawri-production-source/commit/fc1ee4171eac9b75189383539857664afa37b264), [run38175555975](https://github.com/nora953/fawri-production-source/actions/runs/38175555975), job114577082735:31 unique files/32 phase invocations, **114 PASS / 14 FAIL / 0 SKIP**. Six offline isolated PostgreSQL clusters each applied28 committed migrations; container/volume cleanup SUCCESS. Fourteen failures comprise ten functional failures and four parents across existing006/012/018/027/028/032. No new product finding.

Full committed-schema restore seed AND verify PASS. Native parser round-trips303 CHECK definitions on each side; equivalent-AND positive canary and changed-predicate negative canary PASS. Both fingerprints identical:54f2997b3d8a921daf2aa3d11bef4ab7e62114570d9ecb132cd10fe9bdee05ee.94 public tables/RLS flags/ACLs,45 policies,3 functions,638 constraint definitions/counts/flags, indexes,28 migration journal entries and two fixture channels match; restricted tenant reads PASS after real pg_dump/pg_restore. Previous mismatch is now experimentally classified as CHECK deparse representation, not data loss. This is synthetic schema/channel recovery in one owned offline cluster; roles remain pre-existing. No cluster-role/PITR/external-media/redeploy/RPO-RTO guarantee.

018 addon controls PASS (three Node tests including parent): committed FK rejects referenced batch deletion with23503; concurrent refunds credit exactly once and preserve batch identity; expired addon refund after renewal keeps current baseused1/baseRemaining unchanged and addonAvailable0. Confirmed base-cycle defect018 still FAIL. Do not conflate safe addon behavior with unsafe base refund.

020 expanded source inventory:64 candidate DB-dependent integration files,16 direct guard markers,31 isolated selections,33 outside both at sourcefc1ee417. Candidate scan is textual, excludes transitive imports and is not a mutation/CI safety proof. Add guarded merchant-password recovery entrypoint to isolated selection; two local direct invocations (missing URL and unattested hosted-shaped URL) rejected before dynamic application DB imports. New early aggregate hook registered before seed/temp/server setup. TS syntax/API typecheck/diff check PASS. Actual password recovery HTTP tamper/replay/concurrent-reset assertions pending next CI; broader32 unprotected/unselected candidates remain open. No legacy workflow references this filename literally; no blanket attestation change was made to legacy service workflows.

## SEQ-19 — password recovery proof and CI evidence reconciliation

[Source1c498c06](https://github.com/nora953/fawri-production-source/commit/1c498c06e27da42ccb73bfbadb4bd7599d9e2601), [run38175863733](https://github.com/nora953/fawri-production-source/actions/runs/38175863733), job114578004547:32 unique files/33 invocations, **115PASS/14FAIL/0SKIP**. Six28-migration chains and teardownSUCCESS. New password recovery HTTP proofPASS: tampered cookie rejected without password/version change; valid reset revokes prior sessions and increments versions; replay rejected; two concurrent confirmations serialize to200/400 with one further version change. Existing ten functional/four parent failures persist; schema restore/addon controls stillPASS. No application change.

R11 reused completed sourcefc1ee417 CI logs, not reran its proven checks. Returned20 PR workflows:16SUCCESS/4FAIL. Bot adversarial22PASS and workflow-boundary1PASS; both synthetic runtime/SQL/provider substitutes. Quality tool18PASS; source contracts386PASS/0FAIL/1SKIP (387total), APIunit818PASS/0FAIL/0SKIP, frontendTS179PASS/0FAIL/0SKIP; full typecheck/build SUCCESS. Translation structure SUCCESS; reported core777 keys and admin299 keys each in en/ar/ku, missing0/extra0; this is structural, not semantic or browser proof. Security fourjobsSUCCESS; dependency audit retains two moderate advisories030, so green blocking policy is not zero advisories.

Recorded skipped DB subtest: auth-cutover-contract.test.mjs, validated PostgreSQL merchant context reaches business routes without merchants.json authority, skip when DATABASE_URL absent. Now selected explicitly under attested isolated runner; early aggregate teardown before mutations, child stop awaits exit. Local source-only invocation10PASS/0FAIL/1SKIP; DB assertion pending. Its intentionally empty legacy fixture checks absence of legacy merchant authority, unlike removed golden JSON compatibility fixture. No standalone guard added because legacy workflows need separate migration; preloader protects selected execution.

Two other CI failures were infrastructure, not product findings: Meta pipeline audio mixed command60PASS/1FAIL/0SKIP because guarded Meta DB file was invoked on unattested legacy service; foundation knowledge-gap step failed at same pre-import guard. Corrected both workflow invocations to owned offline meta-bot runner, preserving full seed/parent/teardown and pool-contention assertion. No weakening of guard or removing business assertions. YAML, bot workflow path1test and diff checksPASS; actual workflow repair pending. Cashier reusable job failure was existing027/028/032 (policy8PASS), not new infrastructure. Isolated audit failure is existing six indexed findings. CI table/counts in CI_EVIDENCE_RECONCILIATION_2026-10-11.md. PR body updated and publication verified to current evidence before this checkpoint.

## SEQ-20 — safe legacy CI callers verified; critical UI source review

[Source05456ea9](https://github.com/nora953/fawri-production-source/commit/05456ea9c5bfdf9c007159aae0226f8c949db1e6), [isolatedrun38176210529](https://github.com/nora953/fawri-production-source/actions/runs/38176210529), job114579031278:33 unique files/34invocations, **126PASS/14FAIL/0SKIP**. Six28-migration chains/cleanupSUCCESS. auth-cutover-contract11PASS/0SKIP includes previously skipped PostgreSQL business-route assertion; empty legacy merchant fixture remains empty. NoJSON golden and fullschema recovery remainPASS. Ten existing functional failures/fourparents persist.

Legacy Meta pipeline [run38176210628](https://github.com/nora953/fawri-production-source/actions/runs/38176210628), job114579031565 SUCCESS: isolated knowledge1PASS/Meta54PASS,28migrations. Foundation [run38176210612](https://github.com/nora953/fawri-production-source/actions/runs/38176210612), job114579031408 SUCCESS: deletion1PASS plus isolatedknowledge1/Meta54PASS across two28migration chains; finalFOUNDATION_CLEAN_INTEGRATION_FINAL_PASS reached. Guard refusals from previous source repaired by safe invocation, not weakened checks. TEST_CLEANUP_FAILURE failedResources2 in isolated logs is deliberate no-DB guard unit fixture before suites; no teardown failure inferred from that expected marker. Source-linked job cleanup stepsSUCCESS.

R12 bounded source task complete (not browser/linguistic certification). Existing016 now SOURCE_CONFIRMED_UI_SELECTION_GAP / SERVICE_PASS / BROWSER_PENDING: CashierSubscriptionPanel filters release_scheduled out of loaded selection, request and checkboxes although backend accepts both; merchant cannot pick that pending-release station as replacement through this component. Service keeper switch previouslyPASS. New FAWRI-UI-006 SOURCE_CONFIRMED_LOCALIZATION_GAP: billing operation/status render raw and server English errors pass into toast in AR/KU, despite translation key parity. No runtime display test, app fix, payment breach or data leak claimed. CRITICAL_UI_SEMANTIC_REVIEW_2026-10-11.md has exact bindings/accessibility/editorial limits. Existing003 admin logs is a different surface; no duplicate016 created.

## SEQ-21 — restricted-role sensitive-session HTTP proof prepared

Bounded FA-I-007 follow-up fixture merchant-session-restricted-http-postgres.integration.test.mjs prepared, **not DB-executed yet**. Pre-import attestation runs before @workspace/db; actual local no-attestation invocation exits1 with expected refusal before DB import. Syntax/diffPASS. Owner connection reserved exclusively for setup/teardown; all newly created application pool connections use startup rolefawri_audit_sensitive_http. Fixture must assert current_user, NOSUPERUSER/NOBYPASSRLS/non-owner and allfourDMLprivileges on five sensitive tables before HTTP. Account_sessions RLSflag must befalse to model application defense rather than rely on a protective RLS predicate there. Two synthetic merchants, three bound sessions; no external provider or hosted data.

Four planned HTTP subtests: missing/tampered/wrongdevice rejection; own-only session list with no rawtokens/tokenhash and no-store; cross-merchant revoke404 versus selected-own revoke200; origin denial before logout mutation and own logout-all leaving othermerchant active. Early aggregate teardown closes HTTP, deletes own accounts, removes role grants/role, restores pooloptions, releases ownerclient and ends pool. Actual outcome/cleanup awaited in next isolatedCI,34 unique files/35phaseinvocations. Role is modeled from historical observation, not live staging role; staff/credential endpoints and complete grantleastprivilege remain openFA-I-007. No new vulnerability ID and no change to app or actual grants.

## SEQ-22 — restricted HTTP session defense verified; deployment/recovery boundaries

[Sourcefccd677a](https://github.com/nora953/fawri-production-source/commit/fccd677a1798470b3dba70e20ccbc37662177ceb), [run38176766705](https://github.com/nora953/fawri-production-source/actions/runs/38176766705), job114580690925:34 unique files/35invocations, **131PASS/14FAIL/0SKIP**; six28-migration chains/owned cleanupSUCCESS. New restricted HTTP suite5PASS (four subtests+parent). Actual applicationrolefawri_audit_sensitive_http is nonowner/NOSUPERUSER/NOBYPASSRLS; fourDMLprivileges on accounts/account_sessions/merchants/merchant_cashier_staff/cashier_station_credentials proven and allfive actualRLSflagsfalse. Own-only session list/tokenredaction/no-storePASS; no-cookie/tampered/wrong-device401PASS; crossmerchantrevoke404/ownrevoke200PASS; foreignOrigin403/no mutation and ownlogout-all preservingothermerchantPASS. This partially addressesFA-I-007 with modeled broadgrants, not actualhostedgrants/staff/credential endpoints or total leastprivilege certification. No newvulnerability.

R13source review/drill proposal saved in DEPLOYMENT_RECOVERY_REVIEW_2026-10-11.md. Clean-deployment gate is isolatedHTTP, container contract runs shellfile/default checks rather thanserverstartup, DockerfileNode22 differs fromNode24testedjourney; hostedauto-deploy/mount/roles notqueried. Catalog/supportfilesystemroots and priorreleasefreeze statements do not close existingstorage/PITR/currentfindings. No duplicate externaldependency IDs and no hostedmutation.

Prepared fixednode22-http isolated selection with sameguard/migrations/assertions; explicitruntime/auditBatch summaries, seventhfreshcluster,34unique/36phase-runtimeinvocations. Repetition technically justified by runtimeversiondelta; syntax/shell/YAMLPASS, actualNode22HTTPproofpending. This remainsNODE_ENVtest, not packagedimage/stagingproductiongate proof. Proposed role/media/rollback/recoverydrill requires approvedsyntheticenvironment and explicit hostedmutation approval for redeploy; RPO/RTO/retention undecided, not invented.

## SEQ-23 — Node22 HTTP compatibility verified; external checkout rollback proof prepared

[Source83999ff1](https://github.com/nora953/fawri-production-source/commit/83999ff1ff1986ce5284142f089b1c459abab2e9), [run38177206914](https://github.com/nora953/fawri-production-source/actions/runs/38177206914), job114581998702:34unique files/36phase-runtimeinvocations, **132PASS/14FAIL/0SKIP**; sevenfresh28-migration chains/cleanupSUCCESS. Existing HTTPassertionsPASS onactualNodev22.23.3 andv24.21.0 (runtime/auditBatch logged). Repetition reason is DockerfileNode22 versus previously testedNode24. This closes boundedcompiledAPI/testmode compatibility only; actualpackagedimage/stagingproductionstartup remainsunproved. Restricted session5PASS andfullschema recovery remainPASS. Tenfunctional/fourparent failures unchanged.

Prepared guarded billing-external-checkout-rollback-postgres.integration.test.mjs for existing013/015, **DB_NOT_RUN**. Each SaaS/cashier synthetic fixture creates a sandbox-shaped payment through injectedfetch, observes an open INSERTtransaction via pg_stat_activity, then triggers SQLP0001 on referenceattachment; mustinspect durableorderstate. Removesfault, verifies signed status-confirmed orphan webhook through injectedfetchImpl, then retries identicalbusinesskey and comparesproviderrequest/orderidentity. Statusmockcall countasserted, preventing accidentaldefaultfetch from producing falsegreen. RSAkeys are generated transiently; onlyfake credentials, no liveprovidercall. Two nestedcontracts perkind separate identityretention and orphanpaymentacknowledgment; actualoutcome awaited.

Earlyaggregateteardown removesfixturetriggers/functions/accounts/pool. Local noattestation invocationexit1beforeDB/providerimports, syntax/diffPASS. Next35unique files/37phase-runtimeinvocations. Interpretfailureas modeled reliability evidence, neverreal duplicatecharge/loss. Updateexisting013/015 rather thancreate duplicateissue IDs; external latency/actualCOMMITfailure/liveproviderretrycontract still separateproof.


## 2026-10-12 — executed external checkout SQL rollback and orphan payment (new proof for existing 013/015)

Evidence: [audit run 38180374172](https://github.com/nora953/fawri-production-source/actions/runs/38180374172), job 114591512528; source test `artifacts/api-server/tests/billing-external-checkout-rollback-postgres.integration.test.mjs`. Disposable PostgreSQL, synthetic merchant accounts, injected fake provider POST and signed status GET; **no real payment or hosted DB mutation**. Both SaaS and cashier produced the same recorded structured outcome: `firstOrderRows=0`, `fakeProviderCreations=2`, `requestIdReused=false`, `orderIdReused=false`, `retryOrderExists=true`, `openTransactionAtProviderCall=true`, and `orphanWebhook={status:"ignored",reason:"order_not_found"}`. Assertions for identity durability/reuse and durable orphan processing failed. SQL P0001 was injected after fake external creation on provider reference attachment; rollback removed the first order, then same-key retry generated a new provider request/order identity. A signed, status-confirmed first-payment webhook was ignored because the order was missing.

**BILLING-EXTERNAL-TX-013 — CONFIRMED_SYNTHETIC_EXTERNAL_SIDE_EFFECT_GAP (SaaS + cashier).** Preserve provider-side request identity durably before network side effect, or implement safe recovery/lookup and deterministic same-key retry. Acceptance: no second external payment request after SQL failure; verified first provider payment remains discoverable and reconcilable; test concurrency, retries and crash/COMMIT boundaries.

**BILLING-WEBHOOK-ORPHAN-015 — CONFIRMED_SYNTHETIC_ORPHAN_ACK_GAP (SaaS + cashier).** Verified orphan webhook currently returns ignored/order_not_found rather than persisting recoverable work or issuing retryable failure. Acceptance: durable orphan reconciliation or retryable response, with signature/status validation and idempotent replay; no false paid entitlement. Actual provider settlement, production retry contract and real charges remain UNPROVEN.

These are additional proofs for existing canonical IDs, not newly numbered defects. Keep ten earlier functional/four parent failure counts separate; this new suite adds its own failed assertions/parents and must not be merged into the earlier SEQ-23 totals. Meta injected-provider, full-schema restore, Node22 HTTP and owned cleanup steps succeeded in this run; quality/security workflows succeeded, isolated PostgreSQL and isolated cashier workflows failed. Release remains BLOCKED.

## SEQ-29 — source-level root cause for existing 013/015 (2026-10-12)

Correlated actual CI run 38180374172 (132P/21F/0S) with source in the audited branch. `artifacts/api-server/src/services/saasBillingAuthority.ts` lines 509-510 open the SQL transaction; lines 609-626 insert pending order, lines 628-639 invoke `createSuperQiSandboxPayment` **before transaction commit**, and lines 640-653 attach the provider reference inside that transaction. `artifacts/api-server/src/services/cashierBillingAuthority.ts` lines 489-490 open merchant operational transaction, lines 610-637 insert pending order, lines 639-650 invoke the external provider **before commit**, and lines 651-664 attach the reference inside the transaction. An injected SQL P0001 on attachment rolls back the local order but cannot roll back the fake external payment; same-key retry creates another fake payment and the signed orphan event is ignored. This is the source-level explanation of existing BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015, not a separate defect ID. No app code modified.

Remediation design constraint for approved engineering work: avoid remote payment creation inside an uncommitted SQL transaction; first durably reserve a stable checkout/provider request identity, then call provider with safe idempotency and reconcile outcome after network failures; record/retry verified orphan payment events without granting an unverified entitlement. Test process crash, SQL attachment failure, concurrent same-key retries, duplicate webhook, provider timeout and sandbox settlement. Provider-side idempotency guarantees must be verified rather than assumed.

## SEQ-30 — retry identity loss traced (2026-10-12)

Additional source inspection: `saasBillingAuthority.ts:595-605` and `cashierBillingAuthority.ts:596-605` independently create a fresh `orderId` and `providerRequestId` using `crypto.randomUUID()` **inside** the transaction callback, then insert that identity only into the uncommitted order/metadata. A SQL rollback after the provider call loses those generated identifiers; a subsequent invocation with the same merchant/idempotency key regenerates different IDs. The existing duplicate-order lookup at SaaS lines 518-522 / cashier lines 498-505 cannot recover a row rolled back before commit. This is a second source-level causal link for canonical BILLING-EXTERNAL-TX-013 / BILLING-WEBHOOK-ORPHAN-015, consistent with the synthetic CI observation `requestIdReused=false`, `orderIdReused=false`, `fakeProviderCreations=2`. No actual provider idempotency semantics or real duplicate charge established.

Acceptance refinement: persistent same-business-key identity must survive DB attachment errors and process restart; checkout provider request identity must be stable across retries and independently reconciled against provider outcome. Avoid solving solely by catching 23505 or moving UUID generation outside the callback: neither alone durably records an external side effect. Add a test asserting stable IDs and exactly one fake external creation after fault/retry for both SaaS/cashier, then a provider sandbox contract test when authorized. This is source review, not a new test execution or code fix.

## SEQ-31 — SaaS SQL transaction lifecycle verified (2026-10-12)

Read the actual transaction helper in `artifacts/api-server/src/services/saasBillingAuthority.ts:171-184`: it issues `BEGIN` at 175, awaits its callback, issues `COMMIT` at 177 only after callback completion, and attempts `ROLLBACK` at 180 on callback errors. Checkout callback starts at line 509 and awaits external `createSuperQiSandboxPayment` at 632 before returning at 659-668. Thus the external call is definitively made while the local transaction is uncommitted; provider success followed by SQL attachment error enters rollback. This confirms the transaction-boundary mechanism for existing BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015, beyond test-only inference. Cashier checkout similarly calls provider within `withMerchantOperationalTransaction` callback (489, 643); its wrapper internals were not separately inspected in this step. This does not prove real provider settlement or duplicate charging.

Engineering handoff: approved repair should separate durable order reservation and remote side effect with stable provider request identity, then persist attachment/reconciliation with replay-safe webhooks. Preserve atomic merchant entitlement changes and do not prematurely mark payment paid. Re-run fault-injection and concurrency regressions for SaaS and cashier; check provider sandbox idempotency separately. No source mutation or test run in SEQ-31.

## SEQ-32 — cashier transaction wrapper verified (2026-10-12)

Inspected `artifacts/api-server/src/services/operationalPostgresAuthority.ts:68-84`: `withOperationalTransaction` executes BEGIN at 74, awaits callback at 75, COMMIT at 76, and ROLLBACK on error at 79. `withMerchantOperationalTransaction` at 86-105 delegates to that helper and sets transaction-local `fawri.tenant_id` at 99-102. `cashierBillingAuthority.ts:489` invokes that merchant wrapper, creates pending order at 608-637, calls external `createSuperQiSandboxPayment` at 643-650, and only then attaches provider reference at 651-664. Therefore cashier checkout, like SaaS, performs external provider side effect **before SQL COMMIT**; rollback cannot undo it. This resolves the wrapper-inspection caveat from SEQ-31. Tenant setting itself is not the root cause and must be retained when restructuring transactions.

Confirmed code-level scope of canonical BILLING-EXTERNAL-TX-013 / BILLING-WEBHOOK-ORPHAN-015 now covers BOTH checkout transaction wrappers. Preserve tenant-scoped DB access and order authorization in any future repair; separately durable checkout identity, remote request and webhook reconciliation. Existing synthetic test run 38180374172 provides behavior evidence; SEQ-32 is source review only, not new test or live provider settlement. No application source edits.


## SEQ-109–113 — actual sync caller, replay and recovery audit (2026-10-12)

Baseline: audit head `23563ffba019a666e3d2f61f29769723d56b7e03`, main `d38d29229bed0f9575a98e7026e7819fe363bfd4`. Full local checkout search replaces the earlier failed GitHub search; production integration is present. Reopened runtime scope is justified because SEQ-107/108 established only envelope declarations. No application code was changed.

| ID | Phase / classification / severity | Evidence and reproduction | Release consequence / proposal / acceptance / state |
| --- | --- | --- | --- |
| CASHIER-SYNC-SEQUENCE-001 | SEQ-111 / PROOF_GAP with mocked behavior reproduced / HIGH recovery priority | `artifacts/api-server/src/services/cashierHistoricalOperationAuthority.ts:295-317,380-399`: reject sequence <= latest, but accept higher sequence with gaps. Real function bodies under in-memory query adapter: accept1, accept3, reject2 with CASHIER_OPERATION_SEQUENCE_CONFLICT. Test `runtime observation: sequence gap accepted; later missing operation cannot backfill` in `scripts/fawri-sync-audit.test.mjs`. | Cannot certify late missing-operation recovery or gap detection. Gaps can represent intentionally non-uploaded local inventory adjustments, so do not blindly demand contiguous sequences. Define explicit commerce gap/tombstone contract, durable missing-operation recovery and bounded reordering; preserve unique merchant/device sequence and replay protections. Required disposable PostgreSQL proof:1→3→2, initial sequence>1, skipped non-commerce operation, concurrent requests, rollback, exact replay and altered replay. OPEN; no SQL/device incident reproduced and no fix made. |
| CASHIER-SYNC-SHIFT-001 | SEQ-110/112 / PROOF_GAP with client rejection reproduced / HIGH recovery priority | `artifacts/fawri/src/lib/cashierOperatorCloudSync.ts:783-803` compares pending binding to current merchant/station/staff/shift/device; mismatched shift rejects before fetch. Runtime adapter proves same staff/device/station with previous shift leaves outbox intact, uploads0. Server historical resolution exists at `cashierOperatorCommerceAuthority.ts:200-255,489-550`. | Recovery after expired/admin-closed session or switching operator not established; first rejected group aborts remaining upload. Important mitigation: normal `cashierOperatorSessionRuntime.ts:647-658` logout forbids closing shift with pending envelopes. Thus no claim that ordinary logout strands data. Propose explicit authorized historical-upload recovery preserving original attribution, or enforce/recover session transition with pending operations. Never rewrite bindings to the new operator. Required real-browser + disposable HTTP tests: expiry, admin closure, PIN/session restoration, staff change, old-shift sale/return/void, attribution-fault retry and cross-tenant denial. OPEN; product defect status awaits feasible lifecycle reproduction. |
| CASHIER-OFFLINE-001 (existing) | SEQ-113 / existing SECURITY_DESIGN_DECISION, bounded runtime observation / HIGH integrity priority | `cashierOfflineEntitlementAuthority.ts:111-141` validates structural fields and grace>billing end, without signature. Actual `validAuthority` accepts a structurally valid record whose grace_until is edited to2036. Actual clock helper rejects >120000ms rollback and preserves durable last_estimated_server_time_ms after restart model. | This proves structural acceptance, not full POS authorization bypass or tamper-resistant licensing. Preserve existing ID. Server-signed certificate, device/merchant binding, trusted time/reconnect and threat model need explicit design approval. Test altered expiry/version/seat/identity/signature, exact7day boundary, offline restart/clock changes and real browser storage before closure. OPEN; unchanged application. |

**Existing mitigations now bounded-runtime verified (not issue closure):**
- Server sale replay compares normalized request_hash, operation/device/sequence/location before inventory (`postgresCashierSyncAuthority.ts:1291-1320`). Actual function plus mocked DB: identical sale replay has0 inventory mutation; changed note and coherent changed quantity/totals reject409; cross-tenant mismatch rejects before transaction. This does not close earlier local IndexedDB replay-content concerns.
- Actual operator uploader checks complete ACK fields/entities before local deletion (`cashierOperatorCloudSync.ts:676-738,805-818`). Six invalid ACK variants and network ambiguity retain pending operation; accepted first operation remains deleted when second rejects; complete replay ACK deletes once. Actual IndexedDB durability, power-loss between response and deletion and real HTTP remain untested here.
- Cross-device stock uses product/variant/location row locks and current-version guarded updates (`postgresCashierSyncAuthority.ts:762-817,890-972`) within tenant transaction; device advisory lock at1254-1257 protects same-device operations. No new simultaneous multi-device execution performed. Reversed multi-item order/deadlock recovery, last-stock competition, sale-vs-return and compensation replay require disposable DB tests; do not infer correctness from locks alone.

**Prior observations retained without duplicate IDs or repeated testing:** local sale/compensation changed-payload replay (SEQ-93/94 and preceding PR notes), cached closed IndexedDB connection after versionchange (SEQ-99/100). Both remain source-confirmed observations needing actual browser proof. Existing current CI historical/compensation service tests pass; they do not cover these local browser scenarios.

**Test interpretation:**27/27 new audit observations/controls PASS,0FAIL/0SKIP on Node24.19.0;18/18 existing source-contract assertions PASS. The observation tests deliberately assert current problematic behavior; green means reproducible evidence, not repaired product. Imports are replaced by inert mocks before executing stripped committed function bodies. No DB or provider imports/network, no native IndexedDB, no browser proof. Playwright launch refused because bundled Chromium executable is absent: ENVIRONMENT_BLOCKED, not an application test failure.


## SEQ-114a / SEQ-115 — new execution classifications

CASHIER-SYNC-SEQUENCE-001 now has actual disposable PostgreSQL observation: run38194961047/job114635479479 on d0be9ea3; accept1→3, reject2. State remains OPEN / PROOF_GAP until intended skip/backfill contract and safe recovery accepted. Multi-device suite did not prove stock correctness: loser rejected DEVICE_AUTHORITY_REQUIRED before contention; timestamp fixture corrected with both-device historical preflight, runtime CI_PENDING.

**TEST-RECOVERY-TAMPER-001 — TEST_FIXTURE_DEFECT / corrected, integration verification pending.** Existing `merchant-password-recovery-postgres.integration.test.ts:238-245` changed final Base64url tag char, producing same decoded tag bytes when original endsA. First run password proof0PASS/1FAIL, HTTP200 vs401. Actual codec local test proves alias acceptance and rejects64provably changed tags; no cryptographic bypass established. Test-only correction changes first tag char and asserts decoded-byte inequality. User authorized safe tests; application codec unchanged. Required closure: corrected disposable HTTP tamper/replay/concurrent-reset testPASS plus cleanup. Local harness29PASS; actual updated SQL/HTTPCI_PENDING.

**CASHIER-SYNC-SHIFT-001 scope refinement (SEQ115 source):** login reuses an open same-staff shift (staffAuthority1547-1606); expired local session parsing alone does not demonstrate data stranding. Normallogout/pairing blockpending operations; disabling/revokingstaff orstation closes shift580-617,831-840. Currentoperator authentication still needed even on historical-sync routes. Test actualdisable/re-enable/adminclose with pending originalbinding before declaring a defect. No normallogout/sessionexpiry-only defect or issueclosure claimed.


## SEQ-114 real service proof verified; recovery fixture follow-up

Sourcebc8ca369, run38195395321/job114636790344:134PASS/22FAIL/0SKIP. New multi-device suite3PASS: four last-stock races, concurrent replay/no duplicate mutation, altered-note conflict, loser rollback/retry and SQLgap observation. Exact boundaries and evidence inEXECUTION_RESULTS. Extra recovery failure was duplicatefirst variable introduced in test correction; renamedtagFirstCharacter, full-file transformed syntaxPASS, actualHTTPretestawaited. Existing21product failuremarkers remain. ReleaseBLOCKED; no applicationchange. Exactresume: inspect newcommitrecovery/runcounts/cleanup before feasibleclosedshift/browserproof. WORK_HANDOFF andISSUES preserveopen scope; local29runtime/18sourcePASS, no browsercertification.


## Final SEQ-114/115 adjudication

Source0d5b9ef8, run38195697724/job114637714590:135PASS/21FAIL/0SKIP. **TEST-RECOVERY-TAMPER-001 CLOSED / VERIFIED_TEST_FIX**: actual corrected disposable HTTP recovery suite1PASS, including byte-changing tamper rejection/replay/concurrent reset/session revocation; no application crypto fix or bypass found. Earlier duplicate-variable transform error was a test-only agent error, corrected and verified.

**CASHIER-SYNC-SEQUENCE-001 remains OPEN / PROOF_GAP** with actual SQL1→3→2 observation. Final-stock concurrency/replay subset now VERIFIED_ISOLATED_SERVICE_PASS (new suite3PASS over four races), not blanket sync correctness. **CASHIER-SYNC-SHIFT-001 remains OPEN / PROOF_GAP**, narrowed by normal logout/pairing/open-shift reuse safeguards; feasible closure recovery not executed. **CASHIER-OFFLINE-001 remains OPEN**; no signed licensing/browser certification.

Existing application findings FA-I-006 / BILLING-IDEMPOTENCY-012 / BILLING-EXTERNAL-TX-013 / BILLING-WEBHOOK-ORPHAN-015 / REPLY-RESTORE-CYCLE-018 / BILLING-LATE-EXPIRED-027 / BILLING-PAID-REPLAY-028 / BILLING-SQL-RECONCILIATION-032 remain unresolved. No new duplicate issue IDs. Twenty-one failed markers represent fourteen functional failures and seven parents. Closing these requires approved application repair and targeted regression, not further repeated source review.


### CASHIER-SYNC-SHIFT-001 — SEQ116 prepared proof

Guarded real HTTP recovery test saved, executionPENDING. Covers disable/re-enable administrative service closure (staffAuthority713–843), current-token middleware vs historical original attribution (cashierStaffSession134–183,commerceAuthority200–255/489–519), exact replay and no extra stock/order. Client binding checkcashierOperatorCloudSync783–803 remains independently reproduced; server success alone cannot close client recovery finding. No ordinary logout/expiry-only defect claimed. Local syntaxPASS/guard refusalPASS; no local SQL/browser assertion executed. Audit-only user directive: complete remaining coverage before preparing consolidated repair plan or changing application.


**SEQ116 first-run test classification:** source8d3f4888, cashier38197881066/job114644536563, new HTTPsuite0PASS/1FAIL. Historical-saleHTTP200/originalattribution/HTTP200replay precede failingassertion156; nonexistent`duplicate` instead of actual`replayed` field is fixture error. Correctedfixture awaits end-state proof; do not call recovery finding closed. Client mismatch stillOPEN.

**SEQ117 preparation:** native Chrome tests preserve priorSEQ93/94 changed-payload replay andSEQ99/100 cached-handle observations without duplicate IDs. Actual browserNOT_RUN; assertions and limits in register. Browser-storage source scanner is not a native IndexedDB test.


## Current SEQ-116–119 findings and classifications

| Finding | Evidence / classification | Impact / acceptance / status |
| --- | --- | --- |
| CASHIER-SYNC-SHIFT-001 (existing) | SEQ116 actualSQL/HTTP1PASS onb68d24e9,run38198172739/job114645417825; disable/re-enable administrative service createsnewshift; historicalsale andexactreplay preserveoriginal attribution. ClientcashierOperatorCloudSync783–803 and mocked prior-shift rejection remain. Loginruntime468–571 accepts/restoresnewcontext without pendingtransitionguard. | ServerboundedrecoveryVERIFIED_PASS; client recoveryOPEN/HIGH. Feasibleclosure nowproven, butfullbrowserlogin/outboxflow stillNOT_RUN. Do notrewriteoldbindings. Required: realclient recovery afteradministrativeclosure, crossstaff/tenant/currentpermission andhistoricalreturn/void, attributionfaultretry. Normal logout/pairing safeguardsunchanged. |
| SEQ93/94 local changed-payload replay (existing observation, indexed here without duplicate finding) | SEQ117nativeChrome154,run38198172776/job114645417274: sameoperationID/quantity1→2 acceptedreturnsoldsalequantity1. cashierIndexedDbAuthority573–635 replay bypassescomparison. Harness1functionalFAIL; finalstock controls andpending persistencePASS. | CONFIRMED_NATIVE_BROWSER_DEFECT/OPEN,HIGH operationintegritypriority. No doublededuction orfinancialloss demonstrated. Acceptance: exactreplay succeedsunchanged; changedvaliditem/quantity/payment/discount/note rejectsconflict beforemutation; simultaneoussamekey behavior remainsdeterministic. No repairperformed. |
| SEQ99/100 versionchange cached-handle (existing observation) | Nativeupgrade2→3 closesauthority handles; existing objectreadInvalidStateError; pendingrecords2survive; newoldv2authorityVersionError. cashierIndexedDbAuthority211–242,391–426 cachesresolvedDBpromise andonlyclosesonversionchange. | Nativeclosure/data-preservation observed; compatibleapp lifecycle/restart recoveryOPEN. OldschemaVersionError iscorrectfailclosedbehavior, not evidence thatsamev2client shoulddowngradev3. No datalossclaimed; requiredcompatibleupdatedapprefresh/blockedupgrade/inflighttransaction/browserrestart assertions. |
| REPORT-EXPORT-CURRENCY-001 (new) | SEQ118CONFIRMED_FUNCTION_RUNTIME_DEFECT/OPEN,MEDIUM reportsaccuracy. ReportsPage.tsx959–987 storesrawnet_revenue_minor thenexportsrow.cashier/online/sum withoutfractionmetadata; UI826–829/1072–1078 usesmoneyUi65–83 scaling. ActualexportclosureUSD12345vsdisplay123.45,KWD-1050vsdisplay-1.050; scripts/fawri-report-export-audit.test.mjs4PASS/2FAIL. | Foreigncurrency combinedExcel export is100×/1000× differentlyscaled fromUI; IQDdigits0 controlPASS. No corruptionofserveraccounting/paymentdemonstrated. Release impact: unclosedmulticurrencyreportacceptance, notclaimthatIQD-onlyexportfails. Requiredfuturefixacceptance: display/exportsameunits, explicitminor-unitcontract ifneeded, positive/negative/zero fractions0/2/3, separators/AR/EN/KU, actualXLSXopen/render andPDFcomparison. Consolidatedrepairplan deferreduntilauditcomplete. |

SEQ116 fixtureduplicate→replayed assertionCLOSED by actualHTTPPASS. Existing8productfinding21failmarkers remainOPEN andseparate fromnative1FAIL/report2FAIL evidenceclasses. No functionalapplicationfix. Coverageinventory lists37routesNOT_RUN withoutimplyingroleauthorization orallnestedmodals coverage.


## SEQ-120 bounded adjacent cashier export follow-up (2026-10-12)

Extended existing REPORT-EXPORT-CURRENCY-001 to actual centralcashierdownloadclosure. `CashierCentralReportsPage.tsx533–590,617–630` exportsrawminor net/profit/refund/average/product/operationamount under ordinary value/amount labels; liveview`formatReportMoneyMinor`169–177/235–236 scalesbycurrencydigits. NewcapturedcentralUSDsummary12345vs123.45FAIL; IQDsummaryandlimited-operationnoticePASS. Topproduct/operation scaling is SOURCE_REVIEW_ONLY, not separately executed. No duplicateissue.

Final`node --test scripts/fawri-report-export-audit.test.mjs` onNode24.19.0: **5PASS/3FAIL/0SKIP**,8tests. Threefailures=onecurrency-scale finding. InitialSEQ118six-test4/2 result is historical and superseded by this expanded sameharness8-test5/3 result; no homogeneousaddition toSQL136/21 ornative3/1. RealZIPgeneration/XLSXofficeopen,PDFpagination andvisual comparison remainNOT_RUN. Noapplicationchange.

**Current definitive continuation:**SEQ116–120 bounded workcomplete; nextSEQ121 actualworkbookZIP/consumer andPDF/range/completeness assertions, plusclosed-shiftreturn/void/currentpermission/crossstaff/tenant HTTPnegatives.37routeinventory remainsNOT_RUN forappjourneys. Sameexplicituserconstraint: completecomprehensiveaudit before consolidatedrepairplan; historicalpaymentproposalnotcurrentqueue. Allnoteddefects preserved, no repairs. Overallplanning~52%,48%remaining(40–60%uncertainty), releaseBLOCKED.


### SEQ-122 existing CASHIER-SYNC-SHIFT-001 follow-up prepared

`cashierOperatorSaleScope.ts:112–139` rejects own-staff compensation for an original sale outside the current shift, while `sale.view_all` bypasses the staff/shift comparison inside the same station/device. Routes `cashier-operator-commerce.ts:184–230` apply this check before historical compensation ingestion. Guarded actual HTTP proof prepared for both return and void; results pending. Historical pending operations vs newly initiated cross-shift actions need separate acceptance decisions after audit. No new duplicate issue or permission-policy defect declared solely from this source review.


## SEQ-121 verified; SEQ-122 bounded HTTP verified; SEQ-123 print prepared

Executed source `75c53d2b57c45a1f120d55c0a2904be3b16cbcb9` (PR head); workbook checkout merge SHA `c77747bff61be95c911321096182b1257feab93c`. Workbook run38199810989/job114650490522 SUCCESS: actual SheetJS0.20.3 ZIP writer and reader, 4240 bytes, six package parts. Independent Python ZIP CRC/all XML/Arabic-Sorani text/RTL/merge/filter/numeric0-negative/formula-as-string assertions PASS. DOM download is inert; no Office visual/PDF or actual report totals claim. Existing currency-scale finding remains OPEN.

Cashier subset run38199811297/job114650491045: new historical compensation suite1PASS. Both valid return and void of original-shift sale receive403/CASHIER_OPERATOR_SALE_SCOPE_FORBIDDEN from same-staff sale.view_own after closure; after synthetic manager sale.view_all grant and fresh login, HTTP200, complete ACK, original shift/session attribution, exact replay/no second inventory increment and stock1 PASS. This confirms documented own-shift scope and a historical recovery limitation, not unauthorized permission bypass. Current permission required for replay; broader cross-staff/tenant and missing-action-permission negatives still untested in this new suite. Owned cleanup step SUCCESS. Full aggregate must be read from isolated run38199810864 logs before recording totals.

SEQ-123 PREPARED: `scripts/fawri-report-print-audit.mjs` and minimal workflow. Extract actual online report presentation components/helpers (before useOnlineReport), compile with real React and actual translation/money modules; compile actual frontend CSS through Vite, then fresh headless Chrome renders AR/EN/Sorani synthetic report props and prints PDF. Assert nine metrics, last of eight products, nonempty first page and bounded page count through pdftotext. No HTTP/API/DB/provider imports or report data fetch; loopback CSP blocks external webfonts, so system fallback-font layout only. No full app/mobile/linguistic signoff or production font claim. Local syntax PASS; Chrome/build dependencies absent locally. Print assertions NOT_RUN pending CI.

Next inspect print and isolated aggregate logs; then report date-boundary/completeness and cross-tenant/action-permission negatives. Comprehensive audit only; no application repairs or consolidated repair plan. Planning estimate remains ~52% until the new target proof is assessed.


## SEQ-123 fixture correction; SEQ-124 calendar proof

First print run38200106257/job114651400190 on source43f64c6c: all three locale render waits timed out, so no PDF assertions executed or success claimed. Test extraction removed original Recharts imports but components use PieChart/ResponsiveContainer/Cell. Test-only entry corrected to import actual Recharts, with retained browser error diagnostics and actual SVG readiness assertion. This is an identified harness dependency omission, not an established application defect. Actual print rerun pending. No chart stubs or application edits.

SEQ-124: `node --test scripts/fawri-report-calendar-audit.test.mjs`, Node24.19.0,6PASS/0FAIL/0SKIP. Executes actual ReportToolbar date-query bodies in child processes with explicit TZ: Baghdad leap day/exclusive end, New York23h spring and25h autumn days,7-day preset includes today+6previous dates across DST, year-end advancement, all-time unrestricted. No React/browser/API or database execution; existing local-sale range tests are not repeated. Confirms local-browser timezone contract only, not merchant-timezone normalization or malformed-date validation.

Read completed isolated run38199810864/job114650489926: **137PASS/21FAIL/0SKIP,38unique files/40invocations**; new historical return/void suite1PASS. Existing14functional/7parent failure markers unchanged. Workbook producer/parser PASS previously saved; currency-scale finding remains OPEN. Next inspect corrected real-component print logs before further coverage or final status.


## SEQ-123 cleanup classification; SEQ-125 HTTP negative proof prepared

Print rerun38200387912/job114652264539 on f303575d reached browser execution after restoring real chart imports but did not emit evidence: removal of the temporary Chrome profile failed ENOTEMPTY while a Chrome descendant was still writing. No PDF pass/fail inferred from the lost summary. Test-only lifecycle corrected to own a detached process group, terminate all its descendants and retry bounded profile removal; cleanup failure remains visible in the final result and cannot produce green. Actual render/PDF assertions must be reread from a completed rerun. This is a test-resource cleanup failure, not an established app defect.

SEQ-125 PREPARED: extend existing guarded historical compensation HTTP fixture for each return/void with an actual second licensed tenant/manager denied403; remove current action permissions through staff service and fresh login then replay denied403; administrative closure plus a distinct same-tenant cashier with action+view_own denied403. Require no order in other tenant, unchanged original attribution count2 and restored stock1. This adds real boundary assertions missing from prior mocked tests, so rerun is justified. Local syntax PASS; SQL/HTTP pending CI. No hosted grants/DB or business behavior changed.

No change to verified SQL137/21, workbook package PASS, local calendar6PASS, prior native3/1 and export-input5/3 evidence. Do not count repeated unchanged assertions as progress. Next inspect corrected print and new denial logs, then finish bounded report completeness/source budget coverage. Audit first; repairs and consolidated plan deferred.


## SEQ-125 bounded HTTP verified; SEQ-126 completeness proof; print root correction

Source744372b4, cashier subset38200568005/job114652821787: new HTTP suite1PASS. For both historical return and void, actual second licensed tenant403, current action permission removed/fresh login403, distinct same-tenant staff view_own403; original stock1 and two attribution records unchanged, other tenant has0orders. Normal privileged historical recovery and replay remainPASS. Full aggregate awaits run38200567769 log reconciliation. These are actual disposable service/HTTP proofs, not hosted-role certification.

SEQ-126: `node --test scripts/fawri-report-completeness-audit.test.mjs`, Node24.19.0,4PASS/0FAIL/0SKIP. Actual function bodies with explicit inert SQL adapters: financial report requests50001 rows and rejects over50000 with413 rather than silently truncating totals; empty report explicitly0sales; activity detail500 can expose matching_count750; UI warning uses filtered matching count and does not incorrectly flag a30-of30 filtered set. No actual50000-row load, SQL window/paging, browser warning or Excel/PDF full-detail clearance. Existing source range/filter join remains separately source-only.

Third print run38200567854/job114652821367 on744372b4 emits locale failures at visible product text beforePDF generation. CSS reports-print89–125 hidesbody elements unless inside report-print-root; extracted-component fixture lacked this actual outer ReportsPage wrapper. Added existing report-print-root class to synthetic fixture DOM; applicationCSS unchanged. Prior dependencies/profile errors resolved enough to get this diagnostic. Real corrected PDF result pending; no app defect or print pass inferred.

Next inspect print/PDF first-page/text evidence and aggregateSQL result. No consolidation of repair plan/application changes; continue whole scope after this bounded report batch. Planning estimate stays~52% pending usable print evidence.


## SEQ-123 fourth result and stricter metric diagnostic; SEQ-127 query-budget source gap

Print run38200769264/job114653461100 on fa2f5968: actual-component PDFs EN and Sorani PASS, each2nonempty pages,9metrics,lastchartproduct present (EN81562bytes, firstpage1869characters; KU157941bytes, firstpage2285characters). Arabic reached PDF/text checks but failed a broad body.innerText numeric substring assertion. Actual original Arabic formatting function locally returns`٦٩٧,٩١٠ د.ع` correctly; no app defect inferred yet. Test now checks each actual revenue-card DOM text value with explicit Arabic/extended-Arabic digit normalization and requires exact697910; diagnostic emits synthetic metric strings if it fails. This is a stronger targeted value assertion, not removal of a failed numeric check. Printed numeric glyph placement is still outside text-only consumer clearance. Corrected AR assertion/PDF summary awaits CI; no all-language success claimed.

**REPORT-QUERY-BUDGET-001 / SEQ-127 / SOURCE_CONFIRMED_PROOF_GAP / OPEN MEDIUM:** `cashier-staff-operations.ts:160–177` launches finance and activity report transactions concurrently. `postgresCashierCentralReportAuthority.ts:1179–1237` caps returned affected sales50001; `postgresCashierCentralActivityAuthority.ts:281–340` computesCOUNT(*)OVER before detailLIMIT500. Neither sets an explicit statement deadline; `operationalPostgresAuthority.ts:68–105` does not add one; `lib/db/src/index.ts:20` configures only connectionString. Contrast online report`postgresOnlineOrderReportAuthority.ts:185–193` uses8second SET LOCAL statement_timeout. Row caps are not query-time budgets. Actual database/URL/global role timeout settings and observed slow-load behavior are unknown: no live unbounded query or DoS demonstrated. Launch implication: cashier reporting performance/resource-budget acceptance unverified at large tenant volume. Required proof: guarded disposable large-tenant/lock-contention test with measured bounded response, rollback/release, pagination/completeness and production-like configured timeouts. No application/config changes or repair plan.

SEQ125 actual HTTP denials already PASS in dedicated cashier subset. Some intervening full runs cancelled on new commits; do not report incomplete aggregate as137/21 proof for a new source. Authoritative aggregate remains executed75c53d2b/run38199810864/job114650489926 until a later complete run is inspected. Next read latest print and completedSQL logs; save exact final resume.


## SEQ-123 Arabic fixture charset diagnosis and correction

Fifth print run38201039466/job114654293191 (sourcee05f9701) confirms English/Sorani2-page PDF PASS but Arabic DOM monetary values contain onlycurrency labels, while Arabic integer counts are correct. Original Arabic formatter locally yields correct697910; the test HTTP fixture omitted charset on HTML/JS and omitted meta charset. This can decode raw non-ASCII regex ranges differently from escaped string literals in the esbuild bundle; `formatArabicIqd` uses rawArabic digit range to recover ASCII before grouping. Actual application `artifacts/fawri/index.html` andcashier.html explicitlydeclare UTF-8. Test-only fixture now matches that contract: HTMLmeta andHTML/JS/CSS Content-Type charset=utf-8; assert document.characterSetUTF-8 and retain exact revenue-card value check. Hypothesis must be confirmed by a successful corrected browser run; no Arabic application defect declared yet, no numeric assertion removed. Printed glyph positioning still not visually certified. Next inspect this corrected print run and completed aggregate before saving definitive handoff.


## FINAL VERIFIED SEQ-121–127 checkpoint — 2026-10-12

Executed PR head **e1320f8616b5607536c19b6527c92e8c74bf546e**; no application source changes in this continuation. This supersedes the intermediate prepared/failed-fixture notes only for the bounded assertions below.

| Stage | Evidence | Verified outcome and limits |
| --- | --- | --- |
| SEQ-121 workbook package | run38199810989/job114650490522; repeated unchanged producer run38201278452 SUCCESS | Locked SheetJS0.20.3 actual ZIP writer/reader plus independent Python CRC/XML parser PASS. Six package parts; AR/Sorani text, RTL, merge/filter,0/negative numbers and formula-as-text. DOM download inert; no Office visual or actual accounting clearance. Existing REPORT-EXPORT-CURRENCY-001 OPEN. |
| SEQ-122 historical compensation | run38201278470/job114655029862, new suite1PASS | Two independent return/void fixtures: same-staff view_own403 after original shift closure; manager view_all200 and original historical attribution, complete ACK, replay/no duplicate stock restore. This is policy/recovery evidence; own-shift historical recovery gap remains OPEN. |
| SEQ-123 actual online report print | run38201278442/job114655029719; checkout merge4a31b6150cceaec1efec5bc0ff4d3f571d807d21 | Chrome154.0.8037.97, real React/Recharts report components/helpers/translations and Vite CSS; AR/EN/Sorani **3PASS/0FAIL**. Each2nonempty pages,9metrics, exact revenue697910 in card, last of8products present in PDFtext. AR186462bytes/firstpage2359characters; EN81573/1869; KU157941/2285. Synthetic props, loopback/system fallback fonts, no full app/API/mobile or linguistic/visual signoff. |
| SEQ-124 date query | node --test scripts/fawri-report-calendar-audit.test.mjs; Node24.19.0 |6PASS/0FAIL: Baghdad leap/year-end boundaries, NewYork23h/25h DST days,7local-day preset/alltime. Actual function bodies; no HTTP/DB/browser-calendar proof. |
| SEQ-125 HTTP denials | run38201278470/job114655029862 | For return and void: real second licensed tenant403, missing current action permission403, distinct same-tenant cashier403; stock1/attributions2 unchanged and other tenant0orders. Default disposable role only, not live RLS/grants certification. |
| SEQ-126 completeness | node --test scripts/fawri-report-completeness-audit.test.mjs; Node24.19.0 |4PASS/0FAIL with inert SQL adapters:50001 financial rows cause413 rather than silent truncation; explicit0emptyreport;500activity details preserve750matchingcount; filtered30-of30 does not show false truncation warning. Actual large-data SQL/performance NOT_RUN. |
| SEQ-127 cashier query budget | ISSUES.md REPORT-QUERY-BUDGET-001 | Source-confirmed lack of explicit application deadline in two concurrent cashier report transactions. Database-level timeout settings and load behavior unknown; MEDIUM/OPEN performance proof gap, not demonstrated live DoS. |

**Final isolated SQL/HTTP aggregate:** run38201278470/job114655029862, **137PASS/21FAIL/0SKIP**,38unique files/40invocations. Existing21markers remain14functional+7parents for8existing application findings; no app defect repaired. Actual new suite and all three denial classes PASS. Owned cleanup, full-schema restore, injected Meta54, password recovery and Node22 HTTP PASS. Quality38201278432/security38201278488/schema38201278456 SUCCESS. The overall isolated and cashier workflows remain FAILURE because canonical product defects remain; green new tests do not override them.

**Print fixture failures correctly classified and resolved:** missing actual chart imports, missing original print-root wrapper, browser descendant/profile cleanup, and omitted UTF-8 declaration. Corrected harness retains actual chart/PDF/metric assertions, owns browser group and removes profile before result. Source app index.html/cashier.html already declare UTF-8. Local `node --test scripts/fawri-report-print-fixture.test.mjs`2PASS reproduces wrong decoding of raw Arabic regex (blank monetary number) and correct original UTF-8 output; corrected real browser3PASS confirms fixture diagnosis. Earlier failed runs remain history, not product defects or success. No old failed result silently overwritten.

**Open product/gate scope:** existing billing/Meta/refund defects; local changed-payload replay; unsigned offline cache/licensing and actual7day/device proof; current-shift historical outbox/own-scope recovery; foreign-currency export units; cashier query budget; actual central-cashier/receipt/mobile/PDF visual and37route role journeys; hosted grants/image/media/PITR/monitoring/rollback; real external providers and commercial signoff. All repairs and consolidated repair plan remain deferred until comprehensive audit completion.

**Definitive next SEQ-128:** bounded central-cashier report/receipt print and profit-visibility scope, separating genuine app role/PDF evidence from inert adapters. Then unverified owner/admin/merchant screen groups from the37route inventory. Reuse completed sync/compensation/workbook/date proofs; reopen only for changed code/config or a new justified assertion. No merge/deploy/live DB/secrets/real payments authorized.


### CASHIER-REPORT-PROFIT-001 — SEQ-128 candidate, runtime proof pending

Component: operator report API. Paths: `postgresCashierOperatorReportAuthority.ts:59–72,175–189`, product fields in `postgresCashierCentralReportAuthority.ts:936–1014`; actual route GET/cashier/operator/report requires reports.sales. Source candidate HIGH permission/data-confidentiality impact: currency-level redaction leaves nested profits/ranking. Guarded HTTP with known-cost positive control prepared. Not yet a confirmed HTTP incident; actual live role/provider/staging not tested. Required acceptance: withoutreports.profit no aggregate/nested profit/cost-derived confidential/ranked data in serialized response; authorized grant retains intended values; own/all-staff and merchant/station boundaries preserved. Consolidated remediation plan deferred. OPEN/PREPARED.


### CASHIER-REPORT-PROFIT-001 — SEQ-128 CONFIRMED_ISOLATED_HTTP_DEFECT / HIGH / OPEN

Source4ec5944e; run38203123023/job114660651958 and cashier38203123335/job114660652754. Real paired cashier permission reports.sales+sale.view_own, withoutreports.profit, getsHTTP200/can_view_profit:false while `report.by_currency[0].top_products[0].gross_profit_minor=500` and top_profitable_products exposes same amount and profit ranking. Currency-levelgross_profit correctlyabsent; known revenue1000/netunit1 permits inference of500cost. Explicitreports.profit grant positivecontrol passes. Two functional failures and parent are one finding, not three.

Paths `postgresCashierOperatorReportAuthority.ts:59–72,175–189`, nestedprojection `postgresCashierCentralReportAuthority.ts:936–1014`, GEToperatorreport `cashier-operator-commerce.ts:100–119`. Impact: authenticatedstaff sees commerciallyconfidentialprofit/ranking outsideexplicitgrant; no anonymous orcross-tenant disclosure established. Releaseblocker for permission/financial confidentiality acceptance. Required futureacceptance: recursive response redaction/no profit-rankedlist withoutgrant, authorizedaggregate/products retainvalues, own/allstation/tenant/cost privacy boundaries remain. Statusunrepaired; consolidatedrepairplan deferreduntilauditcomplete.


## SEQ-129 native receipt verified; SEQ-130 CSS fixture correction; SEQ-131 admin UI authority

Source262ee63e, receipt run38203617345/job114662158918 SUCCESS: Chrome154, **6PASS/0FAIL**, AR/EN/Sorani×58/80mm, each1PDFpage. Exact2400total, correct bodywidth/nohorizontaloverflow, lastitem/saleID present, reprint marker, no privatecostsentinel, no activeimage/script/iframe and injectedmarkerfalse. Original hostile labels are escaped. Physicalprinter, actualiframe/printdialog cleanup andfullPOS flow NOT_RUN. First bootstrap-script artifact resolved by replacingdocument afterload; producerunchanged.

Central report run38203617325/job114662159017 failed beforebrowser: esbuild needs an outputpath for actualReportToolbar importedcalendarCSS. Test bundle now sets logicaloutfile withwrite:false and explicitly servesJSoutput; actual stylesheet still comes from VitecompiledCSS. No app/component/CSS edits and no browser assertions counted as failures. Corrected actualreactivecentralreport/PDF/empty/error-period-recovery suite pendingnewCI.

SEQ-131 `node --test scripts/fawri-admin-ui-authority-audit.test.mjs`, Node24.19.0, **10PASS/0FAIL/0SKIP**. Actual hasAdminPermission andcontrollercapability/refreshcallback bodies with inertstate/HTTPadapters: owner allsurfaces, mandatorypasswordchange gatesall, logs-onlyassistant cannotmanageadmins/merchantdata, missingadminclosed;401/403 clearscachedowner evenpreserve option; successful serverowner→assistantdowngrade closesownercontrols;503preservesUIidentity onlyexplicittransientpreserve;initial503/malformedresponse clearsidentity andloginredirect. No Reactmount/realadminHTTP/cookies/backendpermission/15secondrefresh/browser visual clearance. The old localStorage-auth TODO atcontrollerheader is stale commentary; current authority calls server/api/auth/admin/me; do not labelit a currentbearertoken exploit. Prior source-contract authcutover tests notrerun.

Newprofitdisclosure remainsHIGH/OPEN; prioraggregate138/24 reused fromexecuted4ec5944e. Next readcorrectedcentralnativeproof andfullaggregate before finalcheckpoint; continue owner/admin/merchant scopes. Noapplicationrepair/consolidatedplan ormerge/deploy/livechanges. Planning~53% unchanged untiltargetresults assessed.


## SEQ-130 bounded first browser results; SEQ-132 pending-dialog authority

Sourcef90984cf, central native run38204031433/job114663443478:3PASS/2FAIL. Actual ENcentral report4nonemptyPDFpages,6summarymetrics,30operationrows, limitednotice/exact697910net/lastproduct PASS. Real empty state removes stale report;503disablesexport then real date-dialog7dayselection/apply recoversfetch andexport PASS. AR/Sorani fail at limited-notice exacttext comparison beforePDF because actualI18nProvider localizes ASCII30 toArabicdigitforms; expecteddictionarystring stillASCII30. Test now normalizes onlydigitforms onbothsides, preserving exactphrase/count30 assertion. This is an identified localized testexpectation mismatch, not a missing appwarning or permission failure. Corrected AR/KU actualcomponent PDFs pendingCI.

SEQ-132 extends same localadminharness: `node --test scripts/fawri-admin-ui-authority-audit.test.mjs`,Node24.19.0, **14PASS/0FAIL/0SKIP total**, superseding prior10test result withoutaddingthetwo runs. Actualcontroller permission-change effect bodies: losingmerchantmanagement cancels pending statusconfirmation/delete target; losingsubscriptiongrant cancels replyreset/plan/replymodals/filter; lostdata visibility closes privatedetails; retainedpermission preserveslegitimatependingactions. Inertstateadapters only, no mountedReact/nativeadmin/backendrevocation proof. No applicationcode/permission changes.

Receipt6nativePASS remains verified unchanged; profitdisclosureHIGH OPEN with actualHTTP1PASS/3FAIL. Next inspect corrected centralreportnative result andfullisolatedcounts before definitivecheckpoint. Then merchant/support/owner routes stillunverified. Wholeestimate~53% untiltarget proofreconciled; noapplicationrepair orconsolidatedfixplan.


## SEQ-130 central component workflow SUCCESS; SEQ-133 receipt lifecycle prepared

Corrected central native run38204282300 completedSUCCESS on sourced6f6b4a0. Preserve exact job/metrics afterlogread. Realreportcomponent/toolbar/I18nProvider +syntheticAPI5cases passed: AR/EN/Sorani report print andlocalizedpartialnotice, empty(no stale report),503exportdisabled→actual date-dialogrange/apply recovery/exportenabled. Normalizingonlydigitforms retains exactnotice/count contract; no appfield/textfix. FrontendAPIfixture isnot ownerbackend/auth/financial proof.

SEQ-133 PREPARED expands actualreceiptbrowserharness from6 to8cases: actual printCashierReceipt/nativeiframe srcdoc load, withexplicitinertprint method at the physicalprintboundary; explicitlydispatchafterprint thenframe0; fault-injectedprint method throws andactualhelpercatchmustremoveframe0 andpreserveerror. Assertiframe receiptretainslastitem/noprivatecostsentinel. Original6native thermalwidth/PDFcases retained. This is actualDOM/load/helper orchestration plus controlledprint/eventadapter, not realhardware/printdialog event proof. Local syntaxPASS; two new assertionsNOT_RUN pendingCI. Possible fallbacktimer behavior afterexception remainsseparate fromframe-removalproof.

CASHIER-REPORT-PROFIT-001 HIGH remainsconfirmed/unrepaired; aggregate138PASS/24FAIL includes16functional+8parents for9canonicalfindings. Existingreportsource/query/offline/provider/hosted/role/visualgates remainopen. Localadminauthority14PASS separate. Next inspect8receipt/central logs andcompletedSQL; then save definitivehandoff forremaining owner/admin/merchant scope. Noapplicationrepair orconsolidatedplan beforeauditcompletion.

## SEQ-215–224 evidence delta and deduplicated issue index

| Canonical ID | Classification | New evidence / boundary | State |
| --- | --- | --- | --- |
| BILLING-WEBHOOK-ORPHAN-015 (SUPERQI-ORDER-NOT-FOUND-ACK-001 alias) | Existing payment recovery finding | Actual service+route bodies with inert SQL/provider/signature adapters: confirmed missing order produces200/ignored and no durable write; acceptance fails.5adjacent deny/error controls pass. No real settlement or gateway retry claim. | OPEN; no duplicate created |
| WORK-MONITOR-STALE-001 | Existing private-data UI lifetime finding | Actual load callback with inert state/fetch: silent401/403/503 retains data and no error;3acceptance failures, initial error/retry control passes. Not mounted React/parent revalidation/actions or fresh backend bypass. | OPEN; new bounded runtime evidence |
| OPS-WORKER-DRAIN-001 | NEW operational PROOF_GAP / MEDIUM / TRIAGE | `src/index.ts:132–156` invokes synchronous worker.stop(), runtime.dispose(), server.close callback exit0. `durableJobQueue.ts:695–698` only disables polling; already running handler not awaited. `merchantPhysicalMediaCleanup.ts:482–485` same stop behavior. Actual shutdown body adapter demonstrates HTTP close can exit without worker completion notification;4shutdown controls pass. No actual job loss or provider duplicate demonstrated; lease/recovery mechanisms exist and need testing. | OPEN proof; owned child-process paused-handler SIGTERM + restart/lease/idempotency test needed |

Catalog/history unsafe/unselected test queue maps to historical DB_TEST_ENTRYPOINT_INVENTORY and PG-TEST-GUARD-002/003; not a newly proven product bug. Literal selection uncertainty is not evidence of nonexecution. No prior application finding closed or repaired.

## SEQ-225–231 new findings and deduplication

| ID | Severity / state | Evidence and limits |
| --- | --- | --- |
| CASHIER-DISCOUNT-PRECISION-001 | LOW / OPEN / FUNCTION_RUNTIME_CONFIRMED | Actual percentage floor at total9007199254740990,3333bps returns3002099511605172 vs BigInt3002099511605171; within-policy accepts extra1.2P/2F independent harness. Ordinary amounts controlsPASS; authenticated approval/SQL/sale reachability NOT_RUN. Source route passes base, authority validates safe integer; no ordinary financial loss claim. |
| AUDIT-STALE-SOURCE-CONTRACT-001 | LOW / OPEN / TEST_MAINTENANCE | Five failed text/regex assertions in manual discount, tenant catalog, clean deploy wrapper, Meta memory and readiness doc. Each exact divergence in SEQ-225–231 report;9actual discount runtimePASS. No application defect inferred from stale contracts; test repairs deferred. |

Residual13 integration entrypoints map to PG-TEST-GUARD-002/003 and DB-TEST-CLEANUP-021. No direct or transitive DB execution performed. No old issue closed.

## SEQ-232–239 deduplicated evidence

OPS-WORKER-DRAIN-001 MEDIUM/OPEN: realSIGTERM/realprocess.exit/realHTTPclose/localdurableFS unfinished claim confirmed; local restart uncertain blockeddeadletter/knownreconcilecomplete/reconciliationfaultblocked allPASS, no data disappearance. Actual requiredPostgres worker callback adapters show stop disables future polling but current handler continues; deployedSQL/provider proof still pending. Do not claim production job/payment loss.

WORK-MONITOR-STALE-001 OPEN: lateoldadmin response overwrites newadmin data; lateoldsuccess clears newer403error; pending revoke-session callback still attempts POST after visible/silent403.8callbacktests4P/4F; not mountedReact/backend bypass. Server route still requires secure session/owner/password. No duplicates.

Receipt run38348021288/job115133820484 ENVIRONMENT_BLOCKED before any assertions (browsernull/results[]/prerequisite timeout); prior native receipt PASS retained. Wholepercent NOT_YET_MEASURABLE.

## SEQ-240–247 evidence / no new duplicates

26pre-import negativecontrolsPASS for13residualtests through explicit existingpreload; native direct-entrypoint safety and CI wiring remain PG-TEST-GUARD-002/003/DB-TEST-CLEANUP-021 open. OriginalSQLcasesNOT_RUN.20actualMeta refund/dispatch/live-reconcile adaptersPASS; existing REPLY-RESTORE-CYCLE-018 accounting/runtimeSQL finding unchanged. Source pending-before-send ordering examined, no realprovider/crash proof. Receipt laternative8PASS run38350269903/job115140836967; previousenvironmenttimeout preserved. No new canonical product finding or closed issue.

## SEQ-248–257 new findings

| ID | Severity/state | Actual evidence / bounds |
| --- | --- | --- |
| MEDIA-CLEANUP-CORRUPT-001 | MEDIUM/OPEN/FUNCTION_RUNTIME_CONFIRMED | Corruptpersisted hashedmanifest silentlyreadnull/reconcilemissing/batch0pending/0logs.1observationPASS/1acceptanceFAIL on realownedFS,inertSQL/storage. No realcorruption/mediaretentionincident proved. |
| MEDIA-CLEANUP-STARVATION-001 | MEDIUM/OPEN/FUNCTION_RUNTIME_CONFIRMED | Actualdefault100batch,101validmanifests;first100permanentadapterfailures monopolize2polls/200attempts,tenant101attempts0/pending.1observationPASS/1acceptanceFAIL. Boundedordering/faultmodel; no realcloudobjects removed. |

SecurityCI scannerfailure1syntheticcredentialURL in auditfixture was a toolfixture classification, no realcredential exposure. Representationonlycorrected,26refusalPASS and scanner1706/0findingsPASS locally; hostedCIpending. Adminparentextra failure browserstartup0assertionsENVIRONMENT_BLOCKED. Existingfindings retained; no duplicate newentryfor these environment/fixture occurrences.

## SEQ-258–265 new findings

| ID | Severity/state | Evidence/limits |
| --- | --- | --- |
| MEDIA-CLEANUP-CONCURRENT-UNLINK-001 | MEDIUM/OPEN/FUNCTION_RUNTIME_CONFIRMED | Twoactualwrappercalls onrealownedFS;winnerpending aftersuccess/storagefault;loserconflict catchrmSync(sharedpath) removeswinnerintent.1observationPASS/1acceptanceFAIL;SQL/storageinjected, actualproductionraceNOT_RUN. Distinct fromcorrupt/batchstarvation. |
| AUDIT-SYNTHETIC-HISTORY-GATE-001 | LOW/OPEN/CI_PROCESS_BLOCKER | run38353681095/job115151569363 currentrepositorySUCCESS/fullhistoryFAIL1credential-url historicalsyntheticfixtureblob202a9fc041cb2cde0e8169683a6eb9eb7478e130. No realsecret;currentliteralcorrection doesn'tclearhistorygate. No scannerexception/historyrewrite. |

## SEQ-266–273 new scoped findings

| ID | Severity/state | Evidence/limits |
| --- | --- | --- |
| SUPPORT-PREVIEW-SESSION-BINDING-001 | LOW/OPEN/SERVICE_CONTRACT_PROOF_GAP | Existingnonnullsessionbinding acceptedwithblankcallerID;actualvalidatoradapterobservationPASS/acceptanceFAIL. MismatchednonnullIDdenied andunboundcontrolPASS. SoleHTTPcaller passesvalidatedcontextsessionid;noactualroutebypassproved. |
| SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 | LOW/OPEN/CONFIRMED_SQL (SEQ-288; prior adapter evidence retained) | ExpiryUPDATEended thenthrow reachesactualhelperROLLBACK;adapterstateactive. Expiredaccessdenied;separatescheduledlifecycleexpirycancommit. NoSQL/browser/expiredaccessbypassclaim. |

Supportpreviewvisualroutefixturecorrected toassistantwithmanage_support+inspect_merchant_sessions;ownerdenial4roleadaptertestsPASS.222casesremainNOT_RUN. Priorfindingsretained;noactualproductionfix orclosedissue.

## SEQ-274–281 original runtime triage

RESIDUAL-FIXTURE-CONTRACT-001 MEDIUM/OPEN/TEST_MAINTENANCE: realownedPGinvocation13files shows oldcashierentitlement/localphone/legacyJSONauth/legacycookie/productiongate fixtureexpectations failcurrentcontracts.12complete16P/8F;oneincomplete23514merchantmanagementseed. Variantremoval Missingexpectedrejection conflicts withcurrentarchiveintent; actualpostremovalhistoryacceptancepending, no productdefectdeclared fromoldtest alone. Source/remapping inreport. Originaltests/appunchanged.

Fourfullygreenfiles:catalogpromotions/emergencyPG/knowledge lifecycle/runtime authorities. Mixedpositivecataloginventoryrows andactualownerprovisioningPASS, not blanketclearance. Incompletemerchantmanagementseed/latehook strengthens existingDB-TEST-CLEANUP-021;ownedcontainercleanupSUCCESS. Canonicalconsentexpiryadapter6P/1F extends existingSUPPORT-PREVIEW-EXPIRY-ROLLBACK-001, no duplicate. Allpreviousfindingsretained.

## SEQ-282–285 catalog marker atomicity

CATALOG-ARCHIVE-ATOMICITY-001 MEDIUM/OPEN/CONFIRMED: actual ownedSQL fault-injection rejects archive-marker UPDATE after corecatalog transaction committed. Product version2→3 and rename persist; zero-stock variant remains publicly visible because metadata marker is absent. Full immutable mutation retained. Run38431991119/job115416248457 1P/1F/0SKIP; sourcece48910f. Trigger fault controlled, not hostedincident evidence. Source and limits in completed report. No repair.

## SEQ-286–289 existing expiry finding strengthened

SUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 LOW/OPEN/CONFIRMED_SQL. Prioradapter-only evidence retained. ActualownedPG7cases5P/2F atsource23efe18cb9089507909b3d390fea790272e22cd7,run38433417141/job115421169603 confirmsconsent/preview markerrollback on timestampdenial. Accessdenied, no expirybypass. Canonical lifecycle commits pending/approved/session expiry and preserves liveother tenant; repeats0updates. Directsweep proof doesnot clear production timer/HTTP/role/RLS. No duplicate finding/repair.

## SEQ-290–293 licensed history acceptance

Fourdistinct actualSQL targetcasesPASS; no new issue. RESIDUAL-FIXTURE-CONTRACT-001 remainsOPEN/originallicensefixturesunchanged. Newcurrentlicensed salehistory surviveszero-stock rebuild andguarded denial; deliberately absentlevel archive retains sale/exactreplay, restitutiondenied withunchanged sale/mutationrows. Not successfulpostarchivecompensation/productiondeletionproof. Initial fourthseed denied deviceauthority; corrected timestampfixture runs onlyremainingcase. Prior3notrerun. ExistingCATALOG-ARCHIVE-ATOMICITY-001 andSUPPORT-PREVIEW-EXPIRY-ROLLBACK-001 stayOPEN.

## SEQ-294–297 native monitor and selector evidence

WORK-MONITOR-STALE-001 OPEN/MOUNTED_BROWSER_CONFIRMED:actualReact/nativeChrome154real15second silent403/503 retainsoldmonitor withouterror; delayedAresponse replacesnewlydisplayedBafterpropchange.7cases4P/3F,source5da92ffd/run38437736590/job115436032580, noinfraerror. SyntheticHTTPonly,noApp/currentrole/backendbypass/nativependingwriteclearance. Existingfinding,no duplicate.21unchangedcontracts nofilename refs in959sources; priorlocalexecution retained/no rerun; boundedCIselectiongap staysOPEN.

## SEQ-298–301 native pending action evidence

WORK-MONITOR-STALE-001 OPEN/NATIVE_ACTION_CONFIRMED:actualcomponentdialog/PasswordInput/nativemouse6cases4P/2F. PendingconfirmPOSTafteractual15s403; targetpropBconfirmusesoldsessionA. Syntheticserverrejects403/404; no realSQL/backendbypass. Fourpositivecontrols cancel/success/incorrectpassword/singlependingPOSTPASS. Head8382a73f/run38439068416/job115440607861. Realbackendsource owner/password/accountqualifiedsession gate retained, notexecutedhere. No newfinding/repair.

## SEQ-302–305 actual retention acceptance

EightnewSQLcases8P/0F/0SKIP,source29be3ed3/run38442860689/job115453629407; newE164/currentAuthv2fixture proves readonly,suspension/sessionrevocation/repeat/tenantisolation,renewalreplystate,no oldsession/closed/manualrevival,SQLfaultrollback,1concurrentpendingdeletionrequest+1audit. No newfinding. RESIDUAL-FIXTURE-CONTRACT-001 remainsOPEN/originaloldphonefiles unchanged; successfulnewbusinessproofdoesnot rewriteoldrun. Currentrole/HTTP/purge/media/provider/leastprivilegegates remainopen.

## SEQ-306–311 actual management HTTP and session binding

15newbusinesssubcases15PASS(raw16inclparent),sourcecc27ff5a/run38444767251/job115460157268. CurrentE164/trusteddevice/fullAuthv2fixture reachesmanagementrole/permission/password/review/anonymization andowner-sessionqualifiedbinding/livecookie401. No newfinding. RESIDUAL-FIXTURE-CONTRACT-001 extendsoldmanagementfixture's missingownerdevicecontract(originaloldphonefailedfirst); originaltestsunchanged. Initialzero-caseownerissuanceblockednotapplicationdefect. WORK-MONITOR-STALE-001 remainsOPEN; backend404bindingPASSdoesnotfixnativeUIstaleaction. HostedRLS/provider/media/fullroute/OTP gatesremainopen.


## PUBLIC-METADATA-TEMPLATE-001 — LOW / OPEN / SOURCE_CONFIRMED

Current artifacts/fawri/index.html:7/10/13 description, og:description and twitter:description retain built-on-Replit/template updateinstruction wording. Public social/search snippet quality issue; source proof on56138e8a, not currentlydeployedincident or credentialexposure. Discovered alongside firstfullApproute batch;18functionalbaselinePASS remainsseparate. Details/bounds inSEQ-330–335 report. No repair.


## A11Y-OWNER-RECOVERY-HEADING-001 — LOW / OPEN / DOM_CONFIRMED

OwnerRecoveryPage initialkey1stage, actualfullAppsixlocale/viewportcases: semantic h1–h6 count0 despite visibleportalTitle. OwnerRecoveryPage.tsx:203 usesCardTitle; card.tsx rendersdiv. Headingnavigationstructuralgap, notcredentialbypass/fullWCAG assessment. NativeDOM/source/captures inSEQ-342–347. No repair;18basicbaselinePASSdoesnotcloseaccessibilitygap.


## I18N-MONITOR-SORANI-DATE-001 — LOW / OPEN / NATIVE_VISUAL_CONFIRMED

Sorani work-monitor Last activity showsEnglish Oct/AM inactualfullApp390/1280captures for synthetic2026-10-14T00:00:00Z. formatDate usesIntlDateTimeFormat ckb-IQ; localefallbackcauseinferred, resolvedOptionsnotcaptured. Native mixed-language presentation proof only, nottimezone/security/allplatform failure. TwoPNGdetails/bounds inSEQ-354–359; no repair. Distinctfromdate-picker/billinglocalization surfaces.


## UI-KU-CATALOG-CSS-SPILLOVER-001 — LOW / OPEN / NATIVE_CAUSE_CONFIRMED

Globalindexcatalog-kurdish-layout-fix.css640–1399Sorani selector appliesflex1 1 28rem tofirstheaderchild, which is40pxshieldbadge inbothsnapshotpages. Native1280badgewidths702.6875/547.921875; test-onlystylesheetdisable gives40px andtitlewidth254.6875/99.921875→917.375/607.84375.2ownedbrowsercausalcontrolsPASS,source/appunchanged. Presentation/usabilitygap,notauth/writebypass; mobilecrampingnotattributedtothismedia rule. SEQ-360–365 has16captures/fullbounds. No repair.

I18N-MONITOR-SORANI-DATE-001 evidenceextension: emergency snapshot generated_at showsEnglishOct/AM inbothSoraniUIR-011captures; sourceusesckb-IQ/dateformatter. Sameexistingdatefinding, no newduplicate. Nativevisualproof, notresolvedOptions/alltimezone proof.

## EMERGENCY-AUDIT-STATUS-MISREPORT-001 — MEDIUM / OPEN / NATIVE_DOM_CONFIRMED

SEQ-366–371 full original App owner overview valid:false still renders localized healthy audit-chain text in all6 AR/EN/KU×390/1280 DOM probes. Three mobile390 chain-card PNGs corroborate; desktop card visibility not certified. AdminEmergencyAccessPage.tsx:658–663 unconditionally renders green shield/text.auditValid, ignoring boolean while showing event_count. PostgreSQL source verifier can return false, owner overview propagates it and HTTP handler serializes200; no actual SQL corruption/HTTP-tamper experiment or unauthorized-access proof. Legacy JSON path verifies/refuses503 before valid:true, not a bypass. SeverityMEDIUM for misleading security integrity indication. Original6 diagnostic locator failures preserved; corrected6-case-only diagnostic verifies reproduction. No application fix. Evidence [SEQ-366–371](SEQ_366_371_EMERGENCY_WORKSPACE_INTEGRITY_20261014.md), seq369/seq370 native results/captures. Owner desktop-card clipping potential remains separate TRIAGE.


## P0 verified-payment SQL recovery continuation — 2026-10-14

Issue #523 / BILLING-SQL-RECONCILIATION-032 remains OPEN. New local branch `fix/p0-verified-payment-sql-recovery-20261014` based on #533/2733cadae. SaaS/cashier savepoint recovery and exact-event concurrent replay regression prepared; API typecheck/build and guard15/15 PASS, real PostgreSQL NOT RUN for new code. Publication rejected by automatic approval review; no remote commit/PR/CI evidence. See active header in `WORK_HANDOFF.md` for design, limitations, exact next actions and publication blocker. P0 is not complete; no percentage recalculated.


## Verified P0 SQL recovery — 2026-10-14

Supersedes earlier local-only/NOT_RUN checkpoint: PR534/da4d0c05, isolated38517736663/job115700230288:168PASS/3FAIL,43invocations/41unique. Cashier SQL6/0 and SaaS SQL3/0 PASS, checkout9/0 PASS; remaining selected runtime failure is Meta FA-I-006/issue535 (2functional+parent). Security history1synthetic-fixture finding separately classified. See P0_PAYMENT_SQL_RECOVERY_20261014.md and active WORK_HANDOFF header. Issue523/P0 stay OPEN for broader acceptance; no merge/deploy or percentage claim.


## VERIFIED P0 execution checkpoint — 2026-10-14

Sourcea696046b, PR537 (stack534/536): isolated38520772813/job115709702562 **174PASS/0FAIL/0SKIP,41unique/43invocations**, restricted resolver+signed HTTP8PASS, seven29migration chains/cleanupPASS. **27/27 CI runsSUCCESS** on this source, including complete Meta pipeline38520772699, schema38520772844 and security38520772794. Exact source/results/limits in WORK_HANDOFF.md and evidence/P0_SELECTED_RESULTS_20261014.json. SQL application recovery and RLS routing fixes are verified drafts, main unchanged. Remaining523 receipt-before-application interruption/inbox and535 complete downstream signed restricted-role/hosted execute rollout remainOPEN. No wholeP0 completion/percentage or release clearance. Later docs-only checkpoint does not alter tested source; no unnecessary SQL rerun required solely for wording.

## Source-confirmed lifecycle watch — trusted device approver deletion

ADMIN_APPROVER_TRUST_DEPENDENCY_ORDER_20261014: existing trusted_devices.trusted_by_account_id FK ON DELETE SET NULL conflicts with trusted_devices_trust_state_check requiring a non-null approver while trusted. Owned fixture cleanup reproduced dependency-order failure; corrected fixture removes its devices before accounts. Current admin management disables accounts; no public hard-delete endpoint failure or extra P0 blocker is claimed. Any future physical approver deletion/retention workflow must explicitly revoke/remove dependent trust first and preserve accountability. Sources lib/db/src/schema/sessions.ts and first migrations; evidence operator attempt0fb0156d above. Keep for lifecycle review, no production schema mutation in this unit.
