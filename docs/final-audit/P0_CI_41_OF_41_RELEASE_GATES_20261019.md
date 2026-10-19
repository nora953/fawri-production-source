# P0 CI completion and remaining release gates — 2026-10-19

**Repository:** `nora953/fawri-production-source`  
**Audit branch:** `fix/p0-provider-receipt-order-discovery-20261015`  
**Verified commit:** `8ef8984df135740c0da0742b4d18988fbbf0b545`  
**Decision:** **P0 NO-GO** (CI green is not production acceptance).

## GitHub Actions evidence

A read-only GitHub workflow-run query for the exact commit returned **41 completed / 41 success / 0 failed or in progress**. The isolated PostgreSQL engineering audit workflow run was `39193911550`, with the `disposable-audit` job completed successfully.

The job reported success for:
- Migrations and selected tests without external network.
- Cashier licensing, compensation and historical operator proofs.
- Billing, refunds and duplicate-event proofs with fake providers.
- Restricted-role tenant, knowledge and retention proofs.
- Meta bot and AI lifecycle with injected providers only.
- Full committed schema and restricted tenant restore drill.
- Node.js 22 offline HTTP compatibility journey.
- Cleanup of owned containers and anonymous volumes.

The repository security workflow also completed successfully. These are **CI step results**, not proof that hosted runtime identity or live tenant boundaries are safe.

### Specific two-session race evidence

- Source: `artifacts/api-server/tests/receipt-cross-authority-phantom-postgres.integration.test.mjs`.
- Runner inclusion: `scripts/execute-disposable-postgres-audit.mjs`, `billing` suite.
- The test opens `owner` and `contender` connections and transactions, confirms blocking via `pg_blocking_pids`, commits the owner, and expects the contender to fail with SQLSTATE `23514`; it asserts only one order owns the identity afterward.
- The isolated PostgreSQL audit job's billing step completed successfully. This is real disposable PostgreSQL concurrency evidence for the tested **UPDATE** scenario; do not mislabel it as source-only. It does not prove every INSERT, key-combination, deadlock or hosted rollout scenario.

## Release blockers requiring separate evidence

1. **Hosted runtime identity:** Railway's application `DATABASE_URL` role is not verified. On the isolated Neon audit branch, `fawri_staging_runtime` was observed with `BYPASSRLS`, `CREATEDB` and `CREATEROLE`; do not infer that Railway uses this role. Verify only the role name and effective privileges, without exposing credentials.
2. **Hosted schema alignment:** The isolated Neon branch previously had 28 migration ledger rows while the checked-in journal contains 35 entries (0000–0034). Reconcile identifiers and hashes and rehearse the unapplied candidates in a disposable environment before any hosted migration.
3. **Migration 0034 race acceptance — partially evidenced:** The billing suite in `scripts/execute-disposable-postgres-audit.mjs` includes `receipt-cross-authority-phantom-postgres.integration.test.mjs`. Its source explicitly opens two PostgreSQL sessions, checks `pg_blocking_pids`, commits the first transaction, and asserts SQLSTATE `23514` for the losing UPDATE. The isolated audit billing step succeeded on this commit. **Therefore a two-session cross-authority UPDATE race has been tested in disposable CI**, not merely specified. Remaining: independent INSERT race cases, opposite-order updates/deadlock coverage, and pre-activation duplicate detection. Payment-only versus request-only collision coverage was added and passed in the follow-up commit documented below.
4. **Non-RLS sensitive tables:** `account_sessions`, `cashier_operator_sessions`, `order_items` and `support_messages` need real API-level cross-merchant negative tests, regardless of the restricted-role CI pass.
5. **Release revision and deployment:** The audited branch has not been approved for merge or deployment; verify the intended commit and Railway runtime health at release time.

## Controls

No hosted migration, privilege change, deployment or merge is authorized by this report. Preserve separate bot/intelligent-replies and cashier subscription authorities; shared inventory is not a shared billing entitlement.

**Acceptance rule:** Do not mark P0 GO until each blocker has a linkable test result or read-only evidence, owner review and explicit deployment approval.

## Follow-up verification: identity-key regression commit 425f639 (2026-10-19)

A second exact-SHA GitHub Actions read confirmed **41 completed / 41 success / 0 failed** for commit `425f639254df6757dcdce6e65846f8657831823e`. The isolated PostgreSQL audit workflow run `39194796136` completed successfully, including the billing, restricted-role, Meta/AI, schema restore and Node.js 22 steps. This revision adds independent request-only and payment-only collision assertions to the disposable PostgreSQL billing test, each expecting SQLSTATE `23514` and a single surviving owner. These are **UPDATE-based collision tests**, not INSERT-race proofs.

**Remaining migration 0034 gaps:** simultaneous cross-authority INSERT collisions, reverse-order two-key advisory-lock deadlock resistance, and pre-activation duplicate detection. These are not cleared by the green CI. Hosted identity, schema alignment, non-RLS API isolation and deployment approval blockers above remain open. No production rollout is authorized.

## Read-only Railway staging check — 2026-10-19

- Railway project `fawri-staging`, environment `production`, service `fawri-web` was inventoried read-only.
- Live source is repository `nora953/fawri-production-source`, branch `main`; latest deployment `11f22954-446b-49ef-adc6-38aca7c08bff` reported `SUCCESS`, created `2026-10-10T22:22:49.599Z`.
- Railway environment status returned one service, zero issues and zero failures; no pending staged work was reported.
- The connected Railway integration returned environment-variable names only (`valuesRedacted=true`). It exposed the name `DATABASE_URL` but not its value, so the effective database role and privileges **could not be verified**. No credentials were read back or exposed, and no variables/configuration were changed.
- This environment is named `production` inside the Railway project `fawri-staging`; do not assume it represents the actual customer-facing production environment without owner confirmation.

**Disposition:** runtime health snapshot is clean, but database identity remains NOT VERIFIED. This does not close the hosted runtime privilege gate. No deployment or hosted database change was made.

## Hosted runtime role check prepared — 2026-10-19

Added `docs/final-audit/sql/p0_hosted_runtime_role_readonly_check.sql`, a read-only SELECT intended to run through the application's actual `DATABASE_URL` in a controlled operator session. It reports the connected role's superuser, CREATEDB, CREATEROLE, BYPASSRLS and INHERIT attributes plus direct role memberships, without displaying credentials. This query has **not** been executed against Railway because the connected Railway integration redacts variable values; the actual runtime role remains **NOT VERIFIED**.

The documentation-only commit `3f094baaacd9ee8ce07a6f559c55d61aab0be920` has no workflow runs returned for its exact SHA. Do not claim CI passed for this docs-only commit. The previously tested code revision `d11387d1cd608f8fe412a132f3117286ecb7e0f8` had 41/41 successful workflows.
