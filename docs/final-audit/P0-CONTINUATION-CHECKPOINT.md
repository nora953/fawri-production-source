# FAWRI P0 continuation checkpoint

Verified 2026-10-20T17:19:13.764Z. **Release decision: NO-GO.**

## Identity and accepted source

Repository nora953/fawri-production-source. Branch `fix/p0-provider-receipt-order-discovery-20261015`. Open Draft [PR#550](https://github.com/nora953/fawri-production-source/pull/550); actual base `test/p0-integrated-billing-meta-20261015`, not main.

Exact accepted executable / branch HEAD at verification: `58ddc2e1e8c3dc9e281569f3cad15d302e1a1ade`. All **44/44 workflows completed SUCCESS on this SHA**, independently fetched after completion. This containing documentation-only checkpoint commit has separate CI; do not transfer source results to a later HEAD without checking it. Prior accepted b04b9c1c152751a7abe51a4dc55b226e860db10d remains historical authentication evidence, not latest source.

## Completed increment: real blocking dependency remediation

At recovery, checkpoint HEAD0ec71eecf4d92120edc6ad437ab1dc318a67ed6e had43/44 SUCCESS and1 failure: [Final security39456550351](https://github.com/nora953/fawri-production-source/actions/runs/39456550351) reported high1/moderate2/critical0. Earlier historical44/44 was true at its timestamp; dependency advisory data subsequently changed.

Diagnostic commit4d6f835b96817c4b5b33e50bf709c8beada6cb1e adds bounded, allowlisted public package/GHSA identifiers without raw registry texts/URLs/findings, preserving High/Critical failure thresholds. Actual regression23 PASS/0fail/0skip. It identified markdown-it14.3.1 through typedoc0.28.19, High [GHSA-r7fv-28h4-cvq7](https://github.com/advisories/GHSA-r7fv-28h4-cvq7)/CVE-2026-111759. Upstream same-series [14.3.2](https://github.com/markdown-it/markdown-it/releases/tag/14.3.2) fixes it.

Because local execution is unavailable, commit9793ec75b55d41e47c576b889526e02f9892dc84 introduced a temporary read-only, credential-free candidate workflow. [Run39462976434](https://github.com/nora953/fawri-production-source/actions/runs/39462976434)/job118766909841 SUCCESS: real pnpm10.26.1 lockfile generation, frozen integrity-checked install with scripts disabled, unchanged policy/minimumReleaseAge1440 and audit high0/critical0/moderate2. Actual19 emitted chunks reconstructed and exact graph diff reviewed: only markdown-it override/node/edge/integrity14.3.1->14.3.2 plus pnpm adding SHA512 for unchanged SheetJS0.20.3 tarball. No other version/content changes; integrity not invented. Source58ddc2e published these generated files and removed the temporary workflow after collecting evidence. No audit exclusion, threshold change, release-age exception, force or security-check bypass.

## Current actual evidence

[Dependency patch evidence](evidence/P0-MARKDOWN-IT-SECURITY-PATCH-20261020.json) contains all44 exact-source run IDs/links/results, failed baseline jobs, diagnostics tests, candidate generation commands/metadata, final audit results and all64 isolated counters.

- [Final security39464003786](https://github.com/nora953/fawri-production-source/actions/runs/39464003786): all four jobs SUCCESS. Dependency audit118770495398 and review118770495626 both high0/critical0/moderate2, no blocking advisories. Lockfile-integrity118770495387 PASS. Repository-security118770495162:23 tests PASS and tracked/full reachable history scans PASS with empty findings.
- [Isolated engineering39464003870](https://github.com/nora953/fawri-production-source/actions/runs/39464003870), job118771254417 SUCCESS:64 complete invocation summaries, every exit0/fail0/skip0/cancel0. Fresh authentication9, admin boundary9, runtime privilege matrix81, direct receipt read5/review11/execution14, HTTP receipt read11/review20/execution20, restricted Meta13 all PASS. Cashier, billing, tenant/knowledge/retention, Meta, full restore and Node22 HTTP invocations PASS.
- [Schema39464003858](https://github.com/nora953/fawri-production-source/actions/runs/39464003858), [Foundation39464003878](https://github.com/nora953/fawri-production-source/actions/runs/39464003878) and all remaining workflows SUCCESS. Full committed/historical migration reproducibility, schema apply/smoke, types/build and relevant API regressions passed. Exact migration candidate run ID is in evidence.
- No local Node/PostgreSQL execution claimed in this continuation. V8 pure sanitizer check is supplementary;23 actual Node regression tests and SQL/package verification ran in GitHub Actions.

## Existing P0 security work retained and reverified

0036 live active-account/enabled-profile/password checks;0037 transaction-bound audit authority;0038 actual-LOGIN role-bound issuer;0039 separate authentication marker/authority are retained.0039 canonical snapshot ID397d6475-189f-427b-8c36-bc3547fbd126, SHA2560d76f3e0a15b5d93a8d92ff708ec6ff88e87728bd38c5fdaba82dbb5b9b3db13. Prior snapshot/knowledge dispatch/Meta pool failures were resolved, not repeated; full history remains reproducible.

`FAWRI_AUTH_DATABASE_URL` is a restricted, actual-LOGIN, identity-checked authentication pool, no production tenant/operator fallback. Sessions/devices/OTP, owner/admin security, signup/management/retention/provisioning and mixed account/merchant operations use it. Core mutations and authority audit access are denied to primary roles by production readiness, including column and inherited/SET privileges. Core8 tables: accounts,admin_profiles,admin_permissions,account_sessions,trusted_devices,auth_otp_challenges,login_attempts,auth_audit_events. Authority table:database_admin_access_audits. No hosted grants provisioned.

Direct LOGIN proofs deny audit forgery even with intentional CRUD precondition, forged actor issuer calls, active-window cross-session and later-transaction reuse, and suspended/disabled actor authority. Legitimate operator directory/receipt flows and auth operations remain tested; authentication fixture primary pool calls0. These claims are limited to tested roles and protocols, not hosted certification or HTTP exploit certification. Smart replies and offline cashier remain separate, preserving local fallbacks.

Prior [authentication evidence](evidence/P0-AUTHENTICATION-ROLE-BOUNDARY-20261020.json), receipt [execution](evidence/P0-RECEIPT-EXECUTION-OPERATOR-POOL-20261020.json), [review](evidence/P0-RECEIPT-REVIEW-OPERATOR-POOL-20261020.json), [read](evidence/P0-RECEIPT-OPERATOR-POOL-20261020.json) and [issuer](evidence/P0-0038-ROLE-BOUND-ISSUER-20261020.json) remain scoped historical evidence.

## Remaining P0 blockers

1. **Confirmed raw SQL tenant-GUC impersonation remains OPEN.** Shared LOGIN can set a known foreign fawri.tenant_id. Admin boundary test deliberately retains this successful exploit finding; green TAP does not close cross-tenant authorization.
2. Sensitive authentication SELECT/privacy and exhaustive reader/writer inventory remain open. Support/emergency/media still read account/profile data; do not revoke all SELECT blindly. Core mutation guards are not a claim that credential reads are safe.
3. Cashier-specific PIN/station credential/operator session integrity is not fully in the core gate. Review merchant_cashier_staff, cashier_station_credentials, cashier_operator_sessions and discount/expiry/historical/central activity writers. Preserve offline essentials; do not merge cashier with smart replies.
4. Hosted least-privilege LOGIN/grant/configuration rollout and historical provider/storage/retention/owner/release gates remain uncertified. Two Moderate advisories remain; High/Critical are0 at recorded audit time, not a claim of zero vulnerabilities.

## Next precise engineering action

Inspect live HEAD/PR/CI, then resume DB-authenticated tenant-scope remediation; the dependency blocker above is resolved and must not be reinvestigated absent new evidence. Evaluate auth-LOGIN-only issuance bound to actual runtime LOGIN/backend/transaction and restricted scope storage, or justified separate tenant LOGINs. This remains a design candidate, not implemented or verified. Raw runtime SQL must be unable to mint/rebind authority or replay another session/transaction. User-controlled GUC comparisons and public definer functions taking forged actors are inadequate.

First prove the chosen protocol in guarded direct restricted LOGIN tests: own access, foreign GUC read/update denial, forged scope mint/table CRUD, same-transaction merchant switching, cross-session/later-transaction replay, expiration, rollback/pool reuse and concurrency. Account for transaction isolation/snapshot visibility and failure cleanup before changing production predicates. Then migrate all scope writers: operationalPostgresAuthority, knowledge/postgresKnowledgeRuntime, postgresSubscriptionEntitlement, superQiSandboxWebhook, verifiedReceiptReplayExecution, saasBillingAuthority, postgresCashierStaffAuthority, authenticationPostgresAuthority. Preserve operator receipt paths and atomic auth operations.

## Environment and recovery

Current local execution environment is unavailable: no shell/filesystem/Node/PostgreSQL checks were performed locally. GitHub connector remains usable; package generation/frozen installs and fresh offline Docker-owned PostgreSQL16 proofs ran in CI. Old worktree path /workspace/scratch/f32f0a256dd0/fawri-auth and detached baseb95f7158 are historical recovery hints only; do not assume they are currently available or reset their connector-published changes.

No production/staging/Neon data or role changes, no Railway deployment, merge or main push. Before any hosted disposable use, reverify project round-fire-18493605 / branch br-billowing-leaf-b14yamgu / neondb as explicitly disposable. Publish only safe expected-SHA fast-forwards on the audit branch. **Release remains NO-GO.**


## Tenant transaction-scope protocol candidate — 2026-10-20T17:42:46.308Z

Recovered live HEAD `5b38f8ecfc6ee551791ea61b653b804f71e2d05e` and Draft PR#550/base test/p0-integrated-billing-meta-20261015; current44/44 workflows SUCCESS, no newer commits. Accepted dependency source58ddc2e remains verified; no need to repeat dependency remediation.

Implemented a guarded SQL protocol candidate and direct-LOGIN regression fixture, registered first in the existing offline audit-boundary/priority suite and in pre-import remote-target guard tests. This is **not a migration and does not change production RLS/app callers**. Actual runtime LOGIN has no scope table CRUD or issuer EXECUTE; actual auth LOGIN has only marker/issuer EXECUTE, no direct scope CRUD; a separate non-LOGIN/non-superuser function owner owns the private nonce namespace/bindings and has pg_read_all_stats plus merchant SELECT. Issuer validates actual session_user marker/role flags, real backend LOGIN/PID/current32-bit XID and full epoch-aware transaction status, then issues a fixed3-minute binding immutable per LOGIN/PID/full-XID. No actor/tenant GUC authorizes the predicate. Bounded cleanup preserves expired in-progress tombstones to prevent renewal/rebinding, pruning only expired completed scopes. Read Committed supported; Repeatable Read/Serializable explicitly fail closed because external issuance and snapshots need deliberate integration design.

Fourteen negative/positive protocol cases cover own/foreign CRUD, GUC/actor forgery, accidentally granted issuer EXECUTE, scope-table CRUD, same-LOGIN cross-backend and same-backend later-transaction replay, immutable/idempotent scope, expiry/renewal, bounded cleanup, marker revocation, live backend/full-epoch validation, isolation modes, rollback/GUC reuse and4 concurrent connections across2 reuse rounds. Owner is restricted and unreachable from both LOGINs; no SET ROLE simulation. Proof marker emits only if all nested checks pass. Tests **NOT YET EXECUTED**; local execution environment still unavailable. SQL relies on documented PostgreSQL16 pg_stat_activity/pg_xact_status, no extra extension/cloud dependency.

NEXT FIRST: inspect candidate isolated CI and pre-import guard results; repair actual failures, require complete non-skipped TAP before accepting protocol. Then design canonical production migration, least-privilege hosted grant/admission checks and migrate all eight scope writers listed above; never declare existing tenant-GUC vulnerability fixed from a separate probe table. Tenant-GUC production impersonation, sensitive auth SELECT/privacy, cashier credential/session scope and hosted rollout gates remain open. **NO-GO**. No production/staging/Neon/Railway mutation, deployment, merge or main push.
