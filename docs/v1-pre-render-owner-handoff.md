# FAWRI V1 — PRE-RENDER handoff and owner bootstrap

Status 2026-11-17: **no paid Render service and no public launch**.

## Done without hosting fee
- 54 canonical commercial Neon migrations, three restricted service logins, and independently accepted 10/10 POS-off database startup proof. Do not repeat.
- Owner-authorized post-schema54 encrypted backup, actual disposable PG18 restore, independently uploaded and SHA256-readback private offsite copy. First 54-stage baseline only, not post-customer media recovery.
- Render Blueprint proposed in the selected workspace, automatic deploy disabled, maintenance enabled, persistent disk planned. Render returned `need_payment_info`; no paid service created.
- V1 Docker **build** now pins `FAWRI_V1_MANUAL_COMMERCE=1` (not merely runtime), to ensure the built UI exposes no old paid/Meta/POS capabilities. The existing production `NODE_ENV` strict runtime gates are preserved.
- Source manifest generated from the verified new Neon project/branch with explicit `source_mode=fresh_schema_migrations_only`; this string is declarative, not substitute for a live DB proof.

## Owner admin is the next security boundary — no real account provisioned yet
- Live Neon currently has zero admin accounts. Only **one** active verified owner can be admitted by the existing `provisionOwnerAdminPostgres` transaction: hash `scrypt`, restrict role to `owner_admin`, reject duplicates, phone collision and concurrent provisioning. Do NOT inject an owner account manually via unguarded SQL, skip phone verification, put raw password in issues or pass it in CLI args.
- **Critical password continuity:** `FAWRI_PASSWORD_SALT` is a persistent password pepper, not a disposable app config. A value randomly generated in Render after owner bootstrap would make the owner password unusable. Render Blueprint now marks this as a private `sync:false` secret. Use the **exact same secure random 32+-character value** when bootstrapping the owner with GitHub Actions and when provisioning the service in Render. Keep the value separately backed up with restricted access; rotating it requires a reviewed credential migration or password-reset process.
- Three independent role-specific URLs, HTTPS origin allowlist and actual persistent image disk remain private Render config. Never store them in repo source, README, action logs or assistant chat.

## NEXT — before paid Render
1. Run source-vetted, owner-authorized one-shot admin bootstrap **only after** the owner privately configures admin phone, strong owner password and stable password salt in GitHub Actions secrets. Use only restricted `fawri_auth_issuer` credentials (plus read-only session probes). App-level operator and merchant roles must never receive admin table write privileges.
2. Confirm independent live `owner_admin=1, usable_owner=1` and no other records changed, with sanitized SQL only. The owner must retain both password and stable salt safely.
3. Recheck hosted-ready startup contract **without customer HTTP**; then ask owner to add a payment method only when actual Render build/startup and first merchant E2E tests are next. Before approving a paid Blueprint, review exact pricing/changes.

G2 two-merchant HTTP/SQL proof, G3 Render deployment and restart media, G4 full manual-merchant journey, G5 post-user-data/media backup restoration and stability, and G6 domain remain **NO-GO**.


## 2026-11-17 — Actual no-cost source work, verified
- [Commercial Render source contract #44049029653](https://github.com/nora953/fawri-production-source/actions/runs/44049029653): PASS. Commercial UI is compiled with the V1 manual-only flag; Render password pepper is now a required `sync:false` private secret and therefore must be the same value as at initial admin bootstrap. The FIELD002 source manifest is pinned to the new Neon branch with no historical import.
- [Restricted owner-bootstrap offline negative tests #44049987704](https://github.com/nora953/fawri-production-source/actions/runs/44049987704): PASS. These test source authorization/target/credential rules only, **NOT** creation of a production admin. Production owner account remains absent. There is no automatic secret/provisioning job authorized.
- [Full Docker image build smoke #44050328442](https://github.com/nora953/fawri-production-source/actions/runs/44050328442) **PASS** on source SHA `ce3103b4`: actual Docker build using `Dockerfile.staging` completed successfully, and executed-container checks found React `index.html` and Express `dist/index.mjs`, with `cashier.html` absent. CI emitted `V1_DOCKER_BUILD_NO_CASHIER_SHELL_ACCEPTED` and `NO_RENDER_SERVICE_NO_CUSTOMER_DEPLOY_NO_NEON_WRITES`. Warnings about Vite sourcemap resolution did not fail the build. This is image-build acceptance only, not hosted health/HTTP readiness.

## Secure owner setup handoff
The existing legitimate provisioning command is `pnpm --dir artifacts/api-server provision:owner-admin --phone <E164> --display-name <owner-display-name>` in a **trusted private shell** with `NODE_ENV=production`, `FAWRI_OPERATIONAL_POSTGRES_AUTHORITY=required`, separate least-privilege tenant/auth Postgres URLs targeting the approved commercial Neon branch, and one stable private `FAWRI_PASSWORD_SALT` (32+ characters). The owner password must be supplied to **stdin only**, not a command-line argument or recorded log. Do not use owner/superuser URL for application SQL. Preserve a private copy of the pepper because a different Render value invalidates verification of scrypt password hashes.

Before activating this transaction, insist on a separately authorized one-time private environment, confirm current Neon owner/admin count is 0 and auth issuer can INSERT account/admin profile, then verify exactly one owner/admin and no unintended merchant/order data changed. Do not fake successful provisioning, and do not create an active administrator with a placeholder phone/password. When there is no approved private execution environment, defer this particular credential write, not its security checks.

No paid Render service, new account, tenant test data, or domain cutover created as part of this preparation.


## 2026-11-17 — owner saved private secrets; bootstrap source approved for offline inspection only

The owner reported saving `FAWRI_V1_OWNER_ADMIN_PHONE`, `FAWRI_V1_OWNER_ADMIN_PASSWORD` and `FAWRI_V1_OWNER_ADMIN_PASSWORD_SALT` to private GitHub Actions secrets. The connected GitHub app cannot read the secret values, and **the owner account has NOT been created**.

A one-shot source-only TypeScript bootstrap was added at `artifacts/api-server/scripts/v1-owner-admin-bootstrap.ts` (commit `dbb07734`). It checks the existing owner-actor/branch/one-shot opt-in and G2B/G2C acceptance, derives limited auth/tenant URLs from existing protected source and passwords, authenticates only as `fawri_auth_issuer`, asserts zero owners / no phone collision, invokes the audited `provisionOwnerAdminPostgres` singleton transaction, and emits only sanitized status codes. It requires a separate, authorized private execution path; merely committing it does not execute it.

[Offline CI run #44055694071](https://github.com/nora953/fawri-production-source/actions/runs/44055694071) **SUCCESS**, checking the script syntax and previously accepted negative source-authorization/role/credential tests; actual production provisioning **not executed**. A new production bootstrap GitHub Actions job is **not installed**. Do not claim source-only guard proof is production acceptance.

Latest independent commercial Neon read-only query: `owner_count=0`, `account_count=0`, `merchant_count=0`, and `migrations=54`. Preserved state: NO-GO, no changes to commercial records, no paid Render service.

**Unresolved:** secure permitted one-shot execution of the prepared bootstrap with private stored secrets (which cannot be retrieved into chat) and explicit owner approval. Once executed, verify `ownerCount=usableOwnerCount=1` and keep the exact stored pepper for later Render `FAWRI_PASSWORD_SALT`. Do not expose phone/password/pepper or substitute placeholder credentials.
