# SEQ-225–231 — selector closure, contract triage and discount precision

Baseline `1db2beb108aea0b507012428cce7ab5129f388be`; branch `audit/conversation-notes-reconciliation-20261011`; 2026-10-13. Application, existing tests, workflows and schema unchanged. Only audit documentation/evidence added. No repair, deployment, provider request or hosted DB mutation.

## Stage results

| Stage | Inspected scope / actual evidence | Result and limits |
| --- | --- | --- |
| SEQ-225 | Canonical ledgers, SEQ-215–224 report, coverage inventory, PR #520 latest comment, exact remote head. Expanded filename scan across 243 tracked workflow/script/package files; manual executable selector/package review. | Continuity PASS. Seven of 41 unresolved selectors resolved through `validate-commerce-cashier-closeout.mjs:51–58` called by `commerce-cashier-closeout.yml:100` and `foundation-integration-final-gate.yml:187`. **34 remain unresolved**, including all13 integration files. This is command selection, not execution or statement coverage. CSV/JSON and read-only reproducer retained. |
| SEQ-226 | All28 non-integration files from original41-file queue; builtin-only imports, except pure discount readiness helper. Explicit local Node test command from JSON, clean child env with no DATABASE_URL. | **92 tests:87 PASS /5 FAIL /0 SKIP**, exit1. Full TAP preserved. Five failures are stale structural/text contracts, mapped below; they do not demonstrate five product failures. All28 files actually executed; historical nonexecution not asserted. |
| SEQ-227 | Actual `cashierDiscountPolicy.ts` via existing `cashier-discount-policy-runtime.test.ts`, Node native TS stripping, no mocks/DB. Re-execution justified by contradictory static-contract failure. | **9 PASS /0 FAIL /0 SKIP**, exit0: missing/disabled policy, explicit percent/amount, manager-only approval, independent amount/percent limits, conservative legacy cap, invalid amount. No HTTP, SQL or permissions clearance. |
| SEQ-228 | Actual exported discount limit/within-policy functions, independent BigInt arithmetic oracle, new four-test evidence harness. `cashierDiscountOverrideAuthority.ts:88–110,304–398,481–554`; route `cashier-operator-commerce.ts:134–155`. | **2 PASS /2 FAIL /0 SKIP**, exit1. New CASHIER-DISCOUNT-PRECISION-001 LOW/OPEN: admitted safe integer total9007199254740990,3333bps gives3002099511605172 instead of exact floor3002099511605171, and permits one minor unit above the mathematical cap. Normal monetary cases and rejection above MAX_SAFE_INTEGER PASS. Endpoint passes supplied base to safe-integer validation, but no actual authenticated request/SQL approval/cashier sale at this extreme amount executed. No ordinary-sized transaction impact demonstrated. |
| SEQ-229 | `postgresMetaAutoReplyIntent.ts:1540–1615`, `metaKnowledgeDecisionBoundary.ts`, `ai/knowledgeDecisionEngine.ts:690–799`; cashier tenant UPDATE1034–1048; reusable clean deployment workflow and migration runner; production readiness doc. | SOURCE_REVIEW_ONLY: all five failed contracts diverge from current source shape/wording; no source edit made. New AUDIT-STALE-SOURCE-CONTRACT-001 LOW test maintenance finding covering five files, not five new product defects. End-to-end context/tenant semantics not newly tested. |
| SEQ-230 | All13 residual integration entrypoints in CSV; four catalog variant histories, emergency2, knowledge lifecycle, merchant management/retention, order payment, owner, runtime authorities, support images. Existing DB_TEST_ENTRYPOINT_INVENTORY and PG-TEST-GUARD-002/003. | SOURCE_REVIEW_ONLY; runtime **NOT_RUN**. Ten have literal DB imports, three launch built server with inherited env. None has literal disposable attestation. Some loopback/name checks exist, which do not prove container ownership or exclude a tunnel. Fixed-ID knowledge fixture deletes accounts before seed and registers cleanup after seed. Maps to existing safety/cleanup findings; no new duplicate. Cannot execute safely here without owned guarded DB/build. Local Docker/Chromium/dependency tree absent. |
| SEQ-231 | Current33 Actions for exact baseline; provider identifier deletion run38343460680/job115119606452; previous pending run38342332323/job115115887813. | Current snapshot **26 SUCCESS /7 FAILURE**, all completed. Former pending run actually CANCELLED during install; downstream assertions NOT_RUN. Later provider job SUCCESS: static1PASS and SQL integration1PASS, separately; teardown success. Workflow uses disposable service + schema push, not network-none attestation/committed migrations/restricted deployed role. Other33-run outcomes are workflow statuses; seven failures not re-triaged/count-adjusted here. No extra credit for unchanged repeats. |

## Five contract failures — exact divergence

