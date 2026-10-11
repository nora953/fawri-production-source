# Fawri audit — current resume point

Updated 2026-10-11. Draft PR520; audit/conversation-notes-reconciliation-20261011. Scope: test infrastructure, fixtures and documentation only. No hosted mutation, application fix, merge or deployment.

## Last completed task and saved evidence

SEQ-17: [commit 8dcc893e](https://github.com/nora953/fawri-production-source/commit/8dcc893ebf9c15a9162b93cb5276c392a7e4d4f9), [run38174896098](https://github.com/nora953/fawri-production-source/actions/runs/38174896098), job114575105770.30 unique files/31 invocations:110 PASS/15 FAIL/0 SKIP. Six fresh offline PostgreSQL clusters,28 migrations each; cleanup SUCCESS. Cashier negative suite2PASS/4FAIL (three functional failures plus parent); six same-key concurrency trials/shared payment-reference protection PASS. Existing006/012/018 and billing027/028/032 persist;027/028/032 now also cashier-confirmed. Real failed-setup cleanup and Meta injected-provider lifecycle remain PASS.

## Current checkpoint preparation

Native PostgreSQL CHECK parse/deparse normalization with positive grouping and negative changed-predicate canaries; no expression comparison removed. Exact original/restored sample showed associative AND flattening. Final full-schema fingerprint still FAIL in latest actual run; postrestore restricted reads PASS. New addon refund fixture tests FK restriction, concurrent refund and expired addon after renewal; syntax PASS only. Both changes saved in this checkpoint, actual run pending.

## Exact next task

Read isolated Actions for this checkpoint. Expect31 unique files/32 phase invocations and six migration chains. Verify canaries, all638 constraint definitions/counts/flags and full schema/data/ACL/RLS/function/index/journal fingerprints, restored restricted reads, addon results and cleanup. Classify any harness failure separately from product findings; update existing issue IDs. Preserve historical failure tables. Update PR summary to latest evidence.

Then continue REMAINING_WORK_MATRIX: direct-entrypoint guards, sensitive role grants, critical translation/UI semantics, deployment/recovery boundaries and final evidence reconciliation. Do not repeat unchanged proven checks unless fixture/runner changes require rerun.

## Open findings, blockers and authority

006 restricted Meta routing;012 SaaS checkout race;018 base-cycle refund;027 late expired payment;028 terminal paid/applied-state mutation;032 SQL-fault reconciliation evidence;030 two moderate dependency advisories with artifact presence but exploitability unproved. Business fixes require explicit approval. External provider, hosted role, storage/PITR and visual deployment proofs require identified approved environments. No local Docker/psql; isolated Actions available. Work balance is not visible and has not been estimated.

## Time estimate

Next CI/triage15–30minutes. Roughly3–6hours of remaining focused audit work excluding queues, new failures, application fixes and external proofs. Release completion time cannot be bounded until those gates are resolved. GitHub commit tree is the durable resume source; check remote HEAD before editing.
