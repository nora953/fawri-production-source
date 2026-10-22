# P0 source acceptance and hosted reconciliation — 2026-10-23

Release **NO-GO**. P0 only. Current executable `bcebf0e436a7805b60822d0338a5d4e511b36846` is accepted for the bounded discount-policy remediation. PR #550 remains draft, base `test/p0-integrated-billing-meta-20261015`; no retarget or merge.

## Executed acceptance
All 47 exact-source PR workflows completed SUCCESS; zero pending/failure/cancellation observed. Native run39828320393/job119997427754:83/83 clean invocations,81 unique files, all exit0/failed0/skipped0/cancelled0/complete. Counts include parent tests and repeated runtimes, not distinct P0 requirements. Checkout95ce575d0cafd9f9862311dfcb86cc7801a960f7 matches source tree80dae12b29f96bd1c25b9745ba406873f32cb816. No suites rerun.

Actual LOGIN policy mutation rejects42501, same actual validator still requires override for discount250/limit100. Trusted-auth upsert300 allows legitimate validation, exact restoration requires approval again.12 mutation denials/165 grant reachability cases, two scoped merchant read positives and unchanged other-merchant/staff/PIN/session/approval state PASS. Existing suite retains real auth approval issue/primary consume binding, rollback, replay/concurrency, pending-kind invalidation and advisory locking. Foundation final marker, canonical schema reproduction and quality gates SUCCESS. Security audit/review each0 high/0 critical/2 moderate. [Exact source results](evidence/P0-CASHIER-DISCOUNT-POLICY-ACCEPTANCE-20261023.json).

This accepts the source restriction/admission guard; it does not revoke unsafe hosted privileges. Full same-tenant approval provenance remains open.

## Hosted read-only results
Railway project fawri-staging, environment production (e3f66140-5fff-472b-ad63-1c16de59a911), service fawri-web independently resolved. Environment name does not establish customer production. Deployment11f22954-446b-49ef-adc6-38aca7c08bff is SUCCESS from2026-10-10, source main/d38d29229bed0f9575a98e7026e7819fe363bfd4. Live source integration main, checkSuites=false, Dockerfile.staging, readiness /ops/readiness, one sfo replica, no staged work or volumes. Current GET readiness returned200/ready at2026-10-22T22:46:12.442Z. This validates old executable health, not P0 acceptance. Bounded latest build/runtime logs show old successful healthcheck and ordinary requests; no current error entries in that sample, no incident-clearance conclusion.

Neon scoped project round-fire-18493605: staging-runtime/br-falling-dust-b1km4gix explicitly selected; default production not queried. SELECT-only catalogs still show28 ledger rows ending0027,94 public tables/45 RLS, no fawri_security schema. Source has45 migrations through0044; exact hash/timestamp comparison gives25 matches,3 historical mismatches (0001/0002/0019) and17 missing entries0028–0044. Historical mismatches require investigation and are not counted as unapplied migrations. Candidate fawri_staging_runtime is LOGIN/BYPASSRLS/CREATEROLE/CREATEDB and member of neon_superuser; fawri_staging_rls_runtime is NOLOGIN/NOBYPASSRLS. Catalogs record owners, policies/FORCE RLS, direct and effective grants, memberships, functions and default ACLs. Sensitive tables without RLS remain accessible to candidate roles; this is a catalog/configuration blocker, not a proven HTTP exploit.

Inspection identity is neondb_owner, **not established as app login**. Actual Railway DB target/login/pooler remain UNVERIFIED: no secret/connection-string values fetched. Named staging correspondence is historical evidence, not conclusive deployment binding. Fresh evidence supersedes old outage-only labels for operations actually performed; unresolved hosted binding remains blocked by missing safe identity proof. [Exact hosted evidence](evidence/P0-HOSTED-READONLY-RECOVERY-20261023.json).

## Remaining gates and next action
1. Execute isolated actual-LOGIN approval provenance diagnostic: forged insert/immutable binding/consumed-marker edits, real consumer, genuine issuance/replay positives, cross-tenant denial and exact rollback.
2. Complete P0 requirement/proof inventory and unresolved auth/privacy/offline/main-cashier/seven-day grace/branch stock/sync/provider/retention/storage gates. Whole-P0 percentage UNMEASURED.
3. Prepare reviewed hosted migration/role/ACL rollout and exact deployed identity/pooler verification; execution requires separate hosted-change approval.
4. Incident response evidence: verify Railway official incident resolution and account access/audit history; inventory affected service identities and credential exposure windows; plan staged DB/auth/provider/storage secret rotation, dependency/revocation order, rollback and post-rotation checks. Never put values in GitHub. Rotation and any hosted changes remain NOT AUTHORIZED and NOT PERFORMED. No claim credentials are uncompromised.

No deployment/restart/migration/live grants/variables/secrets/main push/merge/P1/P2 performed. Next batch is isolated diagnostic, not another policy fix or passing-suite timestamp refresh.