| Test | Failure / current source | Classification |
| --- | --- | --- |
| `cashier-manual-discount-policy.test.mjs:27` | Regex expects multiplication using `input.policy` in same function and old combined min. Current helper `percentageLimitMinor(total,policy):124` performs same floor with `policy`; explicit kind handles independent percentage/amount, legacy keeps stricter min. Actual nine runtime tests PASS. | Stale implementation-shape expectation. Separate extreme precision bug documented independently. |
| `cashier-merchant-catalog-isolation.test.mjs:88` | Requires `WHERE merchant_id = $1 AND id = $2` on one line. Actual UPDATE1038–1042 splits predicates across lines and adds version/deleted guard; values use `bundle.cloudMerchantId` and productID. Earlier SELECT/identity assertions in same test passed. | Whitespace-sensitive regex failure. No newly executed tenant SQL proof. |
| `clean-deployment-postgres-only-contract.test.mjs:15` | Expects inline POSTGRES_DB/migration journal/HTTP filename in wrapper. Wrapper now calls reusable isolated workflow with suite:http; executor performs committed migration before HTTP suite. | Stale wrapper structure; migration execution proof reused, no test weakened or fixed. |
| `knowledge-product-conversation-memory-contract.test.mjs:33` | Regex expects recentMessages immediately before end of decision input. Current intent passes recentMessages before optional trusted visual alternatives; boundary forwards input to engine, engine uses bounded history/trusted product/variant hints. | Stale object-tail expectation. Provider/SQL/engine journey not newly run. |
| `production-readiness-doc-contract.test.mjs:24` | Requires exact “AI/Knowledge providers are optional external integrations”. Doc says “The OpenAI-backed Knowledge providers are optional external integrations” and preserves core neutrality/external gates. | Wording mismatch; no new runtime gate defect. Historical readiness claims in document do not override open final-audit findings. |

## Commands, environment and counts

Fresh detached worktree of exact baseline; prior dirty worktree retained untouched. Node24.19.0. No dependency install, PostgreSQL connection, browser or provider invocation.

- `python docs/final-audit/evidence/seq225-selection-review.py` — expanded bounded selector CSV/JSON (243 sources,7new references,34 unresolved).
- `node --test --test-reporter=tap --test-concurrency=1 <28 explicit filenames>` — full exact argument list and clean environment in `evidence/seq226-unresolved-contracts.json`, TAP beside it; exit1.
- `env -u DATABASE_URL node --test --test-reporter=tap artifacts/api-server/tests/cashier-discount-policy-runtime.test.ts` — exit0,9P.
- `env -u DATABASE_URL node --test --test-reporter=tap docs/final-audit/evidence/seq228-discount-precision.test.mjs` — exit1,2P/2F.

Local totals across disjoint cases **105 tests /98PASS /7FAIL /0SKIP**. Five FAIL are source contracts, two FAIL demonstrate one numeric boundary defect. No suite parent markers in these totals. No application fixes or contract expectation changes. Initial review script/import-scanner syntax/regex errors were audit-tool preparation only; corrected before application tests; not included in counters.

## Current CI links

- [Baseline workflow details](evidence/seq231-ci-snapshot.json),33 terminal outcomes26/7.
- [Provider deletion latest run38343460680/job115119606452](https://github.com/nora953/fawri-production-source/actions/runs/38343460680/job/115119606452): source1P, SQL1P, distinct assertions; service container teardown success.
- [Previous provider run38342332323/job115115887813](https://github.com/nora953/fawri-production-source/actions/runs/38342332323/job/115115887813): CANCELLED, assertions NOT_RUN.
- [Quality run38343460736](https://github.com/nora953/fawri-production-source/actions/runs/38343460736): workflow SUCCESS. Success does not cover unselected contracts or certify full system.
- [Isolated run38343460740](https://github.com/nora953/fawri-production-source/actions/runs/38343460740): workflow FAILURE. Existing144P/24F count belongs to earlier explicitly parsed run; not copied as this run's count.

## Deduplication, measurable scope and continuation

Two new canonical findings: one LOW arithmetic function defect with extreme-value limits; one LOW stale-contract maintenance finding covering five failures. Residual DB guard/cleanup concerns map to existing PG-TEST-GUARD-002/003 and DB-TEST-CLEANUP-021, not new duplicates. No prior finding repaired or closed.

For the declared original41-file queue only: **28/41 files executed locally (68.29%)**,13/41 NOT_RUN (31.71%). This counts executed evidence, including failures, not acceptable outcome or branch coverage. Seven resolved CI command paths reduce selector uncertainty from41/277 to **34/277 (12.27%)**. These denominators cannot represent overall project completion. Overall audit remaining percentage remains NOT_YET_MEASURABLE;11-domain closure and full applicable route-role-language-device inventory still incomplete.

Next **SEQ-232**: mounted WorkMonitor denial/action state; owned child-process actual worker SIGTERM drain/restart; safely prepare13 residual integration proofs without weakening target guards; complete applicable UI case denominator. SQL/browser local blocker retained. No final repair plan until comprehensive audit closes. Release BLOCKED.
