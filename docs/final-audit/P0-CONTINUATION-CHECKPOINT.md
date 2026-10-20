# FAWRI P0 continuation checkpoint

Timestamp 2026-10-20T20:27:35.082275+00:00. **Release: NO-GO.** Branch `fix/p0-provider-receipt-order-discovery-20261015`, open Draft [PR550](https://github.com/nora953/fawri-production-source/pull/550), actual base `test/p0-integrated-billing-meta-20261015`. Live parent before this increment: `87e6be5e91be1892a329c29c490bf22ff337aa7f`; its CI was still running. No concurrent newer work observed.

## Verified evidence retained

Source `06a6be5887c3626624df06eb5d813ba6ca07eb2b`:43/44 completed workflows SUCCESS. [Isolated39473205064](https://github.com/nora953/fawri-production-source/actions/runs/39473205064)/job118802337916 SUCCESS;65 complete invocation summaries, each exit0/fail0/skip0/cancel0. Canonical0040/server-scope proof16 TAP tests PASS; auth9/admin9/privilege81 and receipt/payment/cashier/Meta suites retained. [Candidate39473204638](https://github.com/nora953/fawri-production-source/actions/runs/39473204638) SUCCESS. [Schema39473205447](https://github.com/nora953/fawri-production-source/actions/runs/39473205447) passed canonical regeneration/byte reproducibility but FAILED smoke42P06 because disposable acceptance reset left fawri_security between scenarios. Exact evidence: [canonical scope evidence](evidence/P0-CANONICAL-TENANT-SCOPE-20261020.json).

87e6be5e corrects the guarded local fawri_ci reset to remove private schema before public/drizzle, without changing migration idempotency/assertions. Its PostgreSQL result must be checked, not assumed.

## Current increment — awaiting CI

New tenantScopePostgresBoundary catalog admission checks actual LOGIN/current_user equality, unsafe reachable roles, scope-table/column privileges (including SELECT, CRUD, TRUNCATE, REFERENCES, TRIGGER), private-schema CREATE/ownership, private function ownership and SET/inherited reachability. Tenant cannot reach issuer EXECUTE; auth issuer requires it and has no direct scope-table access. OID catalog lookup needs no tenant private-schema USAGE. Both primary and auth clients are checked before server issuance.

Actual LOGIN fixture adds direct/column/schema grants, INHERIT-only/SET-only memberships, inert membership positive controls, accidental tenant issuer grant, and private function-owner reachability. The issuer-revocation expected error now comes from explicit admission, while existing direct SQL issuer-denial tests remain unchanged. Scope helper is still not wired into existing application writers or public RLS.

Full restore fingerprint now includes private schema/table/function owners and effective ACLs, function bodies, constraints and indexes, plus explicit non-PUBLIC authority denial. Private CHECK DDL is round-tripped through PostgreSQL's parser, preserving semantic comparison. Existing public restore coverage retained.

Local Node syntax checks PASS for two changed MJS fixtures and two TS services (type stripping only); git diff whitespace check PASS. **New PostgreSQL/typecheck results PENDING, no acceptance claimed.** Local shell recovered; no local PostgreSQL/Docker or installed workspace dependencies available. Git fetch worked; git push could not authenticate, so GitHub connector performs expected-SHA publication. Existing dirty worktrees left untouched; new clean worktree fawri-scope derives from exact live source.

## Security and next action

Canonical0040 installs private transaction scope keyed by actual LOGIN/backend PID/full-XID, fixed3-minute merchant-immutable authority and bounded expired-completed cleanup. Original protocol uses a restricted unreachable NOLOGIN owner with pg_read_all_stats and merchant SELECT. Canonical migration itself initially uses migration-executor ownership, grants nothing to LOGINs, and does not provision roles. Hosted restricted ownership/statistics grants/default ACL certification remain REQUIRED.

**Production predicate still trusts raw fawri.tenant_id** and original exploit remains successful by design of the retained finding test.0036-0039 admin activity/transaction/actual issuer/auth pool work remains retained. Do not label production tenant spoofing fixed. Private helper admission is not yet startup readiness admission; add that before cutover.

NEXT: inspect exact new CI, resolve failures first. Then provision/test canonical restricted owner/grants, integrate private admission into production readiness, move all8 scope writers (operationalPostgresAuthority, knowledge/postgresKnowledgeRuntime, postgresSubscriptionEntitlement, superQiSandboxWebhook, verifiedReceiptReplayExecution, saasBillingAuthority, postgresCashierStaffAuthority, authenticationPostgresAuthority), preserving trusted auth/operator exceptions. Issue scope immediately after BEGIN and commit issuer before protected merchant/FK row locks to avoid cross-connection self-block. Enforce Read Committed; RR/Serializable are explicitly rejected. Update actual LOGIN fixtures, then replace production GUC trust and require original exploit denial. Preserve receipt reads/replay and separate smart-replies/offline cashier essentials.

Other blockers: sensitive auth SELECT/privacy, cashier credential/session integrity, exhaustive caller inventory, hosted grants/config/pooler behavior and historical provider/storage/retention/owner/release gates. No production/staging/Neon data or role changes, Railway deploy, main push or merge. Verify any disposable Neon environment before use. **NO-GO.**
