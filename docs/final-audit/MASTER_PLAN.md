# Fawri final audit — master plan

Status: FA-000 in progress. Source of truth: GitHub `main` plus this audit ledger once merged.
Baseline commit: `56d7ac266d2d02d0cc5197f2dfeda134199b2baf` (2026-10-09).
Last recorded: 2026-10-10.

## Purpose
Close the existing Fawri engineering audit without repeating already proven work. Freeze feature scope. Visual QA is last. Production domain and external Meta/AI/billing integrations follow a separately approved release gate.

## Non-negotiable rules
1. Each task has an ID, scope, baseline SHA, evidence links, outcome, and exact next action.
2. A prior PASS is historical evidence, not automatic proof at a later commit. Reopen only for a relevant code/config change or reproducible new finding; record why.
3. Separate **implemented**, **tested**, **deployed**, and **verified end-to-end**. Do not equate one with another.
4. Audit read-only by default. No branch merges/deletions, DB writes, secrets changes, redeploys, or production actions without explicit authorization.
5. Before any new work read PROGRESS.md, AUDIT_REGISTER.md, ISSUES.md, and check current GitHub SHA. At end, record what was verified and where to resume.
6. Do not record credentials, tokens, personal data, database connection strings, or private logs.
7. PASS requires evidence and closure criteria; BLOCKED must name the missing proof. Do not invent completion percentages.

## Stages
- FA-000 Continuity system: create four audit files on a review branch, open PR, merge only after review/checks.
- FA-001 GitHub inventory: paginate all branches and PRs, classify merged/obsolete/diverged/unmerged; do not merge or delete automatically.
- FA-002 Delta and cross-system integration audit: inspect only changed or unproven paths; cashier offline, bot/order/inventory/subscription interactions, tenant isolation, and failures; evaluate concrete external findings.
- FA-003 Targeted fixes and cleanup: fix evidenced defects; run relevant regression gates; dictionary/AR/KU/EN review and structural cleanup only when justified.
- FA-004 Staging operational proof: Railway API/frontend, Neon PostgreSQL role/migrations, readiness, backups and service workflows. No production DB mutations.
- FA-005 Final visual QA: merchant, cashier, owner admin, AR/KU/EN, responsive and accessibility; last.
- FA-006 Final release decision: one verified main SHA, gate report, documented external-provider blockers, controlled domain/integration plan.

## Stage exit record
Task ID | baseline SHA | checked scope | prior evidence reused | new evidence | issues opened/closed | PASS/BLOCKED | next task.

## References
- [Historical 16-phase core freeze](../fawri-core-freeze-audit-2026-10-07.md)
- [Release blockers](../FAWRI_RELEASE_BLOCKERS.md)
- [Staging deployment contract](../staging-deployment-contract.md)


## Current continuation — SEQ-113 (2026-10-12)

Baseline23563ffb, main d38d2922; continue fromSEQ114, not from initialFA000/SEQ26. PR520 discussion carriesSEQ27–108; latest durable canonical additions coverSEQ109–113. New local harness27mocked runtime assertions/18existing source assertions; current-head isolatedCI132PASS/21FAIL/0SKIP reused. StableIDs for sync gap/shift recovery inISSUES; ordinary logout pending guard preserved. Estimates and uncertainty inPROGRESS; external production/staging/browser/provider/repair gates remain open. SeeWORK_HANDOFF for exact continuation and commands. No authorization for business fixes, merge or deploy.


## SEQ-114 — guarded real PostgreSQL proof prepared (2026-10-12)

Continuation from saved commit `3d88d9c78350db1b82036eee6e2a0a6c73c75ba6`. Added test-only `artifacts/api-server/tests/cashier-sync-multidevice-postgres.integration.test.mjs` and registered it first in the existing `cashier` isolated runner batch. No application changes or workflow permissions altered.

Two subtests plus parent: four independent merchant trials, two licensed/credentialed devices competing simultaneously for one physical stock unit at one location; require exactly one sale, one mutation, one timeline record, stock0/version2 and loser CASHIER_SYNC_NEGATIVE_STOCK. Concurrent exact winner replays must cause no second mutation; changed-note replay must reject idempotency conflict; loser retry must remain negative-stock. Separate actual-SQL timeline observation accepts1→3 and rejects later2, preserving the sequence-gap PROOF_GAP instead of approving that behavior. No provider HTTP: subscription activation uses existing test_fake APIs and all fixtures are synthetic.

