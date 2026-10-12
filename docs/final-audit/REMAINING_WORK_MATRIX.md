# Remaining audit work — 2026-10-11

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


## SEQ-114 real service proof verified; recovery fixture follow-up

Sourcebc8ca369, run38195395321/job114636790344:134PASS/22FAIL/0SKIP. New multi-device suite3PASS: four last-stock races, concurrent replay/no duplicate mutation, altered-note conflict, loser rollback/retry and SQLgap observation. Exact boundaries and evidence inEXECUTION_RESULTS. Extra recovery failure was duplicatefirst variable introduced in test correction; renamedtagFirstCharacter, full-file transformed syntaxPASS, actualHTTPretestawaited. Existing21product failuremarkers remain. ReleaseBLOCKED; no applicationchange. Exactresume: inspect newcommitrecovery/runcounts/cleanup before feasibleclosedshift/browserproof. WORK_HANDOFF andISSUES preserveopen scope; local29runtime/18sourcePASS, no browsercertification.


## Final queue after verified SEQ-114 and bounded SEQ-115

1. SEQ-116: disposable HTTP recovery after an actual staff/station lifecycle closes the original shift; preserve original attribution and prove cross-tenant/device/current permission denial. Normal session expiry reuses open shift and is not a sufficient defect reproduction.
2. SEQ-117: real browser two-tab IndexedDB concurrency, versionchange, local altered-input replay, durable outbox restart and7-day signed-license/cache/clock behavior. Chromium missing locally; do not substitute fake storage for browser proof.
3. Application remediation: explicit approval needed for the concrete payment reserve/outside-transaction dispatch/orphan inbox design; existing012/013/015/027/028/032 and Meta006/refund018 remain open. No live gateway required for synthetic repair tests, and no production provider activation authorized.
4. Whole-product unresolved gates: owner/merchant/staff browser journeys, reports/PDF/Excel correctness, AR/EN/KU RTL/mobile/accessibility, hosted least-privilege/image/readiness/media/PITR/monitoring/rollback and authorized external provider/business acceptance.

Finalnew SQL suite3PASS and corrected recovery1PASS on0d5b9ef8 are verified, no longer CI_PENDING. Whole-run135PASS/21FAIL/0SKIP. Canonical issue closure and counts inISSUES/EXECUTION_RESULTS. Auditestimate~50%, not release readiness.


## VERIFIED SEQ-116–119 checkpoint — 2026-10-12

Audit-only continuation, PRhead sourceb68d24e9eb4b1d50b3452a224d479fb1ec2b91a6. App code unchanged. Last completedSEQ116 bounded HTTPrecovery,SEQ117 bounded native IndexedDB,SEQ118 report-export input integrity,SEQ119 actualroute coverage inventory. This supersedes earlierNOT_RUN/PREPARED notes only within the proven bounded scenarios.

**Isolated actualSQL/HTTP:**run38198172739/job114645417825:136PASS/21FAIL/0SKIP,37unique/39invocations. Newclosed-shift suite1PASS. Real staff-service disableclosesoriginalshift/re-enable+HTTPPINloginnewshift; originaltoken401/noorder, wrongdevice401, historicalsaleHTTP200 with fullentityACK, preservedoriginalstaff/shift/session, replayHTTP200/replayedtrue/0mutations, oneorder/attribution andstock0. OwneradminHTTP, otherstaff/tenant andreturn/void scenarios not included. Cashier subsetrun38198172963/job114645417428 confirms1PASS/ownedcleanupSUCCESS. First source8d3f4888 wrongduplicate-field assertion corrected; fixturedefectCLOSED, applicationunchanged. Existing21markers remain14functional/7parents for8canonical findings. Meta54/restore/Node22/passwordrecovery/stocksuite3PASS; finalquality38198172713,security38198172727,schemavalidation38198172765SUCCESS.

