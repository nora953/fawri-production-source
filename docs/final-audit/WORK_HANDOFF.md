# Fawri audit — current resume point

Updated2026-10-11. DraftPR520, audit/conversation-notes-reconciliation-20261011. Authorized changes are test infrastructure/fixtures/docs; application fixes, hosted mutation, merge and deployment need explicit approval.

## Last completed task

SEQ-18 [commitfc1ee417](https://github.com/nora953/fawri-production-source/commit/fc1ee4171eac9b75189383539857664afa37b264), [run38175555975](https://github.com/nora953/fawri-production-source/actions/runs/38175555975), job114577082735:31 unique files/32 invocations,114PASS/14FAIL/0SKIP. Six28-migration chains and owned-container/volume cleanupSUCCESS.

Full committed-schema dump/restore seed+verify PASS:94tables/45policies/3functions/638constraints/28journalrows/twofixturechannels, matching normalized fingerprint and postrestore restricted tenant reads.303 CHECK expressions reparsed on each side; equivalent-grouping and changed-predicate canaries PASS. Historical CHECK mismatch was representation. Roles remain pre-existing; no external media/PITR/cluster-role proof.

Addon refund FK/concurrency/expired-batch controls3PASS including parent. Base-cycle refund018 remains confirmed failing. Common real failed-setup/cleanup proof and injected Meta/knowledge lifecycle remainPASS. Fourteen failures are ten functional failures plus four parents for six existing findings006/012/018/027/028/032;027/028/032 also cashier-confirmed. No real provider money/key used.

## Saved preparation and exact next task

Inventory64 source candidates:17 direct guard markers/32 isolated selections after adding password recovery,32 outside both; transitive imports/globs not fully analyzed. Password recovery now rejects missing URL and unattested hosted-shaped URL before dynamic application imports (two local proofs); early aggregate teardown before setup. TSsyntax/API typecheck PASS. Read next isolated CI for this checkpoint (expected32 unique/33 phase invocations) and classify password HTTP tamper/replay/concurrent reset assertions. Verify migrations/teardown and preserve existing failure counts; save exact evidence.

Then continue REMAINING_WORK_MATRIX: sensitive non-RLS grants/authenticated denials; bot/security CI normalization; critical AR/Sorani/EN semantics/accessibility; deployment/media recovery review; final report reconciliation. Do not restart or rerun unchanged green checks without new assertions/configuration reason. Update PR summary after each significant execution checkpoint.

## Open findings and blockers

006 restricted Meta resolver;012 SaaS checkout race;018 base-cycle refund;027 expired-order late payment;028 paid/applied terminal mutation;032 SQL-fault durable reconciliation;030 two moderate artifact dependencies, active exploitability unproved.020 broader direct test guards open. Hosted role survey, real settlement/Meta/AI, external storage/PITR and visual QA require identified approved environments; no business repairs authorized. No localDocker/psql, isolatedActions available. Work balance not visible.

## Time estimate

Next CI/triage15–30minutes; roughly2–4hours remaining focused source/test audit excluding queues, new failures, application repairs and external proofs. Release readiness cannot be established until operational/visual dependencies are resolved. All code/results are committed to the audit branch; check current remoteHEAD before resuming.
