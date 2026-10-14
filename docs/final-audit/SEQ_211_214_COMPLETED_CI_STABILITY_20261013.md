# SEQ-211–214 completed CI repeatability review (2026-10-13)

Read-only audit of GitHub Actions on commit 1f7c88d97a87aa54b50e7503b21e333b41a8a987. All 33 workflows completed: 25 success, 8 failure. Counts are workflows, not unique test assertions. No code changes.

SEQ-211 Isolated PostgreSQL run 38341810729 job 115114509747 FAILED. 43 suite result markers, 144 passed / 24 failed including nested TAP parent results. Same seven failed suites as preceding isolated runs: meta-page-directory-restricted-rls (3F), cashier-operator-profit-http-postgres (3F), cashier-billing-negative-failure-cases (4F), billing-external-checkout-rollback-postgres (7F), saas-billing-sql-failure-recovery (2F), saas-billing-negative-failure-cases (4F), reply-cross-cycle-refund-postgres (1F). Deduplicate against existing audit issues. No new independent defect inferred.

SEQ-212 Emergency snapshot run 38341810770 job 115114292100 Chrome154 FAILED: 9 PASS, 3 FAIL: Sorani native orders tab empty timeout; end503 navigates without confirmed termination; end401 overrides login redirect with /admin/emergency-access. Same failures as preceding run. Synthetic loopback component, not demonstrated server access bypass.

SEQ-213 Support actual-component run 38341810846 job 115114265508 Chrome154 FAILED: 12 PASS, 1 FAIL: after silent refresh 503, admin reply/resolve remain enabled while old ticket retained. Existing SUPPORT-STALE-001; no real mutation or permission bypass proven.

SEQ-214 Cashier subscription run 38341811053: ordinary job 115114265535 SUCCESS; isolated job 115114266064 FAILURE: 13 suite markers, 17 PASS / 7 FAIL including TAP parents. Failing cashier operator profit (3F) and cashier billing negative cases (4F); existing cashier-profit and billing findings.

All 33 workflows have terminal conclusions; this commit's broader green gates do not override blocking functional tests. No fixes, no final remediation plan. Release BLOCKED. Prior 54 percent estimate is not a computed audit coverage measurement.