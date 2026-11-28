## Recovery read-only refresh — 2026-10-17 00:12 Baghdad

Railway inventory, service configuration, deployment history and72h health reads confirm unchanged main/d38d2922 deployment11f22954SUCCESS, one online replica/zero crashed, zero recent failures, no staged/pending work. checkSuites=false, no Railway volumes/buckets. Actual GET /ops/readiness at2026-10-16T21:12:07Z returned200/ready with PostgreSQL authority and release configuration up. No role identity/privilege flags are returned. These observations do not accept the newer draft source or establish external storage durability.

The now-exposed Neon list_projects connector was retried during recovery and still returned MCP-32602 Tool list_projects not found. Catalog, runtime grants and hosted function owners remain BLOCKED/UNVERIFIED. Prior GitHub protection403 remains UNKNOWN, not retried. No variable values, credentials, hosted SQL or platform mutations. Exact evidence: `evidence/P0_RAILWAY_READONLY_RECOVERY_20261016.json`. Release NO-GO; hosted writes/deployment still require separate explicit authorization.

---

## Read-only refresh — 2026-10-15 21:10 Baghdad

Fresh Railway MCP environment/service/deployment/status reads reconfirm source main/d38d29229bed0f9575a98e7026e7819fe363bfd4 and successful deployment11f22954-446b-49ef-adc6-38aca7c08bff (2026-10-10T22:22:49.599Z). One running replica/zero crashed; no recent failures or active warning/critical notifications in the default8h window. No pending/staged work; checkSuites=false, healthcheck /ops/readiness, no mounted volumes or Railway buckets. Absence of these Railway resources is not evidence that external durable storage is absent.

Actual GET /ops/readiness at2026-10-15T18:10:46.870795Z returned HTTP200/status ready; PostgreSQL authority up(duration1017ms), production release configuration up. No runtime-role identity or flags returned. This certifies only observed old-source endpoint/platform state. New #550 code and its CI are not deployed or hosted accepted. Neon/branch-protection blockers were not retried without a new reason; their previous BLOCKED/UNKNOWN status remains, not an inferred database/protection defect. No variable values, credentials, customer payloads or platform mutations used. Machine evidence: `evidence/P0_RAILWAY_READONLY_REFRESH_20261015_1810Z.json`. Release NO-GO.

---

## Read-only refresh — 2026-10-15 06:40 Baghdad

Railway inventory/config/deployment reads reconfirm main/d38d29229bed0f9575a98e7026e7819fe363bfd4, same successful deployment11f22954, checkSuites=false, no mounted volumes/buckets and no staged changes. GET https://fawri-web-production.up.railway.app/ops/readiness actually returned HTTP200: status ready; PostgreSQL authority up, production release configuration up. This closes only the previously unexecuted endpoint-read gate, not hosted grants, role identity, provider acceptance or deployment of newer PRs. Runtime role is not returned in that response.

Neon list_projects again returns MCP Tool list_projects not found; hosted DB inventory stays BLOCKED. Branch-protection403 evidence remains UNKNOWN; no repeated permission probe. No variable values or credentials read, no infrastructure mutation. Release NO-GO remains.

# P0 Railway hosted acceptance and rollout safety checkpoint (2026-10-15)

Status: **read-only inventory completed; hosted acceptance NOT executed; rollout NOT authorized.**

## Observed evidence
- Railway project: `fawri-staging`; service: `fawri-web`; environment label: `production` (a Railway label, **not** proof of a customer-facing production release).
- Service source: `nora953/fawri-production-source`, branch `main`, `checkSuites=false`.
- Dockerfile: `Dockerfile.staging`; start: `node --enable-source-maps /app/artifacts/api-server/dist/index.mjs`; healthcheck path: `/ops/readiness`.
- Latest successful deployment at inspection: `11f22954-446b-49ef-adc6-38aca7c08bff` (2026-10-10), source commit `d38d29229bed0f9575a98e7026e7819fe363bfd4`.
- One replica in `sfo`; no mounted volumes; Railway hostname `fawri-web-production.up.railway.app`; no custom domain. No pending staged config changes.
- Environment variable **names** were visible, not their values. Neither effective security settings nor operational readiness have been established by this inventory.
- Independent synthetic PostgreSQL test branch `test/p0-operator-device-expiry-race-20261015` at `5bc84db8b220350bab1e62f18e5de9042e0dc97e` passed 6/6 GitHub workflows; operator wire suite 17/17. This code is **not deployed** on Railway.

## Gates before any hosted change
1. Confirm the purpose and data sensitivity of Railway's environment labeled `production`. Never run destructive acceptance tests or synthetic payment mutations against live merchant data.
2. Review current `main` versus test branch and decide an approved, reviewed merge path; no direct deploy from the audit branch.
3. Make deployment protection explicit: `checkSuites=false` is a verified configuration gap. Decide whether Railway check-suite gating can be enabled with required GitHub checks, and verify behavior safely before changing configuration.
4. Establish storage durability for catalog/support media and other file writes. No mounted volumes is not itself proof of data loss, but persistent local writes must not be relied upon without an approved external storage/volume architecture.
5. Establish a safe restricted-role hosted database test plan with a disposable merchant, dedicated credentials, permission boundaries, cleanup, and evidence capture. Never print secret values into logs.
6. Verify the live `/ops/readiness` endpoint response and runtime role without disclosing credentials. A configured healthcheck is not proof of an externally tested endpoint.
7. Exercise billing callback/reconciliation, Meta signed webhook, operator revocation, and offline cashier expiry only with sandbox providers and explicitly approved staging scope. Record both HTTP and durable PostgreSQL outcomes.
8. Record each gate with run ID, commit SHA, environment, evidence, PASS/FAIL/BLOCKED; keep missing hosted or real-provider evidence BLOCKED, not PASS.

## Release decision
**NO-GO for production rollout** until hosted restricted-role and sandbox end-to-end proof, deployment controls, storage durability, and required security evidence are verified. This document is a plan and inventory, not an assertion of executed hosted tests. Do not merge, deploy, rotate credentials or alter Railway settings merely to satisfy this checklist.

## Evidence status update (2026-10-15)
- GitHub branch-protection API query for `main` returned **403 Resource not accessible by integration**. Mark required status checks/branch protection **UNKNOWN**, not disabled; this is distinct from Railway's confirmed `checkSuites=false`.
- Neon project-list connector returned a tool-unavailable error. Hosted Neon branches, runtime grants and database role remain **UNVERIFIED** by this pass; prior isolated PostgreSQL CI is not a substitute.
- Documentation commit `3dc19b08d35d72a5887ecf286db1be941da4391c`: GitHub Actions run `38667410457` isolated PostgreSQL eventually finished **CANCELLED** (not a test failure); the other five workflows were **SUCCESS**. Superseding documentation commit `34417ea5a883f9fd455b5ad74b65c346f66f1e97` launched new PostgreSQL run `38667715944`, **IN PROGRESS** at cashier licensing/compensation/historical-operator tests when inspected. Do not treat a cancelled run as green or as a regression.
