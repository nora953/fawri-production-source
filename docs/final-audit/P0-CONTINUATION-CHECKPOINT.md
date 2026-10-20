## Verified recovery and migration 0036 acceptance — 2026-10-20 UTC

- Verified source HEAD: `c5225acbeec5cfc2e0411c11cd17737ab1ae6dad`; PR #550 OPEN/DRAFT, base `test/p0-integrated-billing-meta-20261015`. No newer source observed; no inline reviews/reviews.
- All **43/43** source workflows completed SUCCESS. Machine-readable run IDs/links: `evidence/P0-0036-VALIDATION-20261020.json`.
- Schema run 39353024854/job 118401795326: canonical generation, byte reproducibility, journal/snapshot validation and disposable migration application SUCCESS. Stage 0036 SQL SHA256 `711d1d7129e106a8b6855b439e80d33dddf1c1239ca5d8d64a44feb608735a55`; snapshot SHA256 `77b2fc02d2e7b4c19b903cb9a7d2340c834abeafaff59adeaba426ba3c8afd1a`. Migration candidate run 39353024740 SUCCESS.
- Isolated run 39353024803/job 118401631953: actual admin-boundary suite 5 PASS / 0 FAIL / 0 SKIP; forgery=true, activeWindowReuse=true, suspendedActorReuse=false, expiredDenied=true. Merchant-management tenant RLS 6 PASS, production RLS 30 PASS; privileged receipt/billing suites also completed. These are synthetic CI proofs, not hosted certification.
- Phase A complete for source above. **NO-GO**: audit forgery and active-window cross-session replay remain; admin identity/permission writes and privileged receipt EXECUTE remain shared-role risks; hosted restricted-login acceptance unresolved. No hosted mutation, merge or deployment.
- Next bounded fix: bind audit authority to its issuing PostgreSQL transaction, retaining audit records as history. Directory issuance and consumption are already in one transaction. Deny committed-token replay in fresh sessions/transactions, preserve active issuing-transaction access, test disabled/password-change actors and concurrency. This is a partial replay remediation; direct audit/identity writers can still manufacture authority. Next architectural milestone remains separate trusted operator issuance/pool and tenant grants without audit/admin identity DML or operator EXECUTE.

# P0 continuation checkpoint

- Last verified UTC: 2026-10-19T23:15:29Z (recovery cycle; use Git commit time for publication).
- Repository: nora953/fawri-production-source.
- Active branch: fix/p0-provider-receipt-order-discovery-20261015.
- PR: #550 OPEN/DRAFT; base test/p0-integrated-billing-meta-20261015 (not main).
- Latest verified remote code commit before this batch: e5300d80da1ea27bd4e7d100edef1fa503f6fc01 (readiness-evidence fix). Recovery: 6394d2d0d0e94bceb164ba17890d4e99483c7daa. Previous fully CI-tested source: 693b2be0e30dbb815afda89ccb0f591cb97e98f1. The containing commit adds audit-boundary tests; resolve its SHA from Git.
- Main verified at d38d29229bed0f9575a98e7026e7819fe363bfd4; no merge or deployment.

## Completed recovery and evidence

1. Fresh GitHub clone verified clean at the source SHA above. Older scratch checkout had a broken worktree pointer and is not authoritative.
2. GitHub API: all 41 observed PR workflow runs for 693b2be0 completed SUCCESS. Reviews and inline review threads empty; latest conversation comments retain concurrency proof limitations. Existing docs in WORK_HANDOFF.md and p0-order-items-rls-evidence-and-release-blockers-20261019.md remain historical evidence, not current release acceptance.
3. Neon branch br-billowing-leaf-b14yamgu is ready, non-default, non-primary, unprotected; parent br-snowy-voice-b1bovtwi. Read-only catalog query reconfirmed fawri_staging_runtime LOGIN/BYPASSRLS/CREATEROLE and fawri_staging_rls_runtime NOLOGIN/NOBYPASSRLS/NOCREATEROLE. No role created or changed.
4. Read-only pg_class/has_table_privilege probe reconfirmed accounts, admin_profiles, admin_permissions and database_admin_access_audits lack RLS and grant the restricted role effective SELECT/INSERT/UPDATE/DELETE. orders/order_items/verified_provider_payment_receipts have RLS enabled. All seven tables are owned by neondb_owner. Grants alone do not demonstrate a reachable HTTP exploit.
5. Initial call-path inventory: sole application SQL admission call is superQiSandboxWebhook.ts; sole production TypeScript direct audit INSERT is postgresMerchantManagementAuthority.ts:listManagedMerchantsPostgres. Migration 0030 also inserts audits inside its SECURITY DEFINER reader. Deeper authorization and regression assessment is in progress.

