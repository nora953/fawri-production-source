# FAWRI P0 continuation checkpoint

Verified UTC: 2026-10-20T10:18:46.787Z
Branch: fix/p0-provider-receipt-order-discovery-20261015.
PR: [#550](https://github.com/nora953/fawri-production-source/pull/550), OPEN/DRAFT; base test/p0-integrated-billing-meta-20261015.
Latest verified executable source: `f5e3949a2fe10aa1bb4c18d254ac4af91d5a31bb`, **43/43 completed SUCCESS**, no failure/cancellation/pending.
Containing evidence commit is docs-only [skip ci]; do not attribute source workflows to its SHA.

## Decision: NO-GO

The tested tenant LOGINs cannot forge the administrative RLS branch without the separate issuer EXECUTE capability, even with audit CRUD/current txid/forged actor GUCs. Arbitrary tenant-GUC trust, audit/auth integrity, shared receipt operator capabilities and hosted acceptance remain unresolved. No production/default/staging changes, Neon calls, main push, merge or Railway deployment.

## Completed increments

0036 active administrator/profile checks and 0037 issuing-transaction binding remain accepted. 0038 creates bounded non-PUBLIC fawri_issue_admin_directory_audit(text,text,text); its EXECUTE ACL on authenticated session_user gates audited cross-tenant consumption. Issuer checks active/enabled/non-password-change actor and existing directory permissions, locks current authorization rows, writes a one-minute audit and local context. Directory no longer directly INSERTs audits.

operatorDirectoryPostgresAuthority.ts selects FAWRI_OPERATOR_DATABASE_URL and refuses production fallback to tenant credentials. Dedicated LOGIN identity must be current, restricted, non-owner, unable to reach elevated/table/issuer-owner roles, and hold issuer EXECUTE. Tenant production readiness rejects issuer grants reachable directly, by inheritance or SET ROLE, missing migration and invalid/missing operator URL. Typed createPostgresPool factory and API runtime declaration preserve sanitized transport handling.

## Actual evidence

Evidence inventory and all per-invocation counters: evidence/P0-0038-ROLE-BOUND-ISSUER-20261020.json.
Detailed design, limits and provisioning prerequisites: P0-ROLE-BOUND-DIRECTORY-ISSUER-20261020.md.
- Schema [39379037201](https://github.com/nora953/fawri-production-source/actions/runs/39379037201), job118483651431: canonical SQL/snapshot reproducible, journal/order and disposable application passed. SQL763c962832da75693295a82415f399d505c4f5ffb9e584799b6af789004c3574; snapshot8f93f829625f9688e8fb693c22acbf488fd6ef6237129fd73305b02261cb70c1.
- Foundation [39379037518](https://github.com/nora953/fawri-production-source/actions/runs/39379037518), job118483634556 SUCCESS: DB/API types/build, new operator/readiness tests, lifecycle, RLS and directory regressions.
- Isolated [39379037396](https://github.com/nora953/fawri-production-source/actions/runs/39379037396), job118483788171: admin-boundary9 PASS/0FAIL/0SKIP; production RLS33; directory6; receipt operator HTTP11; inbox18. All60 emitted suite invocations complete with exit0 and zero failed/skipped/cancelled; repeated runtimes/parent/restore phases are not unique test totals.
- P0_AUDIT_FORGERY_DENIED: auditCRUD=true, forgedCurrentTransactionDenied=true, foreignReadRows=0/updateRows=0, forged actor issuer call denied. Real app directory succeeds with separate directly authenticated bounded operator and no audit CRUD. Replay across4 concurrent transactions denied, including later transaction on same connection.
- P0_TENANT_GUC_TRUST_PROOF remains true for arbitrary SQL with known foreign ID; no HTTP exploit or release acceptance claimed.
- Local focused28 PASS and guard/summary19 PASS; focused strict API types exit0, syntax/diff checks passed. Local SQL/full generation not run (retained dependencies incomplete); actual canonical and SQL acceptance came from CI.
- Initial sources d5814128/43710541 failed missing driver/factory runtime declarations; 8d700180 failed owned child readiness configuration. Repairs retained negative gates and fixed typed factory/ambient API contract and positive fixture declarations. Only source above is accepted. Synthetic URLs in tenant-only readiness probes are not operator connectivity certification; the dedicated directory fixture uses real restricted credentials.

## Next exact action

First separate bounded receipt reading (verifiedReceiptOperatorRead.ts) from tenant credentials using a capability-specific trusted operator pool, with production readiness rejecting tenant read-capability EXECUTE/inherited/SET access. Test direct tenant denial and legitimate operator HTTP read/audit behavior without granting the directory issuer to receipt-only roles. Preserve the working directory boundary.

Then design receipt review/execution split across BOTH autocommit authorization before provider confirmation and the settlement transaction callback. Do not move one call and regrant broad operator EXECUTE to the tenant to make the second work.

Also replace arbitrary tenant GUC trust with independently database-verified scope, narrow auth/bootstrap/session/admin identity and audit DML safely, and reconcile hosted grants/ownership/provider/storage/retention gates. Separate operator credentials alone do not fix the tenant-scope flaw.

## Restrictions and recovery

Only audit branch/guarded disposable CI. If Neon is needed: independently verify disposable project round-fire-18493605 / br-billowing-leaf-b14yamgu / neondb before use. No role provisioning performed; prior safe restricted LOGIN acceptance blocker remains. Never repeat unsafe role-creation experiments, alter production/staging/default, broadly change hosted grants, merge or deploy. Keep cashier and replies separate.

GitHub connector publishes with expected-SHA checks. Scratch worktrees contain connector-published code not reflected in local HEAD; use a clean remote checkout/worktree without resetting uncommitted work. Verify live HEAD and PR before every new batch. Historical evidence remains in Git history and retained 0036/0037 reports. Checkpoint every verified increment before expensive work.
