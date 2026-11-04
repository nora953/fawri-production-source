# FAWRI P0 FIELD002 — Hosted PostgreSQL default EXECUTE ACL root cause

**Observed:** 2026-11-04. **Scope:** read-only PostgreSQL catalog inspection of the actual `Fawri-Staging` Neon `staging-runtime` branch and previously approved isolated clone. No personal data, passwords, connection strings or customer records read. No database writes, role mutations, GRANT/REVOKE changes, deployments or migrations.

## Verified causal chain

1. Migration `0038_role_bound_admin_directory_issuer.sql` creates the privileged directory audit issuer; `0039_role_bound_authentication_runtime.sql` creates the trusted authentication marker `public.fawri_authentication_runtime()`. Both are absent on the original Neon `staging-runtime` branch (28 applied migrations) and present on the isolated clone (52 applied migrations).
2. On **both original and clone** Neon branch catalogs, **`neondb_owner` has one public-schema default FUNCTION EXECUTE grant for `fawri_staging_rls_runtime` and another for `fawri_staging_runtime`**, defined in `pg_default_acl` (two nonowner default grants in total). These are automatic privileges that are attached to new functions created under the relevant owner/schema.
3. On the **isolated clone**, the two trusted functions are owned by `neondb_owner`. For **both** functions, explicit `PUBLIC` EXECUTE grants are absent, but the restricted-intended tenant principal `fawri_staging_rls_runtime` has **one direct, non-PUBLIC EXECUTE grant per function**. Thus revoking only `PUBLIC` EXECUTE in the migration does not remove the principal-specific default ACL grant. This exposes a known conflict between the trusted authentication/administrative-function capability model and tenant-scoped RLS, **even with RLS enabled on 8/8 privacy tables**.
4. Source migration `0040_transaction_scoped_tenant_authority.sql` rejects a tenant scope runtime that can execute `public.fawri_authentication_runtime()`. The original Neon role `fawri_staging_rls_runtime` remains **NOLOGIN** and therefore has not been used as a verified successful tenant SQL session in this test. Do **not** claim cross-tenant disclosure from catalog state alone.
5. The existing latest source preflight `lib/db/scripts/preflight-isolated-neon-migrations.mjs` imports `assessDefaultFunctionExecuteReadiness` and checks `pg_default_acl` before source migrations `0038` and `0039` are applied. A **verbatim equivalent, read-only catalog query** on original `staging-runtime` returned **2 nonowner default EXECUTE grants**. As those migrations remain pending there, the current source preflight correctly classifies this as **`DEFAULT_FUNCTION_EXECUTE_WOULD_LEAK` / not ready**. This is a grounded preflight rejection predicate, not a claim that the full script was executed over a live connection. The clone has already applied both function-creation migrations; its preflight's default-grant check therefore correctly considers them non-pending, while actual function ACLs remain unsafe.

## Reproducible read-only audit

Query A (run separately against original and clone; no private values):

```sql
SELECT pg_get_userbyid(d.defaclrole) AS function_creator,
       COALESCE(n.nspname, '<global>') AS acl_scope,
       CASE WHEN a.grantee = 0 THEN '<PUBLIC>'
            ELSE pg_get_userbyid(a.grantee) END AS execute_grantee,
       count(*)::int AS default_grants
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE d.defaclrole =
      (SELECT oid FROM pg_roles WHERE rolname = current_user)
  AND d.defaclobjtype = 'f'
  AND (d.defaclnamespace = 0 OR n.nspname = 'public')
  AND a.privilege_type = 'EXECUTE'
  AND a.grantee <> d.defaclrole
GROUP BY d.defaclrole, n.nspname, a.grantee
ORDER BY execute_grantee;
```

Original and clone returned the **same two result groups**:

| Function creator | Scope | Nonowner default EXECUTE grantee | Count |
|---|---|---|---:|
| `neondb_owner` | `public` | `fawri_staging_rls_runtime` | 1 |
| `neondb_owner` | `public` | `fawri_staging_runtime` | 1 |

Query B (run against the clone; no function invocation):

```sql
SELECT p.proname, pg_get_userbyid(p.proowner) AS function_owner,
  (SELECT count(*)::int FROM aclexplode(p.proacl) a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
    AS public_explicit_execute,
  (SELECT count(*)::int FROM aclexplode(p.proacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE r.rolname = 'fawri_staging_rls_runtime'
      AND a.privilege_type = 'EXECUTE') AS tenant_direct_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.oid IN (
  to_regprocedure('public.fawri_authentication_runtime()'),
  to_regprocedure('public.fawri_issue_admin_directory_audit(text,text,text)')
) ORDER BY p.proname;
```

