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
