# FAWRI P0 continuation checkpoint

## In-flight knowledge caller increment — 2026-10-20T23:02:09.952635+00:00

Live recovery HEAD `57da9fc9a9dc0bff3b04427c7700ef6083219e39` independently verified: all44 workflows completed SUCCESS. PR550 remains open Draft with base `test/p0-integrated-billing-meta-20261015`. The containing engineering commit's exact SHA is in GitHub history; its CI is PENDING until execution is checked.

Knowledge's actual PostgreSQL client now calls issueMerchantTransactionScope immediately after BEGIN through withOperationalTransaction, before protected SQL/merchant FK locks. It retains the leased primary connection and inherits discard on uncertain BEGIN/COMMIT/ROLLBACK. The old transaction-local GUC is temporarily retained solely for compatibility with the unchanged public predicate. There is no bootstrap/runtime bypass. This is caller wiring, not production RLS remediation.

Disposable knowledge/learning/lifecycle/Meta fixtures now separate actual primary/auth LOGINs from bootstrap setup/inspection. Auth fixture receives private-schema USAGE and issuer EXECUTE, never private-table CRUD. Knowledge RLS fixture temporarily uses canonical private policies on its five public knowledge tables and restores original policies in cleanup; checks real scope tuple, foreign-GUC/update denial, issuer revocation blocking callback, rollback and pool reuse. These assertions are newly added, not yet database-verified in this commit. Dashboard knowledge CI now uses the strict owned isolated runner. Knowledge batch adds management/lifecycle coverage.

Actually executed locally:33 focused knowledge runtime/transaction lifecycle tests PASS,15 disposable guard tests PASS; syntax, whitespace and security policy PASS. No local PostgreSQL run. No production/staging/Neon writes, deployment, main push or merge.

NEXT: inspect this exact commit's CI; resolve genuine failures without bypassing identity/attestation, retain evidence, then continue remaining caller migration and public RLS cutover. Six legacy GUC writer locations remain, with knowledge now additionally requiring a private scope. The original public-predicate GUC exploit remains open. Hosted ownership/grants/pooler and remaining prior P0 gates remain uncertified. **Release NO-GO.**

---

Verified 2026-10-20T22:38:10.137Z. **Release decision: NO-GO.**

