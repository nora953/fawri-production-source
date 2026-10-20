# FAWRI P0 next-session handoff

## Follow-up corrections — 2026-10-20T22:23:29.030246+00:00

6031de063bc216d90fc6ea84a1da098e9b79d735 completed39/44 SUCCESS,5 FAILURE. Canonical restricted-owner protocol16 PASS and actual auth-pool10 PASS, but merchant-management and three Meta restart/job fixtures still relied on shared tenant fallback for authentication. Preserve failures in evidence/P0-TRUSTED-AUTH-CALLER-ATTEMPT-20261021.json; no full acceptance of6031de06.

Correction uses separate actual restricted primary/auth/operator LOGINs in management; primary loses auth mutation/audit access, operator gets SELECT plus bounded issuer without audit-table access. Three Meta child fixtures now authenticate primary directly (no privileged-login SET ROLE simulation), use a separate restricted auth LOGIN, verify both identities and production primary readiness, and close auth pool on graceful exit. Existing SIGKILL/commit-gap/retry/debit/refund/identity assertions remain unchanged.

Local cashier concurrency source contract exposed a stale withMerchantOperationalTransaction requirement despite the earlier auth-pool migration. It now requires exactly one credential-capable authentication transaction, bounded within the login function; all unique-index/409/order assertions retained. Its2 tests PASS and it is added to the existing isolated priority suite, making66 planned invocations. This is source-contract coverage, not a new standalone database race proof.

Newly published High advisories require Vite7.3.6->7.3.7 (GHSA-587h-7wmj-h5pm) and markdown-it14.3.2->14.3.3 (GHSA-gfr2-rv44-r23c). Lockfile actually generated using pinned pnpm10.26.1; only18 replaced lock lines and2 workspace lines (both dependency targets/peer references/integrities), no unrelated dependency updates. Local policy PASS, minimumReleaseAge1440 unchanged/no added exclusions. Frozen lockfile-only validation PASS (not a full local install); actual pnpm audit:High0/Critical0/Moderate2/Low0. Raw audit exits1 for the Moderate advisories, not because the High gate failed. Full frozen install/build/security verification still requires new CI.

New corrected PostgreSQL/CI results PENDING. Release NO-GO: six tenant GUC writers/public predicate cutover still outstanding; hosted ownership/config/privacy/cashier integrity gates remain. No hosted, production, staging, Railway, main or merge changes.


## Trusted-auth caller and canonical-owner continuation — 2026-10-20T22:11:27.589935+00:00

Recovered live HEAD442bb751652f36012e7895933d73e548cac7405a,44/44 completed workflows SUCCESS; Draft PR550/base unchanged. Existing accepted executable1fc4a0f remains the prior accepted source. No concurrent newer work observed.

New code removes tenant GUC writes from withMerchantAuthenticationTransaction and cashier device pairing. Both already run through the separate identity-checked authentication LOGIN; existing non-PUBLIC marker remains their database authority, and SQL merchant predicates remain explicit. This is an intentional trusted-auth path, not tenant scope issuance on the auth LOGIN (which the issuer rejects). Actual auth fixture adds protected merchant_settings read with null tenant GUC and invalid-ID callback rejection; mixed rollback checks null GUC too.

Canonical fawri_security schema/table/functions are temporarily transferred inside the guarded owned PostgreSQL fixture to the existing restricted NOLOGIN/non-superuser/non-bypass/non-createrole owner with pg_read_all_stats and merchant SELECT. Actual server issuance, role admission and pool recovery therefore execute under the canonical restricted owner, not just the nonce-schema replica. Capability revocation must deny issuance, then restored privileges recover. Original owners are captured/restored before role teardown; production migrations/grants are unchanged. No hosted ownership certification is claimed.

Local operator/auth pool plus readiness26/26 PASS, zero failure/skip. Changed MJS syntax and whitespace checks PASS. New PostgreSQL proofs and full CI PENDING. No new security acceptance before execution. Production tenant GUC exploit remains OPEN and release NO-GO. Six tenant-runtime GUC writers still require scope integration: operationalPostgresAuthority, knowledge/postgresKnowledgeRuntime, postgresSubscriptionEntitlement, superQiSandboxWebhook, verifiedReceiptReplayExecution, saasBillingAuthority. Next: inspect exact-source CI/fix failures, then wire these callers before protected merchant locks, update actual LOGIN fixtures/auth issuer grants, and only then replace public RLS GUC trust. Authentication/cashier trusted paths no longer need their GUC writer migration, but require regression preservation.

