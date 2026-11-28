# FT-01 / 0052 — PG18 non-superuser SECURITY INVOKER retirement candidate, HELD

**Date:** 2026-11-09 Baghdad. **Exact tested candidate SHA:** [`48afacc5e0f7222df2eddf0726b00297a3e442a5`](https://github.com/nora953/fawri-production-source/commit/48afacc5e0f7222df2eddf0726b00297a3e442a5).
**Verified target CI:** [FT-01 fresh isolated PostgreSQL18 #42591388662](https://github.com/nora953/fawri-production-source/actions/runs/42591388662), [job #129073561273](https://github.com/nora953/fawri-production-source/actions/runs/42591388662/job/129073561273), **COMPLETED SUCCESS**. Not a hosted release acceptance or original staging change.

## Launch blocker and bounded result

The canonical unchanged `lib/db/drizzle/0052_cashier_stream_receipt_storage.sql` SHA-256 `aaf7ee97fbdef0c1b4600e905216117ee8ff89f31ccd67d783ab61a9c4bd9b8e` ends with `ALTER FUNCTION ... OWNER TO fawri_cashier_retirement_owner`. Actual Neon-style `fawri_owner` is **not** a superuser and fails the canonical owner transfer with SQLSTATE `42501`. Granting SET and revoking it would leave an automatic security-relevant PostgreSQL18 creator ADMIN edge requiring a trusted superuser to remove. That route remains unaccepted and unmodified.

A **source-only, held alternative** at `lib/db/scripts/lib/ft01-0052-nonsuperuser-invoker-candidate.mjs` replaces only the retirement-owner part in a disposable temporary migration folder. It retains the preceding unchanged stream/receipt schema and receipt safeguards, uses a `SECURITY INVOKER` merchant-deletion trigger, and requires the authenticated deletion LOGIN plus a narrowly targeted **NOLOGIN group** `fawri_auth_issuer` for its RLS SELECT/UPDATE policy (no PUBLIC write policy). The group membership is `INHERIT=true, SET=false, ADMIN=false` for the LOGIN; its PG18 creator `fawri_owner` has the expected `ADMIN=true, SET=false, INHERIT=false` membership. Neither LOGIN is a superuser or BYPASSRLS. The deletion function rejects untrusted callers **before** any RLS visibility-based early return.

**Direct log proof on exact tested source:**
- `FT01_INVOKER_NON_SUPERUSER_53_MIGRATIONS_PASS`: 53 migration journal entries on disposable PostgreSQL18 non-superuser owner, function owner is migration owner but `prosecdef=false`; dedicated retirement role and memberships absent; two exact role-targeted RLS policies exist.
- `FT01_INVOKER_DENIAL_DIRECT_WRITE_AND_AUTH_MARKER_PASS`: separate real LOGINs, unauthorized deletion rejected, active stream cannot be directly retired, checkpoint column mutation forbidden; unissued private tenant scope returns false even when executable.
- `FT01_INVOKER_GRANT_DEFICIT_ATOMIC_ROLLBACK_PASS`: revoked `UPDATE(version)` causes merchant-deletion transaction to fail with `42501`, restoring exact original merchant/stream state.
- `FT01_INVOKER_RETIREMENT_OWN_ONLY_PEER_UNCHANGED_PASS`: authorized merchant deletion retires only the target stream, clears device and increments version, with two peers unchanged and replay inert.
- `FT01_HELD_CANDIDATE_NOT_CANONICAL_NOT_HOSTED_PASS` and `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS`: no production write or new-host connection. Disposable roles/database removed.

The initial candidate run [#42590091424](https://github.com/nora953/fawri-production-source/actions/runs/42590091424) failed at a missing permission to evaluate **existing** `fawri_security.allows_merchant` in the local role fixture. The narrowly scoped **local-only EXECUTE grant** fixed this; a separate subsequent failure [#42591207577](https://github.com/nora953/fawri-production-source/actions/runs/42591207577) was an invalid *synthetic phone* violating `accounts_phone_shape_check`. Neither failure was reported as accepted. The final exact-SHA run passed the full targeted workflow including old canonical negative and earlier positive cases.

## Remaining blocking production adoption work

**Not approved for first commercial yet.** Source `0052` and its fixed journal/snapshot hash are still canonical and unchanged. Production `assertCashierStreamStorageReady` still accepts **only** the former dedicated-owner, SECURITY DEFINER fingerprint and rejects this alternative. A reviewed *fresh-launch-only* migration source/journal strategy, new pinned invoker-function and role-group-policy verification (without weakening either protocol), **complete least-privilege grant matrix** for three permanent independent LOGINs, role-grant provenance, first-launch-source enforcement and rollback are not yet complete. A local direct SQL proof does not replace real new-Neon SQL+HTTP, provider identity, commercial snapshot and external recovery.

**No** Neon new/old project SQL, owner grants, secrets, backup snapshot, data import, Railway, deployment, canonical 0052 changes or PR merge. **FIELD002 OPEN; 0052 hosted BLOCKED; P0-HOSTED-RECOVERY BLOCKED; PR #550 DRAFT; launch NO-GO.** This candidate is scoped to resolving an actual blocker, not expanding the general P0 audit.
