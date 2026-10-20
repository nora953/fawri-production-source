# FAWRI P0 continuation checkpoint

Verified 2026-10-20T15:43:21.254Z. Release decision **NO-GO**.
Branch `fix/p0-provider-receipt-order-discovery-20261015`; Draft [PR#550](https://github.com/nora953/fawri-production-source/pull/550), actual base `test/p0-integrated-billing-meta-20261015`.
Accepted executable SHA `64981e847dbb2f496034050670d431760c1691bf`; implementation `f19639f17169291b14bf9232520e0e1b592e55df`, test-observer repair in accepted SHA. Parent durable checkpoint `5793a6f963ddde393237c7c76f122f8fecb3ba21`. Containing docs-only checkpoint changes no executable source; obtain its commit from GitHub history when resuming.

## Completed and verified

Receipt EXECUTION now uses a capability-specific operator transaction before provider I/O. A server-only BillingReplayScope transaction runner carries that same credential boundary into BOTH SaaS/cashier receipt admission and entitlement application. Validated SQL capability output selects merchant scope. Fresh execution preserves four authorization checks across three durable transactions: pre-provider audit, receipt admission, then application with checks at entry and immediately before entitlement mutation. Provider I/O holds no authority locks. Normal non-replay billing retains its existing transaction path. Production cannot fall back to tenant credentials; startup rejects direct/inherited/SET-reachable execution EXECUTE alongside directory/read/review capabilities.

Executor is a TRUSTED billing worker role with targeted billing DML; not a tenant role and not a capability-only role. Its direct LOGIN fixture has no auth/account/session/audit/inbox CRUD, other audited operator capabilities, ownership, privileged membership, CREATEROLE or BYPASSRLS. Capability-specific logical pools share the server-configured FAWRI_OPERATOR_DATABASE_URL; no hosted roles were provisioned. Prior0038 directory and receipt READ/REVIEW boundaries remain verified.

Actual execution on accepted source: **43/43 workflows SUCCESS**. [Foundation39449864275](https://github.com/nora953/fawri-production-source/actions/runs/39449864275), [schema39449864122](https://github.com/nora953/fawri-production-source/actions/runs/39449864122), [isolated39449864066](https://github.com/nora953/fawri-production-source/actions/runs/39449864066), [migration candidate39449864505](https://github.com/nora953/fawri-production-source/actions/runs/39449864505). Full API/DB types and build passed. No migration added; committed/historical reproducibility true,0038 canonical SQL/snapshot hashes unchanged.

Isolated audit:63 complete invocation summaries, all exit0/failed0/skipped0/cancelled0 (invocations, not unique tests). New direct LOGIN execution14 PASS; direct review11; direct reader5; HTTP execution20/review20/reader11; RLS46; admin boundary9; directory6; inbox18. New proof: zero primary pool query/lease calls during execution, four checks/three transactions, post-provider permission/session/EXECUTE revocation and mapping denial, six SaaS/cashier grant/admission/application-COMMIT failure-and-recovery cases, exact microsecond paid timestamp, concurrent duplicate calls across two authorities, unchanged inbox fields and one grant per applied order. Positive dedicated-credential applications cover activate for both products; other billing operations retain prior regressions, not separate hosted credential certification.

Local actual checks: operator/readiness/lifecycle32 PASS; safety/summary19 PASS; strict targeted TypeScript including execution/billing dependency closure, MJS syntax and whitespace PASS. Sandbox NODE_ENV=test exercises the production DATABASE gate only; production payment provider remains uncertified. Direct LOGIN proof is service-level. Existing HTTP SET ROLE proofs must not be described as independent direct LOGIN certification.

## Failure history retained

Initial source f19639f1:42 workflows passed, isolated failed. New fixture12 PASS/2 FAIL (one concurrent subtest and parent): a global idle-in-transaction assertion mistook another request's transaction for this request's retained lock. Accepted repair replaces it with a separate owned-actor UPDATE/ROLLBACK probe under bounded lock_timeout, which would block on this request's retained FOR SHARE lock while letting other requests finish. allSettled ensures no teardown races. Application code was unchanged by that follow-up; no outcome was converted into expected failure. Final new fixture14/14 PASS.

Accepted-source Meta ingress run39449864097 first failed during pnpm download (ECONNRESET), before tests. Failed jobs rerun without code changes; attempt2/job118721833322 SUCCESS. This retry is recorded, not erased.

Evidence: [P0-RECEIPT-EXECUTION-OPERATOR-POOL-20261020.json](evidence/P0-RECEIPT-EXECUTION-OPERATOR-POOL-20261020.json). Previous [review](evidence/P0-RECEIPT-REVIEW-OPERATOR-POOL-20261020.json), [read](evidence/P0-RECEIPT-OPERATOR-POOL-20261020.json) and [0038 directory](evidence/P0-0038-ROLE-BOUND-ISSUER-20261020.json) evidence remains.

## Remaining P0 blockers

- Shared tenant LOGIN still selects a known foreign fawri.tenant_id using raw SQL. User-controlled GUCs are not authenticated tenant identity; direct proof remains true.
- Authentication/account/profile/permission/session/device and audit DML integrity is not separated from all shared runtime paths. These writes can undermine actor/session checks; no full administrative security closure is claimed.
- Hosted safe LOGINs/grants/configuration and earlier provider/storage/retention/owner/rollout gates remain open. Isolated test roles do not certify hosted privileges.

## Environment and next precise work

No Neon production/staging/data/role changes, no Railway deployment, merge or main push. Independently reverify project round-fire-18493605 / branch br-billowing-leaf-b14yamgu / neondb as disposable before any hosted use. Local full install remains limited; full types/build/SQL proofs ran in guarded CI. Do not reset older detached worktrees containing connector-published source.

NEXT: establish a separate trusted authentication database boundary BEFORE replacing tenant GUC trust. Start with authPostgresSessionAuthority's own dynamic @workspace/db pool and the operational-pool writers listed in evidence: owner break-glass, admin account/password/security, merchant account/management/retention and owner provisioning. This nine-file literal SQL scan is a starting inventory, not proof of exhaustive coverage. Trace login/session issue/rotation/revocation, admin/device/password changes, signup/provisioning, retention/delete and required reads; preserve atomic mixed account/merchant operations. Inventory tenant-reachable auth writes including INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER, column grants and inherited/SET-reachable roles. Add direct LOGIN denial/positive tests before production readiness can reject those privileges. Do not merely remove grants and break legitimate authentication. Then design DB-verified tenant scope bound to actual LOGIN/backend/transaction so forged GUCs cannot select foreign merchants; do not treat more user-controlled GUC comparisons as a boundary. Preserve cashier/smart-replies separation and local offline essentials. Release stays **NO-GO**.
