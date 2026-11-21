# FIELD002 — three separately authenticated PostgreSQL authorities, source checkpoint (2026-11-07)

## Reconciled production design

The earlier isolated-role plan focused on two identities (tenant runtime and trusted authentication issuer), but actual production source already requires **a third operator-directory/receipt-review credential** via `FAWRI_OPERATOR_DATABASE_URL`:

- Tenant runtime `DATABASE_URL`: checked at configuration, session, eight exact RLS policies and protected table privileges.
- Authentication/session issuer `FAWRI_AUTH_DATABASE_URL`: must have independent SQL LOGIN, same logical database, private scope issuance capability, and must not reach sensitive tenant tables. It is now probed from its real leased authenticated connection *before* the HTTP listener.
- Operator-directory/receipt issuer `FAWRI_OPERATOR_DATABASE_URL`: independent SQL LOGIN for `public.fawri_issue_admin_directory_audit(text,text,text)` and bounded operator control plane. Operator and authentication identities must **never share a login**, nor use the tenant, staging BYPASSRLS or Neon owner/superuser identity.

## Source changes

Production configuration function `getProductionRuntimeConfigurationIssues()` now rejects:
- Absent, malformed or unparseable operator URL/user: `FIELD002_OPERATOR_DATABASE_URL_REQUIRED`.
- Reuse of tenant, approved runtime, auth or legacy/owner/superuser identities: `FIELD002_OPERATOR_DATABASE_LOGIN_UNSAFE`.
- Operator URL addressing any other DB/port/compute than tenant runtime (with explicit Neon direct/pooler suffix normalization): `FIELD002_OPERATOR_DATABASE_TARGET_MISMATCH`.

New **real SQL startup check** `assertProductionOperatorDatabaseReady` runs in `src/index.ts` after both exact tenant RLS and trusted auth identity checks, **before** any provider initialization, application import, worker or HTTP listener. It uses the existing bounded and privilege-checked dedicated `withOperatorDirectoryTransaction()` (which validates no owner / privileged roles reachable and the directory-issuer function GRANT) and additionally checks actual `session_user=current_user=operator URL user`, `current_database()` equals operator URL DB, direct directory function EXECUTE, **no authentication runtime marker EXECUTE**, **no private tenant scope issuer EXECUTE**. Any SQL/transport/identity failure is reduced to sanitized `PRODUCTION_OPERATOR_DATABASE_IDENTITY_NOT_READY` without exposing URL or raw SQL error. Explicit noncommercial staging bypasses commercial-only gate; it **does not** count as a commercial proof.

Positive and negative tests include all three URLs, Neon pooled/direct same-compute allowed, other DB/port/host rejected, role reuse/legacy forbidden, SQL identity switch, missing/excess function grants, failure sanitization and startup order. Production environment example includes **all three distinct secret-store references**.

## Independent nonsecret observation

Read-only `SELECT` of the exact operator directory/function-access SQL expression succeeded on clean Neon clone `br-polished-mouse-b1proel7`. Authenticated `neondb_owner` returned directory/auth/scope EXECUTE all TRUE; the new operator admission would **reject** this identity, as designed. The exercise validates syntax only; it is **not** a new restricted LOGIN or real mounted-service acceptance.

Latest read-only original Neon branch `br-falling-dust-b1km4gix`: **28 migrations**, 0 notices, no field002 test role, one other backend session. Clean isolated clone: **52 migrations**, 0 notices, no field002 test roles, no other backend sessions at sample. No original migration, ACL, role, backup or service config was changed. Railway isolated `fawri-p0-api` follows the GitHub branch and may automatically rebuild; it **still lacks all three DB URLs**, so any resulting CRASH must not be accepted as hosted SQL/HTTP safety proof. Live `fawri-web` remains a different old `main` release consuming the original branch.

## Execution gate

1. **No fake third-role closure:** the approved safe two-LOGIN isolated provisioning attempt was blocked by SQL connector safety checks. No account was created; separate third operator account **also is not provisioned**. Do not use Neon default admin or broad read_write roles to simulate least-privilege authority. Existing prior 7/7 hosted clean-clone tenant/auth drill remains accepted; no need to repeat it solely because probe roles were cleaned up.
2. **Required before the original cutover:** privileged operator provisioner/review must prepare three independent permanently scoped LOGINs and **separately audit each capability, inheritance, owner reachability and direct data privileges**; validate all three against one pinned Neon database and the full prelistener SQL tests. Operator receipt functions may require extra explicitly reviewed GRANTs, not broad public table access.
3. **Original `staging-runtime` stays NO-GO**: independently approved maintenance/isolation, fresh recoverable backup, default-function ACL repair, 0028–0051 migration, deploy-source and credential switching, SQL/HTTP tenant own/foreign/revoked and authentication/receipt proof. `0052` remains a separate blocker.
4. **Source CI** must pass exact head SHA before counting this new startup check as accepted; workflow results are not evidence for original host.

**FIELD002 OPEN, PR #550 DRAFT, commercial NO-GO.** No percent or delivery deadline claimed.
