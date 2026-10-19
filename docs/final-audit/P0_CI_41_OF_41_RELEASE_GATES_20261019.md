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

## Release blockers requiring separate evidence

1. **Hosted runtime identity:** Railway's application `DATABASE_URL` role is not verified. On the isolated Neon audit branch, `fawri_staging_runtime` was observed with `BYPASSRLS`, `CREATEDB` and `CREATEROLE`; do not infer that Railway uses this role. Verify only the role name and effective privileges, without exposing credentials.
2. **Hosted schema alignment:** The isolated Neon branch previously had 28 migration ledger rows while the checked-in journal contains 35 entries (0000–0034). Reconcile identifiers and hashes and rehearse the unapplied candidates in a disposable environment before any hosted migration.
3. **Migration 0034 race acceptance:** The source-contract test and green CI do not, by themselves, establish that *two concurrent database sessions* cannot create a cross-authority provider identity collision. Require actual two-session INSERT/UPDATE collision tests, deadlock checks, and pre-activation duplicate detection.
4. **Non-RLS sensitive tables:** `account_sessions`, `cashier_operator_sessions`, `order_items` and `support_messages` need real API-level cross-merchant negative tests, regardless of the restricted-role CI pass.
5. **Release revision and deployment:** The audited branch has not been approved for merge or deployment; verify the intended commit and Railway runtime health at release time.

## Controls

No hosted migration, privilege change, deployment or merge is authorized by this report. Preserve separate bot/intelligent-replies and cashier subscription authorities; shared inventory is not a shared billing entitlement.

**Acceptance rule:** Do not mark P0 GO until each blocker has a linkable test result or read-only evidence, owner review and explicit deployment approval.