No production/staging/Neon data/role changes, Railway deployment, main push or merge. All owner/grant mutations in this increment belong only to the existing disposable fixture; no default Neon branch was used. The clean fawri-scope-live checkout starts at442bb751; older dirty worktrees remain untouched.


Verified 2026-10-20T20:38:53.994827+00:00. **Release decision: NO-GO.**

Repository nora953/fawri-production-source. Branch `fix/p0-provider-receipt-order-discovery-20261015`. Open Draft [PR550](https://github.com/nora953/fawri-production-source/pull/550); actual base `test/p0-integrated-billing-meta-20261015`, not main.

Exact accepted executable commit: `1fc4a0f1986cf88faab2d257e2c8bc7e37c48d6d`. **44/44 completed workflows SUCCESS**,65 complete isolated invocation summaries, each exit0/fail0/skip0/cancel0. Containing documentation/evidence commit has separate CI; its exact SHA is in GitHub history. Do not transfer these results to newer source without checking live HEAD/PR/CI.

## Implemented and verified

- Canonical migration0040_transaction_scoped_tenant_authority, matching manual stage SQL,41-entry journal, reproducible snapshot a02b3b85-e9f3-436e-8de6-c684b420289f. SQL/stage SHA2567b1e1a885eac660f422e0de35024b8653354dd294f8f7de8b55cfdc20150ecbb. Private fawri_security.transaction_scopes/issue_scope/allows_merchant reuse the proven LOGIN/backend/full-XID fixed3-minute immutable protocol. No application LOGIN grants or role provisioning in migration.
- Server issueMerchantTransactionScope issues through the separate identity-checked authentication pool, uses actual leased primary identity/PID/full-XID, rejects unsupported isolation and autocommit targets, and commits issuer before return. Must run after BEGIN before merchant/FK locks. Existing production callers are NOT yet wired.
- Private role admission inspects catalog OIDs without needing tenant private-schema USAGE. Checks actual LOGIN/effective identity; unsafe reachable roles; scope-table/column SELECT/CRUD/TRUNCATE/REFERENCES/TRIGGER; schema CREATE/ownership; function ownership; inherited/SET reachability. Tenant cannot reach issuer EXECUTE. Auth issuer requires EXECUTE without direct scope-table authority. Admission runs on primary/auth issuance clients AND production startup readiness.
- Real LOGIN fixture tests direct/column/schema grants, INHERIT-only and SET-only holders, inert-membership positive control, accidental issuer grant and function-owner reachability. Production startup rejects unsafe private grants. Original direct SQL negatives remain. Scope/protocol suite16 TAP tests PASS; proof emitted only if all15 nested tests pass.
- Full backup/restore fingerprint now includes private schema/table/function owners, effective ACLs, function bodies, constraints/indexes and explicit non-PUBLIC capability denial. Native PostgreSQL parser normalizes private CHECK DDL. Seed/restored fingerprint identical:4a86f68b6d650c448945051fef9c8e70fcc5a4ee12cfb01ef86b15f3d931b8b6.41 migrations,95 public tables/46 policies/12 public functions plus1 private table/2 private functions.
- Resolved first canonical smoke42P06 failure: disposable acceptance reset had removed public/drizzle while retaining fawri_security. Guarded reset now removes the private schema first and asserts local fawri_ci. Migration idempotency/assertions were preserved. Applied-twice smoke and byte reproduction now PASS.

## Actual evidence

[Current acceptance JSON](evidence/P0-TENANT-SCOPE-ADMISSION-20261020.json) contains all44 run links/conclusions, all65 isolated counters, scope/private-admission proof, retained production exploit proof, both restore fingerprints, local tests, hashes and limits. [Earlier attempt evidence](evidence/P0-CANONICAL-TENANT-SCOPE-20261020.json) preserves06a6be58's43/44 and original42P06 failure. Intermediate87e6be5e/f06ed4a5 CI was superseded/cancelled, not counted as passing.

[Isolated39492410808](https://github.com/nora953/fawri-production-source/actions/runs/39492410808)/job118869455937 SUCCESS. [Schema39492410406](https://github.com/nora953/fawri-production-source/actions/runs/39492410406)/job118869290070 SUCCESS. Candidate39492410759 and security39492410417 SUCCESS. Auth9/admin9/role matrix81; receipt read5/review11/execution14 and HTTP11/20/20; all cashier/billing/Meta/knowledge/deletion/restore/Node22 invocations PASS.

Local Node24.19.0: readiness16/16, transaction lifecycle+operator/auth pool20/20, migration static2/2 PASS, zero failures/skips. Changed-source syntax/whitespace checks PASS. TS syntax used stripping, not a local typecheck; workspace typechecking belongs to successful CI. Recovered cached tsx allowed these targeted tests; no local PostgreSQL/Docker execution claimed.

Engineering history:06a6be5887c3626624df06eb5d813ba6ca07eb2b canonical foundation;87e6be5e91be1892a329c29c490bf22ff337aa7f reset correction;f06ed4a516ddf035ed4dd933fef9119326b303fd private admission/restore;1fc4a0f1986cf88faab2d257e2c8bc7e37c48d6d startup admission.0036-0039 administrator activity/transaction/actual issuer/auth-pool and prior receipt fixes retained. Dependency High fix58ddc2e remains, security gate not weakened.

## Unresolved production boundary and next precise action

**Production fawri_tenant_or_audited_admin still trusts raw fawri.tenant_id.** Retained P0_TENANT_GUC_TRUST_PROOF reports tenantGucForgery=true. Successful private probe/helper/startup checks are NOT a production RLS cutover. No completion percentage or P0 acceptance.

The nonce protocol fixture proves an unreachable restricted NOLOGIN function owner with pg_read_all_stats and merchant SELECT. Canonical objects initially belong to the migration executor. Hosted canonical restricted ownership/statistics grants/default ACLs are NOT certified. Establish/test this ownership and trusted issuer-only grants before granting production capabilities.

NEXT: recover live HEAD/CI and reuse accepted code. Complete canonical restricted-owner/grant tests, then wire all8 tenant-context writers with correct lock order: operationalPostgresAuthority, knowledge/postgresKnowledgeRuntime, postgresSubscriptionEntitlement, superQiSandboxWebhook, verifiedReceiptReplayExecution, saasBillingAuthority, postgresCashierStaffAuthority, authenticationPostgresAuthority. **Do not blindly mint on trusted auth connections:** existing actual auth marker provides separate global RLS authority and issuer rejects auth LOGIN as target. Preserve that explicit path; audit which cashier/auth operations already run on auth pool. Operator receipt processing needs deliberate trusted issuance for tenant DML. Mint/commit before protected merchant row locks, enforce Read Committed, preserve rollback/discard and leased-client affinity. Update actual LOGIN fixtures/auth issuer configuration. Only then replace public GUC trust and change original exploit into a required denial regression; run full relevant CI.

Other open gates: sensitive auth SELECT/privacy; cashier credential/session integrity/exhaustive inventory; hosted least-privilege roles/config/pooler behavior; historical provider/storage/retention/owner/release gates. Preserve separate smart replies/offline cashier business logic and local offline essentials.

## Environment and safety

GitHub remains durable source. Local shell recovered in /workspace/scratch/f32f0a256dd0; isolated fawri-scope worktree was created from06a6be58. Its local Git HEAD6a5385a0 is an unpublished reset commit, while connector-published later code is in working files; fetch live source and use a fresh checkout before continuing. Existing dirty worktrees were not reset. Git fetch worked; git push could not authenticate. All remote writes were confirmed by GitHub connector with expected-SHA non-force updates.

No production/staging/Neon data/role changes, Railway deployment, PR merge or main push. Actual database tests ran only in owned Docker offline PostgreSQL16 with fabricated fixtures. Verify Neon round-fire-18493605 / br-billowing-leaf-b14yamgu / neondb is explicitly disposable before hosted use. **NO-GO.**