## Tests and scope

- Baseline new regression cases on unchanged readiness source: 10 PASS / 2 FAIL / 0 SKIP (12 tests). Missing safety booleans and privilege arrays were silently accepted.
- Fixed readiness parser rejects absent/malformed native booleans and text-array inventories. Targeted readiness + SuperQi transport + provider source-contract tests: 18 PASS / 0 FAIL / 0 SKIP, process exit 0. The two regression groups exercise 85 malformed field/value combinations.
- Local frozen offline dependency install was blocked by missing pnpm mirror metadata; targeted tests used the retained tsx 4.22.0 loader, executed against current source. No safety check bypassed. Full typecheck/build and fresh database integration NOT RUN locally; Docker/PostgreSQL binaries unavailable. For e5300d80, Foundation run 39340236256 job 118359679712: frozen install, database/API typecheck, API build, production readiness unit contract, production PostgreSQL RLS integration, restricted knowledge and merchant-management integration steps all SUCCESS. The workflow as a whole was still running; not full CI acceptance.
- Detailed source-path and boundary evidence: P0-PAYMENT-ADMISSION-AND-AUDIT-BOUNDARY-20261019.md.
- Catalog inspections are SELECT only on the authorized disposable branch/database neondb.
- No whole-suite rerun for this documentation-only checkpoint.

## Remaining P0 blockers / decision

**NO-GO**. No directly authenticated least-privilege Neon LOGIN acceptance; administrative audit grant boundary unresolved; actual hosted migration/grant/runtime readiness and pooled tenant isolation unproven. Passing CI is not production certification. Existing concurrency/hosted/retention/ownership blockers must be reconciled against retained reports before closure, not silently dropped.

## Current work / next exact action

New admin-audit-boundary-postgres.integration.test.mjs is registered first in isolated priority suite and also selectable as audit-boundary. It uses two fresh restricted directly authenticated LOGIN fixtures, targeted grants, synthetic accounts only, and cleanup. It characterizes baseline tenant CRUD, audit forgery/cross-tenant mutation under audit CRUD grants, denial without those grants, and known-token reuse after actor suspension versus expired-token denial. Syntax/diff checks PASS, runner/attestation unit tests 19/19 PASS; unattested invocation rejected before DB import as expected. SQL cases NOT RUN locally. Next exact action: verify containing GitHub commit and isolated CI logs; record actual P0_AUDIT_FORGERY_PROOF and P0_AUDIT_BEARER_REUSE_PROOF outputs and terminal TAP counters. Do not call characterization success a security fix. No Neon grants or credentials changed.

## Restrictions

Only Git audit branch and reviewable tests/code/docs authorized. Neon project round-fire-18493605, branch br-billowing-leaf-b14yamgu, database neondb only; read-only first. No production/default/staging modifications, destructive SQL, unsafe role creation, broad GRANT/REVOKE, merge or deployment. Keep offline cashier and intelligent replies distinct. Save each meaningful batch and update this file and P0-NEXT-SESSION-HANDOFF.md before starting expensive work.

## CI cancellation evidence follow-up — 2026-10-20

- Verified GitHub Actions runs for source commit `e5300d80da1ea27bd4e7d100edef1fa503f6fc01`: 41 runs; 37 completed success, 4 completed cancelled, zero completed failure. Cancelled workflows: Final security and supply chain (`39340236235`), Foundation integration final gate (`39340236256`), Isolated PostgreSQL engineering audit (`39340236463`), PostgreSQL schema validation (`39340236400`). This commit does **not** have a full 41/41 green acceptance.
- Isolated audit job `118359679872` logs show cashier batch completed with zero test failures and billing batch started; GitHub then logged `The operation was canceled` at 2026-10-19T23:17:14Z. Container cleanup succeeded. This is cancellation, not demonstrated SQL failure or completed billing acceptance.
- Foundation job `118359679712` was cancelled during `Run commerce and Cashier closeout validation`; previous successful steps do not imply a successful final gate.
- The guarded `admin-audit-boundary-postgres.integration.test.mjs` exists on the audit branch and characterizes audit-record forgery and bearer reuse, but **no completed CI proof for its containing commit was verified in this follow-up**. Do not assert `P0_AUDIT_FORGERY_PROOF` or `P0_AUDIT_BEARER_REUSE_PROOF` succeeded.
- Next exact action: resolve containing commit SHA of guarded fixture; inspect that commit's Isolated PostgreSQL workflow logs for both proof markers, terminal TAP counts and cleanup. If absent or cancelled, run a new authorized isolated CI validation without weakening disposable attestation; fix any real fixture failure. P0 remains **NO-GO**. No database changes in this batch.

