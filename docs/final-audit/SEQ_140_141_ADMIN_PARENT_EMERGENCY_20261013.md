# SEQ-141 — Emergency snapshot termination and Sorani UI evidence (2026-10-13)

Status: READ-ONLY AUDIT; no application fix. Based on actual-component browser run [38333324124](https://github.com/nora953/fawri-production-source/actions/runs/38333324124), job 115087760003, Chrome 154, 9 PASS / 3 FAIL.

## Source-level confirmation

File: `artifacts/fawri/src/pages/AdminEmergencySnapshotPage.tsx` on audit branch, lines 338–355 (as inspected 2026-10-13).

`endSession()` awaits the POST and handles HTTP 401 with `clearSession(); setLocation("/login"); return;` but its unconditional `finally` calls `setLocation("/admin/emergency-access")`. There is no `response.ok` check before navigation. This explains two independently observed browser failures without guessing:
- **EMERGENCY-SNAPSHOT-END503-001 — OPEN, MEDIUM, UI/session-state reliability:** HTTP 503 end response still navigates away without server termination confirmation.
- **EMERGENCY-SNAPSHOT-END401-001 — OPEN, MEDIUM, authentication navigation:** HTTP 401 attempts /login, then unconditional finally overwrites it with /admin/emergency-access. This is a UI navigation error, not demonstrated server auth bypass.

- **EMERGENCY-SNAPSHOT-KU-001 — TRIAGE / unconfirmed application defect:** Sorani native orders empty-tab check timed out; Arabic and English passed. Need separate investigation of locator, locale, timing, and actual rendering before assigning product severity.

The snapshot GET path separately redirects 401 to /login, and its catch clears stale snapshot; browser tests of initial 403/409, silent 409/503, expiry and retry passed. Avoid broadening the termination issue to those verified paths.

## SEQ-140 reconciliation

Actual parent AdminPage workflow [38333323885](https://github.com/nora953/fawri-production-source/actions/runs/38333323885), job 115087759639, Chrome154: **15 PASS / 0 FAIL** across initial owner/support/inspector/logs/none/password/401/403/malformed/503 and 5 focus-triggered permission refresh transitions. Mounted real AdminPage/controller/shell/view/i18n/CSS with synthetic loopback HTTP. This does not close child Support stale 503 issue, backend authorization, real App router, hosted grant, a11y or mobile proof.

## Accounting and next step

No repair, no merge, no deploy, no hosted DB changes. Keep existing CASHIER-REPORT-PROFIT-001 as one HIGH finding, not duplicate on cashier CI reruns. Estimate remains ~54% audited/46% remaining, release BLOCKED. Next investigate remaining owner/admin/merchant route groups and Sorani failure classification.