Shared attestation executes before DB/application imports; teardown registered before first fixture mutation, tracks owned account IDs before INSERT and aggregates cleanup failures. Existing network-none runner and migrated schema retained. Local syntax checks PASS; direct unattested invocation exits1 with expected guard refusal before DB import. Actual PostgreSQL assertions **NOT_RUN locally / CI_PENDING**, no assertion success claimed. Expected inventory becomes36 unique files/38 invocations for the full isolated run if all existing phases execute; counts/results must come from logs, not expectation.

Exact next action: inspect the new commit's isolated CI cashier phase and this test's AUDIT_SUITE_RESULT, distinguish fixture/schema errors from product failures, verify cleanup, and update these ledgers. Do not rerun previous unchanged assertions merely to increase counts; this run is justified by new multi-device/altered-replay/gap assertions. After proof, continue SEQ-115 feasible expired/admin-closed historical shift recovery. Browser/IndexedDB remain blocked locally by missing Chromium. Functional fixes, hosted DB, deploy and merge remain unapproved. SEQ-114 is PREPARED until actual results are reconciled.


## SEQ-114a / SEQ-115 continuation

SEQ114 actual SQL gap behavior observed; stock-race fixture and existing recoverytamper fixture corrected after classified failures. Use EXECUTION_RESULTS for exact132/24counters and test-only fixes; useISSUES for unclosedfindings. Local29testsPASS, correctedSQL/HTTPCIawaited. Nextread correctedcommitlogs before resumingSEQ115runtime; do not equate preparation or green observation with closedreleasegate. No applicationchanges.


## Current exact resume checkpoint

SEQ-109–114 bounded audit completed with final executed source0d5b9ef8; SEQ-115 lifecycle source review completed, runtime recovery still OPEN. Read final EXECUTION_RESULTS/ISSUES/WORK_HANDOFF instead of earlier pending fixture notes. Final SQL/HTTP135PASS/21FAIL/0SKIP; no application fixes or launch certification. NextSEQ-116: feasible staff disable/re-enable or administrative shift closure with pending historical operation, and browser prerequisites for IndexedDB versionchange/replay/offline tests. Billing repair requires explicit approval of the concrete preserved proposal; do not merge/deploy/live-mutate.


## SEQ-116 — closed-shift recovery HTTP proof prepared, 2026-10-12

Continuation baseline `57032ce1a88d0ee1588b401fd714668485bb9952`, same audit branch/PR520. User clarified: complete comprehensive audit first; defer all application repair planning/execution until the audit is complete. Earlier billing implementation approval question is withdrawn; no approval requested. No restart of verified stages.

Added `artifacts/api-server/tests/cashier-closed-shift-recovery-http-postgres.integration.test.mjs` to existing guarded cashier runner. Synthetic disposable schema only: real HTTP PIN login, timestamp inside original session, real administrative staff-service disable/re-enable closing original shift, revoked-token rejection/no sale, fresh PIN login/new shift, wrong-device denial, old-operation HTTP upload with original staff/shift/session attribution, complete entity ACK and exact replay/no duplicate stock/order/attribution. Owner administration HTTP middleware, browser outbox, returns/voids and other-staff/tenant cases are outside this bounded new proof. Shared attestation executes before DB/application imports; aggregate HTTP/account/pool cleanup registered before mutation.

Local `node --check` PASS; direct invocation without attestation refuses (exit1) before DB imports as required. SQL/HTTP assertions **PREPARED / NOT_RUN** until isolated Actions logs are read. CI head baseline57032ce1 has23 completed workflows:21SUCCESS/2FAIL (isolated audit/cashier); prior source0d5b9ef8 results135PASS/21FAIL reused, not rerun evidence. New test adds one invocation, expected inventory37 unique/39 invocations, subject to actual logs. CASHIER-SYNC-SHIFT-001 remainsOPEN awaiting results; no new functional bug declared.

Next: read isolated cashier suite result/cleanup, classify fixture vs product failure; continue SEQ117 native IndexedDB versionchange/concurrency/changed-input replay. Existing browser-storage workflow only scans source and executes Node audit behavior; it does not launch a browser. Local Chromium/Docker/psql absent. Whole audit estimate unchanged~50% (40–60% uncertainty); source/runtime/browser/provider/hosted evidence remains separate.


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
