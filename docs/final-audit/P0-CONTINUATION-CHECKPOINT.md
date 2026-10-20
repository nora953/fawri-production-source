# FAWRI P0 continuation checkpoint

Verified 2026-10-20T10:51:38.165Z. Release decision **NO-GO**.
Branch `fix/p0-provider-receipt-order-discovery-20261015`; Draft [PR#550](https://github.com/nora953/fawri-production-source/pull/550), actual base `test/p0-integrated-billing-meta-20261015`.
Accepted executable SHA `98c48d569aff18dff566692afc93095a94de6c6a`; parent durable checkpoint `ab93c6ea59b28eb0d58d2b9ad132433442adebc7`. Containing documentation commit changes no executable source; obtain that commit from GitHub history before resuming.

## Completed changes and verified execution

Bounded receipt REVIEW now uses its own capability-specific operator transaction for BOTH SQL review calls. The first audit commits before provider I/O; no actor locks span that I/O. The second transaction revalidates current permission, database EXECUTE and receipt/order mapping, then commits its audit before confirming. Receipt-only review credentials need neither directory issuance nor reader/replay-execution capabilities nor direct table/audit CRUD. Production cannot use tenant credentials as fallback. Tenant readiness inventories the review capability along with directory and receipt read, and rejects direct, inherited or SET-reachable grants.

No migration was added. 0036–0038 committed history and schema remain reproducible. 0038 role/transaction-bound directory authority and the prior bounded receipt READ separation remain intact.

Actual CI on executable SHA: **43/43 workflows SUCCESS**. [Foundation39410021278](https://github.com/nora953/fawri-production-source/actions/runs/39410021278), [schema39410021365](https://github.com/nora953/fawri-production-source/actions/runs/39410021365), [isolated39410021396](https://github.com/nora953/fawri-production-source/actions/runs/39410021396), [migration candidate39410021178](https://github.com/nora953/fawri-production-source/actions/runs/39410021178). Full types/build passed. Schema diagnostics confirm committed_reproducible=true and historical_reproducible=true with unchanged0038 SQL/snapshot hashes.

Isolated audit:62 invocation summaries, all complete and exit0/failed0/skipped0/cancelled0 (invocations, not unique tests). New direct LOGIN review11 PASS; HTTP review20; HTTP execution20; direct LOGIN reader5; HTTP reader11; production RLS42; admin boundary9; directory6; receipt inbox18. New regression proves separate restricted tenant/reviewer LOGINS; review-only EXECUTE without table CRUD; SaaS and cashier workflows remain distinct; first audit committed before fake provider; permission/EXECUTE/mapping changes rechecked; both deferred-COMMIT failure phases fail closed; no order/receipt/entitlement mutation. Existing deferred HTTP read COMMIT proof still passes.

Local actual results: focused operator/readiness/lifecycle31 PASS; disposable safety/summary19 PASS, including remote-target rejection for both new LOGIN fixture entrypoints; strict targeted TypeScript, MJS syntax and whitespace PASS. Production DATABASE configuration gate is tested with NODE_ENV=test fake sandbox transport. This does not certify a production payment provider. Direct LOGIN proof is service-level; legacy HTTP SET ROLE tests are not independent direct LOGIN certificates.

Evidence: [P0-RECEIPT-REVIEW-OPERATOR-POOL-20261020.json](evidence/P0-RECEIPT-REVIEW-OPERATOR-POOL-20261020.json). Earlier evidence remains [receipt read](evidence/P0-RECEIPT-OPERATOR-POOL-20261020.json) and [0038 directory](evidence/P0-0038-ROLE-BOUND-ISSUER-20261020.json).

## Confirmed P0 blockers

- Shared tenant LOGIN can forge foreign `fawri.tenant_id` through raw SQL. User-controlled GUCs are not DB-authenticated tenant scope; direct proof remains true.
- Authentication/accounts/profile/permission and audit DML integrity still needs least-privilege separation.
- Receipt replay EXECUTION still authorizes through the shared operational pool and through billing transaction callbacks. Its role boundary remains open despite20 passing functional HTTP tests.
- Safe hosted LOGIN/grant provisioning and previous storage/provider/retention/owner/rollout gates remain open. Isolated CI is not hosted role certification.

## Environment and precise next action

No Neon data/roles/grants changed. No Railway deploy, merge, main push or hosted production/staging write. Before using any hosted disposable environment, independently verify project round-fire-18493605 / branch br-billowing-leaf-b14yamgu / DB neondb. Local full dependency installation remains limited; required full build/types/SQL evidence is from guarded CI. Detached worktrees may contain already connector-published source; do not reset or discard them.

NEXT: inspect `verifiedReceiptReplayExecution.ts`, `billingReplayScope.ts`, SQL0032 and both SaaS/cashier `processEvent` implementations. Execution has authorization before provider I/O, at receipt admission, at application entry, and again immediately before entitlement mutation on the fresh path. Preserve all these checks and separate durable admission/application commits. Design a server-only trusted execution transaction runner carried by BillingReplayScope, so BOTH billing phases can use the bounded operator pool without granting execution to tenant LOGINs or losing atomic authorization. This runner is a proposed next design, not implemented/certified here. Add direct LOGIN negative/positive and failure/revocation/recovery coverage; extend readiness ACL inventory. Then address DB-verified tenant scope and auth DML integrity. Preserve offline cashier and smart-replies separation. Release remains **NO-GO**.