## Guarded fixture wiring verification — 2026-10-20

- Read `scripts/execute-disposable-postgres-audit.mjs` on the audit branch: named `audit-boundary` suite maps to `admin-audit-boundary-postgres.integration.test.mjs`; `priority` includes it first. The runner emits `AUDIT_SUITE_RESULT` with pass/fail/skipped/cancelled and `summaryComplete` fields, and guards against an entirely skipped PostgreSQL proof.
- Source wiring VERIFIED; successful SQL execution remains NOT VERIFIED. The latest two documentation commits intentionally use `[skip ci]`, so their lack of PR-triggered runs cannot be counted as a test failure or acceptance. Do not claim the fixture's proof markers executed without a completed run log.
- Next action: identify the source commit that first added the fixture, obtain its guarded isolated workflow logs, or schedule a targeted authorized isolated test on an attested disposable CI database. Keep P0 NO-GO.

## Synthetic fixture cleanup hardening — 2026-10-20

- Code commit `a5635e2a9423efff08d204a72c3a7074494e722d` adds explicit cleanup of synthetic `merchant_settings` and `merchants` before `accounts` in `admin-audit-boundary-postgres.integration.test.mjs`. Previously fixture teardown deleted audit records and accounts but did not explicitly delete merchants/settings it created. This addresses a concrete teardown coverage gap; it does not alter production SQL or grant policy.
- Guarded PostgreSQL execution and SQL cleanup success remain NOT VERIFIED after this change; do not claim the fixture passed. Next: run authorized isolated CI for this source commit and inspect `P0_AUDIT_FORGERY_PROOF`, `P0_AUDIT_BEARER_REUSE_PROOF`, `AUDIT_SUITE_RESULT` and teardown status. P0 remains NO-GO.

## CONFIRMED restricted-login audit boundary proof — 2026-10-20

- GitHub commit `a5635e2a9423efff08d204a72c3a7074494e722d` has **41/41 completed SUCCESS** workflow runs (zero failed/cancelled). Isolated PostgreSQL engineering audit run `39342791412`, job `118368125614`, completed SUCCESS; PostgreSQL schema validation run `39342791526` and Foundation integration final gate `39342791402` completed SUCCESS.
- **Actual isolated job log**, 2026-10-19T23:40:08Z: `P0_AUDIT_FORGERY_PROOF {"directRestrictedLogin":true,"auditCrudPrecondition":true,"syntheticForeignRows":2,"foreignUpdateRows":1,"httpExploitTested":false,"releaseAccepted":false}`.
- **Actual isolated job log**: `P0_AUDIT_BEARER_REUSE_PROOF {"auditTableAccess":false,"knownIdentifiersRequired":true,"activeWindowReuse":true,"suspendedActorReuse":true,"expiredDenied":true,"httpExploitTested":false,"releaseAccepted":false}`.
- **Actual isolated job log**: `AUDIT_SUITE_RESULT {"suite":"admin-audit-boundary-postgres.integration.test.mjs","auditBatch":"priority","runtime":"v24.22.0","exit":0,"passed":5,"failed":0,"skipped":0,"cancelled":0,"summaryComplete":true}`. This confirms the SQL security defect **under the explicit synthetic grants and known-token preconditions**, NOT an HTTP exploit or production credential compromise.
- Release remains **P0 NO-GO despite green CI**: security proof intentionally demonstrates audit-table CRUD privilege allows authority forgery, and known active audit identifiers act as reusable bearer capabilities even after actor suspension. Remediation must address BOTH audit table grants and audit-session/actor validation, then re-run negative tests on isolated direct LOGINs. Never infer production deployment approval from green test workflow.

## 2026-10-20 follow-up: admin profile fixture cleanup and CI in flight

