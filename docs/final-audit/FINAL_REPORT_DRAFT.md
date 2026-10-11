# Fawri engineering audit — current evidence draft

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
