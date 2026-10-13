# Current evidence inventory — baseline 7e0da5eb, SEQ-224

This is a real scope/evidence inventory, not a universal test denominator. Each domain has partial proof. PASS and FAIL both constitute executed audit evidence; product release still requires acceptable outcomes. A domain cannot receive full credit merely because one constituent test passed.

| Required domain | Existing evidence reused | Current classification | Specific remaining acceptance proof |
| --- | --- | --- | --- |
| Repository/build/lineage | Four ledgers, remote main/head, current33Actions, quality build; prior225branch inventory | PARTIAL | Complete branch/PR disposition and exact launch artifact lineage; selection/coverage closure |
| Cloud cashier sync | Stock race, historical compensation/closed-shift HTTP, timeline, ACK models; SEQ-109–127 | PARTIAL / known findings | Legacy bridge historical role/device negatives, client shift transition/outbox recovery, gap/backfill contract, real network interruption |
| Offline cashier/licensing | Native IDB3P/1F, mocked authority/clock; SEQ-113/117 | PARTIAL / known findings | POS shell real offline cold start, 7-day grace/device/restart/clock tamper, signed authority policy and IDB altered payload |
| Payments/subscriptions/accounting | Current billing SQL suite, provider rollback faults, new actual-body webhook adapters | PARTIAL / known findings | Durable identity/orphans, concurrency/late/refund/mismatch/SQL faults, provider contract/settlement and independent cashier/SaaS semantics |
| Auth/session/tenant/RLS | Current admin1P, support5P, sensitive restricted5P, knowledge1P, management6P, production role6P | PARTIAL | Deployed runtime grants/non-RLS endpoints, remaining permission matrix, non-owner/concurrent recovery and true provider OTP |
| Admin/merchant/staff interfaces | Parent15P, Support12P/1F, Preview7P/4F, Emergency9P/3F, new monitor callbacks | PARTIAL / known findings | Full authenticated route and nested-pane role/refresh/write journeys, preview lifecycle and device/action state |
| Catalog/inventory/orders/data lifecycle | Golden HTTP, deletion/RLS, cashier deletion current1P; catalog-history unselected test source | PARTIAL | Four catalog/history SQL tests, retention boundaries and restore/redeletion/provider/media lifecycle under real role; concurrency faults |
| Reports/PDF/XLSX | Package ZIP independent consumer, report3P, central5P, receipt8P, date6P/completeness4P | PARTIAL / known findings | Foreign-currency units, full backend accounting, large dataset/load deadline, visual consumer/physical printer acceptance |
| AR/EN/KU/RTL/mobile/accessibility | Scoped component direction/overflow/PDF text and translation structure | PARTIAL | Route×role×language×viewport applicable cases, keyboard/focus/screen reader and semantic terminology review; no full Cartesian completion claimed |
| Meta/bot/AI | Injected54P, learning1P, signature/replay/queue proofs; restricted-page FAIL | PARTIAL / known findings | Restricted global page resolution, live authorized sandbox permissions/delivery, provider failure/quotas/costs and response quality |
| Hosting/recovery/security/operations | Disposable schema restore, backup/source gates, readiness snapshot; new shutdown adapter4P | PARTIAL | Hosted least privilege/media/PITR/RPO/RTO/TLS/alerts/redeploy rollback; actual worker drain/recovery; external/commercial/operator sign-off |

## Bounded numeric inventory

- **277** current top-level API test files, including **91 integration** files. API quality selector covers127;109 other files have literal references; **41/277 =14.80% selection paths unresolved** in the bounded scan.13 of41 are integration files. This is selection uncertainty, not percent of untested code.
- Current isolated run:41 unique files,43 invocations, all complete summaries. They mix unit/static/SQL assertions and cannot be divided by277 as universal execution coverage. Some other Actions execute separate tests; no such division made.
- **37 named app routes +fallback**, **5 cashier modes** plus demo, nested admin panes. Historical table remains source inventory. Component and authority harnesses provide partial evidence; no new full app route journey run in SEQ-215–224. An applicable route-role-device test-case denominator is still pending.
- **11 required domains** listed above. All have incomplete exit proof. Domain labels and SEQ IDs have no equal-weight basis for a completion percentage.

Overall completed/remaining audit percentage is **NOT_YET_MEASURABLE**. Historical54%/46% estimate is retired as a current measurement; preserved in previous records. This document supplies the missing scope baseline and measurable sub-inventories, but does not fabricate completeness of their applicability or evidence mapping. Next build explicit case IDs, applicability/NA rationale, expected behavior and exact current evidence; calculate completed-evidence cases/total applicable cases only within declared scope. Keep blocked external tests in denominator and report them separately.

Release BLOCKED. No application repairs or consolidated repair plan before comprehensive audit completion. Full evidence and next SEQ-225 are in [SEQ-215–224 report](SEQ_215_224_COVERAGE_WEBHOOK_MONITOR_20261013.md).

## SEQ-225–231 bounded update

Expanded243tracked script/workflow/package sources resolves7of41selectors through commerce validator and two workflow callers;34remain unresolved,all13integration unchanged.41/277 prior figure remains historical bounded result; current34/277=12.27% selection uncertainty.28of original41files executed locally (68.29%),13NOT_RUN (31.71%); this is execution of declared file queue, including failures, not product completion.92contract assertions87P/5F,9actual discount runtimeP,4precision2P/2F. Five stale test expectations and one extreme numeric defect documented. Current33Actions26SUCCESS/7FAIL; provider deletion source1P/SQL1P distinct. Whole audit percentage still NOT_YET_MEASURABLE. NextSEQ-232.

## SEQ-232–239 evidence update

Real childSIGTERM plus local durableFS/restart proof added; no productionSQL/provider clearance. Actual requiredPG worker stop callback proof uses inertSQL. Monitor request race and pending-action after403 added with inertfetch/state, mountedReact pending.15tests10P/5F strengthen two existing findings,zero new canonical product findings. Current33Actions25SUCCESS/8FAILURE: extra receipt failure is environment startup withzeroassertions.34unresolvedselectors/13integration queue unchanged; entire UI case denominator unresolved. Wholepercent NOT_YET_MEASURABLE; nextSEQ-240.
