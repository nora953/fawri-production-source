# SEQ-312–314 — device and permission HTTP preparation

Audit-only. Application, original tests and schema unchanged. Actual SQL/HTTP cases NOT_RUN until CI evidence is read.

SEQ-312: reviewed actual session device binding, current admin routes and SQL permission/enabled authority. SEQ-313: prepared ten new named dependent cases through aggregate Authv2 Express/cookie middleware and disposable PostgreSQL: missing/wrong device, foreign device record, wrong owner password, two-device selective revocation, assistant role denial, unknown permission mutation protection, live permission removal, enabled input validation, disable and reenable without old-cookie revival. Fixture seeds synthetic accounts and registers trusted devices with existing services. Tokens/password hashes are never reported. No real login/OTP/provider or production RLS proof.

SEQ-314: syntax PASS; four local runner refusal tests PASS/0FAIL/0SKIP, separate from business cases. Fixed suite allowlist, required attestation before migration/import, network-none PostgreSQL16, no published ports, readonly repo mount, early server/runtime/pool cleanup, bounded child runtime and owned container cleanup. Existing fifteen SEQ-306 cases are not rerun.

Next execute and classify CI evidence, preserve raw parent count separately, reconcile seven ledgers and PR #520. Whole percentage NOT_YET_MEASURABLE; release BLOCKED; 21 selector paths and 222 full route visual cases unchanged.
