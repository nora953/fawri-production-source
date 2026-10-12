# Fawri engineering audit — current evidence draft

## Definitive current handoff — SEQ-134–137 completed; next SEQ-138

Continue from saved evidence; do not restart. Audit/test/documentation only. All application repairs and consolidated repair planning remain deferred until the comprehensive audit is complete.

Executed source `a2a9a780740d8719be5564344ad9afa984e2bbbd`, [isolated run38288686551](https://github.com/nora953/fawri-production-source/actions/runs/38288686551), job114943166682, Node24.21.0: **144 PASS /24 FAIL /0 SKIP**,41unique files/43invocations. Every AUDIT_SUITE_RESULT has summaryComplete:true.24markers remain16functional+8parents for9existing canonical application findings, including HIGH/OPEN CASHIER-REPORT-PROFIT-001. No application defect repaired or new Support defect demonstrated. Owned teardown, full-schema restore, injected Meta54 and Node22 HTTP PASS.

New actualSQL/HTTP: admin auth/router1PASS; Support5PASS (4negative children+parent). Actual tickets/images/replies/inspection approval/secret-redacted preview/reminders persist inSQL without legacy JSON. Missing session401; real foreign merchant404 for other ticket/image/reply, absent in own list/no message mutation; owner image200. Removing current manage_support grant rejects list/image/reply403 with same previously permitted cookie; restoring grant returns200. Preview PATCH403/read-only and same-admin other-session403; original session200/store unchanged; ended snapshot409. Default disposable role and mounted router fixtures; not deployed grants/full-app fallthrough/browser/live OTP/media durability proof. Owner Support device trust uses real services with synthetic setup; actual owner OTP/device login separately passed in admin suite.

Prior Support fixture failures remain documented: invalid legacy phone shape (23514), then device-less owner session (AUTH_POSTGRES_OWNER_DEVICE_REQUIRED), both before HTTP. Corrected only test fixtures, pre-mutation cleanup and audit counters; no app/schema change. Failed incomplete output was not counted as success. Final complete runtime above supersedes those prepared/setup-only statuses.

Local separate: media filesystem5PASS (real scratch fs, actual producer bodies), runner counter4PASS (actual summary/classification body, synthetic TAP). Prior admin UI14PASS, receipt native8PASS and central component5PASS remain bounded evidence, not added to SQL aggregate. [Detailed evidence](SEQ_134_136_ADMIN_SUPPORT_20261012.md).

Planning estimate remains approximately **54%audited /46%remaining**, uncertainty40–60%, same milestone/domain model. No increment for fixture corrections, unchanged CI repeats or limited extra controls alone; this is not a measured passrate/readiness. Release BLOCKED. Full screen/role/modal/mobile/offline, hosted grants/media/PITR/rollback/monitoring, provider and commercial acceptance remain open.

**Exact next SEQ-138:** mounted merchant/admin Support page state and role/browser coverage from the37route inventory (loading/empty/error/retry, allowed/denied role surfaces and keyboard/RTL), separating synthetic API UI proof from already verified real Support HTTP. Then remaining owner/admin/merchant screen groups. Reuse all completed service/media/report proofs; rerun only for changed code/config or a justified new assertion. No main merge, deployment, live DB/secrets or real payment.


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


Updated2026-10-11. Main baseline d38d29229bed0f9575a98e7026e7819fe363bfd4; draftPR520, audit/conversation-notes-reconciliation-20261011. No staging/production mutation, main merge or deployment.

## Current conclusion

Launch readiness is **not established**. Synthetic execution confirms six product/reliability findings. Full committed-schema recovery and selected tenant isolation are now demonstrated, but external providers, hosted role privileges, persistent media/PITR and visual/accessibility gates remain open. Application fixes require approval outside current test-only scope.

## Latest executed evidence

[Sourcefc1ee417](https://github.com/nora953/fawri-production-source/commit/fc1ee4171eac9b75189383539857664afa37b264), [run38175555975](https://github.com/nora953/fawri-production-source/actions/runs/38175555975), job114577082735: **114 Node PASS / 14 FAIL / 0 SKIP**,31 unique files/32 invocations. Failures are ten functional failures and four parent failures across the six findings below; do not count parents as independent defects or sum reruns. Six fresh PostgreSQL16 clusters,28 committed migrations each, no external network/published ports, synthetic credentials, pre-import attestation, owned-container/volume cleanupSUCCESS. Full execution tables and historical failures remain in EXECUTION_RESULTS_2026-10-11.md/ISSUES.md.

Successful selected coverage: account bootstrap, both golden/HTTP journeys, no root JSON, merchant deletion RLS; cashier lifecycle/licensing/seat concurrency/compensation/history/grace/retention selection/stale version; positive SaaS/SuperQi fixtures/customer payments/refunds; tenant/knowledge/reminder boundaries; standalone learning cycle and54 Meta tests with injected providers. Official send denies a suspended-subscription duplicate reservation with zero fake provider calls. Cashier checkout same-key six concurrency trials and shared payment-reference protection PASS. Real failed setup plus first SQL cleanup failure proves later deletion/pool teardown/error visibility with zero fixture account/merchant rows.

Addon refunds: referenced batch deletion rejected23503, concurrent credit exactly once, expired original-addon refund preserves renewed base usage and offers zero addon balance (three tests including parent). Base-cycle refund remains unsafe018.

Full-schema recovery seed/verify PASS after real pg_dump/pg_restore:94tables/RLSflags/ACLs,45policies,3functions,638constraints/flags/definitions, indexes,28journalrows and two fixturechannels match; restricted tenant readsPASS. Native roundtrip of303 CHECK definitions plus equivalent-grouping and changed-predicate canaries identifies prior mismatch as deparse representation. Roles remain pre-existing in one disposable cluster; no cluster-role/PITR/external-media/RPO-RTO proof. Earlier small recovery drill restored three rows/two local objects and21 safety/object tests passed; its narrower scope is retained.

## Confirmed findings and repair order

| Priority | Existing issue | Confirmed behavior | Required acceptance evidence |
| --- | --- | --- | --- |
| P1 | FA-I-006 | Restricted RLS role tenant isolation passes, global Meta page map0 instead2; known page503 | Narrow audited resolver routes approved pages while preserving tenant isolation, pool reset and generic unknown-page denial; approved hosted proof |
| P1 | BILLING-PAID-REPLAY-028 | Distinct mismatched verified event rewrites SaaS paid and cashier applied orders to reconciliation-required | Preserve terminal state/applied entitlement, safely reject and audit conflict |
| P1 | BILLING-LATE-EXPIRED-027 | Matching late verified payment throws not-payable after proactive expiry in SaaS and cashier | Durable payment evidence/reconciliation and safe retry without inappropriate entitlement |
| P1 | BILLING-IDEMPOTENCY-012 | SaaS identical concurrent checkout yields23505 to one caller; cashier control passes | Both SaaS callers receive same stable order; changed payload rejected; no duplicate charge |
| P1 | REPLY-RESTORE-CYCLE-018 | Old base-cycle refund erases current-cycle usage1->0, remaining3999->4000 | Preserve unrelated new-cycle debit and prove duplicate/concurrent safety; addon controls alreadyPASS |
| P1/P2 | BILLING-SQL-RECONCILIATION-032 | SaaS/cashier SQL fault leaves pending order with no durable payment-event evidence; exact retry later works | Durable evidence or independently verified recovery/retry procedure; no duplicate entitlement |
| P2 | SUPPLYCHAIN-MODERATE-030 | Two moderate dependency advisories; fast-copy4.0.3 present in built pretty asset/copied node_modules | Compatible minimal update and build validation; active default production exploitability unproved |

These are synthetic failures, not evidence of a real financial incident or API data leak.032 transaction rollback prevents partial entitlement writes. No real charge/settlement/provider call was performed.

## Safety repairs and residual gaps

020 priority guards plus runner preloader proven; expanded textual inventory64 candidate files,16 guard markers/31 selected at latest executed source. Next checkpoint adds password recovery guard/selection (17/32,32 candidates outside both); local missing/unattested URL denial and APItypecheck PASS, HTTP assertions pending. Static/transitive imports and legacy service workflows need staged migration, not blind blanket guards.

021/024 common early aggregate cleanup and real failure proofPASS; not every mutation faultpoint tested.022/023 legacyJSON compatibility removed and actual goldenPASS.025 exact historical fake scanner exceptions pinned;026 synthetic E.164 corrected.029 rejects URL override parameters/PG routing environment;031 restricts restore count verification grammar. Earlier security scan/guard checksPASS; use source-linked CI logs for current status.

Synthetic restricted-role results do not close FA-I-007 hosted non-RLS sensitive-table grant/API authorization gap. SuperQi mocks cannot establish settlement. Injected Meta/AI providers do not establish live token permissions, availability or answer quality. Dependency presence does not establish active exploitability. Translation structure/typechecks do not prove wording, responsive layout or accessibility. No release decision until remaining required gates are reconciled.

WORK_HANDOFF.md gives the exact saved resume point; REMAINING_WORK_MATRIX.md lists short tasks and external dependencies. This is a current draft, not a completed comprehensive release report.

## SEQ-19 executed update

Source1c498c06/run38175863733:115PASS/14FAIL/0SKIP,32 unique files/33invocations; six28-migration chains/cleanupSUCCESS. Password recovery tamper/replay/concurrent-confirmation/session revocationPASS. Full schema/addon controlsPASS. CI_EVIDENCE_RECONCILIATION_2026-10-11.md distinguishes source contracts386PASS+1SKIP, API818PASS, frontend179PASS, syntheticbot22PASS, structuraltranslation and greensecurity with two moderate advisories. Two legacy Meta workflow failures were guard refusals; safe invocations repaired, actualrepairproofpending. Skipped auth business-route proof selected for isolated CI, pending.

## Latest SEQ-20 checkpoint

Source05456ea9/run38176210529:126PASS/14FAIL/0SKIP,33unique/34invocations; six28-migration chains/cleanupSUCCESS. Previously skipped auth business-route test now11PASS/0SKIP. Meta pipeline38176210628 and foundation38176210612SUCCESS after safe runner migration; guards retained. Added source findings: existing016 UI omits pending-release replacement station despite servicePASS, and newFAWRI-UI-006 raw billing enums/English errors lack AR/KU localization. Both UI source findings need approved fixes and browser proof; no new executed functional failure. Critical UI semantic review is source-only, not release visual clearance.

## Latest SEQ-22 checkpoint

Sourcefccd677a/run38176766705:131PASS/14FAIL/0SKIP;34unique/35invocations,six28migrationchains/cleanupSUCCESS. Actualrestrictednonowner/NOBYPASSRLS broadgrant HTTPsession suite5PASS; partially closesFA-I-007sessionownershipnegativeproof, hosted/staff/credentialleastprivilege stillopen. Deployment/recoveryreview documents boundaries and reviewabledrill; Node22vs24delta prompts isolatedHTTP compatibilitytest, pending. Existing media/PITR/rollback/provider/browser gates remainopen.

LatestSEQ-23 source83999ff1/run38177206914:132PASS/14FAIL/0SKIP,34unique/36runtime-phaseinvocations; seven28migrationchains/cleanupSUCCESS. Node22.23.3 and24.21.0 HTTPbothPASS, specificcompatibilitygapclosed. Existing013externalcheckoutSQLrollback and015orphanverifiedpayment negativefixturesprepared, executionpending; no newdefect asserted yet.

## SEQ-25: reconciled isolated PostgreSQL execution (2026-10-12)

Source: [workflow run 38180374172](https://github.com/nora953/fawri-production-source/actions/runs/38180374172), job 114591512528, executed on audit branch. Complete job log suite markers: **132 PASS / 21 FAIL / 0 SKIP**, 37 runtime/phase invocations. Seven additional failed test/parent markers versus SEQ-23 came from new external checkout rollback fixture. These markers are NOT 21 independent product defects. Failed suites: restricted Meta page directory (2P/3F), cashier billing negative failures (2P/4F), external checkout rollback (0P/7F), SaaS SQL recovery (1P/2F), SaaS negative billing failures (1P/4F), reply cross-cycle refund (0P/1F). See EXECUTION_RESULTS_2026-10-11.md and ISSUES.md for exact evidence and existing IDs.

The new test confirms both SaaS and cashier synthetic external checkout identity/reconciliation defects (canonical BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015): first SQL order rolled back after fake external creation, same-key retry caused a second fake provider creation, verified signed orphan webhook ignored as order_not_found. No real money/provider interaction. Quality and security workflows passed; isolated PostgreSQL and isolated cashier workflows failed. Injected Meta/AI, full committed-schema restore, Node22 HTTP and owned cleanup steps passed. No actual staging container startup or hosted role, media, PITR, live provider, browser or offline-device validation established.

### Whole-product readiness verdict

**NOT READY / RELEASE BLOCKED.** Code tests alone cannot certify all Fawri product features. Remaining gates: remediate canonical billing/Meta/refund failures and rerun safe regressions; perform role-by-role mobile/desktop browser flows in Arabic/English/Sorani (RTL, accessibility and error states); validate seven-day offline cashier licensing and sync/device clock behavior; verify hosted least-privilege PostgreSQL grants and tenant boundaries; exercise actual staging image/readiness, DNS/TLS/monitoring/rollback; prove durable support/catalog media restore and hosted PITR with defined RPO/RTO; validate authorized Meta, AI and payment sandbox contracts, settlement, webhook replay; approve merchant onboarding, support, privacy/terms and pricing/tax operations. Status for unexecuted areas is NOT_RUN or EXTERNAL_BLOCKED, never PASS. See COMPREHENSIVE_RELEASE_AUDIT_SCOPE_2026-10-12.md.

Audit branch PR #520 is not a deployment authorization. No merge, hosted mutation or application business fix made here. Next safe phase: triage acceptance criteria for existing issue IDs and obtain specific approval/environments for changes and live checks.


## Latest SEQ-113 conclusion — 2026-10-12

Release remains **BLOCKED**. New 27 mocked runtime and 18 source assertions passed. Current baseline isolated CI remains 132 PASS / 21 FAIL / 0 SKIP, reproducing eight existing canonical findings. Actual sync integration exists; server hash/tenant/replay and client complete ACK/partial upload have bounded runtime evidence.

New sequence-gap and prior-shift recovery concerns are PROOF_GAPs with reproducible function behavior, not certified production incidents. Normal logout protects pending data. Offline-cache structural validation accepts edited future grace, enriching the existing unsigned-license concern without claiming a full browser bypass. Local browser execution is blocked by missing Chromium. No new actual two-device SQL, IndexedDB, browser, staging or provider proof was performed. Application behavior is unchanged.

Provisional audit estimate: approximately 50% (40–60% uncertainty); methodology and domain scores are in PROGRESS.md. Green observation tests do not close issues. Resume SEQ-114 as WORK_HANDOFF specifies. No application fix, merge or deployment.


## Latest classified execution — SEQ-114a / SEQ-115

Firstnewrun38194961047 on d0be9ea3:132PASS/24FAIL/0SKIP; actual SQLgapobservationPASS. Stockrace hit historicaldeviceauthority fixturetiming, so contentionnotproven. Recoverytamperfailure was a testfixtureBase64urlbytealias, not establishedcrypto forgery. Test-only corrections and29localPASS saved; correctedSQL/HTTPresultsPENDING. Source narrows shiftrecovery tofeasibleadministrativeclosure, asnormallogout/pairing andsame-staffopenshiftreuse mitigate simplerhypotheses. Details inEXECUTION_RESULTS/ISSUES/WORK_HANDOFF. ReleaseBLOCKED; auditestimateapproximately50%, no applicationrepair.


## SEQ-114 real service proof verified; recovery fixture follow-up

Sourcebc8ca369, run38195395321/job114636790344:134PASS/22FAIL/0SKIP. New multi-device suite3PASS: four last-stock races, concurrent replay/no duplicate mutation, altered-note conflict, loser rollback/retry and SQLgap observation. Exact boundaries and evidence inEXECUTION_RESULTS. Extra recovery failure was duplicatefirst variable introduced in test correction; renamedtagFirstCharacter, full-file transformed syntaxPASS, actualHTTPretestawaited. Existing21product failuremarkers remain. ReleaseBLOCKED; no applicationchange. Exactresume: inspect newcommitrecovery/runcounts/cleanup before feasibleclosedshift/browserproof. WORK_HANDOFF andISSUES preserveopen scope; local29runtime/18sourcePASS, no browsercertification.


## Final evidence and release decision for this batch

Source0d5b9ef8 / run38195697724:135PASS/21FAIL/0SKIP. Four two-device last-stock races and idempotent replay controls passed; actual sequence-gap behavior reproduced; corrected HTTP password recovery passed. Local29runtime/codec and18source assertions are separate bounded evidence. Fixture timing and Base64url tamper issues were corrected in tests only; no application change. Owned cleanup, restore, injected Meta, Node22HTTP, quality and security gates passed.

**Release remains BLOCKED.** Existing eight application findings, sync gap/closed-shift recovery, unsigned offline cache, actual browser/device/staging/provider/backup/visual/commercial proof remain open. Audit planning estimate~50%, with40–60%uncertainty; current definitive handoff and domain table supersede stale conversation guesses. NextSEQ116 recoveryHTTP andSEQ117 actualbrowser; functional billing repair needs explicit approval of concrete proposal. No merge/deploy/liveDB/provider/financial action.


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
