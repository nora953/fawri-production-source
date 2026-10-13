# SEQ-207–210 Fresh CI verification (2026-10-13)

Read-only GitHub Actions verification for commit af25d2fcc9b84aa30ae91f6869f5f9ac85e00013. No app changes.

SEQ-207 Report actual-component print run 38341682096 job 115113853011 SUCCESS. AUDIT_REPORT_PRINT_RESULT Chrome/154.0.8037.97 shows three PASS (ar, en, ku). Previous run 38339482389 had browser prerequisite timeout and no test results; that earlier infrastructure failure is not an app printing defect. This fresh run provides actual browser proof for three locales, not hardware printer signoff.

SEQ-208 Support preview run 38341682074 job 115113852988 FAILURE: Chrome154 7 PASS / 4 FAIL. Silent409 and silent503 retain unmarked snapshot; expired countdown retains readable preview; end503 navigates without server termination confirmation. Same existing PREVIEW-SILENT-REFRESH-001, PREVIEW-EXPIRED-RETAINED-001, PREVIEW-END-UNCONFIRMED-001.

SEQ-209 Cashier native IndexedDB run 38341682062 job 115113852951 FAILURE: Chrome154 3 PASS / 1 FAIL. Same operation ID with changed quantity accepted. Existing CASHIER-IDB-IDEMPOTENCY-001. Other native concurrency/reopen/upgrade tests pass.

SEQ-210 Global admin golden journey run 38341682063 job 115113853109 FAILURE before application DB import: Disposable PostgreSQL attestation rejected. Existing ADMIN-JOURNEY-DISPOSABLE-ATTESTATION-001; environment gate not a proven admin authorization bug.

Other workflows on this commit were still in progress when observed; do not assign final outcomes. No repairs. Release BLOCKED. Planning estimate 54 percent complete / 46 percent remaining, not derived from number of SEQ records.