Both sensitive functions returned **function owner `neondb_owner`; `public_explicit_execute=0`, `tenant_direct_execute=1`**. Original branch returned no function rows because those migrations have not been applied.

## Remediation boundary / acceptance

- **No auto-remediation or weakening:** Do not enable `LOGIN`, revoke/grant privileges on original staging, alter default ACLs on production, change Railway secrets, modify historical migration SQL hashes, or deploy without separate authorization and a verified rollback strategy.
- For a future authorized staged migration, distinguish **creator default privileges before function creation** from **existing function ACLs after creation**. The owner-approved cutover must remove any trusted-auth/operator EXECUTE capability from the tenant login and its inherited or SET-accessible roles, while maintaining the separate trusted authentication issuer. After any controlled ACL change, re-run direct privilege / role-reachability checks and real same-merchant positive / foreign-negative / revoked-session tests.
- The **last checked PR HEAD** was `4ca7c10b1da94ce9dfe458e93bacf7e62429dce4` with **59/59 passing CI for that exact source commit**; further work may advance HEAD. The new evidence only records a hosted SELECT finding and does not independently certify a deployment.
- **FIELD002 OPEN / parent merchant privacy OPEN / 0052 BLOCKED / NO-GO**. Canonical known P0 snapshot remains 29 CLOSED_SOURCE, 7 OPEN, 9 BLOCKED; entire P0 denominator incomplete.

## Post-migration ACL verification — source patch (2026-11-04)

**Problem closed at the source preflight level, not yet on the hosted clone:** the previous `assessDefaultFunctionExecuteReadiness` checked dangerous creator DEFAULT EXECUTE privileges **only if 0038/0039 were pending**. The isolated Neon clone has applied both migrations already (52/53), so that check returned `NOT_PENDING` despite two vulnerable existing functions.

**Actual code changes in draft PR #550:**
- `lib/db/scripts/lib/default-function-execute-preflight.mjs` commit `8ab16b58`: added immutable signatures for the two actual trusted functions, an exact list of the two legacy runtime roles, and a fail-closed `assessAppliedTrustedFunctionExecuteReadiness` evaluator. Rejects missing function rows, unexpected extra/duplicate ACL findings, or EXECUTE grants to either legacy runtime; no role modification.
- `lib/db/scripts/preflight-isolated-neon-migrations.mjs` commit `4d77ed1f`: under its existing **BEGIN READ ONLY / REPEATABLE READ / ROLLBACK** transaction, inspects actual existing `pg_proc` function identities and `has_function_privilege(runtime_role.oid, to_regprocedure(signature), 'EXECUTE')`. Runs whenever either trusted-function migration has **already been applied**; preserves the earlier before-creation default-ACL check for pending migrations and the unrelated `0052` owner guard. A persisted runtime grant leads to `APPLIED_TRUSTED_FUNCTION_RUNTIME_EXECUTE_LEAK`.
- `lib/db/scripts/tests/isolated-neon-migration-static.test.mjs` commit `a24cb849`: five regression tests on both leaked functions and both legacy roles, partial migration state, missing/malformed/duplicate proof, and read-only SQL wiring. **Full CI on this latest code SHA is pending** at evidence-writing time; do not reuse an earlier 59/59 claim.

**Actual direct SELECT against both Neon branches using the exact new SQL projection:**
- Original `staging-runtime` branch `br-falling-dust-b1km4gix`: both functions `present=false` (0038/0039 pending), `runtime_execute_roles=[]`. The separate **pre-creation** default-grant check remains the correct blocker on original.
- Isolated clone `br-young-hill-b1x9vhlz`: both functions `present=true`, each with `runtime_execute_roles=['fawri_staging_rls_runtime','fawri_staging_runtime']`. The new **post-creation** check correctly classifies clone as `APPLIED_TRUSTED_FUNCTION_RUNTIME_EXECUTE_LEAK`. No live role ACL was changed to get this result.
- **No closure claim:** if a future security-approved test changes these grants on clone, verify direct and SET/USAGE-inherited privileges, trust-marker separation and real same-merchant/foreign/revoked SQL+HTTP. Do not edit historical migrations or apply a blind REVOKE to original. `FIELD002` remains OPEN, `0052` BLOCKED, release NO-GO.

**Next controlled action:** on the **isolated clone only**, review and explicitly approve removing **both existing EXECUTE grants** on both trusted functions and **both owner default EXECUTE grants** for the two legacy runtime roles, in an auditable/rollback-capable clone-only rehearsal; then re-run full function/tenant scoped checks. Do **not** change original staging or Railway under this approval, and do not assume the current clone already passed the new preflight.
