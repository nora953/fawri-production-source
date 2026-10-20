# FAWRI P0 continuation checkpoint

Verified 2026-10-20T17:53:19.427Z. **Release decision: NO-GO.**

## Identity and current accepted increment

Repository nora953/fawri-production-source. Branch `fix/p0-provider-receipt-order-discovery-20261015`. Open Draft [PR#550](https://github.com/nora953/fawri-production-source/pull/550); actual base `test/p0-integrated-billing-meta-20261015`, not main.

Exact executable HEAD at verification: `8ae2cf717e04455e8f26a5bf80d28539b9ada62b`. **44/44 completed workflows SUCCESS**, independently fetched on that exact SHA.65 complete isolated invocation summaries, each exit0/fail0/skip0/cancel0. Containing documentation-only checkpoint has separate CI and an exact commit in GitHub history; do not transfer these source results to a newer HEAD without checking it. Recovered prior checkpoint5b38f8ecfc6ee551791ea61b653b804f71e2d05e was also44/44; no concurrent newer work observed before source publication.

## New implemented and verified protocol

Code: [SQL candidate](../../artifacts/api-server/tests/fixtures/tenant-transaction-scope-candidate.sql), blob `d7dab11686f150a74328277483e2066b5066fb00`; [direct LOGIN fixture](../../artifacts/api-server/tests/tenant-transaction-scope-postgres.integration.test.mjs). SQL template installs only the guarded test's owned nonce namespace. **Not a migration; production RLS and all application callers remain unchanged.**

Separate actual auth LOGIN receives authentication marker and issuer EXECUTE, with no direct scope-table SELECT/INSERT/UPDATE/DELETE. Actual tenant LOGIN has only probe-table CRUD and predicate EXECUTE, no issuer authority, ownership or role memberships. Two connections deliberately share the same runtime LOGIN/credentials. A separate NOLOGIN/non-superuser/non-bypass/non-createrole owner has private scope objects, pg_read_all_stats and merchant SELECT; neither LOGIN can SET ROLE into it.

Issuer uses actual session_user marker/role flags, validates target live same-database LOGIN/backend PID/32-bit backend XID and full epoch-aware in-progress transaction status, verifies merchant existence, then creates a fixed3-minute binding. LOGIN/PID/full-XID key cannot be rebound to another merchant or renewed in the same transaction. No actor/tenant GUC authorizes the predicate. Idempotent issuance preserves original expiry. Bounded cleanup deletes at most64 expired completed scopes; it retains expired in-progress tombstones so cleanup cannot enable renewal. Uses built-in PostgreSQL only, no extra extension/cloud dependency.

Read Committed is supported. Repeatable Read and Serializable explicitly deny scope because separate-connection issuance and snapshot visibility need deliberate integration. This does not establish that the existing production admin predicate is safe under every isolation level. Local execution is unavailable; all new SQL/Node proofs ran in actual guarded CI.

## Actual evidence

[Protocol evidence](evidence/P0-TENANT-TRANSACTION-SCOPE-PROTOCOL-20261020.json) records all44 exact-source run links/conclusions, all65 isolated counters, both protocol proof and still-successful production exploit proof, ownership/grants, limitations and next action.

- [Isolated engineering39468476801](https://github.com/nora953/fawri-production-source/actions/runs/39468476801), job118785998742 SUCCESS. New protocol **15 TAP tests PASS** (14 nested plus parent), fail0/skip0/cancel0; proof emits only after all checks pass.
- Own CRUD positive; foreign read/update/delete/insert denied despite GUC switch; forged actor/tenant GUC denial; issuer denial even with accidental EXECUTE grant; runtime and auth issuer private-table CRUD/SELECT denial.
- Same actual LOGIN, different backend replay denied even with known full binding identifiers. Same backend later transaction replay denied. Immutable merchant scope, no idempotent expiry extension, expired scope renewal denial and completed-only bounded cleanup PASS.
- Marker revocation prevents issuance; live backend/LOGIN/full epoch checks PASS. Unsupported RR/Serializable fail closed. Rollback restores data and local GUCs; four concurrent connections sharing one LOGIN retain isolation over two reuse rounds.
- Existing auth9/admin9/privilege matrix81, direct receipts read5/review11/execution14 and HTTP read11/review20/execution20 remain PASS. All cashier, billing, tenant/knowledge/retention, Meta, restore and Node22 HTTP invocations PASS. Pre-import guard now includes the new fixture and still rejects remote targets before DB/application import.
- [Migration candidate39468476963](https://github.com/nora953/fawri-production-source/actions/runs/39468476963), [schema39468476957](https://github.com/nora953/fawri-production-source/actions/runs/39468476957), [security39468476563](https://github.com/nora953/fawri-production-source/actions/runs/39468476563) and all other workflows SUCCESS. No migration history changes in this increment.

## Production security status: still open

Existing admin fixture simultaneously reports P0_TENANT_GUC_TRUST_PROOF with tenantGucForgery=true. Its production predicate still trusts a known foreign fawri.tenant_id under raw SQL. New protocol success is on its own probe table and must never be presented as production remediation. **P0 remains NO-GO.**

Previously verified work retained:0036 live administrator account/profile/password checks;0037 audit transaction binding;0038 actual-LOGIN issuer;0039 separate FAWRI_AUTH_DATABASE_URL with actual role identity and no production tenant/operator fallback. Core auth mutations and admin audit CRUD/SELECT are rejected at primary readiness, including column/inherited/SET privileges. Existing operator directory/receipt and mixed auth/account workflows remain intact.

Dependency High gate was resolved in58ddc2e1e8c3dc9e281569f3cad15d302e1a1ade (markdown-it14.3.1->14.3.2 through typedoc, real pnpm-generated/frozen-verified lockfile, unchanged SheetJS0.20.3 tarball gains integrity). No threshold/release-age exception. Current source security workflows pass; Moderate2 remains historical non-blocking scope, not a zero-vulnerability claim. See [dependency evidence](evidence/P0-MARKDOWN-IT-SECURITY-PATCH-20261020.json), [auth evidence](evidence/P0-AUTHENTICATION-ROLE-BOUNDARY-20261020.json), and earlier receipt/issuer evidence. Do not repeat completed dependency/prototype investigations absent new evidence.

Other remaining gates: sensitive auth SELECT/privacy and exhaustive reader/writer review; cashier PIN/station credential/operator session integrity beyond core8 tables; hosted least-privilege roles/grants/configuration and previous provider/storage/retention/owner/release gates. Preserve separate smart-replies and offline cashier logic/local essentials.

## Next precise engineering action

1. Recover live HEAD/PR/CI. Reuse this proven SQL logic rather than re-designing the protocol from scratch. Create a canonical production migration with private scope objects, explicit owner/ACL handling and reproducible stage/journal/snapshot. Neither prototype installation nor this checkpoint modifies existing production predicates.
2. Establish restricted trusted function ownership and pg_read_all_stats provisioning. Gate primary roles against private schema/table/function ownership, CRUD/SELECT and inherited/SET reachability/default ACL grants; keep auth issuer role free of direct scope CRUD. Do not silently certify hosted privileges.
3. Add server-only scope issuance through the existing trusted auth pool using actual primary-client session_user/PID/full transaction ID. Enforce supported Read Committed transaction startup/admission. **Issue and commit scope before protected merchant row locks:** the scope FK can otherwise wait on a lock held by the primary transaction awaiting issuance. Verify failure rollback/discard and pool affinity; hosted Neon pooler is not certified.
4. Migrate all eight scope writers: operationalPostgresAuthority, knowledge/postgresKnowledgeRuntime, postgresSubscriptionEntitlement, superQiSandboxWebhook, verifiedReceiptReplayExecution, saasBillingAuthority, postgresCashierStaffAuthority, authenticationPostgresAuthority. Audit order of locks, not just literal SET GUC replacement. Existing auth role and audited operator paths require explicit compatible handling.
5. Update actual primary LOGIN fixtures/grants to use the trusted issuer. Only then replace the production tenant-GUC authorization branch and change the original successful exploit finding into a denial regression. Preserve legitimate merchant/auth/operator receipt/business workflows and run full relevant CI. Do not weaken checks or ship a predicate that disables legitimate functionality.

## Environment and recovery

Current local execution environment remains unavailable: no shell, local Node or PostgreSQL execution claimed. GitHub connector and actual CI are the execution path. SQL ran only in fresh Docker-owned offline PostgreSQL16 namespaces using fabricated fixtures. Old worktree /workspace/scratch/f32f0a256dd0/fawri-auth and detached b95f7158 base are historical recovery hints, not confirmed current availability; do not reset connector-published work.

No production/staging/Neon data/role changes, Railway deployment, PR merge or main push. Independently verify project round-fire-18493605 / branch br-billowing-leaf-b14yamgu / neondb is explicitly disposable before hosted use. Use expected-SHA fast-forwards on audit branch only. **NO-GO.**
