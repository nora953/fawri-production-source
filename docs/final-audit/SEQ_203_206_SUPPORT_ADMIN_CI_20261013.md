# SEQ-203–206 Support and CI audit, 2026-10-13

Source commit a3ed63b4c8a194ecc46ad7e81091c90019f3fa5b. Read-only GitHub Actions logs; no app fixes.

SEQ-203 Support preview browser run 38339482373 job 115107020181, Chrome154, 7 PASS and 4 FAIL: silent409 and silent503 retained unmarked snapshot, expiry countdown retained readable snapshot, end503 navigated despite no confirmed termination. Existing PREVIEW-SILENT-REFRESH-001, PREVIEW-EXPIRED-RETAINED-001, PREVIEW-END-UNCONFIRMED-001. Synthetic browser, not a demonstrated new server auth bypass.

SEQ-204 Support actual component run 38339482446 job 115107020864, Chrome154, 12 PASS / 1 FAIL: admin silent refresh 503 retained ticket and left reply/resolve enabled. Existing SUPPORT-STALE-001. Three locale narrow-screen scenarios passed, as did stale overlapping response test. No real unauthorized mutation proven.

SEQ-205 Global admin golden journey run 38339482450 job 115107020441 FAIL before app tests: Disposable PostgreSQL attestation rejected, no application DB import permitted. Existing ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001; classify as test infrastructure gate rather than app auth failure.

SEQ-206 Cashier subscription lifecycle run 38339482619: ordinary job 115107020660 SUCCESS; isolated job 115107021066 FAILURE. Isolated suite summaries 13 files, 17 PASS / 7 FAIL (includes TAP parents). Failed suites cashier-operator-profit-http-postgres (3F) and cashier-billing-negative-failure-cases (4F). Existing CASHIER-REPORT-PROFIT-001, BILLING-PAID-REPLAY-028, CASHIER-BILLING-SQL-RECOVERY-001. Do not claim cashier billing fully passing.

All tests are synthetic CI. Release BLOCKED; ~54 percent audited / 46 percent remaining is an unmeasured planning estimate. No code repairs.