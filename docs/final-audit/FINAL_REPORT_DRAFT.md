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