- Source commit `ca0bede723c25e5865fa3e6682d9401792096537` explicitly deletes the synthetic `admin_profiles` row before synthetic accounts in the guarded `admin-audit-boundary-postgres.integration.test.mjs` teardown. This is fixture hygiene, not a security remediation.
- At observation, GitHub Actions for this source commit had 41 workflows: 36 completed SUCCESS and 5 IN_PROGRESS, including Isolated PostgreSQL engineering audit run `39343880514`. **Do not call this commit 41/41 green until the remaining runs finish**.
- The prior source commit `a5635e2a9423efff08d204a72c3a7074494e722d` had 41/41 SUCCESS and confirmed both audit forgery and suspended-actor bearer reuse in isolated direct-login PostgreSQL tests. Those proofs intentionally demonstrate release blockers; green CI does not override P0 NO-GO.
- Confirmed production-source design gap: `listManagedMerchantsPostgres` still directly INSERTs `database_admin_access_audits` under the operational DB transaction. Revoking audit INSERT without a replacement bounded issuance path would break admin merchant directory. Restricted role's broad permissions on `accounts`, `admin_profiles`, `admin_permissions` must be addressed together with audit grants; mere actor-state check does not prevent forged admin identity under these grants.
- Next: finish current CI review, then implement and validate a bounded issuance mechanism and an active-actor check in the SECURITY DEFINER RLS predicate, with separate role-boundary negative tests; do not revoke live grants or deploy before staged verification.

## 2026-10-20 CI completion and direct SQL evidence for admin-profile teardown

- Source commit `ca0bede723c25e5865fa3e6682d9401792096537`: GitHub Actions **41/41 completed SUCCESS**, zero failed/cancelled. Isolated audit run `39343880514`, job `118371711004`, SUCCESS; schema run `39343880819` SUCCESS; foundation run `39343880661` SUCCESS.
- Actual isolated audit log `2026-10-19T23:49:40Z`: `P0_AUDIT_FORGERY_PROOF` shows directRestrictedLogin=true, auditCrudPrecondition=true, syntheticForeignRows=2, foreignUpdateRows=1; `P0_AUDIT_BEARER_REUSE_PROOF` shows activeWindowReuse=true, suspendedActorReuse=true, expiredDenied=true. Fixture `AUDIT_SUITE_RESULT` exit=0, passed=5, failed=0, skipped=0, cancelled=0, summaryComplete=true. No HTTP exploit test or release acceptance.
- An earlier `TEST_CLEANUP_FAILURE {"failedResources":2}` log line at `23:49:13Z` is **intentional negative-test output** from `scripts/disposable-postgres-test-guard.test.mjs` (`cleanup failures cannot give a green result or prevent later cleanup`); that guard test suite subsequently reports 15 pass, 0 fail. Do not misclassify it as the audit fixture teardown failing.
- Source change explicitly cleans synthetic `admin_profiles` before accounts and CI confirms fixture completes. However the same CI confirms the unsafe authority behavior under its preconditions: P0 stays NO-GO until a tested authorization/role remediation.

## 2026-10-20 CI completion and expected cleanup-failure diagnostic

- Commit `ca0bede723c25e5865fa3e6682d9401792096537`: **41/41 GitHub Actions workflows SUCCESS**, including isolated PostgreSQL run `39343880514` (job `118371711004`), PostgreSQL schema validation `39343880819`, and Foundation integration final gate `39343880661`.
- Isolated job confirms `admin-audit-boundary-postgres.integration.test.mjs`: `passed=5 failed=0 skipped=0 cancelled=0 exit=0`, with `P0_AUDIT_FORGERY_PROOF` and `P0_AUDIT_BEARER_REUSE_PROOF` markers still confirming intentionally vulnerable SQL grant/token preconditions.
- Log line `TEST_CLEANUP_FAILURE {"failedResources":2}` occurs during `node --test scripts/disposable-postgres-test-guard.test.mjs`, whose source includes a **deliberate negative test** `cleanup failures cannot give a green result or prevent later cleanup; redact driver detail`, with two synthetic throwing cleanup callbacks. Do not report that marker alone as actual PostgreSQL fixture cleanup failure. The guard suite passed.
- **Release remains NO-GO**. Next action is a reviewed security remediation to eliminate writable authority records from tenant runtime and reject suspended actor audit reuse without breaking authorized directory issuance. Green characterization tests do not certify secure boundaries.
