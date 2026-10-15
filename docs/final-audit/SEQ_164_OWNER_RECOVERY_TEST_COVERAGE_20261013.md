# SEQ-164 — Owner recovery test evidence inventory (2026-10-13)

Read-only test-source coverage review, **not** a claim that these tests were executed in this stage.

- `artifacts/api-server/tests/owner-break-glass-recovery-contract.test.mjs`: 10+ source-pattern contract checks: entropy, key1/old phone/OTP/key2 ordering, rate limiting, revocation and audit statements, password reauthentication and owner-session route, encrypted HttpOnly strict cookie, OTP/session cap and frontend routes. These are static assertions, not behavioral PostgreSQL proof.
- `artifacts/api-server/tests/owner-break-glass-recovery.integration.test.ts`: real HTTP + local `fawri_ci` PostgreSQL fixture test: requires owner device OTP (403), checks no-password generation 401, generation returns one-time key1/key2, invalid key1 401, OTP challenge and verification, successful recovery with sessions/devices revoked, old bundle replay 401, second recovery with reset password and old password login 401. Scope includes genuine disposable integration test logic, but **no successful CI run for this exact test verified in this audit stage**.
- Gap: concurrent simultaneous recovery completions and explicit assistant/non-owner status/generate denial are not established by this test inspection. Need inspect CI run/job proof before marking PASS.
- The earlier `ownerContext` role check and transactional revocation source controls remain positive evidence. No real account changes.
- No app fixes, release BLOCKED; ~54%/46% planning estimate unchanged.
