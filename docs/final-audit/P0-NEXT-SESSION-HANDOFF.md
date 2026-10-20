# FAWRI P0 next-session handoff

## Continuation 2026-10-20T18:15:20.272Z — canonical tenant-scope foundation, validation pending

Recovered exact source/docs HEAD `72a15c68e524523939e0863d13315ebbc4520733`; all44 workflows completed SUCCESS, including migration39469980947, schema39469981839 and isolated39469981220. Draft PR#550 remains open against `test/p0-integrated-billing-meta-20261015`. No newer concurrent commit observed.

This increment adds canonical manual migration0040 (private fawri_security scope table/issuer/predicate), journal and reproducible snapshot, and server-only issueMerchantTransactionScope using the existing identity-checked authentication pool. Actual primary LOGIN/PID/full-XID are read from the same leased client; autocommit targets expire before issuance, unsupported isolation is explicitly rejected, and issuer commit precedes return. Call immediately after BEGIN before merchant/FK locks. No application caller or public RLS predicate is cut over yet.

The original isolated protocol now reads the canonical SQL rather than an independently drifting template. Its existing restricted NOLOGIN-owner tests remain; an added real LOGIN test exercises the server helper against the canonical migrated namespace using an actual separate auth pool, including GUC redirect denial, same-LOGIN other-backend denial, immutability, autocommit rejection, higher-isolation rejection, issuer revocation/failure rollback and pool recovery. All nested tests now feed the proof-emission guard.

**New execution results: pending CI, not yet accepted.** Local execution was attempted again and remains unavailable. Snapshot ID computed using the generator's deterministic SHA256 algorithm, checked against empty/abc standard vectors; canonical regeneration must verify it in CI. No new tests claimed passed.

Migration grants nothing to application LOGINs and does not provision roles. Canonical objects initially belong to the migration executor, matching current migration ownership behavior. Restricted function-owner/statistics provisioning and readiness rejection of direct/inherited/SET private-object access remain REQUIRED before production use. Prototype restricted-owner success is not certification of hosted canonical ownership.

Release **NO-GO**. Raw tenant GUC exploit in production predicate remains open. Next: inspect exact new-commit CI, fix any migration/service test failures, then add private-object readiness guards and trusted issuer grants in owned fixtures, migrate all8 scope writers with safe lock order, and only then replace public tenant GUC trust. Do not repeat protocol design or dependency work. No hosted data/grants/deployment, main push or merge.


Verified 2026-10-20T17:53:19.427Z. **NO-GO**.

Exact accepted executable `8ae2cf717e04455e8f26a5bf80d28539b9ada62b`: **44/44 completed workflows SUCCESS**, isolated39468476801/job118785998742 with65 complete exit0/fail0/skip0/cancel0 invocation summaries. New transaction-scope protocol15 TAP tests PASS (14 nested+parent). Containing docs-only commit has separate CI; check live HEAD before writing.

Branch `fix/p0-provider-receipt-order-discovery-20261015`; open Draft PR#550; actual base `test/p0-integrated-billing-meta-20261015`, not main. Read [checkpoint](P0-CONTINUATION-CHECKPOINT.md) and [protocol evidence](evidence/P0-TENANT-TRANSACTION-SCOPE-PROTOCOL-20261020.json). Never reset/overwrite newer work.

Implemented and proved a real PostgreSQL tenant-scope protocol under direct restricted LOGINs and an unreachable restricted NOLOGIN function owner. SQL candidate: artifacts/api-server/tests/fixtures/tenant-transaction-scope-candidate.sql (blobd7dab11686f150a74328277483e2066b5066fb00); test: tenant-transaction-scope-postgres.integration.test.mjs, registered first in existing priority suite/pre-import guard. Actual auth LOGIN has marker/issuer EXECUTE only, no scope CRUD. Private LOGIN/PID/full-XID binding is merchant-immutable, fixed3-minute lifetime, no GUC authorization. Issuer validates live backend/login/32-bit XID and full in-progress epoch. Bounded64-row cleanup preserves expired in-progress tombstones. No extra extension/cloud dependency.

Proved own CRUD, foreign GUC denial, forged issuer denial even under accidental EXECUTE grant, private table CRUD/SELECT denial, same-LOGIN cross-backend and same-backend later-transaction replay denial, no rebind/renewal, expiry/cleanup, marker revocation, invalid backend/full-epoch denial, rollback/GUC reuse and4 concurrent same-LOGIN sessions over2 rounds. Read Committed supported; Repeatable Read/Serializable explicitly fail closed. Owner has pg_read_all_stats+merchant SELECT, no super/bypass/createrole or LOGIN; runtime/auth cannot SET ROLE into owner.

**Not a production migration; no application scope writer or production RLS changed.** Original admin fixture still emits P0_TENANT_GUC_TRUST_PROOF tenantGucForgery=true. Do not declare that vulnerability fixed from a separate probe table.

NEXT: reuse the proven protocol in a canonical private production migration with reproducible metadata, restricted ownership/ACL and admission guards for direct/inherited/SET scope-object privileges. Wire server-only issuance via existing auth pool using actual primary identity, before protected merchant locks (FK could otherwise self-block). Enforce supported isolation and rollback/discard/pool-affinity handling. Migrate all8 scope writers listed in checkpoint, preserving trusted auth/operator paths. Update real LOGIN fixtures/grants, then replace production GUC trust and require the original exploit to be denied. Full CI required after integration. Hosted owner/statistics privilege and Neon pooler behavior are not certified.

Existing auth9/admin9/matrix81 and all65 broader invocations PASS;0036-0039/auth separation/receipt boundaries unchanged and retained. Dependency High fix58ddc2e remains verified; no need to repeat it. Other open gates: sensitive auth SELECT/privacy, cashier-specific credential/session integrity/exhaustive inventory, hosted grants/configuration and historical provider/storage/retention/owner/release gates. Preserve offline essentials and separate smart-replies/cashier logic.

Local execution unavailable; all new tests ran in actual guarded GitHub Actions, not local shell. Old fawri-auth worktree is historical only; do not assume availability/reset it. No production/staging/Neon/Railway changes, merge or main push. Reverify disposable Neon identity before hosted testing. **NO-GO.**
