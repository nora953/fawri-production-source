# FT-01 — three actual authenticated restricted PostgreSQL LOGINs, isolated PG18 proof

**Date:** 2026-11-09 (Baghdad). **Exact executable source SHA:** `067d24cf67e23e95a747106e0f16d43c09f2df47`.  
**Run:** [FT-01 isolated clean PostgreSQL18 canonical schema #42530147100](https://github.com/nora953/fawri-production-source/actions/runs/42530147100), **COMPLETED SUCCESS**.  
**Job logs:** [fresh-canonical-schema #128882324141](https://github.com/nora953/fawri-production-source/actions/runs/42530147100/job/128882324141): exact marker `FT01_PG18_THREE_INDEPENDENT_AUTHENTICATED_NONPRIVILEGED_LOGINS_PASS`.  
**Acceptance:** BOUNDED **LOCAL AUTHENTICATED LOGIN PROOF** only, **NOT** production provisioning or hosted role/RLS/HTTP admission.

## Previously accepted, reused in same disposable PG18 session

- PostgreSQL18 service bound to `127.0.0.1:5432/fawri_ci`; no Drizzle ledger or public relations at start.
- Applied **all 53 canonical Drizzle migrations twice without drift**, 97 tables / 69 enums / 82 composite foreign keys, 0 notifications.
- Native RLS enabled on eight residual merchant tables and both cashier 0052 tables, NOLOGIN cashier retirement owner flags and two cashier read policies.
- `0052` was marked **HELD_NOT_AUTHORIZED_FOR_HOSTED** by source-only inventory; applying it to *disposable* PG18 cannot be construed as hosted rollout.
- Full CI job completed successfully with `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS`; no Neon connection was used.

## New actual SQL evidence (not another synthetic policy-only test)

New code `lib/db/scripts/ft01-disposable-three-login-rehearsal.mjs` is deliberately hard-fenced to **GitHub Actions in `nora953/fawri-production-source`**, `FAWRI_ALLOW_FT01_DISPOSABLE_THREE_LOGIN_REHEARSAL=1`, `127.0.0.1:5432/fawri_ci`, exact local PostgreSQL18/53 migrations/no notifications and empty role preimage. It cannot be run on Neon by changing its URL or environment flag.

Within a PostgreSQL transaction, the CI-owned disposable administrator creates three ephemeral **LOGIN** roles with random, never printed/generated-on-run secrets, `NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`, connection limit two, and only representative previously reviewed GRANT capabilities. It then:

1. Authenticates **three independent real network SQL sessions**, each asserting `session_user=current_user=expected login`, PG18 `fawri_ci`, absence of CREATE/schema/owner privileges, privileged flags, inheritance and forbidden marker/issuer crossing.
2. Performs real tenant restricted read of `notifications` with 0 unscoped rows.
3. Uses PostgreSQL catalog functions to verify **tenant-only** `fawri_security.allows_merchant(text)` and notification-read surface, **auth-only** authentication marker + `issue_scope`, **operator-only** directory issuer, no role memberships and **zero direct notification mutation** for any of the three test accounts.
4. Deletes the three temporary login accounts and verifies none remains. Random secrets are never emitted to stdout, committed, sent to Neon, added as GitHub secrets or distributed as external artifacts.

The workflow commits no DB credentials, never uses a connected hosted database, and does not grant blanket `ALL TABLES`/global admin/owner/BYPASSRLS rights. The exact CI log shows `FT01_PG18_THREE_INDEPENDENT_AUTHENTICATED_NONPRIVILEGED_LOGINS_PASS` at job line near the end and workflow **SUCCESS**.

## What still prevents real Neon role provisioning / FIELD002 closure

- This deliberately uses **minimal representative privileges** to prove *separate authenticated sessions* and negative isolation. It is **not** the complete application CRUD/transaction policy for 97 tables, nor the full operator four-routine production matrix. Do not copy the disposable SQL grants directly to Neon or claim full service readiness.
- New project/branch `crimson-cherry-65705041` / `br-holy-waterfall-b993zglb`, database `fawri`, PostgreSQL18 was previously observed **empty** by owner-run select-only preflight; no hosted SQL write, migration or role provisioning has occurred.
- Required next: independently attest new Neon project's exact direct host and administrator DDL capability; design exact **per-role complete least-privilege grants** from current production SQL callers + approved source owner/function catalog, along with locked real endpoints/password custody and rollback. Confirm three permanent authenticated roles *on the actual target*, 8/8 residual and all runtime RLS/HTTP, media and recovery protections.
- Current Neon app is still scoped to old `round-fire-18493605`. **Never omit project_id, reuse old credentials or connect to old staging/default branch** as a workaround.
- Source-only authentication/role tests are not approval to migrate `0052` or connect commercial traffic.

**State:** FIELD002 OPEN; 0052 HOSTED BLOCKED; Draft PR #550; commercial NO-GO. No original-staging/Neon writes, paid cloud services, merge or deployment.
