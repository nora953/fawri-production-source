# SEQ-394 — Verified emergency PostgreSQL HTTP suite PASS

2026-10-14. **Actual CI evidence**, not source-only or inferred.

## Exact run
- [GitHub Actions run 38507961236](https://github.com/nora953/fawri-production-source/actions/runs/38507961236), job `115669689804` (`emergency-disposable`), PR source SHA `ab9db1859df1b84c114e38b787f68f565d542210`; final job **completed/success**.
- Frozen dependencies PASS; API build PASS; isolated guard **15 PASS/0 FAIL**.
- `AUDIT_ISOLATION_PROOF`: `suite=emergency`, `networkMode=none`, `publishedPorts=false`, database/role `fawri_ci`, Node image `node:24-bookworm-slim`; disposable identity markers all true.
- `DISPOSABLE_MIGRATIONS_PASS count=28`.
- TAP: `ok 1 - Emergency read access is PostgreSQL authoritative with Auth v2 sessions`; `tests 1`, `pass 1`, `fail 0`, `skipped 0`. `AUDIT_SUITE_RESULT` `exit=0`, `passed=1`, `failed=0`, `summaryComplete=true`, runtime Node `v24.21.0`.
- Always-run Docker cleanup step **success**; final workflow job **success**.

## Scope and limits
- One aggregate TAP test contains multiple direct HTTP/SQL assertions, including newly added unauthorized directory GET 403 and authorized assistant GET 200 without owner-only assistants list. These are **covered by the passing aggregate**, not separately enumerated TAP cases; do not inflate test counts.
- The test uses loopback Express router with real disposable PostgreSQL and Auth v2 sessions; not a deployed environment, real user browser, production role, or full application E2E. No real provider calls or hosted DB changes.
- UI stale data after authorization revocation remains source-only TRIAGE from SEQ-391; this PASS does not certify browser state refresh or eliminate other existing findings.

## Next
Add/execute mounted browser denied-directory and post-revocation refresh tests; keep production release BLOCKED. Whole audit completion NOT_YET_MEASURABLE. No app fixes made.
