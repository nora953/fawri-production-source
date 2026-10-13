# SEQ-142 — App router and privileged page source inspection (2026-10-13)

**Mode:** source-only audit and documentation; no application changes, no browser execution in this stage, no real session or DB access. Audit branch only.

## Router inventory and guard boundary

- `artifacts/fawri/src/App.tsx` lines 132–157: dedicated admin routes support preview, emergency snapshot and router, early warning, owner recovery setup, work monitor and AdminPage. Lines 159–242: merchant dashboard routes wrapped in `DashboardRoute`/`DashboardLayout`.
- Lines 250–292: `AdminSessionRevalidator` runs for `/admin*`, calls GET `/api/auth/admin/me` on entry and every 30 seconds, and sends to /login on 401. This is asynchronous revalidation, not a synchronous route authorization gate. No conclusion about server access without endpoint proof. Existing SEQ-140 actual AdminPage 15 PASS applies to AdminPage only, not these separate routes.
- `DashboardLayout.tsx` has merchant lifecycle/auth guard and 401 recheck delays (150/650 ms); not browser-executed in this stage.

## Specific source findings and next test candidates

1. `artifacts/fawri/src/pages/AdminSupportPreviewPage.tsx` lines 170–194: initial snapshot 401/403 navigates to /login; silent fetch failure catch does **not** clear prior `snapshot` or visibly mark error (`if (!silent) setError(true)`). When already-rendered preview loses fresh authorization or encounters 503, previously delivered preview remains in client UI until expiry; **PREVIEW-SILENT-REFRESH-001 — OPEN_PROOF**, not a proven new unauthorized backend read. Need actual browser poll 403/503 and backend current-grant checks. Unlike emergency snapshot's GET error handling, this component retains prior state.
2. Same file lines 264–274: `endSession` awaits POST but unconditionally `finally` navigates to /admin, without inspecting `response.ok`. **PREVIEW-END-UNCONFIRMED-001 — source-confirmed UI navigation risk, browser reproduction pending**. Separate from emergency end defect; do not count as browser-proven.
3. `artifacts/fawri/src/pages/AdminWorkMonitorPage.tsx` lines 162–191: silent 15s refresh failures preserve prior `data` and do not set `loadError`; **WORK-MONITOR-STALE-001 — OPEN_PROOF** for stale privileged display/actions; server action authorization and actual browser behavior remain unverified. POST security actions check response.ok and body.ok before success.
4. `artifacts/fawri/src/pages/OwnerRecoverySetupPage.tsx` lines 64–91: owner status is fetched before rendering bundle; redirects on specific owner/auth error codes. Lines 94–114 generate recovery bundle after server POST. No source-only proof of unauthorized recovery secret disclosure. Require owner/non-owner/401/403 browser and real backend permissions.

## Boundaries / accounting

This is **source inspection**, not a passing test suite. No new PASS count or coverage percentage is awarded. Existing SEQ-140 parent 15/15, SEQ-141 emergency 9/12 and cashier profit HIGH remain separate. Planning estimate ~54% audited /46% remaining; release BLOCKED.

**Next SEQ-143:** actual-component Chrome synthetic poll 403/503, end POST 401/503 and successful end for SupportPreview; work-monitor stale response and action state; owner recovery unauthorized status/generate; cross-check backend enforcement. No application repair until entire audit ends.
