# FAWRI P0 next-session handoff

Verified 2026-10-20T10:18:46.787Z. Branch fix/p0-provider-receipt-order-discovery-20261015; Draft PR#550 base test/p0-integrated-billing-meta-20261015.
Last accepted executable source `f5e3949a2fe10aa1bb4c18d254ac4af91d5a31bb`: **43/43 workflows SUCCESS**. Containing docs commit [skip ci] changes no executable source.

Read P0-CONTINUATION-CHECKPOINT.md, verify live remote HEAD/PR/CI, then read P0-ROLE-BOUND-DIRECTORY-ISSUER-20261020.md. Do not reset existing scratch work: local HEAD may lag connector-published source.

0038 COMPLETE in isolated CI: authenticated session_user must hold non-PUBLIC directory issuer EXECUTE; forged audits/GUC/current txid alone cannot authorize admin RLS. Dedicated production directory pool required, tenant startup rejects reachable issuer rights. Admin9 PASS; RLS33; directory6; receipt operator11; inbox18. Canonical schema39379037201, Foundation39379037518, isolated39379037396 (job118483788171) SUCCESS. All60 emitted invocation summaries valid, zero failures/skips/cancellations. Exact runs/proof JSON: evidence/P0-0038-ROLE-BOUND-ISSUER-20261020.json. Earlier failed compile/fixture sources are not acceptance.

NEXT: move only bounded receipt read to capability-specific trusted operator pool; reject tenant effective/inherited/SET-reachable reader EXECUTE at production readiness. Prove direct tenant denial + actual operator HTTP read/audit and keep receipt-only roles free of directory issuer. Review/execution later needs both pre-provider autocommit and entitlement callback authorization; do not blindly move one call or grant tenant operator rights.

NO-GO: arbitrary fawri.tenant_id still permits known foreign tenant selection with raw SQL; auth/permission and audit DML integrity, remaining receipt capabilities, safe hosted LOGIN/role/grant and historical rollout gates remain. No hosted change/merge/deploy. Neon only if independently verified disposable round-fire-18493605/br-billowing-leaf-b14yamgu/neondb; no provisioning this cycle. Preserve cashier/replies separation. Every batch: inspect -> implement -> focused tests -> GitHub commit/checkpoint -> verify SHA.


## Receipt read isolation candidate — 2026-10-20T10:25:52.655362+00:00
Parent checkpoint: `a52c520dbecfdc968c85f365092263f0c3545426`; branch `fix/p0-provider-receipt-order-discovery-20261015`, Draft PR #550 (base `test/p0-integrated-billing-meta-20261015`). This candidate commit contains this checkpoint; obtain its exact SHA from the GitHub branch/PR. Last accepted executable SHA remains `f5e3949a2fe10aa1bb4c18d254ac4af91d5a31bb` (43/43 SUCCESS; prior evidence retained).

Bounded receipt reads now use a dedicated capability-specific operator transaction. Production has no tenant pool fallback; receipt-only credentials need reader EXECUTE, not directory issuer EXECUTE. Receipt response is built after COMMIT. Production tenant readiness checks both operator capabilities, including inherited and SET-reachable grants. New disposable direct LOGIN integration covers tenant denial, bounded service read with durable redacted audit, live actor restrictions and production configuration failure; registered in isolated audit. Existing HTTP deferred-commit-failure coverage is preserved.

Actually executed locally: focused operator/readiness unit tests20 PASS; disposable safety/summary tests19 PASS; strict targeted TypeScript noEmit PASS; new MJS syntax PASS. PostgreSQL execution and full CI for this candidate NOT YET VERIFIED. No migration or hosted changes in this batch.

Next: retrieve candidate CI; inspect Foundation, schema and isolated audit logs, especially new direct LOGIN receipt pool fixture, existing receipt HTTP tests and extended reader ACL matrix. Resolve failures before accepting candidate. Preserve earlier 0038 evidence. Remaining P0: arbitrary tenant GUC trust; auth/profile/permission/audit DML integrity; receipt replay review/execution authority separation; safe hosted runtime roles/grants and previous rollout gates. Release decision **NO-GO**.
