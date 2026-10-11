# Remaining audit work — 2026-10-11

Each row is a short task with a separate saved checkpoint. Estimates are engineering estimates, not credit estimates or measured completion percentages. Reuse prior evidence unless the row adds an assertion or changes the tested configuration.

| Next task | Scope and success criteria | Current evidence / dependency | Estimate |
| --- | --- | --- | --- |
| R01 | Read latest isolated run; classify all 26 files, migrations and cleanup; save exact counters and issue updates | Pending source9331c489; do not guess totals | 15–30 min |
| R02 | Extend direct-entrypoint guards based on inventory; prove unsafe targets rejected before DB imports | Protected runner already proven; older standalone tests still unguarded | 15–30 min |
| R03 | Inject failed fixture setup and cleanup errors in disposable DB; prove all resources attempted and errors visible | Early hooks and mocked aggregate cleanup PASS; DB failure injection not complete | 15–30 min |
| R04 | Cashier retention selection and month-end/leap-year/proration boundaries | Existing grace, full lifecycle and seat competition coverage; policy016/014 unresolved | 15–30 min |
| R05 | Cashier same-key checkout, payment-ref competition and SQL-failure recovery | SaaS012/032 reproduced; cashier equivalent not yet established | 15–30 min |
| R06 | Refund after cycle change: base, expired/missing add-on batch, duplicate credit and concurrent refund | Base cross-cycle test pending018; sender suspension017 pending | 15–30 min |
| R07 | Knowledge learning lifecycle with synthetic embedding; confirm tenant-only approved answers and failure suppression | Knowledge RLS PASS; learning-cycle file present, not executed in current audit | 15–30 min |
| R08 | Full migrated Fawri schema plus synthetic account/merchant/RLS fixture dump/restore; compare data/policies and rerun tenant assertion | Current drill restores only three rows and two local files | 15–30 min |
| R09 | Sensitive non-RLS table grants and authenticated HTTP denial matrix | FA-I-007 remains a coverage gap; avoid owner-role-only conclusions | 15–30 min |
| R10 | Determine moderate advisory reachability in shipped API/frontend artifacts; propose minimum compatible patch |030 has exact dev dependency paths; exploitation unproven | 15–30 min |
| R11 | Normalize bot/AI/security CI counts, provider mocks, skips and failure coverage | Reuse already green adversarial/quality/security runs; live provider proof excluded | 15–30 min |
| R12 | Review critical Arabic/Sorani/English text and accessibility/error states from source; record semantic candidates | Structure already PASS; semantic/browser proof not supplied by structure | 15–30 min |
| R13 | Review staging deploy triggers, rollback and persistent-media recovery requirements; prepare reviewable recovery drill | Hosted changes forbidden; no-volume staging observation is historical | 15–30 min |
| R14 | Reconcile final report, canonical statuses, evidence links, remediation order and handoff | Draft only until required operational and visual gates resolved | 15–30 min |

The 14 listed tasks represent roughly **3.5–7 hours** of focused audit work, excluding queue time, additional investigations caused by failures, approved application fixes and external proof. This is a planning range; update it after each resolved row. A complete release decision has no reliable end date until the dependencies below are resolved.

## Decisions and external proof

- Application changes for restricted Meta routing and billing012/027/028/032 require explicit approval. Do not disable RLS or grant runtime BYPASSRLS.
- Reply-cycle credit policy needs a decision if observed behavior conflicts with accounting invariants; document behavior before proposing a change.
- Persistent catalog/support media storage, production-like recovery/PITR/RPO/RTO, real provider settlement and real Meta/AI operation require separately approved environments, credentials and procedures.
- Final visual QA requires an identified deployed version and approved site access; structure/typecheck/build success cannot substitute for browser evidence.
- Main merge and production deployment remain forbidden without explicit approval.
