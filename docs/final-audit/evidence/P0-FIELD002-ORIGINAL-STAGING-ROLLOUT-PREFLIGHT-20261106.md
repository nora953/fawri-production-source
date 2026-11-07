# FIELD002 — original Neon staging rollout readiness, fail-closed checkpoint (2026-11-06)

**Decision: NO-GO for original staging schema/role changes at this checkpoint.** This is an actionable *preflight*, not approval to alter SQL roles, restore data, run schema migrations, point Railway at a different role, or merge/deploy PR #550.

## Source, target and authorization

GitHub branch `fix/p0-provider-receipt-order-discovery-20261015`, draft PR #550. Neon project `round-fire-18493605`, explicit original **non-default/non-primary** branch `br-falling-dust-b1km4gix` (`staging-runtime`), database `neondb`. Approved test-notification deletion was completed and independently verified at zero in `P0-FIELD002-R2-ORIGINAL-STAGING-FIXTURE-DELETION-20261106.md`. No owner authorization has yet been obtained for modifying original staging RLS, grants, roles, migrations, Railway runtime, or backup/restore settings.

## Fresh non-mutating comparison

The following catalog/aggregate facts were read from the explicitly pinned hosted Neon branches, without personal row content:

| Exact check | Original staging | Existing isolated rehearsal clone |
| --- | ---: | ---: |
| `public.notifications` rows after authorized fixture cleanup | 0 | 0 |
| Critical privacy tables present | 8/8 | 8/8 |
| Critical privacy tables with both RLS enabled and >=1 policy | **0/8** | **8/8** |
| Applied Drizzle migrations | **28** | **52** |
| Pending migration range previously exercised on clone | 0028–0051 | Already applied |
| 0052 migration | Not applied | Not applied / BLOCKED |
| `fawri_staging_rls_runtime` valid NOLOGIN and no BYPASSRLS | yes | yes |
| Legacy `fawri_staging_runtime` LOGIN+BYPASSRLS | yes | yes |

Additional original staging SQL preflight (all aggregate values):
- **2** unsafe nonowner owner-default `EXECUTE` grants for future `public` schema functions, directed to the two legacy runtime role names.
- The two trusted functions created by migrations 0038/0039 are **not yet present** on original staging.
- Consequently, running 0028–0051 on original as-is will fail the existing source preflight's `DEFAULT_FUNCTION_EXECUTE_WOULD_LEAK` guard; bypassing or disabling the guard is **not** an acceptable completion path.
- `fawri_staging_runtime` still carries `BYPASSRLS`; RLS policies alone do not protect sessions using that account.
- The previously accepted isolated-hosted *notification-only* mounted SQL/HTTP tenant acceptance is evidence about the clone, **not original deployment parity**.

## Exact non-destructive prerequisites before original staging rollout

1. **Version pin and rollback:** pin PR code/migration hashes, host endpoint and branch, document all affected tables/functions/roles. Obtain a recoverable fresh staging snapshot plus a successful isolated restore rehearsal; verify rollback recovery with no unresolved source divergence.
2. **Operational isolation:** verify and record whether live `fawri-web` or other test clients still connect to this staging branch, and schedule a safe change window. Never claim a tenant-safe runtime merely from an environment variable.
3. **Review grants and trust model:** specify and independently review a minimal transaction-scoped correction of the **two unsafe creator-default `EXECUTE` grants before 0038/0039**, with before/after privileges and rollback. The earlier isolated-clone ACL remediation does **not** give permission to run it on original staging.
4. **Prove schema rollout:** run the *unchanged* committed 0028–0051 migrations in index order on a **fresh isolated copy of the now-cleaned original staging**, checking each source hash, Drizzle journal record, eight-table row counts/fingerprints, trusted-function `PUBLIC`/named/role-reachable EXECUTE privilege denials, and complete rollback on any mismatch. The historical clone was created before original cleanup; its already-applied migrations do not substitute for this fresh-source parity test.
5. **Independent original staging change approval:** only after the above controls, explicitly authorize a bounded staged rollout. On original, never apply 0052 while its owner/membership prerequisite is unresolved. Never enable old BYPASSRLS credentials as tenant runtime or simply flip restricted NOLOGIN to LOGIN.
6. **Real hosted tenant acceptance:** with reviewed least-privilege live session/issuer identities, rerun own-merchant positives, foreign-merchant read/write negatives with no side effects, revoked-session denials, 8/8 RLS and actual mounted HTTP on target deployment. Include future backup/seed/import/restore fixture-exclusion control, not just one current zero-row query.

## Closure accounting and deliberate limits

- **Closed and verified:** removal of 28 historical test notifications from original and rehearsal branches; R1/R3 bounded source/CI policy; current source migration-row/lineage negative guards; prior isolated-hosted notification SQL+HTTP proof.
- **OPEN:** R2 future release/import/restore fixture exclusion; original-hosted eight-table RLS/ACL/role admission; actual deployment parity; parent privacy gate. **BLOCKED:** 0052 trusted migration owner/bootstrap.
- No new original Neon mutation, Railway change, merge, release, commercial restore, role GRANT/REVOKE or staging migration was performed in this checkpoint. No certified overall P0 percentage. Register remains **29 CLOSED_SOURCE / 7 OPEN / 9 BLOCKED**, release **NO-GO**.

## Supporting source evidence

- `P0-FIELD002-R2-ORIGINAL-STAGING-FIXTURE-DELETION-20261106.md`
- `P0-FIELD002-R2-POST-CLEANUP-RESTORE-BOUNDARY-20261106.md`
- `P0-FIELD002-NEON-STAGING-MIGRATION-REHEARSAL-20261104.md`
- `P0-FIELD002-HOSTED-DEFAULT-EXECUTE-ACL-ROOT-CAUSE-20261104.md`
- `P0-FIELD002-ISOLATED-ACL-REPAIR-RUNBOOK-20261104.md`
- `P0-FIELD002-CONFIGURED-RUNTIME-EIGHT-TABLE-RLS-READINESS-20261104.md`