Repository nora953/fawri-production-source. Branch `fix/p0-provider-receipt-order-discovery-20261015`. Open Draft [PR550](https://github.com/nora953/fawri-production-source/pull/550); actual base `test/p0-integrated-billing-meta-20261015`, not main.

Exact accepted executable SHA: `149ba6826215407ba658c682e6c654020598f89f`. **44/44 completed workflows SUCCESS;66 complete isolated invocation summaries, each exit0/fail0/skip0/cancel0.** Containing docs/evidence commit has separate CI; its exact SHA is in GitHub history. Do not transfer these results to newer code without checking live HEAD/PR/CI.

## Completed and executed

- Removed tenant GUC writes from withMerchantAuthenticationTransaction and cashier device pairing. These paths already use the identity-checked separate auth LOGIN/non-PUBLIC marker; SQL merchant predicates remain explicit. Auth LOGIN is intentionally not a tenant-scope issuer target. This closes two writer migrations, not the vulnerable tenant RLS branch.
- Actual auth fixture now proves protected merchant_settings reads with null tenant GUC, invalid-ID callback rejection, and mixed account/merchant rollback without GUC authority. Auth suite10 TAP tests PASS; no primary-pool borrowing.
- Canonical fawri_security schema/table/functions, rather than only the nonce replica, execute server issuance under a restricted unreachable NOLOGIN/non-superuser/non-bypass/non-createrole owner. Owner has pg_read_all_stats and merchant SELECT; revoking either denies issuance and restoring it recovers. Original owners captured/restored before role teardown. Full scope suite16 PASS, retaining spoof/replay/expiry/concurrency and startup admission proofs.
- Management fixture uses separate actual primary/auth/operator LOGINs. Primary auth mutation and audit access revoked; operator gets SELECT plus bounded directory issuer without direct audit access. Three Meta SIGKILL/commit-gap/job-identity fixtures now use actual primary LOGINs plus separate auth LOGINs, verify both identities and primary production readiness, and close auth pools on graceful shutdown. Existing recovery/debit/refund/identity assertions remain.
- Corrected stale cashier login source contract to require exactly one trusted auth transaction within the login function, preserving shift/session order and index/409 assertions. Registered its2 PASS tests in the existing priority audit, increasing65 to66 invocations. Source contract is not a standalone database race certification.
- Management entrypoint now checks strict disposable attestation before application DB import. Foundation uses the existing owned network-none Docker runner's new single-test management suite. Guard's remote-target rejection now includes it. No weakened guard, skipped test or new cloud dependency.
- Patched newly reported High dependencies: Vite7.3.6->7.3.7 (GHSA-587h-7wmj-h5pm), markdown-it14.3.2->14.3.3 (GHSA-gfr2-rv44-r23c). Actual pnpm10.26.1 generation changed only18 lock lines and2 workspace lines, including exact peer references/integrities. No unrelated upgrades. Minimum release age1440 unchanged/no added exclusions. Full CI frozen install, policy, repository/history scan and dependency review PASS; High0/Critical0/Low0/Moderate2, not zero vulnerabilities.

## Evidence and recovery history

[Current acceptance](evidence/P0-TRUSTED-AUTH-CALLER-ACCEPTANCE-20261021.json) stores all44 exact-source run links, all66 isolated counters, Foundation owned invocations/final marker, auth/scope/restore/remaining-exploit proofs, dependency counts and verified Git blob hashes.

[Isolated39508614948](https://github.com/nora953/fawri-production-source/actions/runs/39508614948)/job118923746262 SUCCESS. [Foundation39508615219](https://github.com/nora953/fawri-production-source/actions/runs/39508615219)/job118923746702 SUCCESS, including management6 and final marker. [Schema39508615118](https://github.com/nora953/fawri-production-source/actions/runs/39508615118)/job118923747599 SUCCESS. Candidate39508615242, [security39508615047](https://github.com/nora953/fawri-production-source/actions/runs/39508615047) and all remaining workflows SUCCESS; dependency job118923748365 confirms High0/Critical0/Moderate2.

Main isolated auth10/admin9/privilege81; receipt read5/review11/execution14 and HTTP11/20/20; cashier/billing/Meta/knowledge/retention/deletion/restore/Node22 invocations all PASS.41 migrations,95 public tables/46 policies/12 public functions plus1 private table/2 private functions. Seed/restored fingerprint identical4a86f68b6d650c448945051fef9c8e70fcc5a4ee12cfb01ef86b15f3d931b8b6. Restore verifies its seeded ownership/ACLs, not hosted owner provisioning.

Local: operator/auth pool+readiness26 PASS; cashier source contract2 PASS; security tooling19 PASS; strict guard15 PASS. Syntax/whitespace/policy PASS. Local lockfile-only frozen validation is not a full local install; full frozen install/typechecking/builds passed CI. A separate early local auth-cutover run had a conditional HTTP skip and the stale cashier source assertion failed; that assertion was corrected and2 PASS, while actual CI auth-cutover11 PASS has zero skips.

Engineering commits:6031de063bc216d90fc6ea84a1da098e9b79d735 (trusted auth GUC removal/canonical owner);956c87aeb5eef6545b02a02a51d02bb2aea91f9a (dependency patches/real fixture roles/contract);149ba6826215407ba658c682e6c654020598f89f (strict Foundation harness). [First failed attempt](evidence/P0-TRUSTED-AUTH-CALLER-ATTEMPT-20261021.json) preserves6031's39/44 and fixture/security failures.956c87ae had66 isolated PASS and43/44, with only Foundation's legacy un-attested invocation rejected;149ba682 resolves that without weakening attestation. Prior0036-0040/canonical stage/journal/snapshot/issuer/auth/receipt work retained; no migration SQL changed in this increment.

## Remaining P0 and next precise action

**Production public.fawri_tenant_or_audited_admin still trusts fawri.tenant_id.** Retained P0_TENANT_GUC_TRUST_PROOF reports tenantGucForgery=true. Private scope/owner/auth proof is not production tenant RLS remediation. **NO-GO.**

Six tenant/runtime writers still need integration: operationalPostgresAuthority; knowledge/postgresKnowledgeRuntime; postgresSubscriptionEntitlement; superQiSandboxWebhook; verifiedReceiptReplayExecution; saasBillingAuthority. The two trusted auth/cashier GUC writers are removed and must not be blindly changed to mint auth-role tenant scopes.

NEXT: recover latest HEAD/PR/CI, then wire these six actual runtime paths through issueMerchantTransactionScope before merchant/FK row locks. Configure owned actual primary/auth issuer fixtures and private schema USAGE/issuer EXECUTE for the trusted auth role only, never scope-table CRUD. Keep actual restricted function ownership. Preserve leased-client affinity, supported Read Committed and rollback/discard; mint/commit before primary locks to avoid FK self-block. Update legacy bootstrap/SET ROLE fixtures to real LOGINs rather than adding bypass flags to obtain green CI. Only after compatible callers/tests, cut over public RLS and require the original successful GUC exploit to be denied. Run focused proofs then full relevant CI.

Canonical restricted-owner execution is now verified in the owned fixture. Production/hosted owner provisioning, statistics grants, default ACLs and pooler behavior remain uncertified. Sensitive auth SELECT/privacy, cashier-specific credential/session integrity, exhaustive caller inventory and historical provider/storage/retention/ownership/release gates remain. Preserve separate smart replies/offline cashier business logic and local offline essentials.

## Environment and safety

GitHub is durable source. Clean fawri-scope-live worktree was created at442bb751652f36012e7895933d73e548cac7405a; its local HEAD stays there and working files contain connector-published changes. Fetch live HEAD/use a fresh isolated checkout before continuing; do not reset older dirty worktrees.19 local source files independently matched remote Git blob hashes before final docs. All remote ref updates used expected-SHA non-force GitHub connector; ordinary git push authentication was unavailable.

Local shell/cached tsx available; pinned pnpm10.26.1 fetched from npm for actual lock generation. No local PostgreSQL/Docker execution claimed. Actual DB proofs ran only in owned Docker offline PostgreSQL16 with fabricated fixtures. No production/staging/Neon data/role changes, Railway deploy, main push or PR merge. Verify Neon round-fire-18493605/br-billowing-leaf-b14yamgu/neondb is explicitly disposable before hosted use. **NO-GO.**
