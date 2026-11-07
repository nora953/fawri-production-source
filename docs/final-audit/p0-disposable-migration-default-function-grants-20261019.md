# P0 disposable migration grant audit — 2026-10-19

Temporary Neon branch `br-billowing-leaf-b14yamgu`, cloned from `br-snowy-voice-b1bovtwi`. **Not deployable**. SQL 0028, 0029, 0030 was applied as raw statements only to the disposable branch, not through Drizzle; ledger still records 28 migrations. Attempt to run 0031 was blocked by safety checks; no bypass attempted. 0032–0034 not applied. Source branch and Railway unchanged.

Catalog confirmed created functions `fawri_resolve_meta_page_merchants`, `fawri_admit_verified_payment_receipt`, and `fawri_read_verified_payment_receipts` are SECURITY DEFINER with `search_path=pg_catalog` and `row_security=off`, and have no PUBLIC EXECUTE grant.

**Important inherited grant:** All three functions were automatically granted EXECUTE to both `fawri_staging_runtime` and `fawri_staging_rls_runtime`, despite migration SQL only revoking PUBLIC. `pg_default_acl` identifies the cause: neondb_owner has a schema-specific default FUNCTION ACL on public: `{fawri_staging_runtime=X/neondb_owner,fawri_staging_rls_runtime=X/neondb_owner}`. Therefore a new SECURITY DEFINER function is callable by these roles unless its grant is explicitly reviewed/revoked. The first runtime role also has BYPASSRLS/CREATEDB/CREATEROLE on the inspected source branch; actual Railway role is not verified.

Security consequence: granting function EXECUTE to a role does not automatically make the function safe; function input validation and backend trust boundaries remain essential. Before migration, audit intended capability callers and explicitly manage function ACLs instead of assuming REVOKE FROM PUBLIC removes inherited grants.

No grants or schema changes made outside the temporary disposable branch. H-01/H-02/H-03/H-05 remain open; P0 NO-GO.
