# Fawri engineering audit — evidence-based draft

Updated 2026-10-11. This is an interim report, not a release approval. Main baseline d38d29229bed0f9575a98e7026e7819fe363bfd4. Changes remain in draft PR520 on audit/conversation-notes-reconciliation-20261011.

## Decision supported by current evidence

Launch readiness is **not established**. Disposable testing has confirmed restricted-role Meta routing failures and several synthetic billing reliability defects. Important recovery, external-provider, hosted runtime and visual gates remain open. No production or staging data was modified by this audit.

## Verified execution checkpoint

[Sourcefbbb9d0c](https://github.com/nora953/fawri-production-source/commit/fbbb9d0cb8806d1e0fc7bd04d57aa7fdd34f1132), [Actions38172886288](https://github.com/nora953/fawri-production-source/actions/runs/38172886288), job114569035624:

- 23 suite files: **50 Node passes, 9 failures, 0 skips**; 20 files successful. Nine failures comprise six failed functional subtests and three failed parents. Do not add rerun counts together or call nine independent defects.
- Four fresh PostgreSQL16 instances each applied all 28 committed migrations. No schema push. Application tests ran with no external network, synthetic credentials, read-only checkout and disposable-target preflight. Owned container/volume cleanup succeeded.
- Successful selected coverage includes account bootstrap and journeys, no root JSON in the golden journey, merchant deletion RLS, cashier seat limits/concurrency/rollback/grace/historical operations/compensation, positive SaaS and SuperQi sandbox fixtures, customer payments/refunds, reply entitlement, tenant/knowledge/reminder isolation.
- SQL-failure recovery: transaction rolled back all entitlement writes; replay after removal of the synthetic fault applied once and subsequent replay was duplicate. Durable reconciliation during the fault did not persist.

[Restore38172886344](https://github.com/nora953/fawri-production-source/actions/runs/38172886344), job114569035881 on the same source: 21 guard/object tests passed; workflow-owned loopback service and empty source schema verified before writes; three PostgreSQL rows restored with matching checksum/count/consistency hash; two local objects restored consistently; cleanup passed. This is a small synthetic restore drill, not full Fawri or production recovery.

Latest [source2964aba2](https://github.com/nora953/fawri-production-source/commit/2964aba2800274f704adbe5cf820e458958f0915), [run38173603888](https://github.com/nora953/fawri-production-source/actions/runs/38173603888), job114571197444:27 files,**106PASS/10FAIL/0SKIP**,23 files successful. Five fresh28-migration chains and cleanup PASS. Seven functional failures plus three parent failures correspond to the six indexed product/reliability findings below.

Corrected Meta harness:54passes (53subtests+parent),0fail/skip. Injected providers cover send deduplication, confirmed/uncertain failure handling, media provenance/unsafe URL denial, manual takeover and tenant-scoped knowledge. Standalone knowledge learning-cycle passed. Suspended subscription duplicate reservation still returns duplicate; official PostgreSQL transport rejected sending with zero fake-provider invocations (017). This is owner-role/injected-provider coverage; restricted Meta page resolver006 still fails. Historical52harness failures are retained in ISSUES.md. Next28file matrix added failed-setup/cleanup SQL proof, but [run38173870161](https://github.com/nora953/fawri-production-source/actions/runs/38173870161) on43e60b16 returned106PASS/11FAIL/0SKIP: new child harness skipped its file because of inherited NODE_TEST_CONTEXT. One extra failure is infrastructure; no real cleanup proof from it. Context stripping and full migrated-schema restore are prepared, pending new CI. The restore uses an offline owned cluster, preserves and compares data/ACL/RLS/functions/constraints/indexes, and verifies restricted tenant reads; cluster roles remain pre-existing in the same temporary cluster.

## Confirmed problems and remediation order

| Priority | Issue | Confirmed behavior | Repair acceptance criteria |
| --- | --- | --- | --- |
| P1 | FA-I-006 | Restricted NOLOGIN/NOSUPERUSER/NOBYPASSRLS role sees own tenant correctly; global Meta page map returns0 instead2 and known approved page returns503 | Narrow audited resolver routes synthetic approved pages while retaining tenant isolation, pool context reset and generic unknown-page failure; then staging proof |
| P1 | BILLING-PAID-REPLAY-028 | Distinct verified mismatched-amount event rewrites a paid order to paid_reconciliation_required | Paid/refunded terminal state and applied entitlement preserved; conflicting event audited and safely rejected |
| P1 | BILLING-LATE-EXPIRED-027 | Matching verified payment for proactively expired checkout throws not-payable before reconciliation | Durable received-payment reconciliation without applying inappropriate entitlement; safe duplicate/retry and operator handling |
| P1 | BILLING-IDEMPOTENCY-012 | Identical concurrent checkout calls yield SQLSTATE23505 to one caller | Both callers receive one stable checkout; changed payload rejected; no duplicate order/charge |
| P1 | REPLY-RESTORE-CYCLE-018 | Old-cycle refund resets new-cycle used1->0 and remaining3999->4000 while new debit stays in ledger | Cycle-aware refund accounting preserves unrelated current-cycle usage; duplicate/concurrent and add-on refund tests |
| P1/P2 | BILLING-SQL-RECONCILIATION-032 | SQL failure leaves pending order and no provider-event/reconciliation record; retry recovery works | Durable received-payment evidence or independently proven reliable retry/recovery procedure; no duplicate entitlement |
| P2 | SUPPLYCHAIN-MODERATE-030 | Two moderate dependency advisories in dev dependency paths | Determine shipped artifact reachability and apply compatible minimal patch/override with build verification |

Application/business repairs are outside the current authorization. Priorities reflect the synthetic failures and potential operational impact, not proof of a live incident or exploit.

## Test infrastructure repairs

- 020: fail-closed pre-import disposable guard protects priority suites and selected direct entrypoints; runner preloader protects the remaining selected legacy suites. Arbitrary direct execution of older tests is still unproven.
- 021/024: earlier cleanup hooks, aggregate error reporting and container/volume teardown. Mocked cleanup failure tests pass; broader real failed-setup cleanup scenarios remain open.
- 022/023: removed unnecessary merchants.json compatibility fixture; same golden journey passed with no root JSON persistence.
- 025/026: exact historical fabricated credential findings narrowly pinned; corrected only invalid E.164 test phones. Security scan and positive billing fixtures passed.
- 029/031: reject URL override parameters, strip inherited libpq routing environment, restrict restore verification to a row-count grammar; CI verifies owned fresh loopback service and reports cleanup errors.

## Evidence limits and next work

RLS results are for synthetic roles/data and committed schema, not a complete live staging-role grant survey. SuperQi tests use synthetic/sandbox fixtures; no real charge or settlement was performed. Injected AI/media/transport providers cannot establish real OpenAI/Meta availability, token permissions or operational quality. Current restore does not prove persistence across redeploys, external storage, retention or PITR. Translation structure success does not prove wording quality, responsive layout or accessibility.

See ISSUES.md for canonical findings and historical updates, EXECUTION_RESULTS_2026-10-11.md for execution tables, REMAINING_WORK_MATRIX.md for short tasks and estimates, and WORK_HANDOFF.md for the exact next action. The final report must reconcile all required successful, failed, skipped and blocked gates before a release decision.

## Latest SEQ-15 recovery checkpoint

[Sourcefe892e69](https://github.com/nora953/fawri-production-source/commit/fe892e6973907e93c808f2c5af80b7273c224e9e), [run38174186237](https://github.com/nora953/fawri-production-source/actions/runs/38174186237), job114572937993:29unique files/30invocations,108PASS/11FAIL/0SKIP. Six28-migration chains and teardownPASS. Real failed-setup/cleanup injection nowPASS: firstcleanup SQLfails, laterDELETE removes bothfixture rows, boundederrorreported/no rawdrivererror.

Full schema seed/restrictedreadsPASS (94tables,45policies,3functions,28journalrows,twochannels); pg_dump/pg_restore commandPASS. Finalfingerprint verificationFAIL, componentcause unknown; fullrestore remainsOPEN. New boundeddiagnostics and postrestore tenantread proof pending. Do not label mismatch data loss or a harmless format difference without evidence.

030: fast-copy4.0.3 is present in locally built pino-pretty asset, and staging Dockerfile copies allbuilt assets/node_modules; defaultproduction logger disables prettytransport. Artifact presence established, activeproduction exploitability unproven.
