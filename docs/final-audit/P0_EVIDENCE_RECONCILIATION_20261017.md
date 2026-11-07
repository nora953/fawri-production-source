# P0 evidence reconciliation — 2026-10-17

Scope: read-only reconciliation of existing isolated CI results for draft PR #550; this note does not certify hosted release acceptance.

## Superseded historical NOT RUN notes

- Isolated run [39002802732](https://github.com/nora953/fawri-production-source/actions/runs/39002802732), job `117309086649`, completed successfully. Its log emits **16 `REPLAY_CAPABILITY_OWNER_PROOF`** records covering restricted function ownership and FORCE RLS cases, with `preRollbackDomainUnchanged=true` and `rollbackRestored=true`. Thus earlier headers in `AUDIT_REGISTER.md`, `ISSUES.md`, `PROGRESS.md` describing the stronger pre-rollback assertion as pending are **historical and superseded** for this tested source.
- The same isolated job includes the restricted provider-order discovery suite. The current test source `artifacts/api-server/tests/billing-provider-discovery-restricted-postgres.integration.test.mjs` covers two-session mapping mutation after durable receipt admission and after initial discovery before attachment, for SaaS and cashier authorities. It asserts fail-closed outcomes, unchanged admitted receipt, zero application/grant and cleared tenant context. The earlier NOT RUN description in `P0_RESTRICTED_PROVIDER_ORDER_DISCOVERY_20261015.md` is **historical and superseded** by this run; do not erase its original publication history.
- API routes `artifacts/api-server/src/routes/auth-verified-receipts-postgres-routes.ts` use `requireSecureAdminPermission('manage_subscriptions')` and derive actor identity from `getAuthContext(res)` rather than request body. Execution also forwards session ID and device hash to SQL authorization. The HTTP/PostgreSQL suite tests client-supplied actor override rejection. This is source/isolated-test evidence, not proof of hosted principal configuration.

## Still open — release NO-GO

1. Hosted migration/rollback and exact function-owner/RLS/EXECUTE acceptance for migrations 0028–0033 on a specifically authorized disposable hosted branch; never run migrations on production without separate authorization.
2. Actual Railway service database principal and deployment-mode attestation, including production-only readiness gates; an old-main staging healthcheck is insufficient.
3. Hosted integration/provider acceptance of the current P0 branch, and remaining storage/retention/privileged deletion and deployment controls as tracked in existing audit documents.
4. Consolidate current-status headers and check every P0 register item against exact source, run, job and environment before asserting audit completion or a new percentage.

No merge, deploy, secrets, hosted SQL or production data mutation was performed in this reconciliation. CI pass on disposable PostgreSQL is not production sign-off.
