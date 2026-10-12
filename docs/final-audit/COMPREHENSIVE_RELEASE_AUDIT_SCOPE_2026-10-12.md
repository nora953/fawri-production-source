# Fawri comprehensive release audit — scope and evidence gates

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


Updated 2026-10-12. This checklist extends PR #520 beyond code review. It does not certify any unchecked gate. Reuse `ISSUES.md`, `EXECUTION_RESULTS_2026-10-11.md`, `WORK_HANDOFF.md`, and `FINAL_REPORT_DRAFT.md` as authoritative evidence; never reset prior results.

## Non-negotiable completion contract

Every area must be classified as VERIFIED_PASS, VERIFIED_FAIL, SOURCE_REVIEW_ONLY, NOT_RUN, EXTERNAL_BLOCKED or NOT_APPLICABLE with a link to exact source SHA, CI job, runtime, fixture/environment, evidence, issue ID and owner/next action. CI success is not equivalent to production readiness. Keep unresolved findings and explicitly distinguish test-parent failures from independent functional defects.

| Area | Minimum acceptance evidence | Current boundary / next action |
| --- | --- | --- |
| Repository integrity and release lineage | main/PR SHA, branch differences, dependencies, stale code, no unmerged release-critical fixes, reproducible build | PR #520 is audit branch; no merge authorization |
| Database, migrations, RLS and privileges | disposable migrated schema, cross-tenant negative HTTP/SQL, concurrency, role grants, rollback, safe cleanup | Isolated suite executed; hosted runtime grants and sensitive non-RLS endpoints still open |
| Authentication, authorization, privacy | admin/merchant/cashier roles, OTP/password recovery, session revocation, device binding, logs/token redaction, account deletion | Synthetic session checks passed; hosted grants and remaining role surfaces unverified |
| Cashier and offline behavior | activation, multiple stations, offline 7-day grace, expiry/clock tampering, seat downgrade, sync conflicts, refund/void, operator history, locale UI | Some DB tests pass; billing failures and UI selection gap open; physical offline/browser proof not certified |
| Subscription, payment and accounting | SaaS vs cashier isolation, IQD proration, idempotency, paid-event replay, late payment, external provider failure, webhook signature and orphan reconciliation | Six synthetic findings open; external checkout rollback test prepared, not yet executed at SEQ-23 |
| Meta, bot and AI | webhook signature, replay/dedup, tenant page mapping, permissions, response quality, limits, queues, failure recovery and live sandbox proof | Injected Meta 54 PASS; restricted page map failure open; live Meta/AI not certified |
| Merchant/catalog/order/report/support | data correctness, stock/compensation, media upload and deletion, receipts, reports, support access and retention | Selected tests pass; full real-browser/data journey and durable hosted media unproven |
| UI, UX, accessibility, language | every screen and role at mobile/desktop, Arabic/English/Sorani terminology, RTL, loading/errors, screen reader, keyboard, receipts | Critical-source review only; browser and language sign-off not performed |
| Infrastructure, security, supply chain | secrets, TLS, CORS, CSP, rate limits, logs, 3rd-party advisories, startup/readiness, deployment rollback, alerts | CI/source checks pass in part; two moderate advisories, actual deployed image startup and alerts unverified |
| Backup, recovery, operations | full restore, PITR, RPO/RTO, role grants, media, cross-region/host failure, restore time, operator runbook | Disposable full-schema restore passed; hosted PITR/media/role recovery not certified |
| Commercial release and support | domains, Meta verification, payment gateway settlement, AI quotas/costs, privacy/terms, merchant onboarding, billing support, incident process | Requires explicit business/operator acceptance; cannot be certified from source alone |

## Execution priority

1. Verify current PR head and new CI results; run/read guarded external checkout rollback/orphan proof. Classify fixture vs real failures; update existing BILLING-EXTERNAL-TX-013 and BILLING-WEBHOOK-ORPHAN-015, not duplicates.
2. Reconcile all synthetic failures (10 functional + 4 parent at SEQ-23) into a prioritized remediation queue with test-specific acceptance criteria. No production data or live provider calls.
3. Finish non-code coverage inventory (UI screens/roles, offline cashier, operations, deploy, storage, business/legal readiness) and record precise external blockers rather than claiming pass.
4. Update FINAL_REPORT_DRAFT.md, REMAINING_WORK_MATRIX.md and WORK_HANDOFF.md with exact evidence and next step.

No production/staging mutation, application business fix, PR merge or live deployment without separate approval. GitHub commit is the durable checkpoint; if write fails, retry or explicitly report unpersisted findings.


## SEQ-119 — route and role browser coverage inventory (2026-10-12)

Source baseline PRheadb68d24e9 (application unchanged from57032ce1). This is a bounded inventory of actual routes and cashier entry modes, not repeated functional clearance and not an exhaustive screen/modal/permission denominator. Audience describes intended use; it does not certify authorization. No application browser journey below has been executed by this audit batch. NativeIndexedDB Chrome proof inSEQ117 only loads authority bundle, not these screens.

