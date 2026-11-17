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
