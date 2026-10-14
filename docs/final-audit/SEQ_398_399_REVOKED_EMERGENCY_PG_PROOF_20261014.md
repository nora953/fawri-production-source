# SEQ-398–399 — Revoked emergency access: independent directory and overview contracts

## Executed evidence
GitHub Actions run https://github.com/nora953/fawri-production-source/actions/runs/38509676662, job 115675053472, SHA 901d122e5282ae2abcadcf5b50f163c2f84ba1c8: completed **SUCCESS**. API build PASS, disposable preflight guard 15 PASS, network-none PostgreSQL16 with no published ports, attestation PASS, 28 migrations PASS, cleanup PASS.

TAP: emergency-read-access-postgres.integration.test.ts **1 aggregate PASS, 0 FAIL, 0 SKIP**, summaryComplete true, Node v24.21.0. Do not count internal assertions as independent cases.

## What changed in audit-only test
Commit https://github.com/nora953/fawri-production-source/commit/901d122e5282ae2abcadcf5b50f163c2f84ba1c8 separates post-revocation responses:
- GET directory with revoked trusted assistant cookie: HTTP403 + EMERGENCY_AUTHORIZATION_REQUIRED.
- GET overview with same cookie: HTTP200, ok true, is_owner false, authorization null, no authorizations, owner_alerts, merchant_notices or audit_chain, requests all requested_by_admin_id == trustedId.
- Existing POST requests after revocation: HTTP403.

Prior failed run 38508376666, expected overview403 actual200, was an incorrect shared assertion for different contracts, not proof of directory leakage.

## Outstanding
The overview retains own historical request metadata after authorization revocation; product/privacy policy needs explicit decision whether this read-only history is intended. No proof of access to another assistant's history or owner-only fields. Frontend AdminEmergencyAccessPage.tsx lines 240–283 uses Promise.all and silent catch without clearing stale state when directory returns403; mounted browser authorized200 -> revoked403 regression remains NOT_RUN. Do not claim frontend repaired or staging/production verified.

Audit-only test change; no application fix. Release BLOCKED. Whole-project completion NOT_YET_MEASURABLE.
