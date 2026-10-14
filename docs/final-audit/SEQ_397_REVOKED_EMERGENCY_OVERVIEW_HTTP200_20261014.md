# SEQ-397 — Revoked assistant overview returns 200, not expected 403

## Executed CI evidence
- GitHub Actions run https://github.com/nora953/fawri-production-source/actions/runs/38508376666, job 115670990155, audit commit 836d3b465b92c97ae75e9f9abf1de0654308e3fe: job **FAIL**.
- Isolated offline PostgreSQL: networkMode none, no published ports, attestation passed, 28 migrations PASS, preflight guard 15 PASS, API build PASS, cleanup PASS.
- Aggregate TAP `emergency-read-access-postgres.integration.test.ts` **0 PASS / 1 FAIL / 0 SKIP**; line 699 `expected 403, actual 200`; summary complete. New loop checks `overview` first, so `directory` after revocation was **NOT REACHED**. Earlier SEQ-394 PASS predates this new assertion and remains valid only for its old scope.

## Root-cause source distinction
- `artifacts/api-server/src/routes/auth-emergency-postgres-routes.ts:87-113`: both routes require secure admin session; service errors propagate.
- `artifacts/api-server/src/services/postgresEmergencyReadAccessAuthority.ts:490-506`: directory checks `activeAuthorization()` for nonowner and rejects 403 if absent.
- Same service lines 612-648: overview obtains authorization rows, finds active `can_request`, otherwise returns `authorization:null`, own prior requests, no owner-only lists; **no active-authorization 403 gate**. Thus 200 is consistent with source, not evidence of bypassing directory or POST guard.

## Security/UX classification
- Confirmed HTTP policy mismatch with test expectation; **business-policy decision pending**: is read-only history of own emergency requests permitted after revocation? Do not silently convert an intended 200 contract into a vulnerability.
- Existing frontend `AdminEmergencyAccessPage.tsx:240-275` requires both GETs successful; revoked directory403 means silent polling catches failure and retains stale overview/directory. Source-confirmed frontend stale presentation in SEQ-395; browser proof pending.
- Need independent post-revocation directory403 assertion placed **before** overview policy assertion; separately assert overview200 + authorization null + no owner-only fields and only own requests if history is intended. Do not weaken directory guard.

No application fix or hosted DB mutation. Release BLOCKED; overall audit NOT_YET_MEASURABLE.
