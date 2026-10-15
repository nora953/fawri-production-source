# SEQ-159–160 — Support preview Chrome and SuperQi coverage gap (2026-10-13)

Audit-only, no app code changes.

## SEQ-159 actual-component browser

[GitHub Actions run 38334859697](https://github.com/nora953/fawri-production-source/actions/runs/38334859697), job 115092661108, Chrome/154.0.8037.97, PR merge source fd726ecafe629cc5a1f4b5c5c94540b6fe6c0bda: **7 PASS /4 FAIL** across 11 checks. Native actual page + i18n + CSS, synthetic loopback data. Passed: Arabic/English/Sorani 390px read-only and escaped output; initial 403/409 no private snapshot; manual 503 retry; successful end200. Failed: silent409 and silent503 retain private snapshot without stale warning; expired countdown retains readable snapshot; end503 navigates to /admin without server confirmation. Distinct source findings: `PREVIEW-SILENT-REFRESH-001` (two statuses, one canonical root), `PREVIEW-EXPIRED-RETAINED-001` (new candidate), `PREVIEW-END-UNCONFIRMED-001` (previous source finding now browser confirmed). These are **already delivered UI data** and do not prove server unauthorized fresh access. Test uses synthetic snapshots, not live records.

## SEQ-160 SuperQi existing test coverage

`artifacts/api-server/tests/superqi-sandbox-billing.integration.test.ts` lines 89–237 tests signed/status-confirmed payment applied once and duplicate webhook idempotency. Lines 238–265 tests invalid signature rejection. `artifacts/api-server/tests/superqi-sandbox-transport.test.ts` tests production fail-closed, status binding, signature and invalid checkout URL. No explicit test located in these two files for missing billing order -> HTTP200 ignored, nor synthetic generic SQL fault -> HTTP503, nor provider delivery retries. **Coverage gap only**; no fresh execution or evidence of actual missing payment.

## Next

Run disposable HTTP route cases and expiry UI revocation/visibility, inspect server preview authorization separately; do not assume stale UI equals fresh server bypass. No production writes or repairs. Overall planning estimate ~54% audited/46% remaining; release BLOCKED.
