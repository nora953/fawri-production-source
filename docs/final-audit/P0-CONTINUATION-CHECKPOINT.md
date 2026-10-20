# FAWRI P0 continuation checkpoint

## Schema reset correction — 2026-10-20T20:24:38.949777+00:00

Exact source `06a6be5887c3626624df06eb5d813ba6ca07eb2b`: 43/44 workflows SUCCESS, one schema-validation FAILURE. Isolated run39473205064/job118802337916 SUCCESS:65 complete invocations, all exit0/fail0/skip0/cancel0; canonical scope/server issuer16 TAP tests PASS. Candidate39473204638 SUCCESS. Canonical generation and byte reproducibility passed inside schema39473205447; its later smoke step failed42P06 because the acceptance fixture reset only public/drizzle and retained fawri_security between runs.

Corrected only the existing guarded disposable reset to include fawri_security before public/drizzle; added an internal local fawri_ci assertion before any schema reset. No migration idempotency shortcut, weakened assertion, hosted change or CI exception. Local syntax check PASS; corrected PostgreSQL execution pending CI. Evidence: evidence/P0-CANONICAL-TENANT-SCOPE-20261020.json.

Branch fix/p0-provider-receipt-order-discovery-20261015; Draft PR#550 remains based on test/p0-integrated-billing-meta-20261015. Release NO-GO. Canonical0040/helper exists and isolated protocol/server proof passed, but production RLS still trusts tenant GUC; no application writer cutover. Next: verify corrected schema CI, then private-object role admission, private-schema backup/restore coverage, trusted ownership/grants, all8 writers and production predicate cutover. Sensitive auth/cashier integrity and hosted gates remain open. Prior uncommitted local worktrees were left untouched; a clean detached worktree was created from exact live HEAD. Local shell is available again; no local PostgreSQL/Docker available.


## Continuation 2026-10-20T18:15:20.272Z — canonical tenant-scope foundation, validation pending

Recovered exact source/docs HEAD `72a15c68e524523939e0863d13315ebbc4520733`; all44 workflows completed SUCCESS, including migration39469980947, schema39469981839 and isolated39469981220. Draft PR#550 remains open against `test/p0-integrated-billing-meta-20261015`. No newer concurrent commit observed.

This increment adds canonical manual migration0040 (private fawri_security scope table/issuer/predicate), journal and reproducible snapshot, and server-only issueMerchantTransactionScope using the existing identity-checked authentication pool. Actual primary LOGIN/PID/full-XID are read from the same leased client; autocommit targets expire before issuance, unsupported isolation is explicitly rejected, and issuer commit precedes return. Call immediately after BEGIN before merchant/FK locks. No application caller or public RLS predicate is cut over yet.

The original isolated protocol now reads the canonical SQL rather than an independently drifting template. Its existing restricted NOLOGIN-owner tests remain; an added real LOGIN test exercises the server helper against the canonical migrated namespace using an actual separate auth pool, including GUC redirect denial, same-LOGIN other-backend denial, immutability, autocommit rejection, higher-isolation rejection, issuer revocation/failure rollback and pool recovery. All nested tests now feed the proof-emission guard.

**New execution results: pending CI, not yet accepted.** Local execution was attempted again and remains unavailable. Snapshot ID computed using the generator's deterministic SHA256 algorithm, checked against empty/abc standard vectors; canonical regeneration must verify it in CI. No new tests claimed passed.

Migration grants nothing to application LOGINs and does not provision roles. Canonical objects initially belong to the migration executor, matching current migration ownership behavior. Restricted function-owner/statistics provisioning and readiness rejection of direct/inherited/SET private-object access remain REQUIRED before production use. Prototype restricted-owner success is not certification of hosted canonical ownership.

Release **NO-GO**. Raw tenant GUC exploit in production predicate remains open. Next: inspect exact new-commit CI, fix any migration/service test failures, then add private-object readiness guards and trusted issuer grants in owned fixtures, migrate all8 scope writers with safe lock order, and only then replace public tenant GUC trust. Do not repeat protocol design or dependency work. No hosted data/grants/deployment, main push or merge.


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
