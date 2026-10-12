# Fawri comprehensive release audit — scope and evidence gates

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
