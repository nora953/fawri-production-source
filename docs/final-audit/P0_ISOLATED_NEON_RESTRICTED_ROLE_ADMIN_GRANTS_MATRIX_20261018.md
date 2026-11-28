# P0 — Restricted runtime administrative grants matrix (2026-10-18)

## Verified catalog evidence
Neon isolated branch `br-snowy-voice-b1bovtwi`, project `round-fire-18493605`, database `neondb`. Read-only catalog queries only.

`fawri_staging_rls_runtime` has all four table privileges (SELECT, INSERT, UPDATE, DELETE) on **five public tables without RLS**:

| Table | RLS | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| admin_profiles | disabled | yes | yes | yes | yes |
| admin_permissions | disabled | yes | yes | yes | yes |
| database_admin_access_audits | disabled | yes | yes | yes | yes |
| merchant_admin_notes | disabled | yes | yes | yes | yes |
| merchants | disabled | yes | yes | yes | yes |

Confirmed 20 direct role-table grant rows through `information_schema.role_table_grants`. This is a permissions/least-privilege **finding**, not proof that a merchant user can exploit it through application endpoints. The connector is connected as `neondb_owner` and cannot SET ROLE to either staging runtime role; no authenticated restricted-session acceptance was executed.

## Security implications and next gate
`database_admin_access_audits` is consulted by the SECURITY DEFINER RLS authorization predicate. `admin_profiles` and `admin_permissions` are privileged identity/authorization state. The combination requires an explicit review of application connection identities, admin issuance paths, role memberships, tenant context provenance and any dynamic SQL entrypoints.

Before remediation, inventory legitimate admin/merchant reads and writes, draft a narrow role/grant migration with rollback, and run synthetic hosted acceptance on an approved isolated branch. Avoid blind REVOKE or enabling RLS on control tables, which may break bootstrap/admin functionality.

**P0 remains NO-GO.** No schema, data, privileges, migrations, or deployment changes were performed.
