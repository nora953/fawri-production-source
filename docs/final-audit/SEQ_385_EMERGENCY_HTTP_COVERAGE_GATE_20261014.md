# SEQ-385 — Emergency access HTTP coverage and safe execution gate (2026-10-14)

Audit only. This checkpoint reconciles source assertions; no test run, no application changes, no hosted DB access.

## Verified source
- `artifacts/api-server/tests/emergency-read-access-postgres.integration.test.ts` checks owner GET directory 200 (lines 315–323), unauthorized assistant POST requests 403 (325–341), owner authorization and authorized request 201 (343–375), wrong-session snapshot 403 and read-only POST 403 (407–441), owner revocation and subsequent assistant POST 403 (661–691).
- **Missing direct assertions**: unauthorized assistant GET directory 403; authorized assistant GET directory 200 without owner-only assistant data; overview/directory paired responses in original App; browser state after revocation and polling.
- Top-level test guard checks only localhost/127.0.0.1 and database name `fawri_ci`. It does not call the newer disposable database attestation helper. Never invoke against persistent loopback DB; run only in isolated guarded Docker CI.
- `scripts/execute-disposable-postgres-audit.mjs` does not list this suite in its current batch inventory. The isolated run 38506114912 is **not** evidence that this suite passed or failed.

## Correct next proof
Run existing emergency suite in guarded isolated CI first, preserving all original assertions and capturing exact run/job/SHA. Add separate audit-only missing GET directory 403/200 and browser revoked-session cases later, without application repair and without double-counting pre-existing coverage. Owner's false healthy audit-chain display is separately tracked as `EMERGENCY-AUDIT-STATUS-MISREPORT-001`.

## Coverage
New executed cases 0; new confirmed defects 0. Source-only proof inventory. Release BLOCKED; overall audit completion NOT_YET_MEASURABLE.
