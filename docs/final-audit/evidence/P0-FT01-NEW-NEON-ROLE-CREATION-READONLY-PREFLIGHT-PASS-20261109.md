# FT-01 — New independent Neon role-creation feasibility read-only preflight PASS

**Date:** 2026-11-09 (Baghdad). **Source-only evidence from actual owner-run Neon SQL Editor; no hosted database writes.**

**Provider UI:** User previously confirmed `fawri-production-prep-20261108`, exact independent project ID `crimson-cherry-65705041`, branch `production` / `br-holy-waterfall-b993zglb`, database `fawri`; then ran [the exact reviewed SELECT-only preflight](sql/P0-FT01-NEW-NEON-ROLE-ADMIN-CAPABILITY-READONLY-20261109.sql) in that project's SQL Editor.

## Actual owner-supplied final complete SQL result

The chat paste contained repeated truncated snippets plus one complete JSON result. Treat it as **one observed query result**, not three separate executions or independent repetitions:

```json
{
  "database_name": "fawri",
  "postgres_major": 18,
  "session_role_name": "fawri_owner",
  "current_role_name": "fawri_owner",
  "owner_can_login": true,
  "owner_can_create_roles": true,
  "owner_superuser": false,
  "owner_bypass_rls": true,
  "owner_can_create_databases": true,
  "owner_replication": true,
  "public_data_relations": 0,
  "drizzle_ledger_exists": false,
  "user_relations": 0,
  "existing_candidate_roles": 0,
  "elevated_candidate_roles": 0,
  "readonly_role_provisioning_decision": "READONLY_ROLE_CREATION_FEASIBILITY_CANDIDATE"
}
```

## Exact bounded acceptance

- **PASS** `READONLY_ROLE_CREATION_FEASIBILITY_CANDIDATE`: the actual new database owner SQL session `fawri_owner` has `CREATEROLE=true`; this role appears capable of creating new roles using a separately approved provider-admin/SQL path.
- **PASS** clean-schema *at this observed moment*: PG18 database `fawri`, user relations 0, public data relations 0, and no Drizzle migrations ledger.
- **PASS** no existing `fawri_restricted_runtime`, `fawri_auth_issuer`, or `fawri_operator_issuer` role-name collisions; zero elevated among candidate names.
- **Critical security fact:** `fawri_owner` has `rolbypassrls=true` and `rolcreatedb=true`, `rolreplication=true` although `rolsuper=false`. It must be **migration/administration only** and **never used as an application tenant, auth or operator connection**. Exact source prelistener now explicitly rejects `fawri_owner` for all 3 runtime URL settings and that code has CI evidence.
- **Limits:** This SELECT does not prove provider resource identity independently of the owner UI, schema DDL/extension support, ability to grant all needed function/table privileges, account password custody, connection routing or role inheritance, authenticated LOGIN acceptance, a restorable hosted production snapshot, or any hosted SQL+HTTP merchant test. No permanent application roles exist yet.

## Next finite FT-01 action (do not restart previous tests)

1. Use these accepted preflights plus the already-passed disposable canonical 53-migration PostgreSQL18 rehearsal, three real restricted local login admissions and actual production prelistener SQL checks. **Do not repeat** them merely to add evidence.
2. Prepare an exact source-SHA-pinned, **new-project-only** full schema/ownership/grant manifest and rollback/snapshot procedure. `0052` is required for production startup but **hosted 0052 approval remains BLOCKED**, and source inventory still holds it; no silent waiver.
3. Distinguish **production 3 permanent LOGIN** privileges from the intentionally limited CI sample GRANTs. Prevent owner/BYPASSRLS/default-schema-create and PUBLIC function-access exposure.
4. Obtain separate scoped owner approval **before any `CREATE ROLE`, `GRANT`, migration DDL or hosted schema write** on `crimson-cherry-65705041`; use only a target-attested connection to the NEW project. Existing Neon app is pinned to the OLD `round-fire-18493605`, must never silently fall back.

**State:** FT-01 *hosted read-only role-creation feasibility* **PASS**; actual schema/bootstrap/3 roles/RLS SQL+HTTP and durable recovery still **OPEN**. `FIELD002` OPEN, `0052` hosted BLOCKED, Draft PR #550, commercial **NO-GO**. No data import, deploy or merge.
