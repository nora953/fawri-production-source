# FAWRI P0 next-session handoff

Verified UTC: 2026-10-20T01:44:47.139Z
Branch `fix/p0-provider-receipt-order-discovery-20261015`; PR [#550](https://github.com/nora953/fawri-production-source/pull/550) OPEN/DRAFT, base `test/p0-integrated-billing-meta-20261015`.
Last verified executable source: `4fe28acd0d83d17fc2f133bc6096e0d620e3d3f0`; **43/43 workflows completed SUCCESS**. Containing docs commit is [skip ci], with only a non-executable comment wrap besides evidence/docs.

Read P0-CONTINUATION-CHECKPOINT.md and P0-ADMIN-TRANSACTION-BINDING-20261020.md first, then inspect LIVE remote HEAD/PR/CI. Preserve newer work. Local checkout HEAD is not authoritative: ordinary push lacked HTTPS credentials and connector commits were used. Use a clean checkout/worktree of verified remote, without resetting existing work.

## Completed — do not repeat

0036 active admin/profile guard validated, reproducible SQL/snapshot and suspended-actor proof. 0037 adds epoch-aware issuing transaction ID to audit records; old records receive 0. Predicate denies committed-token reuse in later transactions and other sessions. Directory and receipt workflows still pass. Isolated run 39354615625/job118406437488: admin boundary7 PASS; production RLS30; merchant management6; inbox18; execution20; review20; operator recovery17. All 60 emitted invocation summaries complete, zero failed/skipped/cancelled (not unique-test totals). Schema39354615431 and Foundation39354615205 SUCCESS. Exact links/proofs/all43 runs in evidence/P0-0037-TRANSACTION-BINDING-20261020.json.

## Next exact task — real issuer separation

**NO-GO**. Audit writers can still forge current-transaction authority; shared identities/permissions/operator EXECUTE remain unsafe. New actual CI proof also shows arbitrary SQL can set foreign fawri.tenant_id with NO audit access. These are SQL-role/grant threats, not demonstrated HTTP exploits.

Implement trusted operator authenticated role/pool and bounded issuance, with no tenant audit/admin-identity DML, operator EXECUTE, column write path or inherited/SET-reachable privileged role. Use report's full issuer matrix. Receipt replay authorizes twice: autocommit before provider confirmation AND in the entitlement transaction callback; preserve both checks and existing durable commit boundaries. Trace auth/bootstrap/session lifecycle before narrowing global auth table access. Also bind tenant scope to database-verified identity; arbitrary GUC values are not credentials. Prove denied forged actor/audit and positive admin/receipt paths using directly authenticated restricted LOGINs. 0037 alone does not prevent audit writes or forged tenant scope.

Only Git audit changes/isolated guarded CI. No hosted mutation/merge/deploy. Neon permitted only after disposable revalidation: round-fire-18493605 / br-billowing-leaf-b14yamgu / neondb. No new Neon inspection this increment; prior safe LOGIN provisioning blocker remains. Do not recreate privileged trial roles. Preserve historical hosted/provider/storage/retention/ownership gates and separate cashier/replies. Checkpoint verified work before every expensive step.
