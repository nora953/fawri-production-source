# P0 payment admission, audit boundary and readiness evidence

Verified 2026-10-19 UTC against source 693b2be0 and recovery checkpoint 6394d2d0. Release **NO-GO**. No hosted writes, grants, role creation, merge or deployment.

## A. Payment receipt call-path result

`routes/saas-billing.ts` mounts the public POST `/billing/providers/superqi/webhook` and rejects a missing x-signature. Its only service caller is `handleSuperQiSandboxWebhook` in `services/superQiSandboxWebhook.ts`. Repository search found exactly one production application call to SQL `fawri_admit_verified_payment_receipt`, in that handler.

The handler checks sandbox availability (the transport disables sandbox checkout in production), verifies RSA-SHA256 using the configured provider public key, validates currency/amount/status, then calls the fixed sandbox HTTPS gateway status endpoint with server-side Basic/terminal credentials. It requires matching payment ID, status, canceled state, currency and amount; an optional supplied request ID must match the gateway's request ID. Receipt event identity uses confirmed gateway fields. Only then does it call the admission capability in autocommit, resolve the confirmed order and apply the separately scoped SaaS or cashier billing authority. Autocommit intentionally preserves independently verified orphan receipts for retry; it is not itself an entitlement grant.

`superQiSandboxTransport.ts` signs/verifies the provider canonical fields paymentId|amount.toFixed(3)|currency|creationDate|status. requestId, canceled and confirmedAmount are not signed by this format: canceled and requestId are checked against gateway confirmation and the settlement amount comes from confirmed gateway data. Do not invent a new provider signing format or claim every JSON field is signed. This trace found no application path accepting an unverified webhook before admission. No real provider/network call or live payment was made.

Migration 0029's SECURITY DEFINER function validates bounded field values and immutable event identity; it does **not** verify a signature. It revokes PUBLIC EXECUTE and requires an explicit trusted backend grant. A database role with EXECUTE can admit syntactically valid synthetic receipts directly. That is a privileged capability/trust assumption, not proof of a public HTTP bypass. Neither merchant/browser database credentials nor general-purpose SQL access may receive it. The application runtime also needs confirmed-order resolution and tenant-scoped billing writes; do not revoke operational grants blindly.

Existing retained integration test `verified-provider-receipt-inbox-postgres.integration.test.mjs` already covers invalid signature, confirmed amount/request mismatch -> no receipt; durable orphan receipt; concurrent redelivery; identity collision; and restricted direct receipt table denial. These DB cases were NOT rerun locally this cycle; the historical 41/41 CI result is for 693b2be0. Transport crypto/production-disabled and source-contract cases were rerun locally: six tests PASS (part of 18 total below). No duplicated payment fix was introduced.

## B. Administrative audit write inventory and open boundary

- Sole production TypeScript direct INSERT: `postgresMerchantManagementAuthority.ts:listManagedMerchantsPostgres`. It validates an active/enabled administrator, inserts a one-minute directory audit with NULL merchant scope, sets transaction-local admin ID/audit ID and performs the cross-tenant directory read in the same transaction. The route `auth-merchant-management-postgres-routes.ts` requires a secure admin session and one of view_merchants/manage_merchant_status/manage_subscriptions/manage_channels/inspect_merchant_sessions. Actor identity comes from session context.
- SQL migration 0030 inserts the receipt-reader audit inside SECURITY DEFINER only after locked active account/profile checks, password-change restriction and owner or manage_subscriptions authorization. If audit INSERT fails, the transaction fails before results return. This function does not require callers to hold direct audit INSERT.
- Repository-wide production source search found no direct UPDATE or DELETE of database_admin_access_audits. Test fixtures and administrative scripts are separate from runtime necessity. Direct INSERT is currently required by the directory implementation; removing it without replacing issuance would break that workflow.
- Migration 0024's audited-admin predicate checks matching GUC identifiers, time window, and global or matching merchant scope. It does not independently verify current account state, current admin permissions, request hash, reason code, or an authenticated actor. A writable audit row is consequently authority-bearing data. Direct INSERT can mint authority; UPDATE can extend/change scope; SELECT can expose reusable bearer identifiers; DELETE undermines audit integrity. This is a SQL-role threat assessment. HTTP exploitability has not been established.

Read-only Neon catalog result on **br-billowing-leaf-b14yamgu / neondb**: accounts/admin_profiles/admin_permissions/database_admin_access_audits have RLS=false; fawri_staging_rls_runtime has effective SELECT/INSERT/UPDATE/DELETE on all four. orders/order_items/verified_provider_payment_receipts have RLS=true. All seven are owned by neondb_owner. Admission/reader/predicate functions are SECURITY DEFINER owned by neondb_owner, fixed pg_catalog search_path; admission and reader set row_security=off. Both fawri runtime roles have EXECUTE on all three. No customer/admin rows were read or modified.