**Native browser:**run38198172776/job114645417274, Chrome154.0.8037.97. PRheadb68d24e9; checkoutmergeSHA35cc841b7cf8f7d369078879b3dc1d544001b6ca.3PASS/1FAIL: two actualsame-origin tabs finalstock=oneaccepted/oneCASHIER_OUT_OF_STOCK/stock0/onecompletesaleoutbox2; close/reopenretains2pending; versionchangeclosesbotholdhandlesInvalidStateError,preserves2outboxrecords,oldv2reopenonschema3rejectsVersionError. Changedvalidquantity1→2 withsameoperationIDisacceptedandreturnsquantity1(oldsale): priorSEQ93/94 observation nowconfirmednativefailure. No extra stockdecrement/dataloss demonstrated. VersionError is fail-closed old-schema compatibility, not a separate claim of corrupt upgrade. Existing authority retainsclosedpromise; auto-recovery and all appcallers not certified. Freshprofile/browser/server cleanup completes before result emission. No physicaldevice/POSUI/offline7day certification.

**Report-export actualfunction/adapters:**`node --test scripts/fawri-report-export-audit.test.mjs`,Node24.19.0:4PASS/2FAIL/0SKIP. Actual CombinedReports download closure passed explicit inertdownloader; actual moneyUi/reportWorkbook purefunctions executed after TStransformation. IQDwholeunitsPASS, realUIformatter majorunitsPASS, formula-like strings encodeinline/noformulaPASS, XMLescaping/numeric0PASS.USD12345minor suppliedtoworkbookas12345 underUSDsalesheader whileUIdisplays123.45;KWD-1050minor suppliedas-1050 whileUIshows-1.050. Twofailures areoneREPORT-EXPORT-CURRENCY-001 finding, nottwoissues. XLSXzip/Office/PDF/ReactHTTP/exportdownload notexecuted. Initial harness componentmarker typo corrected before these6assertions; no appdefect counted fromthat.

**Scope inventory:**COMPREHENSIVE_RELEASE_AUDIT_SCOPE now lists37named routes+fallback, sourcecomponents/intendedaudiences, all appbrowserjourneysNOT_RUN; separatecashierPOS/history/reports/sync/diagnostic modes andnestedadminpanes remainexplicit. Nativeauthority proofcannotcertify thescreens. Browserrole/AR/EN/KU/RTL/mobile/focus/loading/empty/error andhosted/provider/commercial gates remainOPEN.

**NextSEQ120:** report-range/completeness/PDF and workbook actualconsumer assertions; extend historicalHTTPreturn/void/crossstaff/tenant/permission negatives. Then fullappbrowserjourneys from37route inventory when safe synthetic runtime prepared. Preserve earlier proofs, do not restart. No application repair or consolidated repairplan until comprehensiveaudit complete, as explicitlyrequestedbyuser. Historical paymentrepairproposal is not current execution queue or approval request. No mainmerge/deploy/liveDB/secrets/realpayment.


## SEQ-120 bounded adjacent cashier export follow-up (2026-10-12)

Extended existing REPORT-EXPORT-CURRENCY-001 to actual centralcashierdownloadclosure. `CashierCentralReportsPage.tsx533–590,617–630` exportsrawminor net/profit/refund/average/product/operationamount under ordinary value/amount labels; liveview`formatReportMoneyMinor`169–177/235–236 scalesbycurrencydigits. NewcapturedcentralUSDsummary12345vs123.45FAIL; IQDsummaryandlimited-operationnoticePASS. Topproduct/operation scaling is SOURCE_REVIEW_ONLY, not separately executed. No duplicateissue.

Final`node --test scripts/fawri-report-export-audit.test.mjs` onNode24.19.0: **5PASS/3FAIL/0SKIP**,8tests. Threefailures=onecurrency-scale finding. InitialSEQ118six-test4/2 result is historical and superseded by this expanded sameharness8-test5/3 result; no homogeneousaddition toSQL136/21 ornative3/1. RealZIPgeneration/XLSXofficeopen,PDFpagination andvisual comparison remainNOT_RUN. Noapplicationchange.

**Current definitive continuation:**SEQ116–120 bounded workcomplete; nextSEQ121 actualworkbookZIP/consumer andPDF/range/completeness assertions, plusclosed-shiftreturn/void/currentpermission/crossstaff/tenant HTTPnegatives.37routeinventory remainsNOT_RUN forappjourneys. Sameexplicituserconstraint: completecomprehensiveaudit before consolidatedrepairplan; historicalpaymentproposalnotcurrentqueue. Allnoteddefects preserved, no repairs. Overallplanning~52%,48%remaining(40–60%uncertainty), releaseBLOCKED.


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
