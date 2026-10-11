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

## Latest SEQ-19 checkpoint (supersedes next task above)

[Source1c498c06](https://github.com/nora953/fawri-production-source/commit/1c498c06e27da42ccb73bfbadb4bd7599d9e2601), [run38175863733](https://github.com/nora953/fawri-production-source/actions/runs/38175863733), job114578004547:115PASS/14FAIL/0SKIP;32 unique/33invocations, six28-migration chains/cleanupSUCCESS. Password recovery HTTP tamper/replay/concurrent reset/revocationPASS. Schema/addon proofs remainPASS. Current task also reconciled completed fc1ee417 CI counts (seeCI_EVIDENCE_RECONCILIATION_2026-10-11.md).

Next: verify checkpoint CI with33 unique files/34invocations. New selected auth-cutover-contract.test.mjs must execute its previously skipped PostgreSQL business-route assertion; early aggregate hook/awaited child teardown prepared. Verify Meta pipeline and foundation knowledge-gap steps now use owned offline meta-bot runner and no longer reject legacy service targets. Full Meta parent includes genuine all-but-one pool connection occupancy, preserved without name-filter skips. Do not count guard refusals as application defects. YAML/path test/local source10PASS+1DBSKIP verified. Then R09/R12/R13 source/negative access/semantic/deployment audit; remainingroughly2–4hours excluding fixes/queues/externalproof. Currentcode/docs saved in this checkpoint; no app change.
