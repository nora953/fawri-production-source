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
