# Fawri P0 — launch blockers only: executable closure queue

**Checkpoint:** 2026-11-09, Draft PR [#550](https://github.com/nora953/fawri-production-source/pull/550); source-only work. **NO-GO** until every necessary P0 blocker has real acceptance, external setup and deployment/recovery proof.

This file supersedes **audit-work sequencing only**, not canonical authorization policy or `docs/final-audit/evidence/P0-CLOSURE-REGISTER.json`. That 2026-10-24 registry has **45 known bounded source gates: 29 CLOSED_SOURCE, 7 OPEN, 9 BLOCKED**. It explicitly declares `completeP0Inventory=false`, `overallPercentage=null`. **29/45 = 64.4% counts source-gate rows, not launch readiness.** Do not use a percent as evidence of release closure.

## P0 launch-blocker execution order

| Order | Exact outstanding P0 gate (or source-critical dependency) | Closure type | Next concrete acceptance, without redundant broad audit |
|---|---|---|---|
| 1 | **FT-01 / 0052 first-commercial PostgreSQL18** (dependency of hosted rollout; not an additional register row) | Source candidate proved; hosted BLOCKED | Choose and approve exact first-commercial-only source/journal/role design, pin checksum and rollback; test production startup profile and complete per-operation grants. Then separately approved new-target-only bootstrap and real SQL+HTTP |
| 2 | P0-ACCESS-HOSTED-IDENTITY | BLOCKED, external/provider | Independently attest new production project+branch+direct/pooled endpoints, runtime/auth/operator LOGINs and their exact actual identities. Refuse old original-staging project |
| 3 | P0-ACCESS-HOSTED-ROLLOUT | BLOCKED, hosted | On attested new target only, source-pinned 53-stage schema/GRANT/RLS check, 0052 admission, restricted negative/positive SQL+HTTP and rollback |
| 4 | P0-ACCESS-FULL-ROLE-PRIVACY-MATRIX | OPEN, code/hosted parity | Reuse accepted 8-table SQL + 7/7 isolated SQL/HTTP evidence; close only missing actor/field/producer/consumer paths on real restricted LOGINs, not reopen accepted tests |
| 5 | P0-RESIDUAL-MERCHANT-PRIVACY-001/http | OPEN, code/hosted parity | Match remaining actual mounted HTTP actor matrix to same/new restricted identities and negative no-side-effect SQL |
| 6 | CASHIER-SYNC-SEQUENCE-001 | OPEN, cashier financial protocol | SEQ-R1/R2/R3: preserve unsupported v2 fence; decide v2 movement-only compatibility and independent reviewed device provenance, then targeted ordered replay/restore/negative acceptance. No assumed counter reset |
| 7 | P0-OFFLINE-DEVICE-ACCEPTANCE | OPEN, physical acceptance | Real device/profile/7-day-expiry and power-loss/restore cases. Native local tests are not physical evidence |
| 8 | P0-OFFLINE-KEY-RELEASE | BLOCKED, key provider | Approved production key ID/public-key/release manifest and rotation + offline grant/rollback, no generated fixture keys |
| 9 | P0-RECEIPT-OWNERSHIP-POLICY | OPEN, product/authorization decision | Define original receipt owner and reviewer-assisted exception flow with immutable provenance and anti-replay; approve before repair actions |
| 10 | P0-RETENTION-PRIVILEGED-DELETION-POLICY | OPEN, data-governance decision | Class-by-class purpose/retention/hold/deletion-reader matrix and tests. Do not truncate financial/legal evidence merely to produce a green status |
| 11 | P0-HOSTED-PROVIDER-PAYMENT | BLOCKED, commercial gateway | Supported real subscription provider/account and bounded signed webhook, idempotence and settlement reconciliation; sandbox does not count |
| 12 | P0-HOSTED-PROVIDER-META | BLOCKED, Meta/KMS | Approved Meta app, KMS trust, real OAuth/webhook subscriptions and one bounded negative/positive live test, within 24-hour/compliance rules |
| 13 | P0-HOSTED-STORAGE-DELETION | BLOCKED, durable image/media | Select persistent storage, verify restart/redeploy retention, private tenant access, real delete/backup/restore |
| 14 | P0-HOSTED-RECOVERY | BLOCKED, provider backup | Verified encrypted externally recoverable database+media strategy; independent restore with actual roles and measured RPO/RTO. New Neon Free-plan snapshot alone is not an external backup |
| 15 | P0-HOSTED-BRANCH-DEPLOYMENT | BLOCKED, hosting | Trace actual SHA/image, production secrets and 3 role URLs to verified deploy; readiness and rollback without impacting old project |
| 16 | P0-INCIDENT-REVIEW | OPEN, operator security | Review required original logs, exposed identities and window; rotate affected secrets with evidence if necessary. Historical healthy samples ≠ incident clearance |
| 17 | P0-RELEASE-SIGNOFF | BLOCKED, final | Close/explicitly disposition required functional and external gates, approve domain/legal/merchant smoke, then owner-signoff + release controlled merge/deploy |

**Execution rule:** first resolve a *real source defect* or narrowly scoped missing acceptance; verify on the exact commit; update closure evidence. Skip already accepted checks unless impacted source changed. External/provider or approval-only gates are never quietly marked closed. Nonblocking P1/P2 enhancements are deferred. A dependency remaining blocked is not a reason to rerun the comprehensive audit.

## Latest real code acceptance (not release acceptance)

- [`6db300b7`](https://github.com/nora953/fawri-production-source/commit/6db300b73264a1a4aabf7656eedd4d9dcee2b9e9): local held 0052 SECURITY INVOKER + auth group admission/forged membership/rollback/three-merchant isolation [FT-01 run #42594566747](https://github.com/nora953/fawri-production-source/actions/runs/42594566747) **success**.
- [`f0793ddd`](https://github.com/nora953/fawri-production-source/commit/f0793ddd69311e0a93bf3f507a26dcc8f2c5a767): new proof queries HELD metadata through a **restricted primary tenant LOGIN** (not only superuser/BYPASSRLS owner) and insists the actual canonical production startup gate **reject** the unapproved INVOKER variant. [FT-01 run #42596023294](https://github.com/nora953/fawri-production-source/actions/runs/42596023294) **success**, log markers `FT01_HELD_INVOKER_TENANT_LOGIN_CATALOG_PASS`, `FT01_HELD_INVOKER_CANONICAL_PRODUCTION_GATE_DENIED_PASS`.
- [\`eea74fbd\`](https://github.com/nora953/fawri-production-source/commit/eea74fbddf24ca0571fd5a732a47474927f79d70): immutable **first-commercial-only held 0052 INVOKER source-review manifest**, with independent canonical 53-step journal/stage/source and drift-negative tests; [FT-01 run #42596873523](https://github.com/nora953/fawri-production-source/actions/runs/42596873523) **COMPLETED SUCCESS** (marker `FT01_FIRST_COMMERCIAL_0052_INVOKER_REVIEW_MANIFEST_FAIL_CLOSED_PASS`). Still `approved_to_execute=false`, startup-profile-adopted=false, hosted proof=false. This is a source review prerequisite, not deployment permission.
- Source `lib/db/drizzle/0052_cashier_stream_receipt_storage.sql` and its canonical journal/stage hash remain unchanged; `0052` real Neon application is still **BLOCKED** due to non-superuser function ownership and missing separately reviewed official source/journal adoption, not silently solved by local tests.

## Stop criteria

No release traffic, hosted DB mutations, old-Neon migration/import, Railway deployment, PR merge or secrets exposure on the authority of this file. For each gate, the only valid status update is an exact source+CI/SQL/HTTP/provider evidence record and an explicit scoped release decision. **FIELD002 OPEN, PR #550 DRAFT, launch NO-GO**.
