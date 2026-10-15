# Golden journey database safety review

Source review only; tests not executed.

- `artifacts/api-server/package.json` defines `test:global-merchant-journey` using `global-merchant-auth-bootstrap-postgres.integration.test.mjs` and `global-merchant-golden-journey.integration.test.mjs`.
- Both entrypoints skip if `DATABASE_URL` is absent. Neither entrypoint contains the explicit local database host and name assertion seen in `global-merchant-postgres-http-journey.integration.test.ts`.
- The bootstrap test provisions synthetic merchant credentials and deletes the account during cleanup.
- The golden journey test deletes a synthetic account ID before inserting fixtures and exercises merchant/cashier data paths.
- Finding: a configured database URL alone is not a safe indication of a disposable target. Running these tests with a staging URL would risk mutating a non-disposable database.
- Required follow-up: implement and test a shared fail-closed disposable database preflight before any fixture writes, and execute only in an isolated CI database with proven instance identity. Record any skipped tests explicitly.

Status: OPEN, test-runner safety gap. No application code, production DB, staging DB or tests were modified by this audit note.
