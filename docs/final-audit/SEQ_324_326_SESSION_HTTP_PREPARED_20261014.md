# SEQ-324–326 — session HTTP preparation

Audit only; application/original tests/schema unchanged. Source review checks owner per-device cap versus assistant account cap, session list/delete ownership, committed expiry markers, touch deadline clamp, rotation/lineage, concurrent winner and self logout-all/credential kind handling. Prepared14 new named cases using real aggregate Authv2 HTTP and owned SQL. Previous creation/password/device/permission cases not rerun.

Clock boundaries prepared by updating only disposable fixture timestamps with schema constraints retained; no global clock or production guard changes. Absolute-expired fixture also has expired idle deadline because SQL requires idle<=absolute, so that case does not isolate the absolute disjunct. Concurrent loopback HTTP rotation validates one linked winner and stale denial; cookie-clear observation is recorded separately from browser response-order behavior. Tokens/cookies never logged.

SEQ-326 syntax PASS and4local runner refusal controls PASS separately. Fixed allowlist/attestation/network-none PG16/readonly source/early cleanup/bounded executor/owned container cleanup retained. Actual business cases NOT_RUN until CI logs. Seeded devices/sessions not OTP/interactive login/browser/production RLS/provider proof. Whole percentage NOT_YET_MEASURABLE/release BLOCKED.
