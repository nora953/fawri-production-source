# FT-01 — exact PostgreSQL18 creator-membership admission, locally verified

**Date:** 2026-11-09 (Baghdad). **Gate:** P0-ACCESS-HOSTED-ROLLOUT / FIELD002.
**Exact executable source SHA:** [`2762ad810c92cc0426aaf7eca4f36a529b7a34f1`](https://github.com/nora953/fawri-production-source/commit/2762ad810c92cc0426aaf7eca4f36a529b7a34f1).
**Exact FT-01 clean PG18 run:** [#42586380032](https://github.com/nora953/fawri-production-source/actions/runs/42586380032), job `fresh-canonical-schema`, **COMPLETED SUCCESS**. The GitHub commit-workflow query returned **60/60 completed SUCCESS** on the exact executable SHA, zero failures or in-progress at verification. The workflow is a local disposable `127.0.0.1:5432/fawri_ci` PostgreSQL18 job, not a hosted Neon acceptance.

## What changed and was actually proved

The held, **NOT HOSTED-AUTHORIZED** [new-target three-NOLOGIN reservation SQL](sql/P0-FT01-NEW-NEON-THREE-NOLOGIN-ROLE-RESERVATION-HELD-20261109.sql) formerly checked only outbound group-role memberships. PostgreSQL18 automatically gives non-superuser CREATEROLE creator `fawri_owner` one inbound group-role membership: `ADMIN=true, INHERIT=false, SET=false` per created role. That is not zero membership and should not be represented as such.

The postimage now requires **exactly one** inbound membership to `fawri_owner` per NOLOGIN group role, with the exact flags above, and no outbound memberships. Unexpected additional members or changed SET/INHERIT options fail atomically **before COMMIT**. The same SQL still requires exact local DB identity/schema/role preimage; wrong DB and second execution must refuse.

The exact [disposable harness](https://github.com/nora953/fawri-production-source/blob/2762ad810c92cc0426aaf7eca4f36a529b7a34f1/lib/db/scripts/ft01-disposable-nologin-role-reservation.mjs) interrogated `pg_auth_members` in both directions, proved three exact creator ADMIN-only edges, injected an additional unauthorized recipient with `SET=true`, observed `FT01_THREE_NOLOGIN_ROLE_POSTIMAGE_UNSAFE`, removed the forged membership and recovered the positive invariant. The exact CI log contains:
- `FT01_THREE_NOLOGIN_EXTRA_SET_MEMBERSHIP_DENIAL_PASS`
- `FT01_THREE_NOLOGIN_HELD_NEW_TARGET_SQL_LOCAL_POSITIVE_NEGATIVE_PASS`
- `FT01_DISPOSABLE_ONLY_NO_NEON_NO_RELEASE_PASS`

## Security boundary / outstanding blocker

These are three **management/group NOLOGIN** roles, *not* `fawri_cashier_retirement_owner`. The latter is an isolated function owner for canonical historical migration 0052; its **ZERO** inbound/outbound membership requirement remains strict and unmodified. The local non-superuser proof still shows canonical 0052 rejects the owner transfer with SQLSTATE **42501**. The in-memory grant/owner-transfer workaround requires a **trusted PostgreSQL superuser cleanup** to remove the creator's automatic ADMIN membership, unavailable through the observed hosted `fawri_owner` privilege. That workaround was not committed as a production migration.

**No** hosted role creation/GRANT, schema migration, snapshot, recovery, import, production app connection, real merchant acceptance, role secret, old Neon connector fallback, Railway, deploy or merge. Original 0052 SQL and reviewed SHA remain unchanged.

**Decision:** exact held three-NOLOGIN creator-membership SQL local acceptance **BOUNDED PASS**; new-Neon hosted role credential/grant/recovery/branch attestation **OPEN**; canonical hosted 0052 ownership handoff **BLOCKED**; `FIELD002 OPEN / PR #550 DRAFT / P0 NO-GO`. Do not treat 60 local CI successes as production or host acceptance. Evidence also recorded in [PR discussion](https://github.com/nora953/fawri-production-source/pull/550#issuecomment-6735652166).
