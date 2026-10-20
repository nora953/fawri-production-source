## Verified recovery and migration 0036 acceptance — 2026-10-20 UTC

- Verified source HEAD: `c5225acbeec5cfc2e0411c11cd17737ab1ae6dad`; PR #550 OPEN/DRAFT, base `test/p0-integrated-billing-meta-20261015`. No newer source observed; no inline reviews/reviews.
- All **43/43** source workflows completed SUCCESS. Machine-readable run IDs/links: `evidence/P0-0036-VALIDATION-20261020.json`.
- Schema run 39353024854/job 118401795326: canonical generation, byte reproducibility, journal/snapshot validation and disposable migration application SUCCESS. Stage 0036 SQL SHA256 `711d1d7129e106a8b6855b439e80d33dddf1c1239ca5d8d64a44feb608735a55`; snapshot SHA256 `77b2fc02d2e7b4c19b903cb9a7d2340c834abeafaff59adeaba426ba3c8afd1a`. Migration candidate run 39353024740 SUCCESS.
- Isolated run 39353024803/job 118401631953: actual admin-boundary suite 5 PASS / 0 FAIL / 0 SKIP; forgery=true, activeWindowReuse=true, suspendedActorReuse=false, expiredDenied=true. Merchant-management tenant RLS 6 PASS, production RLS 30 PASS; privileged receipt/billing suites also completed. These are synthetic CI proofs, not hosted certification.
- Phase A complete for source above. **NO-GO**: audit forgery and active-window cross-session replay remain; admin identity/permission writes and privileged receipt EXECUTE remain shared-role risks; hosted restricted-login acceptance unresolved. No hosted mutation, merge or deployment.
- Next bounded fix: bind audit authority to its issuing PostgreSQL transaction, retaining audit records as history. Directory issuance and consumption are already in one transaction. Deny committed-token replay in fresh sessions/transactions, preserve active issuing-transaction access, test disabled/password-change actors and concurrency. This is a partial replay remediation; direct audit/identity writers can still manufacture authority. Next architectural milestone remains separate trusted operator issuance/pool and tenant grants without audit/admin identity DML or operator EXECUTE.

# FAWRI P0 next-session handoff

Read P0-CONTINUATION-CHECKPOINT.md first. Verify GitHub head of fix/p0-provider-receipt-order-discovery-20261015 and Draft PR #550 before editing. This file's containing commit is the recovery milestone after verified source 693b2be0e30dbb815afda89ccb0f591cb97e98f1 (41/41 observed workflows SUCCESS).

Resume Priority A: inspect superQiSandboxWebhook.ts, superQiSandboxTransport.ts and routes/saas-billing.ts; admission SQL is migration 0029. Signature and gateway confirmation precede the sole application admission call; assess actual negative coverage before claiming weakness. Do not move signature verification into SQL without a demonstrated need.

Priority B: sole production TypeScript direct database_admin_access_audits INSERT found in postgresMerchantManagementAuthority.ts:listManagedMerchantsPostgres. Migration 0030 inserts inside the receipt-reader SECURITY DEFINER function. Restricted Neon role has CRUD on unprotected admin tables. Trace legitimate directory/session/permission paths and prove boundary implications in isolated local tests; no broad grants/revokes on hosted branches.

Priority C remains infrastructure-blocked: restricted role NOLOGIN; staging LOGIN has BYPASSRLS+CREATEROLE. Earlier Neon-created unsafe login experiment was already cleaned up. Do not repeat role creation. Any SET ROLE proof is not direct-login certification.

Neon permitted target only: round-fire-18493605 / br-billowing-leaf-b14yamgu / neondb. Do not touch parent/default/staging/production. No merge/deploy. NO-GO until security gates and hosted acceptance are proven. Keep cashier and AI replies separate. Every batch: hypothesis -> evidence -> small tests -> GitHub commit -> checkpoint/handoff -> verify SHA. Do not rely on conversation history or lost scratch state.

## Readiness evidence parsing milestone