| Route | Component | Intended audience | Source App.tsx line | Browser journey |
| --- | --- | --- | ---: | --- |
| `/` | `LandingPage` | public/recovery | 116 | NOT_RUN |
| `/login` | `LoginPage` | public/recovery | 117 | NOT_RUN |
| `/signup` | `SignupPage` | public/recovery | 118 | NOT_RUN |
| `/verify-otp` | `OTPPage` | public/recovery | 119 | NOT_RUN |
| `/pending` | `PendingPage` | public/recovery | 120 | NOT_RUN |
| `/privacy` | `PrivacyPage` | public/recovery | 121 | NOT_RUN |
| `/terms` | `TermsPage` | public/recovery | 122 | NOT_RUN |
| `/owner-recovery/:recoveryId` | `OwnerRecoveryPage` | public/recovery | 123 | NOT_RUN |
| `/__dev/cashier-indexeddb-smoke` | `CashierIndexedDbSmokePage` | diagnostic (build flag required) | 127 | NOT_RUN |
| `/admin/support-preview/:sessionId` | `AdminSupportPreviewPage` | admin (role matrix required) | 133 | NOT_RUN |
| `/admin/emergency-access/:requestId/snapshot` | `AdminEmergencySnapshotPage` | admin (role matrix required) | 136 | NOT_RUN |
| `/admin/emergency-access` | `AdminEmergencyAccessRouterPage` | admin (role matrix required) | 141 | NOT_RUN |
| `/admin/early-warning` | `AdminEarlyWarningPage` | admin (role matrix required) | 148 | NOT_RUN |
| `/admin/owner-recovery-setup` | `OwnerRecoverySetupPage` | admin (role matrix required) | 151 | NOT_RUN |
| `/admin/work-monitor/:adminId` | `AdminWorkMonitorPage` | admin (role matrix required) | 154 | NOT_RUN |
| `/admin` | `AdminPage` | admin (role matrix required) | 157 | NOT_RUN |
| `/dashboard/notifications` | `NotificationsPage` | merchant | 160 | NOT_RUN |
| `/dashboard/conversations` | `ConversationsPage` | merchant | 164 | NOT_RUN |
| `/dashboard/products/import` | `ImportProductsPage` | merchant | 168 | NOT_RUN |
| `/dashboard/import-products` | `ImportProductsPage` | merchant | 172 | NOT_RUN |
| `/dashboard/products` | `ProductsPage` | merchant | 176 | NOT_RUN |
| `/dashboard/orders` | `OrdersPage` | merchant | 180 | NOT_RUN |
| `/dashboard/reports/combined` | `ReportsPage` | merchant | 184 | NOT_RUN |
| `/dashboard/reports/online` | `ReportsPage` | merchant | 188 | NOT_RUN |
| `/dashboard/reports/cashier` | `ReportsPage` | merchant | 192 | NOT_RUN |
| `/dashboard/reports` | `ReportsPage` | merchant | 196 | NOT_RUN |
| `/dashboard/cashiers/reports` | `ReportsPage` | merchant | 200 | NOT_RUN |
| `/dashboard/cashiers/discounts` | `CashierDiscountPoliciesPage` | merchant | 204 | NOT_RUN |
| `/dashboard/cashiers` | `CashierManagementPage` | merchant | 208 | NOT_RUN |
| `/dashboard/saved-answers` | `SavedAnswersPage` | merchant | 212 | NOT_RUN |
| `/dashboard/bot-training` | `TrainingPage` | merchant | 216 | NOT_RUN |
| `/dashboard/channels` | `ChannelsPage` | merchant | 220 | NOT_RUN |
| `/dashboard/subscription` | `SubscriptionPage` | merchant | 224 | NOT_RUN |
| `/dashboard/support` | `SupportPage` | merchant | 228 | NOT_RUN |
| `/dashboard/settings` | `SettingsPage` | merchant | 232 | NOT_RUN |
| `/dashboard/overview` | `OverviewPage` | merchant | 236 | NOT_RUN |
| `/dashboard` | `OverviewPage` | merchant | 240 | NOT_RUN |

Inventory: 37 explicit named route entries plus fallbackNotFound. Aliases remain separate routing assertions while the same underlying component need not be re-audited without reason. ReportsPage routes select combined/online/cashier views, so each view requires separate data/export assertions despite sharing a component.

Cashier separate entry`cashierMain.tsx`: ordinary POS, `?history=1`, `?reports=1`, `?sync=1`, `?diagnostics=1` (requiresVITE_CASHIER_DIAGNOSTICS=1) and demo flag require independent real application checks. AdminPage is composed of shell/controller/sections/dialogs; top-level`/admin` must not count all nested merchant/subscription/support/staff/incident/knowledge panes as verified.

Pending acceptance matrix for each reachable screen/view: AR/EN/Sorani × mobile/desktop, authorized role/unauthenticated/wrongrole, loading/empty/error/retry, keyboard/focus/screenreader, RTL/mixedcurrency/dates, offline/resume where relevant. Cover merchantapproved/pending/suspended/deleted, owner/admin distinct permission subsets, cashier/manager with denied operations, active/grace/expired subscriptions. Not every Cartesian combination is equally applicable; mark documentedNA instead of inventing passes. Prior API/source evidence must retain its original labels and source/run links. Production paths involving real settlement/Meta/AI/hosted media/PITR remainEXTERNAL_BLOCKED rather than passed by this inventory.

Next bounded taskSEQ120: continue actual report export/PDF range/completeness and missing cashier return/void historical HTTP negatives; preserve the route inventory when moving into application browser journeys. Consolidated repair plan remains deferred until comprehensive audit completion.


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