Least-privilege design to review: tenant data role must not issue, mutate or inspect admin authority records or mutate admin identity/permissions. Directory issuance belongs behind a bounded authorized capability or a separately authenticated admin backend role, with transaction-local scope, fresh account/permission checks and atomic audit+operation behavior. Audit reader/cleanup belongs to separately reviewed operator/retention authority; ordinary runtime has no demonstrated UPDATE/DELETE need. Protecting only audit INSERT is insufficient while admin identities/permissions remain writable. Do not impose RLS on global auth tables without tracing bootstrap/login/session/admin lifecycle dependencies. This batch documents the boundary and does not claim it is fixed.

## C. Infrastructure blocker (no repeated provisioning)

Read-only Neon recheck: fawri_staging_runtime LOGIN=true/BYPASSRLS=true/CREATEROLE=true; restricted fawri_staging_rls_runtime LOGIN=false/BYPASSRLS=false/CREATEROLE=false. The exposed create_postgres_role tool accepts name/no_login, with no option to request NOBYPASSRLS/NOCREATEROLE/no privileged membership. The prior unsafe create-and-cleanup experiment is already documented; no new role was created. A supported safe provisioning path and actual direct-authenticated acceptance remain unresolved. No production role attestation is asserted.

## D. Demonstrated readiness defect and narrow fix

`postgresRuntimeRlsSecurity.ts` previously converted absent/malformed safety booleans to false and absent/non-array inventories to empty arrays, filtering malformed entries. This allowed incomplete safety evidence to pass the production gate. New regressions on unchanged source: **10 PASS / 2 FAIL / 0 SKIP** (12 tests), with missing expected rejection. The corrected parser requires native PostgreSQL booleans and text arrays of nonblank names; unknown/malformed evidence throws PRODUCTION_DATABASE_RLS_READINESS_CHECK_FAILED. Known unsafe evidence retains its specific rejection code. SQL queries, privileges and non-production gate behavior are unchanged.

After fix: **18 PASS / 0 FAIL / 0 SKIP / 0 CANCELLED**, process exit 0. Three files: production-postgres-rls-security.test.ts (12 tests including 85 invalid field/value probes), superqi-sandbox-transport.test.ts (5), superqi-sandbox-provider-static.test.mjs (1). git diff --check PASS. Command from repository root:

```sh
node --import /workspace/scratch/857e685e528f/fawri-audit/node_modules/tsx/dist/loader.mjs --test --test-reporter=tap artifacts/api-server/tests/production-postgres-rls-security.test.ts artifacts/api-server/tests/superqi-sandbox-transport.test.ts artifacts/api-server/tests/superqi-sandbox-provider-static.test.mjs
```

The absolute loader is environment-specific retained tsx 4.22.0; a normal installed checkout uses `pnpm exec tsx --test ...`. Frozen offline install failed due missing pnpm mirror metadata for @aws-sdk/client-kms. No dependency policy was disabled and no lockfile changed. Full build/typecheck and database integration were not run locally (Docker/PostgreSQL binaries unavailable). Foundation CI includes the readiness unit and PostgreSQL integration tests; verify the new commit's results separately. Existing CI success is not proof for new code or hosted security.

## Next exact action

Verify this code commit on GitHub and its CI, then add a synthetic guarded PostgreSQL test demonstrating audit issuance/reuse boundaries and authorized directory preservation. Record preconditions, SQLSTATE/rows and cleanup. Review the minimum safe grant/capability design before modifying issuance or runtime credentials. Retain NO-GO for infrastructure, audit boundary and hosted acceptance blockers.

## Follow-up batch: guarded SQL characterization fixture

Added admin-audit-boundary-postgres.integration.test.mjs to the first position in the isolated priority suite and named audit-boundary suite. Uses separate bootstrap setup/cleanup and two freshly created LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT accounts, verifying current_user=session_user, no memberships and no relation ownership. Grants are explicit to merchant_settings plus optional audit-table CRUD, never ALL TABLES. The fixture runs only after repository network-none disposable attestation. It expects unsafe-grant behavior as characterization, not as a desired production property; existing legitimate merchant-directory tests remain unchanged.

Local validation: node --check for fixture/runner, git diff --check PASS; runner summary + disposable guard tests 19 PASS / 0 FAIL / 0 SKIP; intentionally unattested fixture invocation rejected before DB driver import. SQL execution NOT RUN locally; no Docker. After commit, inspect guarded CI for actual evidence and cleanup before asserting the SQL behavior is reproduced.

Readiness fix e5300d80 Foundation run 39340236256 job 118359679712 has successfully completed frozen install, typecheck, build, readiness units, PostgreSQL RLS and merchant-management integration steps. Full workflow/41-run cycle still pending at 2026-10-19T23:15:29Z.