Recovery remote commit verified: 6394d2d0d0e94bceb164ba17890d4e99483c7daa. The containing code batch fixes implicit safe defaults for missing/malformed PostgreSQL role evidence. Added regressions reproduced 10 PASS / 2 FAIL before the fix; readiness + SuperQi transport/source-contract suite passed 18/18 afterward, zero skips. See P0-PAYMENT-ADMISSION-AND-AUDIT-BOUNDARY-20261019.md. Check CI for the containing commit before claiming fresh CI success.

Next exact task: synthetic isolated audit-record forgery/reuse proof and preserve legitimate directory/receipt-reader workflows; no hosted writes. Dependency install offline was blocked by missing mirror metadata; local unit tests use the retained tsx 4.22.0 loader. Docker unavailable locally; use the repository's guarded isolated CI for DB integration, never bypass its attestation.

## Audit boundary fixture pending guarded CI

Readiness code SHA e5300d80da1ea27bd4e7d100edef1fa503f6fc01 was verified on GitHub. Foundation job 118359679712 passed DB/API typecheck, build, readiness unit and PostgreSQL RLS integration plus merchant-management integration; full workflow still running at observation. New admin-audit-boundary-postgres.integration.test.mjs is first in isolated priority suite. Local syntax/checks and runner+guard tests: 19/19 PASS. Unattested fixture rejects before DB import; SQL test cases NOT RUN locally.

Next: inspect the containing commit's isolated PostgreSQL workflow job logs for P0_AUDIT_FORGERY_PROOF / P0_AUDIT_BEARER_REUSE_PROOF and AUDIT_SUITE_RESULT terminal counts. If failing, repair synthetic fixture/cleanup based on actual SQLSTATE. Characterization of unsafe grants is evidence, never a release acceptance gate. No hosted mutations.

## Verified 2026-10-20 continuation

Checkpoint documentation commit `3e8320734ddfa014fcbc0821daba2db1a8021079` preserves exact CI cancellation evidence. For `e5300d80`: 37 success, 4 cancelled, 0 failure among 41 workflows; isolated audit was cancelled after cashier success during billing; foundation cancelled during commerce/Cashier closeout. Guarded audit forgery/bearer-reuse fixture is present but no completed execution proof was verified. Next: identify its containing source commit and read that commit's isolated workflow terminal markers and TAP counters; no claim of successful security proof until then. Do not repeat privileged Neon role provisioning. P0 NO-GO.

## 2026-10-20 latest validated state (supersedes stale 'pending proof' notes above)

- Source commit `ca0bede723c25e5865fa3e6682d9401792096537` has 41/41 completed successful GitHub workflows. Isolated PostgreSQL run `39343880514` / job `118371711004` logged `P0_AUDIT_FORGERY_PROOF` and `P0_AUDIT_BEARER_REUSE_PROOF`; audit-boundary suite passed 5/5. These are confirmed SQL-level release-blocking weaknesses under synthetic explicit role grants and known identifiers, **not** HTTP exploitation.
- CI `TEST_CLEANUP_FAILURE {"failedResources":2}` in disposable-postgres-test-guard.test.mjs is from its intentionally failing cleanup unit test; it is expected and its suite passes.
- Further source-only fixture hardening commits: `fea4f2182c11a965ed418fe33fe784463deacc67` asserts suspended actor state persisted; `895a9e8b65f1a22562ff6e1420b90c4f893aec2b` asserts audit still unexpired; `eef8afb536513a524dad9c078da4bb02f20d71d0` and `730d2f5711d0c0e639b107b441b8e491a915fd70` assert transaction-local admin context reset after initial and suspended-actor replay. Latest source commit `730d2f57`: CI at observation 22 success, 16 in progress, 3 queued of 41, zero failures; **do not infer final success**.
- **STOP adding redundant characterization assertions. Next engineering action must implement a narrowly scoped, reviewable actual security fix**: remove audit issuance/mutation/visibility from tenant DB role while preserving authorized admin merchant directory (currently direct audit INSERT in postgresMerchantManagementAuthority.ts); validate current actor/account state in the audited-admin predicate, and address runtime CRUD of admin identity/permission tables. Use disposable PostgreSQL and negative/legitimate-workflow tests. Do not modify production/hosted grants, deploy, merge, or claim GO. Keep P0 NO-GO.
