# FAWRI P0 continuation checkpoint

Verified 2026-10-20T10:32:37.751Z. Release **NO-GO**.
Branch: `fix/p0-provider-receipt-order-discovery-20261015`; Draft [PR #550](https://github.com/nora953/fawri-production-source/pull/550), actual base `test/p0-integrated-billing-meta-20261015`.
Accepted executable commit: `6eede58f12a6871b773f0d8e880a1c76f506366e`. Previous accepted directory boundary: `f5e3949a2fe10aa1bb4c18d254ac4af91d5a31bb`; previous durable checkpoint `a52c520dbecfdc968c85f365092263f0c3545426`. Containing documentation commit changes no executable source and is identifiable from GitHub history.

## Completed and verified

0036–0038 remain reproducible and pass committed-history validation. 0038 gates administrative RLS on authenticated session_user issuer EXECUTE and the issuing transaction, blocking tested audit forgery and cross-session/later-transaction bearer reuse. This is not a complete tenant authorization fix.

This increment routes bounded receipt reads through a separate capability-specific operator pool and transaction. Production cannot fall back to tenant credentials. A receipt-only operator needs reader EXECUTE without directory issuer rights or direct table/audit CRUD. Response construction follows successful COMMIT. Production tenant readiness rejects direct, inherited or SET-reachable reader and directory issuer capabilities. No SQL migration was needed for this application/pool increment.

Actual execution: **43/43 workflows SUCCESS** on accepted executable SHA. [Schema39407921926](https://github.com/nora953/fawri-production-source/actions/runs/39407921926), [Foundation39407922119](https://github.com/nora953/fawri-production-source/actions/runs/39407922119), [isolated39407921866](https://github.com/nora953/fawri-production-source/actions/runs/39407921866), [migration candidate39407922080](https://github.com/nora953/fawri-production-source/actions/runs/39407922080). Schema confirms committed_reproducible and historical_reproducible true; unchanged0038 canonical hashes retained in evidence.

Isolated audit emitted61 complete invocation summaries, all exit0/failed0/skipped0/cancelled0 (invocations, not unique tests). Direct LOGIN receipt service5 PASS; existing receipt HTTP11; production RLS36; admin audit boundary9; directory6; receipt inbox18. Deferred audit COMMIT failure: native rows prepared2, HTTP503, no receipt response, no committed audit, unchanged receipt fields, zero entitlement grants. Direct LOGIN proof is a real service call; do not describe the legacy HTTP SET ROLE fixture as a separate authenticated LOGIN proof.

Locally executed: authority/readiness20, lifecycle10, safety/summary19 PASS; targeted strict TypeScript, new MJS syntax and remote-target refusal PASS. Evidence: [P0-RECEIPT-OPERATOR-POOL-20261020.json](evidence/P0-RECEIPT-OPERATOR-POOL-20261020.json). Earlier directory evidence remains [P0-0038-ROLE-BOUND-ISSUER-20261020.json](evidence/P0-0038-ROLE-BOUND-ISSUER-20261020.json).

## Confirmed remaining blockers

- Shared tenant LOGIN can choose an arbitrary foreign `fawri.tenant_id` through raw SQL; direct proof remains true. User-controlled GUCs are not authenticated tenant identity.
- Auth/account/profile/permission and audit-table DML integrity still needs a separate trusted boundary and least-privilege rollout.
- Receipt review and replay execution still consume the shared operational pool; execution reauthorizes inside entitlement application. Do not grant these capabilities to the tenant role or move only one of the two authorization phases.
- Hosted safe LOGIN/role/grant provisioning and previous storage/provider/retention/owner/rollout gates remain open. No hosted security certification is implied by isolated CI.

## Environment and next action

No Neon data/roles/grants changed; no Railway deploy, merge or main push. Hosted disposable identity must be independently verified before any use: project round-fire-18493605 / br-billowing-leaf-b14yamgu / neondb. Local dependency installation limitations remain; complete types/build/SQL proofs ran in guarded CI.

Next: verify live branch/PR/CI, then separate bounded receipt REVIEW using capability-specific operator transactions around both SQL review calls, with provider I/O outside transactions. Add direct LOGIN denial/positive/audit tests. Design execution separately to retain authorization/mapping recheck in the entitlement transaction. In parallel planning, replace tenant GUC trust with DB-verified scope and protect authentication DML before any P0 acceptance. Preserve separate cashier/smart-replies behavior. Local worktrees may have detached older HEAD with connector-published changes: do not reset or discard them.
