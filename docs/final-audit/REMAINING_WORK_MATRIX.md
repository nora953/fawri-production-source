# Remaining audit work — 2026-10-11

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
