# Deployment and recovery boundary — source review and drill proposal

Sourcefccd677a1798470b3dba70e20ccbc37662177ceb,2026-10-11. No hosted deploy, modification, production backup extraction, credential use or destructive recovery performed. This is a reviewable plan, not infrastructure configuration evidence.

## What the current gates actually prove

| Source / gate | Observed behavior / actual evidence | Excluded conclusion |
| --- | --- | --- |
| clean-deployment-golden-gate.yml | PR/manual gate calls reusable isolated HTTP suite; completed source05456ea9 HTTP proof reused | Workflow name does not establish hosted deployment, actual image startup or rollback |
| staging-container-contract.yml | PR/manual source assertions, docker build, then shell checks API/frontend files and disabled provider defaults; completed sourcefc1ee417 workflowSUCCESS | Shell overrides entrypoint; no actual API startup/readiness, hosted HTTPS, persistent mount or roles proven |
| Dockerfile.staging | Node22build/runtime, pnpm10.26.1, NODE_ENVproduction/DEPLOYMENT_MODEstaging, workers/Meta/embeddingdisabled, same-processweb/API; fullnode_modules/dist copied | Node24isolated HTTP does not by itself prove Node22 runtime. No volume/data path configured by Dockerfile; provider-managed mounting may exist but was not queried here |
| Image build context | Docker ignore excludes env files except example, git, data, backups and buildoutputs | No claim about externally injected secrets or unknown platform settings |
| Catalog/support media | catalogMediaStorage.ts filesystem selection; supportImageStorage.ts filesystem type/root; both undergetFawriDataDir() catalog-media/support-images | No remote object-store transport, cross-instance durability, redeploy survival or hosted backup guarantee from these paths |
| Full committed-schema restore | Real offlinepg_dump/pg_restore,94tables/45policies/638constraints/28journalrows/twofixturechannels and restrictedreadsPASS | Roles remain pre-existing; no cluster-role restore, external media, PITR, operational latency or production data proof |
| production-deployment-rollback.md | Forward-only migration default, app rollback only if schema-compatible, explicit recovery point/data-loss decision and side-effect reconciliation | Documentation is not an executed rollback or selected RPO/RTO |
| HistoricalFAWRI_RELEASE_BLOCKERS.md | Frozen SHA85cf9dce statements apply to that historical checkpoint; external launch gates remain explicit | Historical none-at-freeze does not override current executed006/012/018/027/028/032 findings on the reviewedmain/auditbranch |

Reviewed container/golden workflows have no hosting deploy command. This does not establish the absence of external platform auto-deploy hooks/settings. No current Railway/Neon/Amplify inventory was inferred from repository absence. The historical no-volume observation is not re-certified as current.

## New narrowly justified compatibility check

Prepared node22-http selection uses the same ownednetwork-none PostgreSQL guard/28migrations and existing HTTP assertions under fixednode:22-bookworm-slim; all other batches stayNode24. Both image choices are enum-controlled, not arbitrary environment overrides. Suite result now recordsactualprocess.version and auditBatch. Adds seventh fresh cluster and one justified repeated HTTP invocation;34 unique files/36phase/runtimeinvocations. Syntax/YAMLPASS; runtimeproofpending. Repetition reason: deployment imageNode22 differs from original testedNode24. It is NODE_ENVtest/compiledAPI compatibility, not production/staging mode or packaged image startup proof.

## Proposed production-like recovery drill — requires separately identified approved environment

1. Record exact application image/commit, runtimeNodeversion, migration hashes/journal position and selected prior compatible app image. Verify only the approved synthetic isolated target, runtime role and network boundaries; providers/workers disabled and no real keys.
2. Inventory role memberships/ownership/default privileges and45RLS policies with sanitized evidence. Restore declared restricted roles separately into a fresh owned cluster; do not recreate BYPASSRLS or owner grants as a workaround. Repeat actual tenant/APInegative matrix.
3. Create only synthetic account/merchant/channel/session/catalog/support media fixtures. Capture DB snapshot and media manifests at one declared consistency point, including hashes and database-to-object references. No production dump or real customer data authorized.
4. Restore into a new isolated target and ownedprivate media path; require all schema/ACL/RLS/function/constraint/journal comparisons and every fixture mediahash/reference. Exercise own-tenant reads and cross-tenant media/APIdenials; verify teardown/errors visible.
5. With explicit hosting mutation approval, redeploy/replace the synthetic app instance, then prove media survives and multi-instance reads remain consistent. Without that approval, this step is BLOCKED and filesystembackup is insufficient.
6. Test approllback only to an approved compatible prior image at the restored migration position; failedmigration stops promotion. No automatic destructive down-migration and no handwritten migration-ledger marking. Record observed startup/readiness and smoke result, not policy-onlyPASS.
7. Inject fake payment/Meta side effects and queued jobs; reconcile already-completed effects before reopening workers. Never replay real sends/charges to obtain a green drill. Production side-effect procedure still requires separate operator/provider evidence.
8. Measure actual recovery/backup age. Business owner supplies RPO/RTO/retention requirements; no numerical target invented. Validate measured results against approved requirements, encrypted storage access and escalation ownership before declaring operational recoveryPASS.

## Open canonical dependencies

CATALOG-MEDIA-001/SUPPORT-STORAGE-001, BACKUP-DRILL-001 and FA-I-005 remainOPEN. RELEASE-GATE-STATIC-001 covers proof boundaries, not a new defect. Node22check can close a bounded runtime compatibility gap only. Real provider activation, hostedroleinventory, media/PITR/rollback and browser QA need separate environments/authorization. Current audit does not permit those mutations or any merge/deploy.
