# P0 — Application runtime database role acceptance checklist (2026-10-18)

## Evidence and scope
- Isolated Neon project `round-fire-18493605`, branch `br-snowy-voice-b1bovtwi`.
- Catalog reconfirmed: `fawri_staging_runtime` LOGIN=true/BYPASSRLS=true; `fawri_staging_rls_runtime` LOGIN=false/BYPASSRLS=false.
- Existing `lib/db/scripts/preflight-isolated-neon-migrations.mjs` is read-only and validates isolated Neon URL, host, SSL, direct endpoint and applied migration hashes. It does **not** demonstrate application runtime role switching or cross-tenant access denial.
- 94 public tables: 45 RLS enabled with identical tenant predicate, 49 RLS disabled. Restricted role has all four DML privileges on all 94. See `P0_ISOLATED_NEON_ALL_94_TABLE_POLICY_AND_GRANTS_AUDIT_20261018.md`.

## Required acceptance evidence before GO
1. Identify all actual app/worker/admin DB connection constructors, deployed role identities and pooling configuration. Check whether the app ever executes tenant queries while `current_user` has BYPASSRLS.
2. In a disposable authorized isolated environment, connect using the same credentials/path as the hosted app, verify `session_user`, `current_user`, role attributes and any `SET ROLE` operation inside the transaction.
3. Verify tenant context cannot be set from untrusted request input; test transaction-local context reset and pool reuse.
4. Test two synthetic tenant fixtures: own read/write succeeds, cross-tenant read hidden, cross-tenant write denied, missing tenant context denied.
5. Test audit privilege issuance boundaries and unauthorized changes to `admin_profiles`, `admin_permissions`, `database_admin_access_audits` and related sensitive non-RLS tables. Do not use real admin accounts.
6. Collect redacted query/test evidence, ensure rollback/cleanup and record the final GO/NO-GO decision.

## Constraints
No changes to roles, data, schema, migrations or deployment are authorized by this checklist. Existing catalog findings are risk hypotheses, not proof of exploitability. Avoid blanket RLS enablement or blind REVOKE without dependency analysis.

**Current gate: P0 NO-GO.**
